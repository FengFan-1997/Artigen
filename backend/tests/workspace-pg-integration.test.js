const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Pool } = require("pg");
const storage = require("../services/asset-storage");
const { createWorkspaceService } = require("../services/workspace-service");
const {
  createWorkspaceFilesService,
} = require("../services/workspace-files-service");
const {
  createWorkspaceGithubService,
} = require("../services/workspace-github-service");
const { createAgentRunService } = require("../services/agent-run-service");
const {
  buildContextMessages,
  normalizeTaskSpec,
  createWorkingState,
} = require("../services/agent-runtime-v2");
const {
  normalizeFileEditTargets,
  validateFileEditTargets,
  resolveEditTarget,
} = require("../services/workspace-file-context");
const {
  createAgentConnectorService,
} = require("../services/agent-connector-service");
const env = {
  NODE_ENV: "test",
  AGENT_PAYLOAD_ENCRYPTION_KEY: "hex:" + "17".repeat(32),
  AGENT_BETA_MODE: "disabled",
};

test("read-only connector preserves 30 records and long patches without issuing a write", async () => {
  const records = Array.from({ length: 30 }, (_, i) => ({
    filename: `file-${i}`,
    patch: "x".repeat(3000),
  }));
  const calls = [];
  const api = createAgentConnectorService({
    integrationService: {
      readTokenForConnector: async () => ({ accessToken: "fixture-token" }),
    },
    fetchImpl: async (url, options) => {
      calls.push(options);
      return new Response(JSON.stringify(records), { status: 200 });
    },
  });
  const result = await api.requestReadOnly({
    provider: "github",
    userId: "fixture",
    path: "/repos/example/work/pulls/1/files",
    method: "DELETE",
  });
  assert.equal(result.data.length, 30);
  assert.equal(result.data[29].patch.length, 3000);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].body, undefined);
});

test("file target declarations cannot point outside the selected input set", async () => {
  const assetId = crypto.randomUUID(),
    sha256 = "f".repeat(64);
  const target = {
    source: "local",
    id: "local:notes.md",
    name: "notes.md",
    assetId,
    sha256,
  };
  const normalized = normalizeFileEditTargets([target], [assetId]);
  assert.equal(
    resolveEditTarget({ filename: "revision-1.txt" }, normalized).sha256,
    sha256,
  );
  assert.equal(
    resolveEditTarget({ filename: "unrelated.txt" }, normalized),
    null,
  );
  assert.throws(
    () => normalizeFileEditTargets([target], []),
    /AGENT_FILE_TARGET_INVALID/,
  );
  await assert.rejects(
    validateFileEditTargets(
      {
        query: async () => ({
          rows: [{ id: assetId, sha256: Buffer.alloc(32) }],
        }),
      },
      "owner",
      normalized,
    ),
    /HASH_MISMATCH/,
  );
});

test(
  "workspace files, history, ownership, concurrent conflicts, durable GC and messages on PostgreSQL",
  { skip: process.env.RUN_WORKSPACE_PG !== "1", timeout: 30000 },
  async () => {
    // One connection proves storage I/O never needs a nested pool lease.
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "artigen-workspace-storage-"),
    );
    const adapter = new storage.FileAssetAdapter(root);
    const assets = {
      ...storage,
      storeAsset: (input) => storage.storeAsset({ ...input, adapter }),
      openAsset: (input) => storage.openAsset({ ...input, adapter }),
    };
    try {
      const owner = (
        await pool.query(
          "INSERT INTO users(display_name) VALUES('Workspace fixture') RETURNING id",
        )
      ).rows[0].id;
      const other = (
        await pool.query(
          "INSERT INTO users(display_name) VALUES('Other fixture') RETURNING id",
        )
      ).rows[0].id;
      const project = (
        await pool.query(
          "INSERT INTO creative_projects(user_id,title) VALUES($1,'Workspace fixture') RETURNING id",
          [owner],
        )
      ).rows[0].id;
      const workspace = createWorkspaceService({ pool, env });
      const files = createWorkspaceFilesService({
        pool,
        transaction: workspace.transaction,
        assets,
      });
      const first = await files.save({
        userId: owner,
        projectId: project,
        path: "notes/brief.md",
        text: "first\n",
        expectedRevision: 0,
      });
      assert.equal(first.revision, 1);
      assert.equal(
        (await files.listFiles({ userId: owner, projectId: project })).length,
        1,
      );
      const target = normalizeFileEditTargets(
        [
          {
            source: "cloud",
            id: first.id,
            name: "brief.md",
            assetId: first.assetId,
            sha256: first.sha256,
          },
        ],
        [first.assetId],
      );
      await validateFileEditTargets(pool, owner, target, project);
      await assert.rejects(
        validateFileEditTargets(
          pool,
          owner,
          [{ ...target[0], id: crypto.randomUUID() }],
          project,
        ),
        /SOURCE_CHANGED/,
      );
      const bom = await files.save({
        userId: owner,
        projectId: project,
        path: "bom.txt",
        text: "\ufeffBOM preserved",
        expectedRevision: 0,
      });
      assert.equal(
        (
          await files.content({
            userId: owner,
            projectId: project,
            fileId: bom.id,
          })
        ).text,
        "\ufeffBOM preserved",
      );
      await validateFileEditTargets(
        pool,
        owner,
        normalizeFileEditTargets(
          [
            {
              source: "cloud",
              id: bom.id,
              name: "bom.txt",
              assetId: bom.assetId,
              sha256: bom.sha256,
            },
          ],
          [bom.assetId],
        ),
        project,
      );
      const second = await files.save({
        userId: owner,
        projectId: project,
        fileId: first.id,
        text: "second\n",
        expectedRevision: 1,
        baseSha256: first.sha256,
      });
      assert.equal(second.revision, 2);
      assert.equal(second.verificationStatus, "user-edited");
      assert.equal(
        (
          await files.content({
            userId: owner,
            projectId: project,
            fileId: first.id,
            revision: 1,
          })
        ).text,
        "first\n",
      );
      await assert.rejects(
        files.save({
          userId: owner,
          projectId: project,
          fileId: first.id,
          text: "stale",
          expectedRevision: 1,
          baseSha256: first.sha256,
        }),
        /WORKSPACE_VERSION_CONFLICT/,
      );
      await assert.rejects(
        files.content({ userId: other, projectId: project, fileId: first.id }),
        /PROJECT_NOT_FOUND/,
      );
      await assert.rejects(
        files.save({
          userId: owner,
          projectId: project,
          path: "../escape",
          text: "x",
          expectedRevision: 0,
        }),
        /PATH_INVALID/,
      );
      const writes = await Promise.allSettled(
        ["one", "two"].map((text) =>
          files.save({
            userId: owner,
            projectId: project,
            fileId: second.id,
            text,
            expectedRevision: 2,
            baseSha256: second.sha256,
          }),
        ),
      );
      assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(writes.filter((r) => r.status === "rejected").length, 1);
      const empty = await files.save({
        userId: owner,
        projectId: project,
        path: "empty.txt",
        text: "",
        expectedRevision: 0,
      });
      assert.equal(empty.byteSize, 0);
      assert.equal(
        (
          await files.content({
            userId: owner,
            projectId: project,
            fileId: empty.id,
          })
        ).text,
        "",
      );
      await pool.query(
        "UPDATE assets SET expires_at=now()-interval '1 hour' WHERE id=$1",
        [first.assetId],
      );
      assert.deepEqual(
        await storage.claimExpiredAssets({ pool, assetId: first.assetId }),
        [],
      );
      await pool.query("UPDATE assets SET expires_at=NULL WHERE id=$1", [
        first.assetId,
      ]);
      const original = await assets.storeAsset({
        pool,
        ownerUserId: owner,
        buffer: Buffer.from("legacy"),
        declaredMime: "text/plain",
        allowedMimeTypes: ["text/plain"],
        expiresAt: new Date(Date.now() + 60000),
      });
      await pool.query(
        "INSERT INTO project_asset_links(project_id,asset_id,role,label) VALUES($1,$2,'product','legacy.txt')",
        [project, original.assetId],
      );
      const imported = await files.save({
        userId: owner,
        projectId: project,
        fileId: "asset:" + original.assetId,
        text: "edited legacy",
        expectedRevision: 0,
        baseSha256: crypto.createHash("sha256").update("legacy").digest("hex"),
      });
      assert.equal(
        (
          await files.content({
            userId: owner,
            projectId: project,
            fileId: imported.id,
            revision: 0,
          })
        ).text,
        "legacy",
      );
      assert.equal(
        (
          await files.versions({
            userId: owner,
            projectId: project,
            fileId: imported.id,
          })
        ).length,
        2,
      );
      const run = (
        await pool.query(
          `INSERT INTO agent_runs(user_id,project_id,status,idempotency_key,request_hash,model_name,sandbox_version,max_credits,worker_id,lease_epoch,lease_expires_at,expires_at) VALUES($1,$2,'running',$3,$4,'fixture','fixture',10,'fixture-worker',1,now()+interval '1 hour',now()+interval '1 day') RETURNING id`,
          [owner, project, crypto.randomUUID(), Buffer.alloc(32)],
        )
      ).rows[0].id;
      const runtime = createAgentRunService({ pool, env });
      const lease = { runId: run, workerId: "fixture-worker", leaseEpoch: 1 };
      await runtime.appendPublicMessage({
        ...lease,
        text: "## Real public message\n\nA | B\n---|---\n1|2\n\n```xml\n<analysis>public XML example</analysis>\n```",
        sourceKey: "turn:1",
      });
      await runtime.appendPublicMessage({
        ...lease,
        text: "duplicate",
        sourceKey: "turn:1",
      });
      assert.equal(
        (await workspace.messages({ userId: owner, runId: run })).messages
          .length,
        1,
      );
      assert.match((await workspace.messages({ userId: owner, runId: run })).messages[0].text, /<analysis>public XML example/);
      const row = (
        await pool.query(
          "SELECT * FROM agent_events WHERE run_id=$1 AND event_type='message.created'",
          [run],
        )
      ).rows[0];
      assert.ok(!JSON.stringify(row).includes("Real public message"));
      await assert.rejects(
        runtime.appendPublicMessage({
          ...lease,
          workerId: "wrong",
          text: "invalid",
          sourceKey: "turn:2",
        }),
        /LEASE_LOST/,
      );
      for (let i = 2; i < 104; i++)
        await runtime.appendPublicMessage({
          ...lease,
          text: "Page " + i,
          sourceKey: "turn:" + i,
        });
      const firstPage = await workspace.messages({ userId: owner, runId: run });
      assert.equal(firstPage.messages.length, 100);
      const secondPage = await workspace.messages({
        userId: owner,
        runId: run,
        cursor: firstPage.nextCursor,
      });
      assert.equal(secondPage.messages.length, 3);
      assert.equal(secondPage.nextCursor, null);
      assert.equal(
        new Set(
          [...firstPage.messages, ...secondPage.messages].map((m) => m.id),
        ).size,
        103,
      );
      const nav = await workspace.navigation({ userId: owner, limit: 1 });
      assert.equal(nav.projects.length, 1);
      assert.equal(nav.sessions[0].id, run);
      await assert.rejects(
        workspace.messages({ userId: other, runId: run }),
        /AGENT_RUN_NOT_FOUND/,
      );
      const calls = [];
      const github = createWorkspaceGithubService({
        pool,
        transaction: workspace.transaction,
        ownedProject: files.ownedProject,
        connector: {
          requestReadOnly: async (request) => {
            calls.push(request);
            return {
              data: request.path.includes("/pulls?")
                ? Array.from({ length: 30 }, (_, i) => ({
                    number: i + 1,
                    title: "PR " + i,
                    html_url: "https://github.com/example/work/pull/" + i,
                  }))
                : [],
            };
          },
        },
      });
      await github.bind({
        userId: owner,
        projectId: project,
        owner: "example",
        repository: "work",
      });
      assert.equal(
        (
          await github.read({
            userId: owner,
            projectId: project,
            kind: "pulls",
          })
        ).items.length,
        30,
      );
      assert.ok(calls.every((r) => r.method === "GET"));
    } finally {
      await pool.end();
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);

test("precompiled V2 context retains file revision contract without changing the user goal", () => {
  const taskSpec = normalizeTaskSpec({
    goal: "Improve the selected text file",
    deliverables: [],
    plan: [
      {
        id: "edit",
        label: "Edit file",
        phase: "production",
        status: "in_progress",
      },
    ],
  });
  const fileEditContext = {
    targets: [
      {
        id: "local:fixture",
        name: "notes.md",
        sha256: "a".repeat(64),
        candidateFilename: "revision-1.txt",
      },
    ],
    inputPaths: ["/tmp/artigen-workspace/inputs/fixture.txt"],
  };
  const context = buildContextMessages({
    instructions: "fixture",
    taskSpec,
    workingState: createWorkingState({ taskSpec }),
    fileEditContext,
  });
  const state = JSON.parse(context.messages[1].content);
  assert.equal(state.taskSpec.goal, taskSpec.goal);
  assert.equal(
    state.fileEditContext.targets[0].candidateFilename,
    "revision-1.txt",
  );
  assert.match(state.fileEditPolicy, /confirmation/);
});
