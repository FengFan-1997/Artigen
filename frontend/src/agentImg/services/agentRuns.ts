import { authFetch } from '@/login/authFetch';
import { buildApiUrl } from '@/utils/api';
import { ToolTaskClientError } from './toolTasks';

export type AgentRunStatus =
  | 'draft'
  | 'queued'
  | 'provisioning'
  | 'running'
  | 'waiting_user'
  | 'paused'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type AgentArtifact = {
  artifactId: string;
  assetId: string | null;
  parentArtifactId: string | null;
  role: 'source' | 'editable' | 'preview' | 'pdf' | 'package' | 'website' | 'image' | 'data';
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string | null;
  version: number;
  verificationStatus: 'pending' | 'passed' | 'failed';
  verification: Record<string, unknown>;
  sources: Array<{ title: string; url: string }>;
  costCredits: number;
  url: string | null;
  expiresAt: string;
  createdAt: string;
};

export type AgentApproval = {
  approvalId: string;
  actionType: string;
  recipient: string;
  riskLevel: 'medium' | 'high' | 'blocked';
  changeSummary: string;
  evidenceSummary: string;
  impactSummary: string;
  rollbackSummary: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  expiresAt: string;
  decidedAt: string | null;
  createdAt: string;
};

export type AgentSubagentStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AgentSkillRef = { id: string; version: number };

export type AgentRequirement = {
  id: string;
  text: string;
  source: 'user' | 'planner' | 'server';
  criticality: 'critical' | 'required' | 'optional';
};

export type AgentTaskSpec = {
  version: 1 | 2;
  goal: string;
  goalRequirement?: AgentRequirement;
  complexity: 'simple' | 'medium' | 'high';
  confidence: number;
  constraints: string[];
  constraintRequirements?: AgentRequirement[];
  assumptions: string[];
  deliverables: Array<'report' | 'spreadsheet' | 'presentation' | 'website' | 'image'>;
  allowedOrigins: string[];
  acceptanceCriteria: string[];
  acceptanceRequirements?: AgentRequirement[];
  skillIds: string[];
  plan: Array<{
    id: string;
    label: string;
    phase: 'research' | 'production' | 'verification' | 'completion';
    status: 'pending' | 'in_progress' | 'completed';
  }>;
  budget: { maxCredits: number };
};

export type ObservationEnvelope = {
  ok: boolean;
  code: string | null;
  summary: string;
  stateDelta: Record<string, unknown>;
  evidenceRefs: string[];
  changedFiles: string[];
  retryHint: string | null;
  fingerprint: string;
};

export type AgentWorkingState = {
  version: 1 | 2;
  taskSpec: AgentTaskSpec;
  phase: AgentTaskSpec['plan'][number]['phase'];
  projectMemory: Record<string, unknown> | null;
  sources: string[];
  files: string[];
  completedEvidence: ObservationEnvelope[];
  failures: ObservationEnvelope[];
  pendingApproval: Record<string, unknown> | null;
  budgetPolicy?: Record<string, boolean | number>;
  remainingBudget: number;
};

export type AgentSubagent = {
  subagentId: string;
  runId: string;
  ordinal: number;
  role: string;
  label: string;
  status: AgentSubagentStatus;
  progress: { stepCount: number; maxSteps: number; cancelRequested: boolean };
  usage: { credits: number; inputTokens?: number; outputTokens?: number; provider?: string };
  summary: string;
  outputFiles: Array<{ path: string; byteSize: number; sha256: string }>;
  error: { code: string } | null;
  expiresAt: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type AgentRun = {
  runId: string;
  objective?: string;
  objectivePreview?: string;
  projectId: string | null;
  status: AgentRunStatus;
  runtime?: {
    version: number;
    promptProfile: string | null;
    profileHash?: string | null;
    profileSummary?: Record<string, unknown>;
    checkpointVersion?: number;
    skills: AgentSkillRef[];
  };
  model: { provider: string; name: string };
  sandbox: { provider: string; version: string; takeoverAvailable: boolean };
  capabilities: Record<string, boolean>;
  browserConfig: { allowedOrigins?: string[]; profileId?: string | null; persistSession?: boolean };
  budget: {
    maximum: number;
    freeReserved: number;
    used: number;
    charged: number;
    refunded: number;
    frozen: number;
    released: number;
  };
  progress: {
    stepCount: number;
    maxSteps: number;
    replanCount: number;
    pauseRequested: boolean;
    cancelRequested: boolean;
    checklist: Record<string, unknown>;
    plan: Array<{
      label: string;
      status: 'pending' | 'in_progress' | 'completed';
    }>;
    planExplanation: string;
    durableCheckpointSaved: boolean;
    retryRequired?: boolean;
    retryReason?: string | null;
    clarificationRequired?: boolean;
  };
  approvals?: AgentApproval[];
  artifacts?: AgentArtifact[];
  subagents: AgentSubagent[];
  error: { code: string } | null;
  finalTextSha256?: string | null;
  semanticVerification?: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  replayed?: boolean;
};

export type AgentEvent = {
  eventId: string;
  runId: string;
  subagentId: string | null;
  type: string;
  phase: string | null;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type AgentQuote = {
  currency: 'credits';
  freeCreditsRemaining: number;
  trialCreditsRemaining?: number;
  dailyFreeCreditsRemaining?: number;
  estimatedCredits: { minimum: number; maximum: number };
  maximumCredits: number;
  hardMaximumCredits: number;
  requiredPaidHold: number;
  canStart: boolean;
  runtime?: { version: number };
  limits: {
    minutes: number;
    steps: number;
    memoryMb: number;
    diskGb: number;
    concurrentRuns: number;
  };
  requirements: Record<string, boolean>;
};

export type AgentServiceStatus = {
  enabled: boolean;
  workerOnline: boolean;
  workerModelReady?: boolean;
  configuredModel?: { provider: string; model: string } | null;
  workerModel?: { provider: string; model: string } | null;
  queueDepth: number;
  oldestQueuedAt: string | null;
  concurrency: number;
  modelFamily: string;
  sandboxMode: 'local' | 'cloud' | 'fixture' | string;
  browserReady: boolean;
  egressVerified: boolean;
  desktopRelayReady: boolean;
  sandboxImageRef: string | null;
  browserPublicEnabled?: boolean;
  imageGenerationPublicEnabled: boolean;
  subagentsEnabled?: boolean;
  subagentMaxConcurrent?: number;
  subagentSandboxMode?: 'shared-v1' | string;
  runtimeV2Enabled?: boolean;
  runtimeV2RolloutPercent?: number;
  runtimeV2CanaryConfigured?: boolean;
  promptEngineVersion?: string;
  adaptiveReasoningEnabled?: boolean;
  projectMemoryEnabled?: boolean;
  providerScheduler?: {
    enabled: boolean;
    ready: boolean;
    mode: string;
  };
  runtimeProfile?: {
    version: string;
    promptEngineVersion: string;
    checkpointVersion: number;
    model: string;
    actorSamplingProfile: string;
  };
  durability?: {
    checkpointVersion?: number;
    leaseEpochReady: boolean;
    modelReceiptsReady: boolean;
    toolReceiptsReady: boolean;
    budgetReservationsReady: boolean;
    pricingReady?: boolean;
  };
  fairScheduling?: {
    enabled: boolean;
    agingSeconds: number;
    admissionControl: boolean;
  };
  accessMode?: 'disabled' | 'owner-only-v1' | 'authenticated-v1' | string;
  availabilityNote: 'ready' | 'busy' | 'worker_offline' | string;
};

export type AgentDesktopTicket = {
  ticketId: string;
  websocketUrl: string;
  expiresAt: string;
};

export type AgentIntegration = {
  provider: 'google_drive' | 'github';
  subject: string;
  scopes: string[];
  status: 'active' | 'revoked' | 'error';
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type AgentBrowserProfile = {
  profileId: string;
  siteOrigin: string;
  label: string;
  lastUsedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

const responseError = async (response: Response) => {
  const body: any = await response.json().catch(() => null);
  const error = body?.error;
  const code = typeof error === 'object'
    ? String(error?.code || `API_ERROR_${response.status}`)
    : String(error || `API_ERROR_${response.status}`);
  return new ToolTaskClientError(code, {
    status: response.status,
    field: typeof error?.field === 'string' ? error.field : undefined,
    retryable: Boolean(error?.retryable)
  });
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await authFetch(url, init);
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
};

export const getAgentServiceStatus = async () => {
  const result = await requestJson<{ status: AgentServiceStatus }>(
    buildApiUrl('/api/agent/status')
  );
  return result.status;
};

export const quoteAgentRun = async (input: {
  objective: string;
  maxCredits?: number;
  capabilities?: Record<string, boolean>;
  deliverables?: string[];
  taskSpec?: Record<string, unknown> | null;
  browserConfig?: {
    allowedOrigins?: string[];
    profileId?: string | null;
    persistSession?: boolean;
  };
}) => {
  const result = await requestJson<{ quote: AgentQuote }>(buildApiUrl('/api/agent-runs/quote'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return result.quote;
};

export const createAgentRun = async (input: {
  objective: string;
  assetIds?: string[];
  maxCredits: number;
  capabilities: Record<string, boolean>;
  deliverables?: string[];
  taskSpec?: Record<string, unknown> | null;
  browserConfig?: {
    allowedOrigins?: string[];
    profileId?: string | null;
    persistSession?: boolean;
  };
  projectId?: string | null;
  idempotencyKey?: string;
}) => {
  const key = input.idempotencyKey || crypto.randomUUID();
  const result = await requestJson<{ run: AgentRun }>(buildApiUrl('/api/agent-runs'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify(input)
  });
  return result.run;
};

export const cancelAgentSubagent = async (runId: string, subagentId: string) => {
  const result = await requestJson<{ subagent: AgentSubagent }>(buildApiUrl(
    `/api/agent-runs/${encodeURIComponent(runId)}/subagents/${encodeURIComponent(subagentId)}/cancel`
  ), { method: 'POST' });
  return result.subagent;
};

export const uploadAgentAssets = async (files: File[]) => {
  if (!files.length) return [] as string[];
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  const response = await authFetch(buildApiUrl('/api/agent-assets'), {
    method: 'POST',
    body: form
  });
  if (!response.ok) throw await responseError(response);
  const result = await response.json() as {
    assets?: Array<{ assetId?: string }>;
  };
  const assetIds = (result.assets || []).map((asset) => String(asset.assetId || '')).filter(Boolean);
  if (assetIds.length !== files.length) {
    throw new ToolTaskClientError('AGENT_ASSET_UPLOAD_INCOMPLETE');
  }
  return assetIds;
};

export const listAgentRuns = async () => {
  const result = await requestJson<{ runs: AgentRun[] }>(buildApiUrl('/api/agent-runs'));
  return Array.isArray(result.runs) ? result.runs : [];
};

export const getAgentRun = async (runId: string) => {
  const result = await requestJson<{ run: AgentRun }>(
    buildApiUrl(`/api/agent-runs/${encodeURIComponent(runId)}`)
  );
  return result.run;
};

export const controlAgentRun = async (
  runId: string,
  action: 'pause' | 'resume' | 'cancel'
) => {
  const result = await requestJson<{ run: AgentRun }>(
    buildApiUrl(`/api/agent-runs/${encodeURIComponent(runId)}/${action}`),
    { method: 'POST' }
  );
  return result.run;
};

export const submitAgentInput = async (
  runId: string,
  input: {
    message?: string;
    approvalId?: string;
    decision?: 'approved' | 'denied';
    decisionReason?: string;
    takeoverEnded?: boolean;
    takeoverApprovalId?: string;
  }
) => {
  await requestJson(
    buildApiUrl(`/api/agent-runs/${encodeURIComponent(runId)}/input`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  );
};

export const createAgentDesktopTicket = async (
  runId: string,
  approvalId: string
) => {
  const result = await requestJson<{ ticket: AgentDesktopTicket }>(
    buildApiUrl(`/api/agent-runs/${encodeURIComponent(runId)}/desktop-ticket`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId })
    }
  );
  return result.ticket;
};

export const openAgentEventStream = (
  runId: string,
  handlers: {
    onEvent: (event: AgentEvent) => void;
    onError?: () => void;
  }
) => {
  const source = new EventSource(
    buildApiUrl(`/api/agent-runs/${encodeURIComponent(runId)}/events`),
    { withCredentials: true }
  );
  const known = [
    'run.queued',
    'run.provisioning',
    'sandbox.ready',
    'sandbox.resumed',
    'step.recorded',
    'artifact.created',
    'cost.updated',
    'approval.required',
    'takeover.required',
    'takeover.ticket_issued',
    'approval.approved',
    'approval.denied',
    'run.pause_requested',
    'run.paused',
    'run.resumed',
    'run.recovered',
    'run.verifying',
    'run.succeeded',
    'run.failed',
    'run.cancelled',
    'run.input_received',
    'takeover.ended',
    'subagent.created',
    'subagent.started',
    'subagent.progress',
    'subagent.succeeded',
    'subagent.failed',
    'subagent.cancelled'
  ];
  const listener = (raw: MessageEvent) => {
    try {
      handlers.onEvent(JSON.parse(raw.data) as AgentEvent);
    } catch {}
  };
  known.forEach((type) => source.addEventListener(type, listener as EventListener));
  source.onerror = () => handlers.onError?.();
  return () => source.close();
};

export const agentAssetUrl = (artifact: AgentArtifact) => (
  artifact.url ? buildApiUrl(artifact.url) : ''
);

export const loadAgentWebsitePreview = async (artifact: AgentArtifact) => {
  if (!artifact.url || !['website', 'package'].includes(artifact.role) ||
      artifact.mimeType !== 'application/zip') {
    throw new ToolTaskClientError('AGENT_WEBSITE_PREVIEW_UNAVAILABLE');
  }
  if (artifact.byteSize > 20 * 1024 * 1024) {
    throw new ToolTaskClientError('AGENT_WEBSITE_PREVIEW_TOO_LARGE');
  }
  const response = await authFetch(buildApiUrl(artifact.url));
  if (!response.ok) throw await responseError(response);
  const { strFromU8, unzip } = await import('fflate');
  const archive = await response.arrayBuffer();
  if (archive.byteLength > 20 * 1024 * 1024) {
    throw new ToolTaskClientError('AGENT_WEBSITE_PREVIEW_TOO_LARGE');
  }
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(new Uint8Array(archive), (error, result) => {
      if (error) reject(new ToolTaskClientError('AGENT_WEBSITE_ARCHIVE_INVALID'));
      else resolve(result);
    });
  });
  const entries = Object.entries(files);
  const expandedBytes = entries.reduce((total, [, bytes]) => total + bytes.byteLength, 0);
  if (entries.length > 1000 || expandedBytes > 50 * 1024 * 1024) {
    throw new ToolTaskClientError('AGENT_WEBSITE_PREVIEW_TOO_LARGE');
  }
  const indexName = Object.keys(files)
    .filter((name) => /(^|\/)index\.html$/i.test(name))
    .sort((left, right) => left.length - right.length)[0];
  if (!indexName) throw new ToolTaskClientError('AGENT_WEBSITE_INDEX_MISSING');
  const html = strFromU8(files[indexName]);
  const csp = [
    "default-src 'none'",
    "img-src data: blob:",
    "font-src data:",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'"
  ].join('; ');
  const policy = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  return /<head[\s>]/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${policy}`)
    : `${policy}${html}`;
};

export const listAgentIntegrations = async () => {
  const result = await requestJson<{ integrations: AgentIntegration[] }>(
    buildApiUrl('/api/integrations')
  );
  return Array.isArray(result.integrations) ? result.integrations : [];
};

export const listAgentBrowserProfiles = async () => {
  const result = await requestJson<{ profiles: AgentBrowserProfile[] }>(
    buildApiUrl('/api/agent-browser-profiles')
  );
  return Array.isArray(result.profiles) ? result.profiles : [];
};

export const revokeAgentBrowserProfile = async (profileId: string) => {
  await requestJson(
    buildApiUrl(`/api/agent-browser-profiles/${encodeURIComponent(profileId)}`),
    { method: 'DELETE' }
  );
};

export const connectAgentIntegration = async (
  provider: AgentIntegration['provider'],
  returnTo = '/artigen/agent'
) => {
  const result = await requestJson<{
    authorization: { authorizeUrl: string; expiresInSeconds: number };
  }>(buildApiUrl(`/api/integrations/${provider}/connect`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnTo })
  });
  return result.authorization;
};

export const revokeAgentIntegration = async (provider: AgentIntegration['provider']) => {
  const response = await authFetch(buildApiUrl(`/api/integrations/${provider}`), {
    method: 'DELETE'
  });
  if (!response.ok) throw await responseError(response);
};
