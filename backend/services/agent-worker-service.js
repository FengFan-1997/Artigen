const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const assets = require('./asset-storage');
const { getAgentConfig } = require('./agent-config');
const {
  createAgentArtifactService,
  inferRequiredDeliverables
} = require('./agent-artifact-service');
const {
  browserActionType,
  createAgentBrowserService
} = require('./agent-browser-service');
const { createAgentImageService } = require('./agent-image-service');
const {
  AgentWaitingForUser,
  createAgentModelProvider
} = require('./agent-model-provider');
const {
  assertAllowedOrigins,
  assertComputerOrigins,
  createAgentSandboxProvider
} = require('./agent-sandbox-provider');
const {
  createAgentIntegrationService
} = require('./agent-integration-service');
const {
  AgentDesktopRelayClient
} = require('./agent-desktop-relay-client');
const {
  connectorActionType,
  createAgentConnectorService
} = require('./agent-connector-service');
const {
  actionFingerprint,
  assertLoopBudget,
  classifyAction,
  TAKEOVER_ACTIONS
} = require('./agent-policy-service');

class AgentPaused extends Error {
  constructor() {
    super('AGENT_PAUSED');
    this.code = 'AGENT_PAUSED';
  }
}

class AgentCancelled extends Error {
  constructor() {
    super('AGENT_CANCELLED');
    this.code = 'AGENT_CANCELLED';
  }
}

const firstPayload = (payloads, kind) => (
  payloads.find((payload) => payload.kind === kind)?.value || null
);

const INPUT_EXTENSIONS = Object.freeze({
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'text/markdown': '.md',
  'text/plain': '.txt'
});

const readOpenedAsset = async (opened, maximumBytes = 100 * 1024 * 1024) => {
  if (Number(opened.contentLength || 0) > maximumBytes) {
    throw new ApiError(413, 'AGENT_INPUT_ASSET_TOO_LARGE');
  }
  if (typeof opened.body?.transformToByteArray === 'function') {
    const bytes = Buffer.from(await opened.body.transformToByteArray());
    if (bytes.length > maximumBytes) throw new ApiError(413, 'AGENT_INPUT_ASSET_TOO_LARGE');
    return bytes;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of opened.body) {
    size += chunk.length;
    if (size > maximumBytes) throw new ApiError(413, 'AGENT_INPUT_ASSET_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const createAgentCostMeter = ({
  costs = {},
  sandboxCreditsPerMinute = 1,
  now = Date.now
} = {}) => {
  const rate = Math.max(0, Number(sandboxCreditsPerMinute || 0));
  let model = Math.max(0, Number(costs.model || 0));
  let generation = Math.max(0, Number(costs.generation || 0));
  let sandbox = Math.max(0, Number(costs.sandbox || 0));
  let sandboxMeteredAt = now();
  const pendingSandbox = () => (
    sandbox + Math.max(0, now() - sandboxMeteredAt) / 60_000 * rate
  );
  const round = (value) => Number(Math.max(0, Number(value || 0)).toFixed(4));

  return {
    setModel(value) {
      model = Math.max(0, Number(value || 0));
    },
    restoreModelMinimum(value) {
      model = Math.max(model, Math.max(0, Number(value || 0)));
    },
    addGeneration(value) {
      generation += Math.max(0, Number(value || 0));
    },
    accrueSandbox() {
      sandbox = pendingSandbox();
      sandboxMeteredAt = now();
      return sandbox;
    },
    snapshot({ accrue = false, minimumSandboxSeconds = 0 } = {}) {
      if (accrue) {
        sandbox = pendingSandbox();
        sandboxMeteredAt = now();
      }
      return {
        model: round(model),
        generation: round(generation),
        sandbox: round(Math.max(
          pendingSandbox(),
          rate * Math.max(0, Number(minimumSandboxSeconds || 0)) / 60
        ))
      };
    },
    total({ additional = 0 } = {}) {
      return model + generation + pendingSandbox() + Math.max(0, Number(additional || 0));
    }
  };
};

const createAgentWorkerService = ({
  pool,
  runService,
  env = process.env,
  sandbox = createAgentSandboxProvider({ env }),
  model = createAgentModelProvider({ env }),
  integrationService = createAgentIntegrationService({ pool, env }),
  imageService = createAgentImageService({ env }),
  runtimeReadiness = {}
} = {}) => {
  if (!pool || !runService) throw new TypeError('AGENT_WORKER_DEPENDENCY_REQUIRED');
  const config = getAgentConfig(env);
  const artifactService = createAgentArtifactService({
    pool,
    sandbox,
    runService
  });
  const browserService = createAgentBrowserService({ sandbox, env });
  const connectorService = createAgentConnectorService({ integrationService });
  const workerId = config.workerId ||
    `agent-worker-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  const desktopRelay = new AgentDesktopRelayClient({
    pool,
    sandbox,
    workerId,
    env
  });
  const readiness = {
    browserReady: config.browserMode === 'full-approval-v1' &&
      runtimeReadiness.egressVerified === true,
    egressVerified: runtimeReadiness.egressVerified === true,
    desktopRelayReady: false,
    sandboxImageRef: config.sandboxImageRef || null
  };

  const processRun = async (runId) => {
    const claimed = await runService.claimRun({ runId, workerId });
    if (!claimed) return { claimed: false };

    let sandboxName = claimed.sandbox_ref || null;
    const startedAt = Date.now();
    const runStartedAt = new Date(claimed.started_at || Date.now()).getTime();
    const sandboxCreditsPerMinute = Math.max(0, Number(
      env.AGENT_SANDBOX_CREDITS_PER_MINUTE || 1
    ));
    const costMeter = createAgentCostMeter({
      costs: claimed.checkpoint?.costs,
      sandboxCreditsPerMinute
    });
    let terminal = false;
    let browserInitialized = false;

    const persistCostCheckpoint = async ({ usageItems = null } = {}) => {
      const costs = costMeter.snapshot({ accrue: true });
      await runService.saveCheckpoint({
        runId,
        workerId,
        checkpoint: { costs }
      });
      if (usageItems) {
        await runService.recordUsage({
          runId,
          workerId,
          estimatedCredits: costs.model + costs.generation + costs.sandbox,
          items: { ...costs, ...usageItems }
        });
      }
      return costs;
    };

    const pauseIfRequested = async () => {
      if (Date.now() - runStartedAt >= config.maxMinutes * 60_000) {
        throw new ApiError(409, 'AGENT_TIME_LIMIT_REACHED');
      }
      const control = await runService.getControlState({ runId });
      if (control.status === 'cancelled' || control.cancel_requested) {
        throw new AgentCancelled();
      }
      assertLoopBudget({
        stepCount: control.step_count,
        maxSteps: config.maxSteps,
        replanCount: control.replan_count,
        consecutiveFailures: control.consecutive_failures,
        unchangedScreenshots: control.unchanged_screenshots
      });
      if (control.pause_requested) {
        await persistCostCheckpoint();
        if (sandboxName) await sandbox.suspend(sandboxName);
        await runService.transitionRun({
          runId,
          workerId,
          toStatus: 'paused',
          eventType: 'run.paused',
          summary: '已在安全检查点暂停'
        });
        throw new AgentPaused();
      }
    };

    try {
      const context = await runService.loadPrivateContext({ runId });
      costMeter.restoreModelMinimum(context.modelCheckpoint?.totalCredits);
      const objectivePayload = firstPayload(context.payloads, 'objective');
      if (!objectivePayload?.objective) throw new ApiError(500, 'AGENT_OBJECTIVE_MISSING');
      const userInputs = context.payloads
        .filter((payload) => payload.kind === 'user_input')
        .map((payload) => payload.value)
        .slice(-20);

      if (sandboxName) {
        await sandbox.ensureRunning(sandboxName);
        await runService.transitionRun({
          runId,
          workerId,
          toStatus: 'running',
          eventType: 'sandbox.resumed',
          summary: '已恢复隔离云电脑',
          sandboxRef: sandboxName,
          checkpoint: { phase: 'running', sandboxReady: true }
        });
      } else {
        const provisioned = await sandbox.provision({
          runId,
          browserEnabled: context.run.capabilities?.browser === true
        });
        sandboxName = provisioned.name;
        await runService.transitionRun({
          runId,
          workerId,
          toStatus: 'running',
          eventType: 'sandbox.ready',
          summary: '隔离云电脑已就绪',
          sandboxRef: sandboxName,
          displayUrl: provisioned.displayUrl,
          checkpoint: { phase: 'running', sandboxReady: true }
        });
        const prerequisites = await sandbox.systemShell(
          sandboxName,
          [
            'set -eu',
            'umask 077',
            'test "$(id -u)" -ne 0',
            'mkdir -p /tmp/artigen-workspace /tmp/artigen-verify',
            'command -v chromium >/dev/null || command -v chromium-browser >/dev/null',
            'command -v bwrap >/dev/null',
            'bwrap --unshare-net --die-with-parent --bind / / /bin/true',
            'command -v libreoffice >/dev/null',
            'command -v python3 >/dev/null',
            'command -v node >/dev/null',
            'command -v ffmpeg >/dev/null',
            'command -v convert >/dev/null || command -v magick >/dev/null',
            'command -v clamscan >/dev/null',
            'command -v pdfinfo >/dev/null'
          ].join('\n'),
          30
        );
        if (!prerequisites.success) {
          throw new ApiError(503, 'AGENT_SANDBOX_IMAGE_INVALID', {
            retryable: false,
            missingTool: String(prerequisites.stderr || '').slice(0, 200)
          });
        }
        if (context.run.browser_config?.profileId) {
          const profile = await runService.loadBrowserProfile({
            userId: context.run.user_id,
            profileId: context.run.browser_config.profileId
          });
          const archive = Buffer.from(profile.archiveBase64, 'base64');
          await sandbox.writeFile(
            sandboxName,
            '/tmp/artigen-workspace/.artigen/browser-profile.zip',
            archive
          );
          const restored = await sandbox.systemShell(
            sandboxName,
            [
              'set -eu',
              "profile='/tmp/artigen-workspace/.artigen/browser-profile.zip'",
              'clamscan --no-summary "$profile" >/dev/null',
              'python3 - "$profile" <<\'PY\'',
              'import pathlib, sys, zipfile',
              'allowed = {"Local State", "Default/Cookies", "Default/Local Storage", "Default/Session Storage"}',
              'with zipfile.ZipFile(sys.argv[1]) as z:',
              '    entries = z.infolist()',
              '    assert len(entries) <= 1000',
              '    assert sum(i.file_size for i in entries) <= 20 * 1024 * 1024',
              '    for item in entries:',
              '        name = pathlib.PurePosixPath(item.filename)',
              '        assert not name.is_absolute() and ".." not in name.parts',
              '        assert any(str(name) == root or str(name).startswith(root + "/") for root in allowed)',
              'PY',
              'mkdir -p /tmp/artigen-chromium',
              'unzip -q "$profile" -d /tmp/artigen-chromium'
            ].join('\n'),
            120
          );
          if (!restored.success) throw new ApiError(422, 'AGENT_BROWSER_PROFILE_RESTORE_FAILED');
        }
      }

      if (context.run.capabilities?.browser === true) {
        await browserService.initialize({ sandboxName });
        browserInitialized = true;
      }
      await pauseIfRequested();
      const inputAssetPaths = [];
      for (const assetId of objectivePayload.assetIds || []) {
        const opened = await assets.openAsset({
          assetId,
          ownerUserId: context.run.user_id,
          pool
        });
        const bytes = await readOpenedAsset(opened);
        const extension = INPUT_EXTENSIONS[String(opened.record.mime_type || '').toLowerCase()] || '.bin';
        const inputPath = `/tmp/artigen-workspace/inputs/${assetId}${extension}`;
        await sandbox.writeFile(sandboxName, inputPath, bytes);
        const scan = await sandbox.systemShell(
          sandboxName,
          `clamscan --no-summary '${inputPath}' >/dev/null`,
          120
        );
        if (!scan.success) {
          throw new ApiError(422, 'AGENT_INPUT_ASSET_SCAN_FAILED', { assetId });
        }
        inputAssetPaths.push(inputPath);
      }
      await runService.appendStep({
        runId,
        workerId,
        role: 'planner',
        status: 'succeeded',
        summary: '已准备输入文件与交付物验证要求，等待模型发布具体计划',
        sanitizedInput: {
          assetCount: Array.isArray(objectivePayload.assetIds) ? objectivePayload.assetIds.length : 0,
          capabilityCount: Object.values(context.run.capabilities || {}).filter(Boolean).length
          ,
          inputAssetPaths
        }
      });

      const execution = await model.execute({
        objective: [
          objectivePayload.objective,
          userInputs.length
            ? `Subsequent user messages and decisions: ${JSON.stringify(userInputs)}`
            : '',
          inputAssetPaths.length
            ? `User-provided files are available at: ${inputAssetPaths.join(', ')}`
            : ''
        ].filter(Boolean).join('\n\n'),
        capabilities: context.run.capabilities,
        resumeState: context.modelCheckpoint,
        safetyIdentifier: crypto.createHash('sha256')
          .update(`artigen-agent:${context.run.user_id}`)
          .digest('hex'),
        maxSteps: config.maxSteps,
        callbacks: {
          updatePlan: async ({ explanation, steps }) => {
            await pauseIfRequested();
            const normalized = (Array.isArray(steps) ? steps : []).map((step) => ({
              label: String(step?.label || '').trim().slice(0, 160),
              status: String(step?.status || '')
            })).filter((step) => (
              step.label &&
              ['pending', 'in_progress', 'completed'].includes(step.status)
            ));
            if (
              normalized.length < 2 ||
              normalized.length > 12 ||
              normalized.filter((step) => step.status === 'in_progress').length > 1
            ) {
              throw new ApiError(400, 'AGENT_PLAN_INVALID');
            }
            await runService.savePlan({
              runId,
              workerId,
              plan: normalized,
              explanation: String(explanation || '').trim().slice(0, 500)
            });
            await runService.appendStep({
              runId,
              workerId,
              role: 'planner',
              status: 'succeeded',
              toolName: 'update_plan',
              summary: String(explanation || '已更新执行计划').trim().slice(0, 500),
              sanitizedOutput: { plan: normalized }
            });
            return { accepted: true, steps: normalized };
          },
          checkpoint: async (modelResponseId) => {
            await runService.saveCheckpoint({
              runId,
              workerId,
              checkpoint: {
                phase: 'running',
                sandboxReady: true,
                modelResponseId
              }
            });
          },
          saveModelState: async (value) => {
            await persistCostCheckpoint();
            await runService.saveModelCheckpoint({
              runId,
              workerId,
              value
            });
          },
          clearModelState: async () => {
            await runService.clearModelCheckpoint({ runId, workerId });
          },
          recordUsage: async (credits, items) => {
            costMeter.setModel(credits);
            await persistCostCheckpoint({ usageItems: items });
          },
          recordStep: async (step) => {
            await pauseIfRequested();
            return runService.appendStep({ runId, workerId, ...step });
          },
          computerActions: async (actions) => {
            await pauseIfRequested();
            assertComputerOrigins(
              actions,
              context.run.browser_config?.allowedOrigins || []
            );
            return sandbox.actions(sandboxName, actions);
          },
          screenshot: async () => {
            await pauseIfRequested();
            const result = await sandbox.screenshot(sandboxName);
            const unchanged = await runService.recordScreenshot({
              runId,
              workerId,
              sha256: crypto.createHash('sha256').update(String(result.base64 || '')).digest('hex')
            });
            if (unchanged >= 3) throw new ApiError(409, 'AGENT_SCREEN_STALLED');
            return result.base64;
          },
          browserDom: async (request) => {
            await pauseIfRequested();
            if (context.run.capabilities?.browser !== true) {
              throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', {
                capability: 'browser'
              });
            }
            const description = ['click', 'fill'].includes(request.action)
              ? await browserService.describe({
                  sandboxName,
                  selector: request.selector,
                  allowedOrigins: context.run.browser_config?.allowedOrigins || []
                })
              : null;
            const actionType = browserActionType({
              ...request,
              tagName: description?.tagName,
              inputType: description?.inputType,
              autocomplete: description?.autocomplete,
              isSubmit: description?.isSubmit,
              sensitive: description?.sensitive,
              injectionSuspected: description?.injectionSuspected,
              href: description?.href,
              selector: [
                request.selector,
                description?.elementText,
                description?.href
              ].filter(Boolean).join(' ')
            });
            const classification = classifyAction({ type: actionType });
            if (classification.decision === 'blocked') {
              throw new ApiError(403, 'AGENT_ACTION_FORBIDDEN', { actionType });
            }
            if (classification.decision === 'approval' ||
                classification.decision === 'takeover') {
              const fingerprint = actionFingerprint({
                type: actionType,
                selector: request.selector,
                url: request.url,
                textHash: request.text
                  ? crypto.createHash('sha256').update(request.text).digest('hex')
                  : null
              });
              const decision = await runService.consumeApproval({ runId, fingerprint });
              if (decision?.status === 'denied') {
                await runService.appendStep({
                  runId,
                  workerId,
                  role: 'executor',
                  status: 'skipped',
                  toolName: 'browser_dom',
                  riskLevel: 'high',
                  summary: `用户拒绝了 ${actionType}`,
                  actionFingerprint: fingerprint
                });
                return { ok: false, denied: true, actionType };
              }
              if (decision?.status === 'approved' && classification.decision === 'takeover') {
                const current = await browserService.execute({
                  sandboxName,
                  request: {
                    action: 'snapshot',
                    selector: '',
                    url: '',
                    text: ''
                  },
                  allowedOrigins: context.run.browser_config?.allowedOrigins || []
                });
                await runService.appendStep({
                  runId,
                  workerId,
                  role: 'executor',
                  status: 'succeeded',
                  toolName: 'browser_dom',
                  riskLevel: 'high',
                  summary: `用户接管并完成了 ${actionType}`,
                  actionFingerprint: fingerprint
                });
                return { ...current, takeoverCompleted: true };
              }
              if (!decision) {
                await persistCostCheckpoint();
                const approval = await runService.requestApproval({
                  runId,
                  actionType,
                  recipient: description?.url ||
                    request.url ||
                    context.run.browser_config?.allowedOrigins?.[0] ||
                    '',
                  riskLevel: classification.decision === 'takeover' ? 'blocked' : 'high',
                  changeSummary: request.purpose,
                  evidenceSummary: [
                    description?.elementText,
                    description?.href
                  ].filter(Boolean).join(' · ') || `DOM 目标：${request.selector}`,
                  impactSummary: `将在网页中执行 ${actionType}；目标站点为 ${
                    request.url || context.run.browser_config?.allowedOrigins?.[0] || '当前页面'
                  }。`,
                  rollbackSummary: actionType === 'delete'
                    ? '删除可能不可恢复；拒绝后不会执行。'
                    : '如需撤销，必须通过一次新的、单独审批的反向操作完成。',
                  fingerprint
                });
                throw new AgentWaitingForUser(approval);
              }
            }
            const result = await browserService.execute({
              sandboxName,
              request,
              allowedOrigins: context.run.browser_config?.allowedOrigins || []
            });
            await runService.appendStep({
              runId,
              workerId,
              role: 'executor',
              status: 'succeeded',
              toolName: 'browser_dom',
              riskLevel: classification.riskLevel,
              summary: String(request.purpose || '浏览网页').slice(0, 500),
              actionFingerprint: classification.riskLevel === 'high'
                ? actionFingerprint({
                    type: actionType,
                    selector: request.selector,
                    url: request.url,
                    textHash: request.text
                      ? crypto.createHash('sha256').update(request.text).digest('hex')
                      : null
                  })
                : null,
              sanitizedInput: {
                action: request.action,
                urlOrigin: request.url ? new URL(request.url).origin : undefined,
                selectorHash: request.selector
                  ? crypto.createHash('sha256').update(request.selector).digest('hex')
                  : undefined
              },
              sanitizedOutput: {
                url: result.url,
                untrusted: true,
                injectionSuspected: result.injectionSuspected,
                injectionSignals: result.injectionSignals,
                contentHash: result.contentHash
              }
            });
            return result;
          },
          shell: async (script, purpose) => {
            await pauseIfRequested();
            assertAllowedOrigins(
              script,
              context.run.browser_config?.allowedOrigins || []
            );
            const result = await sandbox.shell(sandboxName, script, 120);
            await runService.appendStep({
              runId,
              workerId,
              role: 'executor',
              status: result.success ? 'succeeded' : 'failed',
              toolName: 'sandbox_shell',
              summary: String(purpose || '运行沙箱命令').slice(0, 500),
              actionFingerprint: actionFingerprint({ type: 'shell', script }),
              sanitizedInput: {
                purpose: String(purpose || '').slice(0, 300),
                scriptSha256: crypto.createHash('sha256').update(String(script)).digest('hex')
              },
              sanitizedOutput: {
                success: result.success,
                returnCode: result.returnCode
              }
            });
            return result;
          },
          generateImage: async (request) => {
            await pauseIfRequested();
            if (context.run.capabilities?.generate_images !== true) {
              throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', {
                capability: 'generate_images'
              });
            }
            const nextImageCredits = Math.max(0, Number(env.AGENT_IMAGE_CREDITS || 8));
            if (
              costMeter.total({ additional: nextImageCredits }) >
                Number(context.run.max_credits || 0)
            ) {
              throw new ApiError(409, 'AGENT_BUDGET_EXCEEDED');
            }
            const generated = await imageService.generate(request);
            const outputPath = `/tmp/artigen-workspace/${generated.filename}`;
            await sandbox.writeFile(sandboxName, outputPath, generated.buffer);
            costMeter.addGeneration(generated.costCredits);
            await runService.appendStep({
              runId,
              workerId,
              role: 'executor',
              status: 'succeeded',
              toolName: 'artigen_image_generation',
              summary: `生成图片 ${generated.filename}`,
              sanitizedInput: {
                promptSha256: crypto.createHash('sha256')
                  .update(String(request.prompt || ''))
                  .digest('hex'),
                aspectRatio: request.aspectRatio
              },
              sanitizedOutput: {
                path: outputPath,
                mimeType: generated.mimeType,
                byteSize: generated.buffer.length,
                costCredits: generated.costCredits
              }
            });
            await persistCostCheckpoint({ usageItems: { source: 'image_generation' } });
            return {
              path: outputPath,
              mimeType: generated.mimeType,
              costCredits: generated.costCredits
            };
          },
          connectorRequest: async (request) => {
            await pauseIfRequested();
            if (context.run.capabilities?.[request.provider] !== true) {
              throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', {
                capability: request.provider
              });
            }
            const connectorAction = connectorActionType(request);
            const fingerprint = actionFingerprint({
              type: 'connector_request',
              provider: request.provider,
              method: request.method,
              path: request.path,
              body: request.body
            });
            if (connectorAction !== 'read') {
              const decision = await runService.consumeApproval({ runId, fingerprint });
              if (decision?.status === 'denied') {
                await runService.appendStep({
                  runId,
                  workerId,
                  role: 'executor',
                  status: 'skipped',
                  toolName: `${request.provider}_api`,
                  riskLevel: 'high',
                  summary: `用户拒绝了 ${connectorAction}`,
                  actionFingerprint: fingerprint
                });
                return { ok: false, denied: true, actionType: connectorAction };
              }
              if (!decision) {
                await persistCostCheckpoint();
                const approval = await runService.requestApproval({
                  runId,
                  actionType: connectorAction,
                  recipient: `${request.provider}:${request.path}`,
                  riskLevel: 'high',
                  changeSummary: request.purpose,
                  evidenceSummary: `${request.method} ${request.path}`,
                  impactSummary: `将通过 ${request.provider} API 修改外部数据。`,
                  rollbackSummary: connectorAction === 'delete'
                    ? '删除可能不可恢复；拒绝后不会调用 API。'
                    : '撤销需要一次新的、单独审批的反向 API 操作。',
                  fingerprint
                });
                throw new AgentWaitingForUser(approval);
              }
            }
            const result = await connectorService.request({
              userId: context.run.user_id,
              provider: request.provider,
              method: request.method,
              path: request.path,
              body: request.body
            });
            await runService.appendStep({
              runId,
              workerId,
              role: 'executor',
              status: 'succeeded',
              toolName: `${request.provider}_api`,
              riskLevel: connectorAction === 'read' ? 'low' : 'high',
              summary: request.purpose,
              actionFingerprint: fingerprint,
              sanitizedInput: {
                provider: request.provider,
                method: request.method,
                path: request.path
              },
              sanitizedOutput: {
                status: result.status,
                url: result.sourceUrl,
                untrusted: true,
                injectionSuspected: result.injectionSuspected,
                injectionSignals: result.injectionSignals,
                contentHash: result.contentHash
              }
            });
            return result;
          },
          declareArtifact: async (declaration) => {
            await pauseIfRequested();
            const artifact = await artifactService.ingest({
              run: context.run,
              sandboxName,
              declaration
            });
            await runService.appendStep({
              runId,
              workerId,
              role: 'verifier',
              status: artifact.verificationStatus === 'passed' ? 'succeeded' : 'failed',
              toolName: 'artifact_verifier',
              summary: `验证 ${artifact.filename}`,
              sanitizedInput: {
                role: artifact.role,
                mimeType: artifact.mimeType
              },
              sanitizedOutput: {
                verificationStatus: artifact.verificationStatus,
                byteSize: artifact.byteSize
              }
            });
            return artifact;
          },
          requestApproval: async (request) => {
            await pauseIfRequested();
            const fingerprint = actionFingerprint({
              type: request.actionType,
              recipient: request.recipient,
              changeSummary: request.changeSummary,
              evidenceSummary: request.evidenceSummary,
              impactSummary: request.impactSummary,
              rollbackSummary: request.rollbackSummary
            });
            const approved = await runService.consumeApproval({ runId, fingerprint });
            if (approved) {
              return {
                ...approved,
                consumed: true,
                approved: approved.status === 'approved'
              };
            }
            await persistCostCheckpoint();
            const approval = await runService.requestApproval({
              runId,
              actionType: request.actionType,
              recipient: request.recipient,
              riskLevel: request.takeover || TAKEOVER_ACTIONS.has(request.actionType)
                ? 'blocked'
                : 'high',
              changeSummary: request.changeSummary,
              evidenceSummary: request.evidenceSummary,
              impactSummary: request.impactSummary,
              rollbackSummary: request.rollbackSummary,
              fingerprint
            });
            return { ...approval, consumed: false };
          }
        }
      });
      costMeter.setModel(execution.credits);
      await persistCostCheckpoint({ usageItems: { source: 'model_complete' } });

      if (
        browserInitialized &&
        context.run.browser_config?.persistSession === true &&
        context.run.browser_config?.allowedOrigins?.length === 1
      ) {
        const captured = await sandbox.systemShell(
          sandboxName,
          [
            'set -eu',
            'browser_pid="$(cat /tmp/artigen-chromium/browser.pid 2>/dev/null || true)"',
            'case "$browser_pid" in (*[!0-9]*|"") browser_pid="" ;; esac',
            'test -z "$browser_pid" || kill -TERM "$browser_pid" >/dev/null 2>&1 || true',
            'for attempt in 1 2 3 4 5; do',
            '  test -z "$browser_pid" || ! kill -0 "$browser_pid" >/dev/null 2>&1 && break',
            '  sleep 1',
            'done',
            'cd /tmp/artigen-chromium',
            'rm -f /tmp/artigen-workspace/.artigen/browser-profile.zip',
            'include=""',
            'for path in "Local State" "Default/Cookies" "Default/Local Storage" "Default/Session Storage"; do',
            '  test -e "$path" && include="$include \\"$path\\""',
            'done',
            'test -n "$include"',
            'eval "zip -qr /tmp/artigen-workspace/.artigen/browser-profile.zip $include"',
            'test "$(wc -c </tmp/artigen-workspace/.artigen/browser-profile.zip)" -le 1433600'
          ].join('\n'),
          120
        );
        if (captured.success) {
          const storedProfile = await sandbox.readFile(
            sandboxName,
            '/tmp/artigen-workspace/.artigen/browser-profile.zip'
          );
          await runService.saveBrowserProfile({
            userId: context.run.user_id,
            siteOrigin: context.run.browser_config.allowedOrigins[0],
            archiveBase64: storedProfile.base64
          });
          await runService.appendStep({
            runId,
            workerId,
            role: 'packager',
            status: 'succeeded',
            toolName: 'browser_profile',
            summary: '已加密保存站点会话 30 天',
            sanitizedInput: {
              siteOrigin: context.run.browser_config.allowedOrigins[0]
            }
          });
        } else {
          await runService.appendStep({
            runId,
            workerId,
            role: 'packager',
            status: 'failed',
            toolName: 'browser_profile',
            summary: '浏览器会话过大或不可用，未保存',
            sanitizedOutput: { saved: false }
          });
        }
      }

      await runService.transitionRun({
        runId,
        workerId,
        toStatus: 'verifying',
        eventType: 'run.verifying',
        summary: '正在执行独立交付物验证',
        checkpoint: {
          phase: 'verifying',
          modelResponseId: execution.responseId
        }
      });

      const artifacts = await runService.listArtifacts({
        userId: context.run.user_id,
        runId
      });
      const requiredDeliverables = Array.isArray(objectivePayload.deliverables) &&
          objectivePayload.deliverables.length
        ? objectivePayload.deliverables
        : inferRequiredDeliverables(objectivePayload.objective);
      const minimumArtifactCounts = {
        report: 2,
        spreadsheet: 1,
        presentation: 2,
        website: 1
      };
      const finalCosts = costMeter.snapshot({
        accrue: true,
        minimumSandboxSeconds: 1
      });
      await runService.finishRun({
        runId,
        workerId,
        actualCredits: finalCosts.model + finalCosts.generation + finalCosts.sandbox,
        checklist: {
          requiredArtifactCount: Math.max(
            1,
            requiredDeliverables.reduce(
              (total, type) => total + minimumArtifactCounts[type],
              0
            )
          ),
          requiredDeliverables,
          artifactCount: artifacts.length,
          allArtifactsPassed: artifacts.length > 0 &&
            artifacts.every((artifact) => artifact.verificationStatus === 'passed'),
          editableSourcePresent: artifacts.some((artifact) => (
            artifact.role === 'editable' || artifact.role === 'source'
          )),
          modelClaimIgnoredUntilVerified: true
        }
      });
      terminal = true;
      return { claimed: true, status: 'succeeded' };
    } catch (error) {
      if (error instanceof AgentWaitingForUser || error?.code === 'AGENT_WAITING_FOR_USER') {
        const takeover = error?.approval?.risk_level === 'blocked';
        if (sandboxName && !takeover) await sandbox.suspend(sandboxName).catch(() => {});
        return { claimed: true, status: 'waiting_user' };
      }
      if (error instanceof AgentPaused || error?.code === 'AGENT_PAUSED') {
        return { claimed: true, status: 'paused' };
      }
      if (error instanceof AgentCancelled || error?.code === 'AGENT_CANCELLED') {
        terminal = true;
        return { claimed: true, status: 'cancelled' };
      }
      const failureCosts = costMeter.snapshot({ accrue: true });
      await runService.failRun({
        runId,
        errorCode: String(error?.code || 'AGENT_RUNTIME_FAILED').slice(0, 100),
        refundable: failureCosts.generation <= 0,
        actualCredits: failureCosts.generation
      }).catch((failure) => {
        console.error('Agent failure settlement failed', runId, failure?.code || failure?.message);
      });
      terminal = true;
      throw error;
    } finally {
      if (terminal && sandboxName) {
        try {
          await sandbox.destroy(sandboxName);
          await runService.markSandboxDestroyed?.({
            runId,
            sandboxRef: sandboxName
          });
        } catch (error) {
          console.error('Agent sandbox cleanup failed', runId, error?.code || error?.message);
        }
      }
    }
  };

  const cleanupTerminalSandboxes = async ({ limit = 100 } = {}) => {
    if (
      typeof runService.listTerminalSandboxes !== 'function' ||
      typeof runService.markSandboxDestroyed !== 'function'
    ) {
      return { destroyed: 0, failed: 0 };
    }
    const pending = await runService.listTerminalSandboxes({ limit });
    let destroyed = 0;
    let failed = 0;
    for (const entry of pending) {
      try {
        await sandbox.destroy(entry.sandboxRef);
        await runService.markSandboxDestroyed(entry);
        destroyed += 1;
      } catch (error) {
        failed += 1;
        console.error(
          'Agent terminal sandbox cleanup failed',
          entry.runId,
          error?.code || error?.message
        );
      }
    }
    return { destroyed, failed };
  };

  return {
    processRun,
    workerId,
    readiness,
    startInfrastructure: async () => {
      readiness.desktopRelayReady = await desktopRelay.start();
      return readiness;
    },
    stopInfrastructure: async () => {
      readiness.desktopRelayReady = false;
      await desktopRelay.stop();
    },
    expireStaleRuns: async (input) => {
      const expiredRuns = await runService.expireStaleRuns(input);
      const sandboxCleanup = await cleanupTerminalSandboxes(input);
      const privateData = await runService.purgeExpiredPrivateData?.(input);
      return { expiredRuns, sandboxCleanup, privateData };
    }
  };
};

module.exports = {
  AgentCancelled,
  AgentPaused,
  createAgentCostMeter,
  createAgentWorkerService,
  firstPayload
};
