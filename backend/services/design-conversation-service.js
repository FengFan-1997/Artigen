const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const {
  assertToolOperation,
  resolveOperationExecution
} = require('../lib/tool-catalog');
const { resolveUserId } = require('./billing-service');
const {
  decryptDesignExecution,
  decryptDesignMessage,
  encryptDesignExecution,
  encryptDesignMessage,
  hasAgentPayloadKey
} = require('./agent-payload-service');
const { normalizeActionType, sanitizeLogValue, sanitizeText } = require('./agent-policy-service');
const { getAgentConfig, resolveAgentRuntimeAssignment } = require('./agent-config');
const {
  classifyRuntimeFailure,
  normalizeTaskSpec,
  selectAgentSkills,
  taskPlannerMessages
} = require('./agent-runtime-v2');
const { parseRetryAfterMs } = require('./agent-model-runtime-service');
const { createCreativeProjectService } = require('./creative-project-service');

const TEXT_MODEL = 'Qwen/Qwen3-8B';
const IMAGE_MODEL = 'Kwai-Kolors/Kolors';
const ROUTE_KINDS = new Set(['reply', 'local_tool', 'tool_task', 'agent_run']);
const EXECUTION_STATUSES = new Set([
  'planning',
  'waiting_clarification',
  'waiting_upload',
  'waiting_budget',
  'queued',
  'running',
  'waiting_authorization',
  'succeeded',
  'failed',
  'cancelled'
]);
const CLOUD_TOOLS = new Set([
  'ai-design:generate',
  'ai-design:directions',
  'background:ai-scene',
  'id-photo:professional-portrait',
  'ingredient-label:ai-organize-source-text',
  'old-photo:enhance',
  'old-photo:enhance-colorize'
]);
const SAFE_SESSION_ACTIONS = new Set([
  'send',
  'publish',
  'submit',
  'delete',
  'change_permissions',
  'browser_fill',
  'browser_interaction'
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const URL_RE = /https:\/\/[^\s<>()"']+/gi;

const enabled = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim());
const integer = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(parsed) ? parsed : fallback));
};

const waitFor = (milliseconds, signal = null) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new ApiError(409, 'DESIGN_PLANNING_LEASE_LOST'));
    return;
  }
  const onAbort = () => {
    clearTimeout(timer);
    reject(new ApiError(409, 'DESIGN_PLANNING_LEASE_LOST'));
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, Math.max(0, Number(milliseconds) || 0));
  timer.unref?.();
  signal?.addEventListener('abort', onAbort, { once: true });
});

const normalizePlannerSteps = (steps) => {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((item) => {
      if (typeof item === 'string') return sanitizeText(item, 200);
      if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
      return sanitizeText(item.label || item.title || item.description || '', 200);
    })
    .filter(Boolean)
    .slice(0, 6);
};

const getDesignConversationConfig = (env = process.env) => Object.freeze({
  enabled: enabled(env.DESIGN_CONVERSATION_ENABLED),
  workerEnabled: enabled(env.DESIGN_CONVERSATION_WORKER_ENABLED),
  autoCreditCap: integer(env.DESIGN_CONVERSATION_AUTO_CREDIT_CAP, 50, 1, 500),
  retentionDays: integer(env.DESIGN_CONVERSATION_RETENTION_DAYS, 30, 1, 30),
  authorizationIdleMinutes: integer(env.DESIGN_CONVERSATION_AUTH_IDLE_MINUTES, 30, 5, 120),
  pollMs: integer(env.DESIGN_CONVERSATION_POLL_MS, 750, 250, 5000),
  planningLeaseSeconds: integer(env.DESIGN_CONVERSATION_PLANNING_LEASE_SECONDS, 90, 1, 300),
  planningLeaseHeartbeatMs: integer(
    env.DESIGN_CONVERSATION_PLANNING_LEASE_HEARTBEAT_MS,
    20_000,
    100,
    60_000
  ),
  plannerMaxTokens: integer(env.DESIGN_CONVERSATION_PLANNER_MAX_TOKENS, 1800, 512, 4096),
  model: String(env.AGENT_MODEL_NAME || (
    String(env.AGENT_MODEL_PROVIDER || '').trim().toLowerCase() === 'cloudflare'
      ? '@cf/openai/gpt-oss-120b'
      : TEXT_MODEL
  )).trim(),
  imageModel: IMAGE_MODEL
});

const transaction = async (pool, callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const readTransaction = async (pool, callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const normalizeMessageText = (value) => {
  const text = String(value || '').trim();
  if (text.length < 1 || text.length > 20_000) {
    throw new ApiError(400, 'DESIGN_MESSAGE_INVALID', { field: 'message' });
  }
  return text;
};

const normalizeAttachmentManifest = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) {
    throw new ApiError(400, 'DESIGN_ATTACHMENTS_INVALID', { field: 'attachments' });
  }
  return value.map((entry, index) => {
    const clientId = sanitizeText(entry?.clientId, 120);
    const name = sanitizeText(entry?.name, 240);
    const mimeType = String(entry?.mimeType || '').trim().toLowerCase().slice(0, 160);
    const byteSize = Number(entry?.byteSize || 0);
    if (!clientId || !name || !mimeType || !Number.isSafeInteger(byteSize) || byteSize < 1) {
      throw new ApiError(400, 'DESIGN_ATTACHMENTS_INVALID', {
        field: `attachments.${index}`
      });
    }
    return { clientId, name, mimeType, byteSize };
  });
};

const titleFromText = (value) => {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  return sanitizeText(compact.slice(0, 42) || '新的设计任务', 160);
};

const publicConversation = (row) => ({
  conversationId: row.id,
  projectId: row.project_id || null,
  title: row.title,
  status: row.status,
  autoCreditCap: Number(row.auto_credit_cap || 50),
  clarificationRounds: Number(row.clarification_rounds || 0),
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const publicMessage = (row, env) => {
  const value = decryptDesignMessage({
    conversationId: row.conversation_id,
    messageId: row.id,
    role: row.role,
    record: row,
    env
  });
  return {
    messageId: row.id,
    sequence: Number(row.sequence),
    role: row.role,
    kind: row.kind,
    status: row.status,
    text: String(value?.text || ''),
    attachments: Array.isArray(value?.attachments) ? value.attachments : [],
    questions: Array.isArray(value?.questions) ? value.questions : [],
    assumptions: Array.isArray(value?.assumptions) ? value.assumptions : [],
    memoryCandidates: Array.isArray(value?.memoryCandidates) ? value.memoryCandidates : [],
    createdAt: row.created_at
  };
};

const decodeExecutionPlan = (row, env = process.env) => {
  const stored = row.plan && typeof row.plan === 'object' && !Array.isArray(row.plan)
    ? row.plan
    : {};
  const { _sealed: sealed, ...publicPlan } = stored;
  if (!sealed || typeof sealed !== 'object') return publicPlan;
  const privatePlan = decryptDesignExecution({
    conversationId: row.conversation_id,
    executionId: row.id,
    record: {
      algorithm: sealed.algorithm,
      iv: Buffer.from(String(sealed.iv || ''), 'base64'),
      auth_tag: Buffer.from(String(sealed.authTag || ''), 'base64'),
      ciphertext: Buffer.from(String(sealed.ciphertext || ''), 'base64')
    },
    env
  });
  return { ...publicPlan, ...(privatePlan && typeof privatePlan === 'object' ? privatePlan : {}) };
};

const sealExecutionPlan = ({ conversationId, executionId, publicPlan, privatePlan, env = process.env }) => {
  const encrypted = encryptDesignExecution({ conversationId, executionId, value: privatePlan, env });
  return {
    ...publicPlan,
    _sealed: {
      algorithm: encrypted.algorithm,
      keyVersion: encrypted.keyVersion,
      iv: encrypted.iv.toString('base64'),
      authTag: encrypted.authTag.toString('base64'),
      ciphertext: encrypted.ciphertext.toString('base64')
    }
  };
};

const publicExecution = (row, env = process.env) => ({
  executionId: row.id,
  conversationId: row.conversation_id,
  sourceMessageId: row.source_message_id || null,
  routeKind: row.route_kind,
  status: row.derived_status || row.status,
  toolId: row.tool_id || null,
  operation: row.operation || null,
  toolTaskId: row.tool_task_id || null,
  agentRunId: row.agent_run_id || null,
  localRoute: row.local_route || null,
  maxCredits: Number(row.max_credits || 50),
  quotedCredits: row.quoted_credits === null ? null : Number(row.quoted_credits),
  plan: decodeExecutionPlan(row, env),
  error: row.error_code ? { code: row.error_code } : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  finishedAt: row.finished_at || null
});

const publicConversationAsset = (row) => ({
  clientId: row.client_id,
  assetId: row.asset_id,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size || 0),
  createdAt: row.created_at
});

const publicEvent = (row) => ({
  eventId: String(row.id),
  conversationId: row.conversation_id,
  type: row.event_type,
  summary: row.summary,
  data: row.data && typeof row.data === 'object' ? row.data : {},
  createdAt: row.created_at
});

const safeJsonObject = (raw) => {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new ApiError(502, 'DESIGN_PLANNER_OUTPUT_INVALID');
  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    return parsed;
  } catch {
    throw new ApiError(502, 'DESIGN_PLANNER_OUTPUT_INVALID', { retryable: true });
  }
};

const explicitHttpsOrigins = (text) => {
  const found = String(text || '').match(URL_RE) || [];
  const origins = [];
  for (const value of found) {
    try {
      const url = new URL(value.replace(/[.,;!?，。；！？]+$/u, ''));
      if (url.protocol === 'https:' && !origins.includes(url.origin)) origins.push(url.origin);
    } catch {}
  }
  return origins.slice(0, 10);
};

const inferDeliverables = (text, proposed = []) => {
  const value = String(text || '').toLowerCase();
  const allowed = new Set(['report', 'spreadsheet', 'presentation', 'website', 'image']);
  const nounPatterns = {
    report: '(?:报告|方案|审计|pdf|markdown|\\bmd\\b|reports?|proposals?|audits?)',
    spreadsheet: '(?:表格|工作簿|xlsx?|excel|spreadsheets?|workbooks?)',
    presentation: '(?:pptx?|powerpoint|演示(?:文稿|稿)?|幻灯片|路演稿|presentations?|slides?)',
    website: '(?:网站|网页|静态站点|网站原型|网页原型|websites?|webpages?|web\\s+pages?|prototypes?|landing\\s+pages?)',
    image: '(?:图片|生图|海报|视觉稿|主视觉|概念图|images?|posters?|visuals?|key\\s+visuals?)'
  };
  const explicitlyNegated = (kind) => {
    const noun = nounPatterns[kind];
    return new RegExp(
      `(?:不要|无需|不需要|别|禁止|不含|不包括|排除|无)\\s*[^\\n。！？；;,，.]{0,60}?${noun}`,
      'iu'
    ).test(value) || new RegExp(
      `\\b(?:do\\s+not|don't|no|without|exclude|excluding)\\b\\s*[^\\n.!?;,]{0,80}?${noun}`,
      'iu'
    ).test(value);
  };
  const requested = (kind) => !explicitlyNegated(kind) && new RegExp(nounPatterns[kind], 'iu').test(value);
  const result = Array.isArray(proposed)
    ? proposed
      .map((item) => String(item || '').trim())
      .filter((item) => (
        allowed.has(item) &&
        requested(item)
      ))
    : [];
  const add = (kind) => { if (!result.includes(kind)) result.push(kind); };
  if (requested('image')) add('image');
  if (requested('report')) add('report');
  if (requested('spreadsheet')) add('spreadsheet');
  if (requested('presentation')) add('presentation');
  if (requested('website')) add('website');
  if (!result.length) add('report');
  return result.slice(0, 5);
};

const repairPlannerRoute = ({ raw, text }) => {
  const value = String(text || '').trim();
  const wantsExecution = /(?:帮我|请|给我|需要|想要|开始|直接|立即|生成|制作|创建|设计|处理|转换|压缩|修复|增强|换|整理|输出|导出|build|create|generate|make|design|convert|compress)/iu.test(value);
  if (!wantsExecution) return raw;
  const wantsResearch = /(?:调研|审计|浏览(?:网站|网页)|搜索资料|竞品|shell|脚本|代码|多文件|完整提案|research|audit|browse|website|spreadsheet|xlsx|pptx|presentation)/iu.test(value);
  const deliverables = inferDeliverables(value, raw.deliverables);
  if (/(?:图片.*压缩|压缩.*图片|compress image)/iu.test(value)) {
    return { ...raw, routeKind: 'local_tool', toolId: 'image-batch', operation: 'compress' };
  }
  if (/(?:图片.*转.*pdf|images?.*to.*pdf)/iu.test(value)) {
    return { ...raw, routeKind: 'local_tool', toolId: 'pdf-image', operation: 'images-to-pdf' };
  }
  if (/(?:pdf.*转.*图片|pdf.*to.*image)/iu.test(value)) {
    return { ...raw, routeKind: 'local_tool', toolId: 'pdf-image', operation: 'pdf-page' };
  }
  if (wantsResearch || deliverables.length > 1) {
    return { ...raw, routeKind: 'agent_run', deliverables };
  }
  if (/(?:老照片|旧照片|修复照片|上色)/u.test(value)) {
    return {
      ...raw,
      routeKind: 'tool_task',
      toolId: 'old-photo',
      operation: /(?:上色|着色|color)/iu.test(value) ? 'enhance-colorize' : 'enhance'
    };
  }
  if (/(?:证件照|职业照|职业头像|professional portrait)/iu.test(value)) {
    return { ...raw, routeKind: 'tool_task', toolId: 'id-photo', operation: 'professional-portrait' };
  }
  if (/(?:换背景|添加背景|场景背景|background scene)/iu.test(value)) {
    return { ...raw, routeKind: 'tool_task', toolId: 'background', operation: 'ai-scene' };
  }
  if (/(?:配料表|成分表|ingredient)/iu.test(value)) {
    return {
      ...raw,
      routeKind: 'tool_task',
      toolId: 'ingredient-label',
      operation: 'ai-organize-source-text'
    };
  }
  if (/(?:生图|生成图片|画一张|海报|主视觉|视觉稿|概念图|image|poster|key visual)/iu.test(value)) {
    return { ...raw, routeKind: 'tool_task', toolId: 'ai-design', operation: 'generate' };
  }
  return raw;
};

const normalizePlannerDecision = ({
  raw,
  text,
  attachments,
  clarificationRounds,
  creditCap,
  textModel = TEXT_MODEL
}) => {
  const repaired = repairPlannerRoute({ raw, text });
  raw = repaired;
  let routeKind = String(raw.routeKind || raw.route || 'reply').trim().toLowerCase();
  if (!ROUTE_KINDS.has(routeKind)) routeKind = 'reply';
  const proposedQuestions = Array.isArray(raw.questions)
    ? raw.questions.map((question) => sanitizeText(question, 240)).filter(Boolean).slice(0, 2)
    : [];
  const needsClarification = Boolean(raw.needsClarification) && proposedQuestions.length > 0 && clarificationRounds < 1;
  const reply = sanitizeText(raw.reply || raw.message || '', 4000) || (
    needsClarification
      ? '为了把结果做准，我只需要确认下面两点。'
      : '我已经整理好执行路线。'
  );
  const assumptions = Array.isArray(raw.assumptions)
    ? raw.assumptions.map((item) => sanitizeText(item, 300)).filter(Boolean).slice(0, 6)
    : [];
  if (needsClarification) {
    return {
      routeKind: 'reply',
      status: 'waiting_clarification',
      reply,
      questions: proposedQuestions,
      assumptions,
      plan: { label: '等待补充', steps: proposedQuestions, executor: textModel }
    };
  }

  const inputCount = attachments.length;
  if (routeKind === 'local_tool') {
    const requestedTool = String(raw.toolId || '').trim();
    const checked = assertToolOperation(requestedTool, raw.operation);
    if (!checked.ok || resolveOperationExecution(checked.tool, checked.operation) !== 'local') {
      routeKind = 'reply';
    } else {
      return {
        routeKind,
        status: 'queued',
        reply,
        assumptions,
        toolId: checked.tool.id,
        operation: checked.operation,
        localRoute: checked.tool.route,
        plan: {
          label: checked.tool.name?.zh || checked.tool.id,
          steps: ['在浏览器中打开本地工具', '载入已选择的本地文件', '处理并下载结果'],
          executor: 'local_tool',
          uploadRequired: false,
          attachmentClientIds: attachments.map((item) => item.clientId)
        }
      };
    }
  }

  if (routeKind === 'tool_task') {
    const requestedTool = String(raw.toolId || '').trim();
    const requestedOperation = String(raw.operation || '').trim();
    const key = `${requestedTool}:${requestedOperation}`;
    const checked = assertToolOperation(requestedTool, requestedOperation);
    if (!checked.ok || !CLOUD_TOOLS.has(key)) {
      routeKind = 'agent_run';
    } else {
      const imageAttachments = attachments.filter((item) => /^image\/(?:png|jpeg|webp)$/i.test(item.mimeType));
      const singleImageInput = imageAttachments.slice(0, 1);
      const singleImageTools = new Set([
        'ai-design:generate',
        'old-photo:enhance',
        'old-photo:enhance-colorize',
        'id-photo:professional-portrait',
        'background:ai-scene'
      ]);
      const selectedAttachments = singleImageTools.has(key) ? singleImageInput : [];
      const boundedAssumptions = imageAttachments.length > 1 && singleImageTools.has(key)
        ? [...assumptions, 'Kolors 单参考图流程只使用第一张已选择的图片。'].slice(0, 6)
        : assumptions;
      let options = {};
      if (key === 'ai-design:generate') {
        options = {
          prompt: text,
          profileId: selectedAttachments.length ? 'product-reference-v1' : 'standard-v1',
          aspectRatio: ['1:1', '4:5', '3:4', '16:9', '9:16'].includes(String(raw.options?.aspectRatio || ''))
            ? String(raw.options.aspectRatio)
            : '1:1',
          ...(selectedAttachments.length ? { referenceRoles: ['product'] } : {})
        };
      } else if (key === 'ai-design:directions') {
        options = { prompt: text, locale: 'zh', productProfile: null };
      } else if (key === 'id-photo:professional-portrait') {
        options = { style: ['finance', 'tech', 'scholar', 'creative', 'leader'].includes(raw.options?.style)
          ? raw.options.style : 'creative' };
      } else if (key === 'background:ai-scene') {
        options = { mode: 'add', presetId: sanitizeText(raw.options?.presetId || 'studio-white', 80) };
      } else if (key === 'ingredient-label:ai-organize-source-text') {
        options = { sourceText: text, productType: 'Food', locale: 'zh' };
      } else if (requestedTool === 'old-photo') {
        options = { colorize: requestedOperation === 'enhance-colorize' };
      }
      const inputRequired = new Set([
        'old-photo:enhance',
        'old-photo:enhance-colorize',
        'id-photo:professional-portrait',
        'background:ai-scene'
      ]).has(key);
      return {
        routeKind,
        status: selectedAttachments.length || inputRequired ? 'waiting_upload' : 'queued',
        reply,
        assumptions: boundedAssumptions,
        toolId: checked.tool.id,
        operation: checked.operation,
        options,
        plan: {
          label: checked.tool.name?.zh || checked.tool.id,
          steps: ['取得服务端报价', '创建受控任务', '验证并交付结果'],
          executor: 'tool_task',
          uploadRequired: selectedAttachments.length > 0 || inputRequired,
          attachmentClientIds: selectedAttachments.map((item) => item.clientId)
        }
      };
    }
  }

  if (routeKind === 'agent_run') {
    const origins = explicitHttpsOrigins(text);
    const deliverables = inferDeliverables(text, raw.deliverables);
    const plannerSteps = normalizePlannerSteps(raw.steps);
    return {
      routeKind,
      status: inputCount ? 'waiting_upload' : 'queued',
      reply,
      assumptions,
      objective: text,
      capabilities: {
        files: true,
        shell: true,
        browser: origins.length > 0,
        generate_images: deliverables.includes('image'),
        subagents: true
      },
      deliverables,
      browserConfig: { allowedOrigins: origins, persistSession: false },
      plan: {
        label: 'Computer Agent',
        steps: plannerSteps.length
          ? plannerSteps
          : ['拆解目标与交付物', '在隔离环境中执行', '验证并打包结果'],
        executor: 'agent_run',
        uploadRequired: inputCount > 0,
        attachmentClientIds: attachments.map((item) => item.clientId),
        maxCredits: creditCap,
        capabilities: {
          files: true,
          shell: true,
          browser: origins.length > 0,
          generate_images: deliverables.includes('image'),
          subagents: true
        },
        deliverables,
        browserConfig: { allowedOrigins: origins, persistSession: false }
      }
    };
  }

  return {
    routeKind: 'reply',
    status: 'succeeded',
    reply,
    assumptions,
    plan: { label: '设计建议', steps: [], executor: textModel }
  };
};

const normalizeMemoryCandidates = (value, userText) => {
  const allowedFields = new Set([
    'audience',
    'goals',
    'tone',
    'visualKeywords',
    'mustInclude',
    'avoid',
    'outputPreferences',
    'factualConstraints'
  ]);
  const source = String(userText || '').toLocaleLowerCase();
  const candidates = [];
  for (const candidate of Array.isArray(value) ? value : []) {
    const field = String(candidate?.field || '').trim();
    if (!allowedFields.has(field)) continue;
    const rawValue = candidate?.value;
    const leaves = Array.isArray(rawValue)
      ? rawValue
      : rawValue && typeof rawValue === 'object'
        ? Object.values(rawValue).flatMap((entry) => Array.isArray(entry) ? entry : [entry])
        : [rawValue];
    const normalizedLeaves = leaves
      .map((entry) => sanitizeText(entry, 300))
      .filter(Boolean);
    if (!normalizedLeaves.length || normalizedLeaves.some((entry) => (
      !source.includes(entry.toLocaleLowerCase())
    ))) continue;
    candidates.push({
      field,
      value: Array.isArray(rawValue)
        ? normalizedLeaves
        : rawValue && typeof rawValue === 'object'
          ? sanitizeLogValue(rawValue)
          : normalizedLeaves[0]
    });
    if (candidates.length >= 3) break;
  }
  return candidates;
};

const enrichPlannerDecision = ({ decision, raw, text, creditCap, allowMemory = false }) => {
  const complexity = ['simple', 'medium', 'high'].includes(raw?.complexity)
    ? raw.complexity
    : decision.routeKind === 'agent_run'
      ? 'high'
      : decision.routeKind === 'reply'
        ? 'simple'
        : 'medium';
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence ?? 0.75)));
  const capabilities = decision.capabilities || {};
  const deliverables = decision.deliverables || [];
  const skillIds = selectAgentSkills({
    objective: text,
    deliverables,
    capabilities,
    requestedSkillIds: raw?.skillIds
  }).map((skill) => skill.id);
  const memoryCandidates = allowMemory
    ? normalizeMemoryCandidates(raw?.memoryCandidates, text)
    : [];
  if (decision.routeKind !== 'agent_run') {
    return { ...decision, complexity, confidence, skillIds, memoryCandidates };
  }
  const taskSpec = normalizeTaskSpec({
    ...(raw?.taskSpec && typeof raw.taskSpec === 'object' ? raw.taskSpec : {}),
    goal: text,
    complexity,
    confidence,
    deliverables,
    allowedOrigins: decision.browserConfig?.allowedOrigins || [],
    skillIds,
    plan: normalizePlannerSteps(raw?.steps).map((label, index) => ({
      id: `step-${index + 1}`,
      label,
      phase: decision.capabilities?.browser && index === 0 ? 'research' : 'production'
    })),
    budget: { maxCredits: creditCap }
  }, {
    objective: text,
    deliverables,
    capabilities,
    allowedOrigins: decision.browserConfig?.allowedOrigins || [],
    maxCredits: creditCap
  });
  return {
    ...decision,
    complexity,
    confidence,
    skillIds: taskSpec.skillIds,
    taskSpec,
    memoryCandidates,
    plan: { ...decision.plan, taskSpec }
  };
};

const requiresDeepPlanner = ({ decision, raw, text }) => {
  if (!decision || decision.routeKind !== 'agent_run') return false;
  const objective = String(text || '');
  const explicitSubagents = raw?.requiresSubagents === true ||
    /(?:子\s*agent|子代理|并行(?:调研|分析|起草|执行)|delegate)/iu.test(objective);
  const externalWrite = raw?.requiresExternalWrite === true ||
    /(?:发布|提交|发送|上传到|写入|删除|修改权限|publish|submit|send|delete)/iu.test(objective);
  return decision.complexity === 'high' ||
    Number(decision.confidence || 0) < 0.85 ||
    (Array.isArray(decision.deliverables) && decision.deliverables.length > 1) ||
    decision.capabilities?.browser === true ||
    explicitSubagents ||
    externalWrite;
};

const plannerMessages = ({
  history,
  message,
  attachmentCount,
  projectMemory = null,
  textModel = TEXT_MODEL
}) => [{
  role: 'system',
  content: `You are Artigen's design request router. The server-pinned text model is ${textModel}; never request or switch models.
Return one JSON object and no markdown. Schema:
{"routeKind":"reply|local_tool|tool_task|agent_run","complexity":"simple|medium|high","confidence":0.0,"reply":"Chinese answer","needsClarification":false,"questions":[],"assumptions":[],"toolId":"","operation":"","options":{},"deliverables":[],"skillIds":[],"taskSpec":{},"memoryCandidates":[],"steps":[]}
Ask at most two questions only when the missing answer materially changes the result. Choose reply for advice or brainstorming without an execution request. Choose tool_task for: ai-design generate/directions, old-photo enhance/enhance-colorize, id-photo professional-portrait, background ai-scene, ingredient-label ai-organize-source-text. Local tools are strictly: image-batch convert/compress/resize/rotate/filter/pipeline; privacy-redaction redact/export/pdf; video-frame extract; pdf-image pdf-page/pdf-range-zip/pdf-long-image/images-to-pdf; pdf-text-word extract-text-docx; document-pdf txt-local/word-server-faithful; video-gif convert; favicon generate/export/zip. Choose agent_run for research, browser, shell, multiple files, or multiple deliverable formats. Never set prices, models, credentials, or permissions. All image output is handled by Kwai-Kolors/Kolors downstream.`
}, {
  role: 'user',
  content: JSON.stringify({
    recentConversation: history.slice(-6),
    currentMessage: message,
    attachmentCount,
    projectMemory
  })
}];

const createDesignConversationService = ({
  pool,
  env = process.env,
  chatGenerate,
  providerScheduler = null,
  modelCallService = null,
  workerId = `design-planner:${process.pid}`
} = {}) => {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('DESIGN_CONVERSATION_POOL_REQUIRED');
  const config = getDesignConversationConfig(env);
  const agentConfig = getAgentConfig(env);
  const projectService = createCreativeProjectService({ pool, env });
  let timer = null;
  let processing = false;

  const generateModelJson = async ({
    messages,
    phase,
    priority,
    thinkingEnabled,
    conversation,
    maxTokens,
    signal = null
  }) => {
    let requestMessages = Array.isArray(messages) ? [...messages] : [];
    let schemaCorrectionAttempt = 0;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const attemptThinkingEnabled = thinkingEnabled && schemaCorrectionAttempt === 0;
      const promptHash = crypto.createHash('sha256')
        .update(JSON.stringify({ messages: requestMessages, tools: [] }))
        .digest('hex');
      const slot = providerScheduler && agentConfig.providerSchedulerEnabled
        ? await providerScheduler.acquire({ priority, signal })
        : { queueWaitMs: 0 };
      const call = modelCallService
        ? await modelCallService.start({
            conversationId: conversation.id,
            userId: conversation.user_id,
            provider: agentConfig.modelProvider,
            modelName: agentConfig.modelName,
            phase,
            turn: 0,
            attempt,
            promptProfile: phase === 'router' ? 'design-router-v2' : 'design-planner-v2',
            promptHash,
            thinkingEnabled: attemptThinkingEnabled,
            estimatedInputTokens: JSON.stringify(requestMessages).length / 4
          }).catch(() => null)
        : null;
      let response = null;
      try {
        response = await chatGenerate({
          phase,
          promptHash,
          messages: requestMessages,
          model: agentConfig.modelName,
          maxTokens,
          enableThinking: attemptThinkingEnabled,
          responseFormat: 'json_object',
          temperature: attemptThinkingEnabled ? 0.6 : 0.2,
          topP: attemptThinkingEnabled ? 0.95 : 0.7,
          topK: attemptThinkingEnabled ? 20 : undefined,
          minP: attemptThinkingEnabled ? 0 : undefined,
          timeoutMs: 60_000,
          signal,
          skipRateGate: Boolean(providerScheduler && agentConfig.providerSchedulerEnabled)
        });
        const parsed = safeJsonObject(response?.text);
        if (call) {
          await modelCallService.finish(call, {
            outcome: 'succeeded',
            inputTokens: Number(response?.usage?.promptTokens || 0),
            outputTokens: Number(response?.usage?.completionTokens || 0),
            queueWaitMs: slot.queueWaitMs
          }).catch(() => {});
        }
        return parsed;
      } catch (error) {
        if (call) {
          await modelCallService.finish(call, {
            outcome: 'failed',
            inputTokens: Number(response?.usage?.promptTokens || 0),
            outputTokens: Number(response?.usage?.completionTokens || 0),
            queueWaitMs: slot.queueWaitMs,
            errorCode: String(error?.code || 'DESIGN_PLANNER_FAILED').slice(0, 100)
          }).catch(() => {});
        }
        const classified = classifyRuntimeFailure(error);
        const schemaRetry = classified.category === 'validation';
        const providerRetry = classified.category === 'transient_provider';
        if ((!schemaRetry && !providerRetry) || attempt >= 3) throw error;
        if (schemaRetry) {
          schemaCorrectionAttempt += 1;
          requestMessages = [
            ...requestMessages,
            { role: 'assistant', content: String(response?.text || '').slice(0, 4000) },
            {
              role: 'user',
              content: 'The previous output was not one valid JSON object matching the requested schema. Return only a corrected JSON object; do not include markdown or reasoning.'
            }
          ];
          continue;
        }
        const retryAfter = parseRetryAfterMs(
          error?.retryAfter || error?.failures?.find((failure) => failure?.retryAfter)?.retryAfter
        );
        if (retryAfter > 0 && providerScheduler?.defer) {
          await providerScheduler.defer(retryAfter);
        }
        await waitFor(
          Math.max(retryAfter, Math.min(8000, 500 * (2 ** (attempt - 1)))),
          signal
        );
      }
    }
    throw new ApiError(502, 'DESIGN_PLANNER_FAILED', { retryable: true });
  };

  const requireEnabled = () => {
    if (!config.enabled) throw new ApiError(404, 'DESIGN_CONVERSATION_DISABLED');
    if (!hasAgentPayloadKey(env)) {
      throw new ApiError(503, 'AGENT_PAYLOAD_KEY_MISSING', { retryable: false });
    }
  };

  const resolveOwnedConversation = async (client, { userId, conversationId, lock = false }) => {
    const dbUserId = await resolveUserId(client, userId);
    const result = await client.query(
      `SELECT * FROM design_conversations
        WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp()
        ${lock ? 'FOR UPDATE' : ''}`,
      [conversationId, dbUserId]
    );
    if (!result.rowCount) throw new ApiError(404, 'DESIGN_CONVERSATION_NOT_FOUND');
    return { dbUserId, row: result.rows[0] };
  };

  const insertEvent = async (client, { conversationId, type, summary = '', data = {} }) => {
    const result = await client.query(
      `INSERT INTO design_conversation_events (conversation_id,event_type,summary,data)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [conversationId, sanitizeText(type, 100), sanitizeText(summary, 500), JSON.stringify(sanitizeLogValue(data))]
    );
    await client.query(
      `SELECT pg_notify('design_conversation_events',$1)`,
      [JSON.stringify({ conversationId, eventId: String(result.rows[0].id) })]
    );
    return publicEvent(result.rows[0]);
  };

  const insertMessage = async (client, {
    conversationId,
    role,
    kind = 'text',
    status = 'complete',
    value,
    retentionDays = config.retentionDays
  }) => {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`design-message:${conversationId}`]
    );
    const next = await client.query(
      'SELECT COALESCE(max(sequence),0)+1 AS sequence FROM design_messages WHERE conversation_id=$1',
      [conversationId]
    );
    const messageId = crypto.randomUUID();
    const encrypted = encryptDesignMessage({ conversationId, messageId, role, value, env });
    const inserted = await client.query(
      `INSERT INTO design_messages
        (id,conversation_id,sequence,role,kind,status,algorithm,key_version,iv,auth_tag,ciphertext,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
         clock_timestamp()+($12::text || ' days')::interval)
       RETURNING *`,
      [
        messageId,
        conversationId,
        Number(next.rows[0].sequence),
        role,
        kind,
        status,
        encrypted.algorithm,
        encrypted.keyVersion,
        encrypted.iv,
        encrypted.authTag,
        encrypted.ciphertext,
        retentionDays
      ]
    );
    return inserted.rows[0];
  };

  const createConversation = async ({ userId, projectId = null }) => {
    requireEnabled();
    return transaction(pool, async (client) => {
      const dbUserId = await resolveUserId(client, userId);
      if (projectId) {
        if (!UUID_RE.test(String(projectId))) throw new ApiError(400, 'INVALID_ID', { field: 'projectId' });
        const project = await client.query(
          `SELECT id FROM creative_projects WHERE id=$1 AND user_id=$2 AND status<>'trashed'`,
          [projectId, dbUserId]
        );
        if (!project.rowCount) throw new ApiError(404, 'PROJECT_NOT_FOUND');
      }
      const inserted = await client.query(
        `INSERT INTO design_conversations
          (user_id,project_id,auto_credit_cap,expires_at)
         VALUES ($1,$2,$3,clock_timestamp()+($4::text || ' days')::interval)
         RETURNING *`,
        [dbUserId, projectId || null, config.autoCreditCap, config.retentionDays]
      );
      await insertEvent(client, {
        conversationId: inserted.rows[0].id,
        type: 'conversation.created',
        summary: '设计会话已创建'
      });
      return publicConversation(inserted.rows[0]);
    });
  };

  const listConversations = async ({ userId, limit = 30, cursor = null }) => {
    requireEnabled();
    return transaction(pool, async (client) => {
      const dbUserId = await resolveUserId(client, userId);
      const result = await client.query(
        `SELECT * FROM design_conversations
          WHERE user_id=$1 AND expires_at>clock_timestamp()
            AND ($2::timestamptz IS NULL OR updated_at<$2)
          ORDER BY updated_at DESC LIMIT $3`,
        [
          dbUserId,
          cursor && !Number.isNaN(new Date(cursor).getTime()) ? new Date(cursor) : null,
          Math.max(1, Math.min(100, Number(limit) || 30))
        ]
      );
      return result.rows.map(publicConversation);
    });
  };

  const getConversation = async ({ userId, conversationId }) => {
    requireEnabled();
    return readTransaction(pool, async (client) => {
      const { row } = await resolveOwnedConversation(client, { userId, conversationId });
      const messages = await client.query(
        'SELECT * FROM design_messages WHERE conversation_id=$1 AND expires_at>now() ORDER BY sequence',
        [conversationId]
      );
      const executions = await client.query(
        `SELECT execution.*,
          CASE
            WHEN task.status='success' OR run.status='succeeded' THEN 'succeeded'
            WHEN task.status='failed' OR run.status='failed' THEN 'failed'
            WHEN task.status='cancelled' OR run.status='cancelled' THEN 'cancelled'
            WHEN run.status='waiting_user' THEN 'waiting_authorization'
            WHEN task.status='running' OR run.status IN ('provisioning','running','verifying') THEN 'running'
            ELSE execution.status
          END AS derived_status
         FROM design_executions execution
         LEFT JOIN tool_tasks task ON task.id=execution.tool_task_id
         LEFT JOIN agent_runs run ON run.id=execution.agent_run_id
         WHERE execution.conversation_id=$1
         ORDER BY execution.created_at`,
        [conversationId]
      );
      const uploads = await client.query(
        `SELECT link.*,asset.mime_type,asset.byte_size
           FROM design_conversation_assets link
           JOIN assets asset ON asset.id=link.asset_id
          WHERE link.conversation_id=$1
          ORDER BY link.created_at`,
        [conversationId]
      );
      return {
        ...publicConversation(row),
        messages: messages.rows.map((message) => publicMessage(message, env)),
        executions: executions.rows.map((execution) => publicExecution(execution, env)),
        uploads: uploads.rows.map(publicConversationAsset)
      };
    });
  };

  const deleteConversation = async ({ userId, conversationId }) => {
    requireEnabled();
    return transaction(pool, async (client) => {
      const { dbUserId } = await resolveOwnedConversation(client, { userId, conversationId, lock: true });
      const active = await client.query(
        `SELECT 1 FROM design_executions execution
         LEFT JOIN tool_tasks task ON task.id=execution.tool_task_id
         LEFT JOIN agent_runs run ON run.id=execution.agent_run_id
         WHERE execution.conversation_id=$1
           AND (task.status IN ('queued','running') OR run.status IN (
             'draft','queued','provisioning','running','waiting_user','paused','verifying'
           )) LIMIT 1`,
        [conversationId]
      );
      if (active.rowCount) throw new ApiError(409, 'DESIGN_CONVERSATION_HAS_ACTIVE_EXECUTION');
      const deleted = await client.query(
        'DELETE FROM design_conversations WHERE id=$1 AND user_id=$2',
        [conversationId, dbUserId]
      );
      return deleted.rowCount > 0;
    });
  };

  const addMessage = async ({ userId, conversationId, message, attachments }) => {
    requireEnabled();
    const text = normalizeMessageText(message);
    const manifest = normalizeAttachmentManifest(attachments);
    const result = await transaction(pool, async (client) => {
      const { row } = await resolveOwnedConversation(client, { userId, conversationId, lock: true });
      if (row.status !== 'active') throw new ApiError(409, 'DESIGN_CONVERSATION_ARCHIVED');
      const inserted = await insertMessage(client, {
        conversationId,
        role: 'user',
        value: { text, attachments: manifest }
      });
      await client.query(
        `INSERT INTO design_planning_jobs (message_id,conversation_id)
         VALUES ($1,$2)`,
        [inserted.id, conversationId]
      );
      const title = row.title === '新的设计任务' ? titleFromText(text) : row.title;
      await client.query(
        `UPDATE design_conversations
            SET title=$2,updated_at=now(),expires_at=clock_timestamp()+($3::text || ' days')::interval
          WHERE id=$1`,
        [conversationId, title, config.retentionDays]
      );
      await insertEvent(client, {
        conversationId,
        type: 'message.received',
        summary: '已收到设计请求',
        data: { messageId: inserted.id, attachmentCount: manifest.length }
      });
      return publicMessage(inserted, env);
    });
    void processNextJob().catch(() => {});
    return result;
  };

  const claimPlanningJob = async () => transaction(pool, async (client) => {
    const result = await client.query(
      `WITH candidate AS (
         SELECT message_id FROM design_planning_jobs
          WHERE (
            status='queued'
            OR (status='running' AND lease_expires_at<=clock_timestamp())
          )
            AND next_attempt_at<=clock_timestamp()
            AND attempt_count<3
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE design_planning_jobs job
          SET status='running',lease_owner=$1,
              lease_expires_at=clock_timestamp()+($2::text || ' seconds')::interval,
              attempt_count=attempt_count+1,updated_at=now()
         FROM candidate
        WHERE job.message_id=candidate.message_id
       RETURNING job.*`,
      [workerId, config.planningLeaseSeconds]
    );
    return result.rows[0] || null;
  });

  const renewPlanningJobLease = async (job) => {
    const renewed = await pool.query(
      `UPDATE design_planning_jobs
          SET lease_expires_at=clock_timestamp()+($3::text || ' seconds')::interval,
              updated_at=now()
        WHERE message_id=$1 AND status='running' AND lease_owner=$2
        RETURNING message_id`,
      [job.message_id, workerId, config.planningLeaseSeconds]
    );
    if (!renewed.rowCount) throw new ApiError(409, 'DESIGN_PLANNING_LEASE_LOST');
  };

  const runWithPlanningLease = async (job, work) => {
    const controller = new AbortController();
    let leaseError = null;
    let heartbeat = null;
    const renew = async () => {
      try {
        await renewPlanningJobLease(job);
      } catch (error) {
        leaseError = error;
        controller.abort();
      }
    };
    await renew();
    if (leaseError) throw leaseError;
    heartbeat = setInterval(() => void renew(), Math.min(
      config.planningLeaseHeartbeatMs,
      Math.max(100, Math.floor(config.planningLeaseSeconds * 1000 / 3))
    ));
    heartbeat.unref?.();
    try {
      const result = await work(controller.signal);
      if (leaseError) throw leaseError;
      await renew();
      if (leaseError) throw leaseError;
      return result;
    } finally {
      clearInterval(heartbeat);
    }
  };

  const loadPlanningContext = async (job) => transaction(pool, async (client) => {
    const conversation = await client.query(
      'SELECT * FROM design_conversations WHERE id=$1 AND expires_at>clock_timestamp() FOR SHARE',
      [job.conversation_id]
    );
    if (!conversation.rowCount) throw new ApiError(410, 'DESIGN_CONVERSATION_EXPIRED');
    const messages = await client.query(
      `SELECT * FROM design_messages
        WHERE conversation_id=$1 AND sequence<=(
          SELECT sequence FROM design_messages WHERE id=$2
        ) AND expires_at>now()
        ORDER BY sequence`,
      [job.conversation_id, job.message_id]
    );
    const current = messages.rows.find((message) => message.id === job.message_id);
    if (!current) throw new ApiError(404, 'DESIGN_MESSAGE_NOT_FOUND');
    return {
      conversation: conversation.rows[0],
      current: publicMessage(current, env),
      history: messages.rows.map((message) => publicMessage(message, env))
    };
  });

  const completePlanningJob = async ({ job, decision }) => transaction(pool, async (client) => {
    const lease = await client.query(
      `SELECT message_id FROM design_planning_jobs
        WHERE message_id=$1 AND status='running' AND lease_owner=$2
        FOR UPDATE`,
      [job.message_id, workerId]
    );
    if (!lease.rowCount) throw new ApiError(409, 'DESIGN_PLANNING_LEASE_LOST');
    const assistant = await insertMessage(client, {
      conversationId: job.conversation_id,
      role: 'assistant',
      kind: decision.status === 'waiting_clarification' ? 'clarification' : (
        decision.routeKind === 'reply' ? 'text' : 'execution'
      ),
      value: {
        text: decision.reply,
        questions: decision.questions || [],
        assumptions: decision.assumptions || [],
        memoryCandidates: decision.memoryCandidates || []
      }
    });
    const executionId = crypto.randomUUID();
    const rawPlan = decision.plan && typeof decision.plan === 'object' ? decision.plan : {};
    const {
      taskSpec: _embeddedTaskSpec,
      objective: _embeddedObjective,
      options: _embeddedOptions,
      browserConfig: _embeddedBrowserConfig,
      assumptions: _embeddedAssumptions,
      ...displayPlan
    } = rawPlan;
    const storedPlan = sealExecutionPlan({
      conversationId: job.conversation_id,
      executionId,
      publicPlan: sanitizeLogValue({
        ...displayPlan,
        capabilities: decision.capabilities || undefined,
        deliverables: decision.deliverables || undefined,
        complexity: decision.complexity || undefined,
        confidence: decision.confidence ?? undefined,
        skillIds: decision.skillIds || []
      }),
      privatePlan: {
        options: decision.options || undefined,
        objective: decision.objective || undefined,
        browserConfig: decision.browserConfig || undefined,
        taskSpec: decision.taskSpec || undefined,
        assumptions: decision.assumptions || []
      },
      env
    });
    const execution = await client.query(
      `INSERT INTO design_executions
        (id,conversation_id,source_message_id,route_kind,status,tool_id,operation,local_route,
         max_credits,plan,finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        executionId,
        job.conversation_id,
        assistant.id,
        decision.routeKind,
        decision.status,
        decision.toolId || null,
        decision.operation || null,
        decision.localRoute || null,
        Number(decision.plan?.maxCredits || config.autoCreditCap),
        JSON.stringify(storedPlan),
        decision.status === 'succeeded' ? new Date() : null
      ]
    );
    if (decision.status === 'waiting_clarification') {
      await client.query(
        `UPDATE design_conversations
            SET clarification_rounds=1,updated_at=now()
          WHERE id=$1`,
        [job.conversation_id]
      );
    } else {
      await client.query(
        'UPDATE design_conversations SET updated_at=now() WHERE id=$1',
        [job.conversation_id]
      );
    }
    await client.query(
      `UPDATE design_planning_jobs
          SET status='succeeded',lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
        WHERE message_id=$1 AND lease_owner=$2`,
      [job.message_id, workerId]
    );
    await insertEvent(client, {
      conversationId: job.conversation_id,
      type: decision.status === 'waiting_clarification' ? 'clarification.required' : 'execution.ready',
      summary: decision.status === 'waiting_clarification' ? '需要补充两项信息' : '执行路线已准备',
      data: {
        messageId: assistant.id,
        executionId: execution.rows[0].id,
        routeKind: decision.routeKind,
        status: decision.status,
        complexity: decision.complexity,
        confidence: decision.confidence,
        skillIds: decision.skillIds || [],
        memoryCandidateCount: decision.memoryCandidates?.length || 0
      }
    });
    return publicExecution(execution.rows[0], env);
  });

  const failPlanningJob = async ({ job, error }) => transaction(pool, async (client) => {
    const code = sanitizeText(error?.code || error?.message || 'DESIGN_PLANNER_FAILED', 100);
    const state = await client.query(
      `UPDATE design_planning_jobs
          SET status=CASE WHEN attempt_count>=3 THEN 'failed' ELSE 'queued' END,
              next_attempt_at=clock_timestamp()+
                (CASE WHEN attempt_count>=3 THEN 0 ELSE attempt_count*2 END * interval '1 second'),
              lease_owner=NULL,lease_expires_at=NULL,error_code=$3,updated_at=now()
        WHERE message_id=$1 AND lease_owner=$2
        RETURNING status,attempt_count`,
      [job.message_id, workerId, code]
    );
    if (state.rows[0]?.status !== 'failed') return;
    const assistant = await insertMessage(client, {
      conversationId: job.conversation_id,
      role: 'assistant',
      kind: 'error',
      status: 'failed',
      value: { text: '这次需求没有完成分析。你可以直接重试，系统不会因此创建任务或扣点。' }
    });
    await insertEvent(client, {
      conversationId: job.conversation_id,
      type: 'planning.failed',
      summary: '需求分析失败',
      data: { messageId: assistant.id, errorCode: code }
    });
  });

  async function processNextJob() {
    if (!config.enabled || !config.workerEnabled || processing) return false;
    processing = true;
    let job = null;
    try {
      job = await claimPlanningJob();
      if (!job) return false;
      if (typeof chatGenerate !== 'function') throw new ApiError(503, 'DESIGN_PLANNER_NOT_CONFIGURED');
      await runWithPlanningLease(job, async (signal) => {
        const context = await loadPlanningContext(job);
        const runtimeAssignment = resolveAgentRuntimeAssignment(
          agentConfig,
          context.conversation.user_id
        );
        const runtimeV2 = runtimeAssignment.version === 2;
        const contextualAttachments = context.current.attachments.length
          ? context.current.attachments
          : Number(context.conversation.clarification_rounds || 0) > 0
            ? context.history
                .filter((message) => message.role === 'user')
                .flatMap((message) => message.attachments || [])
                .filter((item, index, all) => (
                  all.findIndex((candidate) => candidate.clientId === item.clientId) === index
                ))
                .slice(-10)
            : [];
        const projectMemory = runtimeV2 && agentConfig.projectMemoryEnabled && context.conversation.project_id
          ? (await projectService.getProject({
              userId: context.conversation.user_id,
              projectId: context.conversation.project_id
            })).designMemory || null
          : null;
        const raw = await generateModelJson({
          messages: plannerMessages({
            history: context.history.map((message) => ({ role: message.role, text: message.text })),
            message: context.current.text,
            attachmentCount: contextualAttachments.length,
            projectMemory,
            textModel: agentConfig.modelName
          }),
          phase: 'router',
          priority: 'router',
          thinkingEnabled: false,
          conversation: context.conversation,
          maxTokens: agentConfig.stageMaxOutputTokens.router,
          signal
        });
        const routed = normalizePlannerDecision({
          raw,
          text: context.current.text,
          attachments: contextualAttachments,
          clarificationRounds: Number(context.conversation.clarification_rounds || 0),
          creditCap: Number(context.conversation.auto_credit_cap || config.autoCreditCap),
          textModel: agentConfig.modelName
        });
        let decision = enrichPlannerDecision({
          decision: routed,
          raw,
          text: context.current.text,
          creditCap: Number(context.conversation.auto_credit_cap || config.autoCreditCap),
          allowMemory: runtimeV2 && agentConfig.projectMemoryEnabled && Boolean(context.conversation.project_id)
        });
        if (
          decision.routeKind === 'agent_run' &&
          runtimeV2 &&
          agentConfig.designPlannerV2Enabled &&
          requiresDeepPlanner({ decision, raw, text: context.current.text })
        ) {
          const plannedRaw = await generateModelJson({
            messages: taskPlannerMessages({
              objective: context.current.text,
              deliverables: decision.deliverables,
              capabilities: decision.capabilities,
              allowedOrigins: decision.browserConfig?.allowedOrigins || [],
              maxCredits: Number(context.conversation.auto_credit_cap || config.autoCreditCap),
              projectMemory,
              textModel: agentConfig.modelName
            }),
            phase: 'planner',
            priority: 'planner',
            thinkingEnabled: agentConfig.adaptiveReasoningEnabled,
            conversation: context.conversation,
            maxTokens: agentConfig.stageMaxOutputTokens.planner,
            signal
          });
          const taskSpec = normalizeTaskSpec({
            ...plannedRaw,
            goal: context.current.text,
            deliverables: decision.deliverables,
            allowedOrigins: decision.browserConfig?.allowedOrigins || [],
            budget: {
              maxCredits: Number(context.conversation.auto_credit_cap || config.autoCreditCap)
            }
          }, {
            objective: context.current.text,
            deliverables: decision.deliverables,
            capabilities: decision.capabilities,
            allowedOrigins: decision.browserConfig?.allowedOrigins || [],
            maxCredits: Number(context.conversation.auto_credit_cap || config.autoCreditCap)
          });
          decision = {
            ...decision,
            complexity: taskSpec.complexity,
            confidence: taskSpec.confidence,
            skillIds: taskSpec.skillIds,
            taskSpec,
            plan: {
              ...decision.plan,
              steps: taskSpec.plan.map((step) => step.label),
              taskSpec
            }
          };
        }
        await completePlanningJob({ job, decision });
      });
      return true;
    } catch (error) {
      if (job) await failPlanningJob({ job, error }).catch(() => {});
      return false;
    } finally {
      processing = false;
    }
  }

  const startWorker = () => {
    if (!config.enabled || !config.workerEnabled || timer) return false;
    timer = setInterval(() => void processNextJob(), config.pollMs);
    timer.unref?.();
    void processNextJob();
    return true;
  };

  const stopWorker = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const listEvents = async ({ userId, conversationId, after = 0, limit = 250 }) => {
    requireEnabled();
    return transaction(pool, async (client) => {
      await resolveOwnedConversation(client, { userId, conversationId });
      const result = await client.query(
        `SELECT * FROM design_conversation_events
          WHERE conversation_id=$1 AND id>$2
          ORDER BY id LIMIT $3`,
        [conversationId, Math.max(0, Number(after) || 0), Math.max(1, Math.min(500, Number(limit) || 250))]
      );
      return result.rows.map(publicEvent);
    });
  };

  const recordToolQuote = async ({
    userId,
    conversationId,
    executionId,
    quoteId
  }) => {
    requireEnabled();
    if (!UUID_RE.test(String(quoteId || ''))) {
      throw new ApiError(400, 'INVALID_ID', { field: 'quoteId' });
    }
    return transaction(pool, async (client) => {
      const { dbUserId } = await resolveOwnedConversation(client, { userId, conversationId });
      const execution = await client.query(
        `SELECT * FROM design_executions
          WHERE id=$1 AND conversation_id=$2 FOR UPDATE`,
        [executionId, conversationId]
      );
      if (!execution.rowCount) throw new ApiError(404, 'DESIGN_EXECUTION_NOT_FOUND');
      if (execution.rows[0].route_kind !== 'tool_task') {
        throw new ApiError(409, 'DESIGN_EXECUTION_ROUTE_MISMATCH');
      }
      if (execution.rows[0].tool_task_id || execution.rows[0].agent_run_id) {
        throw new ApiError(409, 'DESIGN_EXECUTION_ALREADY_STARTED');
      }
      const quote = await client.query(
        `SELECT id,credits,expires_at,consumed_at
           FROM tool_task_quotes
          WHERE id=$1 AND user_id=$2 FOR SHARE`,
        [quoteId, dbUserId]
      );
      if (!quote.rowCount) throw new ApiError(404, 'QUOTE_NOT_FOUND', { field: 'quoteId' });
      if (quote.rows[0].consumed_at) {
        throw new ApiError(409, 'QUOTE_ALREADY_USED', { field: 'quoteId' });
      }
      if (new Date(quote.rows[0].expires_at).getTime() <= Date.now()) {
        throw new ApiError(409, 'PRICE_CHANGED', { field: 'quoteId', retryable: true });
      }
      const quotedCredits = Number(quote.rows[0].credits || 0);
      const wallet = await client.query(
        'SELECT available_credits FROM wallets WHERE user_id=$1 FOR SHARE',
        [dbUserId]
      );
      const budgetExceeded = quotedCredits > Number(
        execution.rows[0].max_credits || config.autoCreditCap
      );
      const insufficientCredits = Number(wallet.rows[0]?.available_credits || 0) < quotedCredits;
      const status = budgetExceeded || insufficientCredits
        ? 'waiting_budget'
        : execution.rows[0].status;
      const errorCode = budgetExceeded
        ? 'DESIGN_EXECUTION_BUDGET_EXCEEDED'
        : insufficientCredits
          ? 'INSUFFICIENT_CREDITS'
          : null;
      const updated = await client.query(
        `UPDATE design_executions
            SET quoted_credits=$3,status=$4,error_code=$5,updated_at=now()
          WHERE id=$1 AND conversation_id=$2 RETURNING *`,
        [executionId, conversationId, quotedCredits, status, errorCode]
      );
      await insertEvent(client, {
        conversationId,
        type: status === 'waiting_budget' ? 'execution.budget_required' : 'execution.quoted',
        summary: status === 'waiting_budget' ? '报价超过本次自动预算' : '已取得服务端报价',
        data: {
          executionId,
          quotedCredits,
          maxCredits: Number(updated.rows[0].max_credits),
          reason: errorCode
        }
      });
      return publicExecution(updated.rows[0], env);
    });
  };

  const registerUploadedAssets = async ({ userId, conversationId, uploads }) => {
    requireEnabled();
    if (!Array.isArray(uploads) || uploads.length < 1 || uploads.length > 10) {
      throw new ApiError(400, 'DESIGN_ATTACHMENTS_INVALID', { field: 'uploads' });
    }
    return transaction(pool, async (client) => {
      const { dbUserId } = await resolveOwnedConversation(client, { userId, conversationId });
      const result = [];
      for (const upload of uploads) {
        const clientId = sanitizeText(upload?.clientId, 120);
        const assetId = String(upload?.assetId || '').trim();
        if (!clientId || !UUID_RE.test(assetId)) {
          throw new ApiError(400, 'DESIGN_ATTACHMENTS_INVALID', { field: 'uploads' });
        }
        const inserted = await client.query(
          `INSERT INTO design_conversation_assets (conversation_id,asset_id,client_id)
           SELECT $1,asset.id,$3 FROM assets asset
            WHERE asset.id=$2 AND asset.owner_user_id=$4
              AND asset.gc_state='active' AND asset.delete_requested_at IS NULL
              AND (asset.expires_at IS NULL OR asset.expires_at>clock_timestamp())
           ON CONFLICT (conversation_id,client_id)
           DO UPDATE SET asset_id=EXCLUDED.asset_id
           RETURNING *`,
          [conversationId, assetId, clientId, dbUserId]
        );
        if (!inserted.rowCount) throw new ApiError(404, 'ASSET_NOT_FOUND');
        const asset = await client.query(
          'SELECT mime_type,byte_size FROM assets WHERE id=$1',
          [assetId]
        );
        result.push(publicConversationAsset({ ...inserted.rows[0], ...asset.rows[0] }));
      }
      await insertEvent(client, {
        conversationId,
        type: 'attachments.uploaded',
        summary: '附件已按执行路线上传',
        data: { count: result.length, clientIds: result.map((item) => item.clientId) }
      });
      return result;
    });
  };

  const attachExecutionTarget = async ({
    userId,
    conversationId,
    executionId,
    toolTaskId,
    agentRunId
  }) => {
    requireEnabled();
    if (Boolean(toolTaskId) === Boolean(agentRunId)) {
      throw new ApiError(400, 'DESIGN_EXECUTION_TARGET_INVALID');
    }
    return transaction(pool, async (client) => {
      const { dbUserId } = await resolveOwnedConversation(client, { userId, conversationId });
      const execution = await client.query(
        `SELECT * FROM design_executions
          WHERE id=$1 AND conversation_id=$2 FOR UPDATE`,
        [executionId, conversationId]
      );
      if (!execution.rowCount) throw new ApiError(404, 'DESIGN_EXECUTION_NOT_FOUND');
      let quotedCredits = null;
      let status = 'queued';
      if (toolTaskId) {
        const task = await client.query(
          'SELECT id,status,quoted_credits FROM tool_tasks WHERE id=$1 AND user_id=$2',
          [toolTaskId, dbUserId]
        );
        if (!task.rowCount) throw new ApiError(404, 'TASK_NOT_FOUND');
        quotedCredits = Number(task.rows[0].quoted_credits || 0);
        status = task.rows[0].status === 'running' ? 'running' : 'queued';
      } else {
        const run = await client.query(
          'SELECT id,status,max_credits FROM agent_runs WHERE id=$1 AND user_id=$2',
          [agentRunId, dbUserId]
        );
        if (!run.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
        quotedCredits = Number(run.rows[0].max_credits || 0);
        status = ['provisioning', 'running', 'verifying'].includes(run.rows[0].status) ? 'running' : 'queued';
      }
      if (quotedCredits > Number(execution.rows[0].max_credits || config.autoCreditCap)) {
        throw new ApiError(409, 'DESIGN_EXECUTION_BUDGET_EXCEEDED', { retryable: false });
      }
      const updated = await client.query(
        `UPDATE design_executions
            SET tool_task_id=$3,agent_run_id=$4,quoted_credits=$5,status=$6,updated_at=now()
          WHERE id=$1 AND conversation_id=$2 RETURNING *`,
        [executionId, conversationId, toolTaskId || null, agentRunId || null, quotedCredits, status]
      );
      await insertEvent(client, {
        conversationId,
        type: 'execution.started',
        summary: '任务已开始',
        data: { executionId, routeKind: updated.rows[0].route_kind }
      });
      return publicExecution(updated.rows[0], env);
    });
  };

  const getExecution = async ({ userId, conversationId, executionId }) => {
    requireEnabled();
    return transaction(pool, async (client) => {
      await resolveOwnedConversation(client, { userId, conversationId });
      const result = await client.query(
        `SELECT execution.*,
          CASE
            WHEN task.status='success' OR run.status='succeeded' THEN 'succeeded'
            WHEN task.status='failed' OR run.status='failed' THEN 'failed'
            WHEN task.status='cancelled' OR run.status='cancelled' THEN 'cancelled'
            WHEN task.status='running' OR run.status IN ('provisioning','running','verifying') THEN 'running'
            WHEN run.status IN ('waiting_user','paused') THEN 'waiting_authorization'
            ELSE execution.status
          END AS derived_status
         FROM design_executions execution
         LEFT JOIN tool_tasks task ON task.id=execution.tool_task_id
         LEFT JOIN agent_runs run ON run.id=execution.agent_run_id
         WHERE execution.id=$1 AND execution.conversation_id=$2`,
        [executionId, conversationId]
      );
      if (!result.rowCount) throw new ApiError(404, 'DESIGN_EXECUTION_NOT_FOUND');
      return publicExecution(result.rows[0], env);
    });
  };

  const markExecution = async ({ userId, conversationId, executionId, status, errorCode = null }) => {
    requireEnabled();
    if (!EXECUTION_STATUSES.has(status)) throw new ApiError(400, 'DESIGN_EXECUTION_STATUS_INVALID');
    return transaction(pool, async (client) => {
      await resolveOwnedConversation(client, { userId, conversationId });
      const updated = await client.query(
        `UPDATE design_executions
            SET status=$3,error_code=$4,updated_at=now(),
                finished_at=CASE WHEN $3 IN ('succeeded','failed','cancelled') THEN now() ELSE NULL END
          WHERE id=$1 AND conversation_id=$2 RETURNING *`,
        [executionId, conversationId, status, errorCode ? sanitizeText(errorCode, 100) : null]
      );
      if (!updated.rowCount) throw new ApiError(404, 'DESIGN_EXECUTION_NOT_FOUND');
      await insertEvent(client, {
        conversationId,
        type: `execution.${status}`,
        summary: status === 'succeeded' ? '任务已完成' : status === 'failed' ? '任务执行失败' : '任务状态已更新',
        data: { executionId, status, errorCode: errorCode || null }
      });
      return publicExecution(updated.rows[0], env);
    });
  };

  const increaseExecutionBudget = async ({ userId, conversationId, executionId, maxCredits }) => {
    requireEnabled();
    const cap = integer(maxCredits, config.autoCreditCap, 1, 500);
    return transaction(pool, async (client) => {
      await resolveOwnedConversation(client, { userId, conversationId, lock: true });
      const updated = await client.query(
        `UPDATE design_executions
            SET max_credits=$3,status='queued',error_code=NULL,updated_at=now()
          WHERE id=$1 AND conversation_id=$2 AND tool_task_id IS NULL AND agent_run_id IS NULL
          RETURNING *`,
        [executionId, conversationId, cap]
      );
      if (!updated.rowCount) throw new ApiError(409, 'DESIGN_EXECUTION_BUDGET_LOCKED');
      await insertEvent(client, {
        conversationId,
        type: 'execution.budget_updated',
        summary: '本次自动预算已更新',
        data: { executionId, maxCredits: cap }
      });
      return publicExecution(updated.rows[0], env);
    });
  };

  const normalizeOrigin = (value) => {
    try {
      const url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('origin');
      return url.origin;
    } catch {
      throw new ApiError(400, 'DESIGN_AUTHORIZATION_ORIGIN_INVALID', { field: 'siteOrigin' });
    }
  };

  const grantAuthorization = async ({ userId, conversationId, siteOrigin, actionType }) => {
    requireEnabled();
    const origin = normalizeOrigin(siteOrigin);
    const action = normalizeActionType(actionType);
    if (!SAFE_SESSION_ACTIONS.has(action)) {
      throw new ApiError(403, 'DESIGN_AUTHORIZATION_SCOPE_FORBIDDEN', { field: 'actionType' });
    }
    return transaction(pool, async (client) => {
      const { dbUserId } = await resolveOwnedConversation(client, { userId, conversationId });
      await client.query(
        `UPDATE design_session_authorizations
            SET status='expired',updated_at=now()
          WHERE conversation_id=$1 AND user_id=$2 AND status='active'
            AND expires_at<=clock_timestamp()`,
        [conversationId, dbUserId]
      );
      const inserted = await client.query(
        `INSERT INTO design_session_authorizations
          (conversation_id,user_id,site_origin,action_type,expires_at)
         VALUES ($1,$2,$3,$4,clock_timestamp()+($5::text || ' minutes')::interval)
         RETURNING *`,
        [conversationId, dbUserId, origin, action, config.authorizationIdleMinutes]
      );
      await insertEvent(client, {
        conversationId,
        type: 'authorization.granted',
        summary: '会话授权已开启',
        data: { authorizationId: inserted.rows[0].id, siteOrigin: origin, actionType: action }
      });
      return {
        authorizationId: inserted.rows[0].id,
        conversationId,
        siteOrigin: origin,
        actionType: action,
        status: 'active',
        lastUsedAt: null,
        expiresAt: inserted.rows[0].expires_at,
        createdAt: inserted.rows[0].created_at
      };
    });
  };

  const listAuthorizations = async ({ userId, conversationId }) => {
    requireEnabled();
    return transaction(pool, async (client) => {
      const { dbUserId } = await resolveOwnedConversation(client, { userId, conversationId });
      await client.query(
        `UPDATE design_session_authorizations SET status='expired',updated_at=now()
          WHERE conversation_id=$1 AND user_id=$2 AND status='active'
            AND expires_at<=clock_timestamp()`,
        [conversationId, dbUserId]
      );
      const result = await client.query(
        `SELECT * FROM design_session_authorizations
          WHERE conversation_id=$1 AND user_id=$2 ORDER BY created_at DESC`,
        [conversationId, dbUserId]
      );
      return result.rows.map((row) => ({
        authorizationId: row.id,
        conversationId: row.conversation_id,
        siteOrigin: row.site_origin,
        actionType: row.action_type,
        status: row.status,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at
      }));
    });
  };

  const revokeAuthorization = async ({ userId, conversationId, authorizationId }) => {
    requireEnabled();
    return transaction(pool, async (client) => {
      const { dbUserId } = await resolveOwnedConversation(client, { userId, conversationId });
      const updated = await client.query(
        `UPDATE design_session_authorizations
            SET status='revoked',revoked_at=now(),updated_at=now()
          WHERE id=$1 AND conversation_id=$2 AND user_id=$3 AND status='active'
          RETURNING id`,
        [authorizationId, conversationId, dbUserId]
      );
      if (!updated.rowCount) throw new ApiError(404, 'DESIGN_AUTHORIZATION_NOT_FOUND');
      await insertEvent(client, {
        conversationId,
        type: 'authorization.revoked',
        summary: '会话授权已撤销',
        data: { authorizationId }
      });
      return true;
    });
  };

  const getStatus = async () => {
    const counts = config.enabled
      ? await pool.query(
          `SELECT
             count(*) FILTER (WHERE status='queued')::integer AS queued,
             count(*) FILTER (WHERE status='running')::integer AS running
           FROM design_planning_jobs`
        ).catch(() => ({ rows: [{}] }))
      : { rows: [{}] };
    const scheduler = providerScheduler
      ? await providerScheduler.readiness()
      : { ok: !agentConfig.providerSchedulerEnabled, enabled: false, mode: 'unconfigured' };
    return {
      enabled: config.enabled,
      workerEnabled: config.workerEnabled,
      plannerReady: Boolean(config.enabled && hasAgentPayloadKey(env) && typeof chatGenerate === 'function'),
      model: agentConfig.modelName,
      imageModel: IMAGE_MODEL,
      plannerV2Enabled: agentConfig.designPlannerV2Enabled,
      adaptiveReasoningEnabled: agentConfig.adaptiveReasoningEnabled,
      projectMemoryEnabled: agentConfig.projectMemoryEnabled,
      runtimeV2RolloutPercent: agentConfig.runtimeV2RolloutPercent,
      runtimeV2CanaryConfigured: agentConfig.runtimeV2CanaryUserIds.length > 0,
      providerScheduler: scheduler,
      autoCreditCap: config.autoCreditCap,
      retentionDays: config.retentionDays,
      authorizationIdleMinutes: config.authorizationIdleMinutes,
      queued: Number(counts.rows[0]?.queued || 0),
      running: Number(counts.rows[0]?.running || 0)
    };
  };

  const sweepExpired = async ({ limit = 200 } = {}) => {
    const bounded = Math.max(1, Math.min(1000, Number(limit) || 200));
    return transaction(pool, async (client) => {
      const deleted = await client.query(
        `WITH expired AS (
           SELECT id FROM design_conversations
            WHERE expires_at<=clock_timestamp()
            ORDER BY expires_at LIMIT $1
         )
         DELETE FROM design_conversations conversation USING expired
          WHERE conversation.id=expired.id RETURNING conversation.id`,
        [bounded]
      );
      return deleted.rowCount;
    });
  };

  return {
    addMessage,
    attachExecutionTarget,
    createConversation,
    deleteConversation,
    getExecution,
    getConversation,
    getStatus,
    grantAuthorization,
    increaseExecutionBudget,
    listAuthorizations,
    listConversations,
    listEvents,
    markExecution,
    processNextJob,
    recordToolQuote,
    registerUploadedAssets,
    revokeAuthorization,
    startWorker,
    stopWorker,
    sweepExpired
  };
};

module.exports = {
  CLOUD_TOOLS,
  EXECUTION_STATUSES,
  IMAGE_MODEL,
  ROUTE_KINDS,
  SAFE_SESSION_ACTIONS,
  TEXT_MODEL,
  createDesignConversationService,
  enrichPlannerDecision,
  requiresDeepPlanner,
  explicitHttpsOrigins,
  getDesignConversationConfig,
  inferDeliverables,
  normalizeAttachmentManifest,
  normalizePlannerDecision,
  normalizeMemoryCandidates,
  decodeExecutionPlan,
  repairPlannerRoute,
  plannerMessages,
  safeJsonObject,
  sealExecutionPlan
};
