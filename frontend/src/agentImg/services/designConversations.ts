import { authFetch } from '@/login/authFetch';
import { buildApiUrl } from '@/utils/api';
import type { AgentQuote } from './agentRuns';

export type DesignRouteKind = 'reply' | 'local_tool' | 'tool_task' | 'agent_run';
export type DesignExecutionStatus =
  | 'planning'
  | 'waiting_clarification'
  | 'waiting_upload'
  | 'waiting_budget'
  | 'queued'
  | 'running'
  | 'waiting_authorization'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type DesignAttachmentManifest = {
  clientId: string;
  name: string;
  mimeType: string;
  byteSize: number;
};

export type DesignMemory = {
  audience: string;
  goals: string[];
  tone: string[];
  visualKeywords: string[];
  mustInclude: string[];
  avoid: string[];
  outputPreferences: {
    deliverables: string[];
    aspectRatio: string;
    language: string;
  };
  factualConstraints: string[];
};

export type AgentTaskSpec = {
  version: 1;
  goal: string;
  complexity: 'simple' | 'medium' | 'high';
  confidence: number;
  constraints: string[];
  assumptions: string[];
  deliverables: string[];
  allowedOrigins: string[];
  acceptanceCriteria: string[];
  skillIds: string[];
  plan: Array<{
    id: string;
    label: string;
    phase: 'research' | 'production' | 'verification' | 'completion';
    status: 'pending' | 'in_progress' | 'completed';
  }>;
  budget: { maxCredits: number };
};

export type DesignMessage = {
  messageId: string;
  sequence: number;
  role: 'user' | 'assistant';
  kind: 'text' | 'clarification' | 'execution' | 'error';
  status: 'pending' | 'complete' | 'failed';
  text: string;
  attachments: DesignAttachmentManifest[];
  questions: string[];
  assumptions: string[];
  memoryCandidates: Array<{ field: keyof DesignMemory; value: unknown }>;
  createdAt: string;
};

export type DesignExecutionPlan = {
  label?: string;
  steps?: string[];
  executor?: string;
  uploadRequired?: boolean;
  attachmentClientIds?: string[];
  options?: Record<string, unknown>;
  objective?: string;
  capabilities?: Record<string, boolean>;
  deliverables?: string[];
  browserConfig?: {
    allowedOrigins?: string[];
    persistSession?: boolean;
  };
  assumptions?: string[];
  complexity?: 'simple' | 'medium' | 'high';
  confidence?: number;
  skillIds?: string[];
  taskSpec?: AgentTaskSpec;
};

export type DesignExecution = {
  executionId: string;
  conversationId: string;
  sourceMessageId: string | null;
  routeKind: DesignRouteKind;
  status: DesignExecutionStatus;
  toolId: string | null;
  operation: string | null;
  toolTaskId: string | null;
  agentRunId: string | null;
  localRoute: string | null;
  maxCredits: number;
  quotedCredits: number | null;
  plan: DesignExecutionPlan;
  error: { code: string } | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type DesignConversation = {
  conversationId: string;
  projectId: string | null;
  title: string;
  status: 'active' | 'archived';
  autoCreditCap: number;
  clarificationRounds: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  messages: DesignMessage[];
  executions: DesignExecution[];
  uploads?: Array<{
    clientId: string;
    assetId: string;
    mimeType: string;
    byteSize: number;
    createdAt: string;
  }>;
};

export type DesignAssistantStatus = {
  enabled: boolean;
  workerEnabled: boolean;
  plannerReady: boolean;
  model: '@cf/openai/gpt-oss-120b';
  imageModel: 'Kwai-Kolors/Kolors';
  autoCreditCap: number;
  retentionDays: number;
  authorizationIdleMinutes: number;
  plannerV2Enabled?: boolean;
  adaptiveReasoningEnabled?: boolean;
  projectMemoryEnabled?: boolean;
  runtimeV2RolloutPercent?: number;
  runtimeV2CanaryConfigured?: boolean;
  providerScheduler?: { ok: boolean; enabled: boolean; mode: string; intervalMs?: number };
  queued: number;
  running: number;
};

export type DesignConversationEvent = {
  eventId: string;
  conversationId: string;
  type: string;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type DesignSessionAuthorization = {
  authorizationId: string;
  conversationId: string;
  siteOrigin: string;
  actionType: string;
  status: 'active' | 'revoked' | 'expired';
  lastUsedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export class DesignConversationError extends Error {
  code: string;
  status?: number;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(code: string, options: {
    status?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  } = {}) {
    super(code);
    this.name = 'DesignConversationError';
    this.code = code;
    this.status = options.status;
    this.retryable = Boolean(options.retryable);
    this.details = options.details;
  }
}

const responseError = async (response: Response) => {
  const json: any = await response.json().catch(() => null);
  const raw = json?.error;
  return new DesignConversationError(String(raw?.code || `API_ERROR_${response.status}`), {
    status: response.status,
    retryable: Boolean(raw?.retryable),
    details: raw?.details && typeof raw.details === 'object' ? raw.details : undefined
  });
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await authFetch(buildApiUrl(path), init);
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
};

export const getDesignAssistantStatus = async () => {
  const result = await requestJson<{ status: DesignAssistantStatus }>('/api/design-assistant/status');
  return result.status;
};

export const createDesignConversation = async (projectId?: string | null) => {
  const result = await requestJson<{ conversation: DesignConversation }>('/api/design-conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectId ? { projectId } : {})
  });
  return result.conversation;
};

export const listDesignConversations = async () => {
  const result = await requestJson<{ conversations: DesignConversation[] }>('/api/design-conversations');
  return Array.isArray(result.conversations) ? result.conversations : [];
};

export const getDesignConversation = async (conversationId: string) => {
  const result = await requestJson<{ conversation: DesignConversation }>(
    `/api/design-conversations/${encodeURIComponent(conversationId)}`
  );
  return result.conversation;
};

export const deleteDesignConversation = async (conversationId: string) => {
  const response = await authFetch(
    buildApiUrl(`/api/design-conversations/${encodeURIComponent(conversationId)}`),
    { method: 'DELETE' }
  );
  if (!response.ok) throw await responseError(response);
};

export const sendDesignMessage = async (
  conversationId: string,
  message: string,
  attachments: DesignAttachmentManifest[] = []
) => {
  const result = await requestJson<{ message: DesignMessage }>(
    `/api/design-conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, attachments })
    }
  );
  return result.message;
};

export const uploadDesignAttachments = async (
  conversationId: string,
  files: Array<{ clientId: string; file: File }>
) => {
  const form = new FormData();
  form.set('clientIds', JSON.stringify(files.map((item) => item.clientId)));
  files.forEach((item) => form.append('files', item.file, item.file.name));
  const response = await authFetch(
    buildApiUrl(`/api/design-conversations/${encodeURIComponent(conversationId)}/attachments`),
    { method: 'POST', body: form }
  );
  if (!response.ok) throw await responseError(response);
  const result = await response.json() as {
    uploads?: Array<{ clientId: string; assetId: string; mimeType: string; byteSize: number }>;
  };
  return Array.isArray(result.uploads) ? result.uploads : [];
};

const executionPath = (conversationId: string, executionId: string, action: string) =>
  `/api/design-conversations/${encodeURIComponent(conversationId)}/executions/${encodeURIComponent(executionId)}/${action}`;

export const recordDesignToolQuote = async (
  conversationId: string,
  executionId: string,
  quoteId: string
) => {
  const result = await requestJson<{ execution: DesignExecution }>(
    executionPath(conversationId, executionId, 'quote'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId })
    }
  );
  return result.execution;
};

export const quoteDesignAgentExecution = async (conversationId: string, executionId: string) => {
  return requestJson<{ quote: AgentQuote; execution: DesignExecution }>(
    executionPath(conversationId, executionId, 'agent-quote'),
    { method: 'POST' }
  );
};

export const attachDesignExecutionTarget = async (
  conversationId: string,
  executionId: string,
  target: { toolTaskId?: string; agentRunId?: string }
) => {
  const result = await requestJson<{ execution: DesignExecution }>(
    executionPath(conversationId, executionId, 'target'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target)
    }
  );
  return result.execution;
};

export const increaseDesignExecutionBudget = async (
  conversationId: string,
  executionId: string,
  maxCredits: number
) => {
  const result = await requestJson<{ execution: DesignExecution }>(
    executionPath(conversationId, executionId, 'budget'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxCredits })
    }
  );
  return result.execution;
};

export const cancelDesignExecution = async (conversationId: string, executionId: string) => {
  const result = await requestJson<{ execution: DesignExecution }>(
    executionPath(conversationId, executionId, 'cancel'),
    { method: 'POST' }
  );
  return result.execution;
};

export const grantDesignSessionAuthorization = async (
  conversationId: string,
  siteOrigin: string,
  actionType: string
) => {
  const result = await requestJson<{ authorization: DesignSessionAuthorization }>(
    `/api/design-conversations/${encodeURIComponent(conversationId)}/authorizations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteOrigin, actionType })
    }
  );
  return result.authorization;
};

export const listDesignSessionAuthorizations = async (conversationId: string) => {
  const result = await requestJson<{ authorizations: DesignSessionAuthorization[] }>(
    `/api/design-conversations/${encodeURIComponent(conversationId)}/authorizations`
  );
  return Array.isArray(result.authorizations) ? result.authorizations : [];
};

export const revokeDesignSessionAuthorization = async (
  conversationId: string,
  authorizationId: string
) => {
  const response = await authFetch(buildApiUrl(
    `/api/design-conversations/${encodeURIComponent(conversationId)}/authorizations/${encodeURIComponent(authorizationId)}`
  ), { method: 'DELETE' });
  if (!response.ok) throw await responseError(response);
};

export const openDesignEventStream = (
  conversationId: string,
  handlers: {
    onEvent: (event: DesignConversationEvent) => void;
    onError?: () => void;
  }
) => {
  const source = new EventSource(
    buildApiUrl(`/api/design-conversations/${encodeURIComponent(conversationId)}/events`),
    { withCredentials: true }
  );
  const known = [
    'conversation.created',
    'message.received',
    'clarification.required',
    'execution.ready',
    'planning.failed',
    'attachments.uploaded',
    'execution.quoted',
    'execution.budget_required',
    'execution.budget_updated',
    'execution.started',
    'execution.queued',
    'execution.running',
    'execution.waiting_authorization',
    'execution.succeeded',
    'execution.failed',
    'execution.cancelled',
    'authorization.granted',
    'authorization.revoked'
  ];
  const listener = (raw: MessageEvent) => {
    try {
      handlers.onEvent(JSON.parse(raw.data) as DesignConversationEvent);
    } catch {}
  };
  known.forEach((type) => source.addEventListener(type, listener as EventListener));
  source.onerror = () => handlers.onError?.();
  return () => source.close();
};
