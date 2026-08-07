const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');

const APPROVAL_ACTIONS = new Set([
  'send',
  'publish',
  'submit',
  'delete',
  'change_permissions',
  'payment',
  'install_software',
  'security_setting',
  'password_change',
  'browser_fill',
  'browser_interaction'
]);
const TAKEOVER_ACTIONS = new Set([
  'captcha',
  'enter_password',
  'enter_otp',
  'bypass_security_warning',
  'finalize_password_change'
]);
const FORBIDDEN_ACTIONS = new Set([
  'purchase',
  'bypass_captcha',
  'legal_decision',
  'medical_decision',
  'financial_decision',
  'read_cloud_metadata',
  'read_host_files',
  'expose_arbitrary_port'
]);
const SECRET_KEYS = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|otp|session)/i;
const UNTRUSTED_INSTRUCTION_PATTERNS = Object.freeze([
  {
    signal: 'instruction_override',
    pattern: /(?:ignore|disregard|forget|override|replace)\W{0,30}(?:(?:all|any|the|your|previous|prior|above|earlier)\W{0,12})?(?:instructions?|rules?|policy|system|developer)|(?:忽略|无视|忘记|覆盖|替换|不(?:要|必)遵守).{0,24}(?:之前|以上|此前|系统|开发者|原有).{0,12}(?:指令|规则|要求|策略|提示词)/iu
  },
  {
    signal: 'secret_exfiltration',
    pattern: /(?:reveal|show|print|extract|exfiltrate|upload|send|copy)\W{0,24}(?:(?:the|all|any|your)\W{0,12})?(?:system\W*prompt|secrets?|tokens?|api\W*keys?|cookies?|passwords?|credentials?)|(?:泄露|展示|打印|提取|窃取|上传|发送|复制).{0,24}(?:系统提示词|密钥|令牌|口令|密码|凭证|Cookie)/iu
  },
  {
    signal: 'unsafe_execution',
    pattern: /(?:run|execute|paste|download|install)\W{0,24}(?:(?:this|the|following)\W{0,12})?(?:scripts?|commands?|powershell|bash|curl)|(?:执行|运行|粘贴|下载|安装).{0,24}(?:脚本|命令|代码|PowerShell|bash|curl)/iu
  },
  {
    signal: 'safety_bypass',
    pattern: /(?:disable|bypass|turn\W*off|remove)\W{0,24}(?:security|safety|guardrails?|policy|restrictions?)|(?:绕过|关闭|禁用|移除|解除).{0,24}(?:安全|防护|护栏|策略|限制|检查)/iu
  },
  {
    signal: 'role_hijack',
    pattern: /(?:you\W+are\W+now|act\W+as|switch\W+to)\W{0,24}(?:system|developer|administrator|root)|(?:你现在是|扮演|切换为).{0,24}(?:系统|开发者|管理员|root)/iu
  }
]);

const normalizeActionType = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const sanitizeText = (value, maxLength = 500) => String(value || '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .slice(0, maxLength);

const normalizeUntrustedText = (value, maxLength = 20_000) => sanitizeText(value, maxLength)
  .normalize('NFKC')
  .replace(/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/gu, '');

const sanitizeLogValue = (value, depth = 0) => {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeLogValue(entry, depth + 1));
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? sanitizeText(value) : value;
  }
  const result = {};
  for (const [key, nested] of Object.entries(value).slice(0, 40)) {
    result[key] = SECRET_KEYS.test(key) ? '[redacted]' : sanitizeLogValue(nested, depth + 1);
  }
  return result;
};

const classifyAction = (action = {}) => {
  const actionType = normalizeActionType(action.type || action.actionType);
  if (FORBIDDEN_ACTIONS.has(actionType)) {
    return { actionType, decision: 'blocked', riskLevel: 'blocked' };
  }
  if (TAKEOVER_ACTIONS.has(actionType)) {
    return { actionType, decision: 'takeover', riskLevel: 'high' };
  }
  if (APPROVAL_ACTIONS.has(actionType)) {
    return { actionType, decision: 'approval', riskLevel: 'high' };
  }
  return { actionType: actionType || 'unknown', decision: 'allow', riskLevel: 'low' };
};

const assertActionAllowed = ({ action, capabilities = {}, approval = null }) => {
  const classification = classifyAction(action);
  if (classification.decision === 'blocked') {
    throw new ApiError(403, 'AGENT_ACTION_FORBIDDEN', {
      actionType: classification.actionType
    });
  }
  if (classification.decision === 'takeover') {
    throw new ApiError(409, 'AGENT_TAKEOVER_REQUIRED', {
      actionType: classification.actionType,
      retryable: false
    });
  }
  if (classification.decision === 'approval' && approval?.status !== 'approved') {
    throw new ApiError(409, 'AGENT_APPROVAL_REQUIRED', {
      actionType: classification.actionType,
      retryable: false
    });
  }
  const capability = String(action.capability || '').trim();
  if (capability && capabilities[capability] !== true) {
    throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', { capability });
  }
  return classification;
};

const inspectUntrustedContent = (text) => {
  const normalized = normalizeUntrustedText(text);
  const injectionSignals = UNTRUSTED_INSTRUCTION_PATTERNS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ signal }) => signal);
  return {
    untrusted: true,
    injectionSuspected: injectionSignals.length > 0,
    injectionSignals,
    contentHash: crypto.createHash('sha256').update(normalized, 'utf8').digest('hex'),
    excerpt: normalized.slice(0, 240)
  };
};

const actionFingerprint = (action) => crypto
  .createHash('sha256')
  .update(JSON.stringify(sanitizeLogValue(action)), 'utf8')
  .digest();

const assertLoopBudget = ({
  stepCount,
  maxSteps = 120,
  consecutiveFailures = 0,
  unchangedScreenshots = 0,
  replanCount = 0
}) => {
  if (Number(stepCount) >= Number(maxSteps)) throw new ApiError(409, 'AGENT_STEP_LIMIT_REACHED');
  if (Number(consecutiveFailures) >= 2) throw new ApiError(409, 'AGENT_REPEATED_ACTION_FAILED');
  if (Number(unchangedScreenshots) >= 3) throw new ApiError(409, 'AGENT_SCREEN_STALLED');
  if (Number(replanCount) >= 3) throw new ApiError(409, 'AGENT_REPLAN_LIMIT_REACHED');
  return true;
};

module.exports = {
  APPROVAL_ACTIONS,
  FORBIDDEN_ACTIONS,
  TAKEOVER_ACTIONS,
  actionFingerprint,
  assertActionAllowed,
  assertLoopBudget,
  classifyAction,
  inspectUntrustedContent,
  normalizeUntrustedText,
  normalizeActionType,
  sanitizeLogValue,
  sanitizeText
};
