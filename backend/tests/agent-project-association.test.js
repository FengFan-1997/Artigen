const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { createAgentProjectAssociationService } = require('../services/agent-project-association');
const { createDesignConversationService } = require('../services/design-conversation-service');

// An explicitly supplied local test database only. Never loads the app's .env.
const databaseUrl = process.env.AGENT_ASSOCIATION_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const id = () => crypto.randomUUID();

test('project association validates input and rolls back without writing', async () => {
  const queries = [];
  const service = createAgentProjectAssociationService({ pool: { connect: async () => ({
    query: async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 }; }, release() {}
  }) } });
  await assert.rejects(service.associate({ userId: id(), runId: id(), projectId: '../not-an-id' }), { code: 'AGENT_PROJECT_ID_INVALID' });
  assert.deepEqual(queries, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'ROLLBACK']);
});

test('PostgreSQL project scope, safety, ownership and concurrency', { skip: !enabled }, async (t) => {
  const parsed = new URL(databaseUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname), 'Use an isolated local test database');
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = `project_association_${crypto.randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 8 });
  // Isolated schema keeps these lock/transaction tests away from account data.
  await pool.query(`
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE creative_projects(id uuid PRIMARY KEY,user_id uuid,status text);
    CREATE TABLE design_conversations(id uuid PRIMARY KEY,user_id uuid,project_id uuid,updated_at timestamptz,expires_at timestamptz);
    CREATE TABLE agent_runs(id uuid PRIMARY KEY,user_id uuid,project_id uuid,status text,worker_id text,lease_expires_at timestamptz,idempotency_key text,checkpoint jsonb DEFAULT '{}',updated_at timestamptz,max_credits numeric DEFAULT 50);
    CREATE TABLE design_executions(id uuid PRIMARY KEY,conversation_id uuid REFERENCES design_conversations(id),agent_run_id uuid REFERENCES agent_runs(id),status text,max_credits numeric DEFAULT 50,quoted_credits numeric,tool_task_id uuid,updated_at timestamptz,route_kind text DEFAULT 'agent_run',plan jsonb DEFAULT '{}');
    CREATE TABLE design_conversation_events(id bigserial,conversation_id uuid,event_type text,summary text,data jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE design_planning_jobs(conversation_id uuid,status text);
    CREATE TABLE agent_subagents(run_id uuid,status text);
    CREATE TABLE agent_tool_call_receipts(run_id uuid,state text);
    CREATE TABLE agent_model_call_receipts(run_id uuid,state text);
    CREATE TABLE agent_model_calls(run_id uuid,outcome text);
    CREATE TABLE agent_events(run_id uuid,event_type text,phase text,summary text,data jsonb);
  `);
  const service = createAgentProjectAssociationService({ pool });
  const userId = id(), otherUser = id(), projectId = id(), secondProject = id(), foreignProject = id();
  await pool.query('INSERT INTO users VALUES($1),($2)',[userId,otherUser]);
  await pool.query("INSERT INTO creative_projects VALUES ($1,$2,'active'),($3,$2,'active'),($4,$5,'active')", [projectId, userId, secondProject, foreignProject, otherUser]);
  const newRun = async (status = 'queued', user = userId) => {
    const runId = id(); await pool.query('INSERT INTO agent_runs(id,user_id,status) VALUES($1,$2,$3)', [runId,user,status]); return runId;
  };
  const newConversation = async (runs) => {
    const conversationId = id();
    await pool.query('INSERT INTO design_conversations(id,user_id) VALUES($1,$2)', [conversationId,userId]);
    for (const runId of runs) await pool.query("INSERT INTO design_executions(id,conversation_id,agent_run_id,status) VALUES($1,$2,$3,'running')", [id(),conversationId,runId]);
    return conversationId;
  };
  const input = (runId, overrides = {}) => ({ userId, runId, projectId, ...overrides });
  try {
    await t.test('foreign runs and projects cannot be inspected or linked', async () => {
      const runId = await newRun();
      await assert.rejects(service.getScope(input(runId, { userId: otherUser })), { code: 'AGENT_RUN_NOT_FOUND' });
      await assert.rejects(service.associate(input(runId, { projectId: foreignProject })), { code: 'PROJECT_NOT_FOUND' });
      assert.equal((await pool.query('SELECT project_id FROM agent_runs WHERE id=$1',[runId])).rows[0].project_id, null);
    });
    await t.test('queued initial association is atomic and repeated same project is idempotent', async () => {
      const runId = await newRun();
      const result = await service.associate(input(runId)); assert.equal(result.changed,true);
      assert.equal((await service.associate(input(runId))).changed,false);
      await assert.rejects(service.associate(input(runId, { projectId: secondProject })), { code:'AGENT_PROJECT_CONFLICT' });
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM agent_events WHERE run_id=$1',[runId])).rows[0].n,1);
    });
    await t.test('running requires pause; paused requires explicit confirmation and no worker', async () => {
      const runId = await newRun('running');
      assert.deepEqual((await service.getScope(input(runId))).pausableRunIds,[runId]);
      await assert.rejects(service.associate(input(runId)), { code:'AGENT_PROJECT_PAUSE_REQUIRED' });
      await pool.query("UPDATE agent_runs SET status='paused',worker_id='still-active' WHERE id=$1",[runId]);
      await assert.rejects(service.associate(input(runId,{confirmPaused:true})), { code:'AGENT_PROJECT_WORKER_ACTIVE' });
      await pool.query('UPDATE agent_runs SET worker_id=NULL WHERE id=$1',[runId]);
      await assert.rejects(service.associate(input(runId)), { code:'AGENT_PROJECT_PAUSED_CONFIRM_REQUIRED' });
      await service.associate(input(runId,{confirmPaused:true}));
      assert.equal((await pool.query('SELECT status FROM agent_runs WHERE id=$1',[runId])).rows[0].status,'paused');
    });
    await t.test('subtasks, durable and legacy in-flight calls, verification cannot change scope', async () => {
      for (const [table,column,value,code] of [
        ['agent_subagents','status','running','AGENT_PROJECT_CHILDREN_ACTIVE'],
        ['agent_tool_call_receipts','state','ambiguous','AGENT_PROJECT_CALL_PENDING'],
        ['agent_model_call_receipts','state','received','AGENT_PROJECT_CALL_PENDING'],
        ['agent_model_calls','outcome','running','AGENT_PROJECT_CALL_PENDING']
      ]) {
        const runId = await newRun('paused');
        await pool.query(`INSERT INTO ${table}(run_id,${column}) VALUES($1,$2)`,[runId,value]);
        await assert.rejects(service.associate(input(runId,{confirmPaused:true})), { code });
      }
      const legacy = await newRun('paused');
      await pool.query('UPDATE agent_runs SET checkpoint=$2 WHERE id=$1',[legacy,{toolReceipts:{call:{state:'dispatched'}}}]);
      await assert.rejects(service.associate(input(legacy,{confirmPaused:true})),{code:'AGENT_PROJECT_CALL_PENDING'});
      await assert.rejects(service.associate(input(await newRun('verifying'))),{code:'AGENT_PROJECT_VERIFYING'});
      await service.associate(input(await newRun('succeeded')));
    });
    await t.test('conversation scope is disclosed and all runs update in one transaction', async () => {
      const runs = [await newRun('succeeded'),await newRun('queued')];
      const conversationId = await newConversation(runs);
      const scope = await service.getScope(input(runs[1])); assert.equal(scope.scope,'conversation'); assert.equal(scope.affectedRunCount,2);
      await assert.rejects(service.associate(input(runs[1])),{code:'AGENT_PROJECT_CONVERSATION_CONFIRM_REQUIRED'});
      assert.equal((await pool.query('SELECT project_id FROM design_conversations WHERE id=$1',[conversationId])).rows[0].project_id,null);
      await service.associate(input(runs[1],{confirmConversation:true}));
      assert.equal((await pool.query('SELECT project_id FROM design_conversations WHERE id=$1',[conversationId])).rows[0].project_id,projectId);
      assert.ok((await pool.query('SELECT project_id FROM agent_runs WHERE id=ANY($1::uuid[])',[runs])).rows.every(run=>run.project_id===projectId));
    });
    await t.test('new design Run cannot change project during its create/attach gap', async () => {
      const runId = await newRun(), conversationId = await newConversation([]), executionId = id();
      await pool.query("INSERT INTO design_executions(id,conversation_id,agent_run_id,status) VALUES($1,$2,NULL,'queued')",[executionId,conversationId]);
      await pool.query('UPDATE agent_runs SET idempotency_key=$2 WHERE id=$1',[runId,`design:${executionId}`]);
      const scope = await service.getScope(input(runId)); assert.equal(scope.scope,'conversation');
      await assert.rejects(service.associate(input(runId,{confirmConversation:true})),{code:'AGENT_PROJECT_CONVERSATION_BUSY'});
      assert.equal((await pool.query('SELECT project_id FROM agent_runs WHERE id=$1',[runId])).rows[0].project_id,null);
      await pool.query('UPDATE design_executions SET agent_run_id=$2 WHERE id=$1',[executionId,runId]);
      await service.associate(input(runId,{confirmConversation:true}));
      assert.equal((await pool.query('SELECT project_id FROM design_conversations WHERE id=$1',[conversationId])).rows[0].project_id,projectId);
    });
    await t.test('design attachment keeps the conversation lock and rejects a changed project', async () => {
      const design = createDesignConversationService({ pool, env: { DESIGN_CONVERSATION_ENABLED:'true',AGENT_PAYLOAD_ENCRYPTION_KEY:'hex:'+'42'.repeat(32) } });
      const conversationId = await newConversation([]), executionId = id(), runId = await newRun();
      await pool.query("INSERT INTO design_executions(id,conversation_id,status) VALUES($1,$2,'queued')",[executionId,conversationId]);
      await pool.query('UPDATE agent_runs SET project_id=$2 WHERE id=$1',[runId,projectId]);
      await assert.rejects(design.attachExecutionTarget({userId,conversationId,executionId,agentRunId:runId}), {code:'DESIGN_EXECUTION_PROJECT_CONFLICT'});
      assert.equal((await pool.query('SELECT agent_run_id FROM design_executions WHERE id=$1',[executionId])).rows[0].agent_run_id,null);
      assert.equal((await pool.query('SELECT count(*)::int n FROM design_conversation_events WHERE conversation_id=$1',[conversationId])).rows[0].n,0);
      await pool.query('UPDATE design_conversations SET project_id=$2 WHERE id=$1',[conversationId,projectId]);
      const attached = await design.attachExecutionTarget({userId,conversationId,executionId,agentRunId:runId});
      assert.equal(attached.agentRunId,runId);
      await assert.rejects(service.associate(input(runId,{projectId:secondProject,confirmConversation:true})), {code:'AGENT_PROJECT_CONFLICT'});
    });
    await t.test('attaching an existing Run invalidates a concurrent standalone association snapshot', {timeout:10000}, async () => {
      const conversationId = await newConversation([]), executionId = id(), runId = await newRun();
      await pool.query("INSERT INTO design_executions(id,conversation_id,status) VALUES($1,$2,'queued')",[executionId,conversationId]);
      let releaseAttach, reportAttachedLock, reportAssociationLock;
      const heldAttach = new Promise(resolve => {releaseAttach=resolve;});
      const attachedLock = new Promise(resolve => {reportAttachedLock=resolve;});
      const associationLock = new Promise(resolve => {reportAssociationLock=resolve;});
      const wrapped = (hook) => ({connect:async()=> {
        const client=await pool.connect();
        return {release:()=>client.release(),query:async(sql,values)=>hook(client,sql,values)};
      }});
      const design = createDesignConversationService({ pool:wrapped(async(client,sql,values)=> {
        if(sql.startsWith('UPDATE agent_runs SET updated_at=clock_timestamp()')) { reportAttachedLock(); await heldAttach; }
        return client.query(sql,values);
      }),env:{DESIGN_CONVERSATION_ENABLED:'true',AGENT_PAYLOAD_ENCRYPTION_KEY:'hex:'+'42'.repeat(32)}});
      const racing = createAgentProjectAssociationService({pool:wrapped((client,sql,values)=> {
        const response=client.query(sql,values);
        if(sql.includes('WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE')) reportAssociationLock();
        return response;
      })});
      const attaching=design.attachExecutionTarget({userId,conversationId,executionId,agentRunId:runId});
      try {
        await attachedLock;
        const associating=racing.associate(input(runId));
        // Install rejection handling before releasing the transaction it waits on.
        const rejected=assert.rejects(associating,{code:'AGENT_PROJECT_STATE_CHANGED'});
        await associationLock;
        releaseAttach();
        await attaching;
        await rejected;
        assert.equal((await pool.query('SELECT project_id FROM agent_runs WHERE id=$1',[runId])).rows[0].project_id,null);
        assert.equal((await service.getScope(input(runId))).scope,'conversation');
      } finally { releaseAttach(); await attaching.catch(()=>{}); }
    });
    await t.test('pending planning or unbound execution blocks conversation association', async () => {
      const runId = await newRun('succeeded'); const conversationId = await newConversation([runId]);
      await pool.query("INSERT INTO design_planning_jobs VALUES($1,'queued')",[conversationId]);
      await assert.rejects(service.associate(input(runId,{confirmConversation:true})),{code:'AGENT_PROJECT_CONVERSATION_BUSY'});
      await pool.query('DELETE FROM design_planning_jobs WHERE conversation_id=$1',[conversationId]);
      await pool.query("INSERT INTO design_executions(id,conversation_id,agent_run_id,status) VALUES($1,$2,NULL,'waiting_upload')",[id(),conversationId]);
      await assert.rejects(service.associate(input(runId,{confirmConversation:true})),{code:'AGENT_PROJECT_CONVERSATION_BUSY'});
    });
    await t.test('competing first associations never split conversation and run ownership', async () => {
      const runs = [await newRun(),await newRun('succeeded')], conversationId = await newConversation(runs);
      const outcomes = await Promise.allSettled([
        service.associate(input(runs[0],{confirmConversation:true})),
        service.associate(input(runs[1],{projectId:secondProject,confirmConversation:true}))
      ]);
      assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
      assert.ok(outcomes.some(item=>item.status==='rejected' && ['AGENT_PROJECT_STATE_CHANGED','AGENT_PROJECT_CONFLICT'].includes(item.reason.code)));
      const owned = (await pool.query('SELECT project_id FROM design_conversations WHERE id=$1',[conversationId])).rows[0].project_id;
      assert.ok((await pool.query('SELECT project_id FROM agent_runs WHERE id=ANY($1::uuid[])',[runs])).rows.every(run=>run.project_id===owned));
    });
    await t.test('new conversation request holding the conversation lock cannot race past association', async () => {
      const runId = await newRun('succeeded'), conversationId = await newConversation([runId]);
      const writer = await pool.connect();
      try {
        await writer.query('BEGIN');
        await writer.query('SELECT id FROM design_conversations WHERE id=$1 FOR UPDATE',[conversationId]);
        const associating = service.associate(input(runId,{confirmConversation:true}));
        await writer.query("INSERT INTO design_planning_jobs VALUES($1,'queued')",[conversationId]);
        await writer.query('UPDATE design_conversations SET updated_at=clock_timestamp() WHERE id=$1',[conversationId]);
        await writer.query('COMMIT');
        await assert.rejects(associating, error => ['AGENT_PROJECT_STATE_CHANGED','AGENT_PROJECT_CONVERSATION_BUSY'].includes(error.code));
        assert.equal((await pool.query('SELECT project_id FROM agent_runs WHERE id=$1',[runId])).rows[0].project_id,null);
      } finally { await writer.query('ROLLBACK').catch(()=>{}); writer.release(); }
    });
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
