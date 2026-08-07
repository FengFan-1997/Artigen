import rawCatalog from '../../../../shared/tools.catalog.json';

export type ToolExecution = 'local' | 'server' | 'hybrid';
export type ToolKind = 'generator' | 'workshop' | 'tool';

export interface ToolLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxPixels: number;
  maxDurationSeconds?: number;
}

export interface ToolDefinition {
  id: string;
  kind: ToolKind;
  name: { zh: string; en: string };
  description: { zh: string; en: string };
  route: string;
  legacyIds: string[];
  execution: ToolExecution;
  serverOperations?: string[];
  requiresLogin: boolean;
  sku: string | null;
  operationSkus?: Record<string, string | null>;
  profileSkus?: Record<string, string | null>;
  privacy: {
    localByDefault: boolean;
    uploads:
      | 'never'
      | 'only-after-confirmation'
      | 'required-after-confirmation'
      | 'ai-only-with-confirmation'
      | 'text-only-with-confirmation'
      | 'word-only-with-confirmation';
    retentionHours: number;
    outputRetentionHours?: number;
  };
  limits: ToolLimits;
  operationLimits?: Record<string, Partial<ToolLimits>>;
  operations: string[];
  outputFormats: string[];
  capabilities: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function assertLocalizedText(
  value: unknown,
  field: string
): asserts value is { zh: string; en: string } {
  if (
    !isRecord(value) ||
    typeof value.zh !== 'string' ||
    typeof value.en !== 'string'
  ) {
    throw new Error(`INVALID_TOOL_CATALOG_${field.toUpperCase()}`);
  }
}

function assertToolLimits(value: unknown): asserts value is ToolLimits {
  if (
    !isRecord(value) ||
    !Number.isFinite(value.maxFiles) ||
    !Number.isFinite(value.maxFileBytes) ||
    !Number.isFinite(value.maxPixels) ||
    (value.maxDurationSeconds !== undefined &&
      !Number.isFinite(value.maxDurationSeconds))
  ) {
    throw new Error('INVALID_TOOL_CATALOG_LIMITS');
  }
}

const validKinds = new Set<ToolKind>(['generator', 'workshop', 'tool']);
const validExecutions = new Set<ToolExecution>(['local', 'server', 'hybrid']);
const validUploadPolicies = new Set<ToolDefinition['privacy']['uploads']>([
  'never',
  'only-after-confirmation',
  'required-after-confirmation',
  'ai-only-with-confirmation',
  'text-only-with-confirmation',
  'word-only-with-confirmation'
]);

function assertToolDefinition(
  value: unknown,
  index: number
): asserts value is ToolDefinition {
  if (!isRecord(value)) throw new Error(`INVALID_TOOL_CATALOG_TOOL_${index}`);
  assertLocalizedText(value.name, 'name');
  assertLocalizedText(value.description, 'description');
  assertToolLimits(value.limits);
  if (
    typeof value.id !== 'string' ||
    !validKinds.has(value.kind as ToolKind) ||
    typeof value.route !== 'string' ||
    !isStringArray(value.legacyIds) ||
    !validExecutions.has(value.execution as ToolExecution) ||
    typeof value.requiresLogin !== 'boolean' ||
    (value.sku !== null && typeof value.sku !== 'string') ||
    !isStringArray(value.operations) ||
    !isStringArray(value.outputFormats) ||
    !isStringArray(value.capabilities)
  ) {
    throw new Error(`INVALID_TOOL_CATALOG_TOOL_${index}`);
  }
  if (value.serverOperations !== undefined && !isStringArray(value.serverOperations)) {
    throw new Error(`INVALID_TOOL_CATALOG_SERVER_OPERATIONS_${index}`);
  }
  if (value.operationSkus !== undefined) {
    if (
      !isRecord(value.operationSkus) ||
      !Object.values(value.operationSkus).every(
        (sku) => sku === null || typeof sku === 'string'
      )
    ) {
      throw new Error(`INVALID_TOOL_CATALOG_OPERATION_SKUS_${index}`);
    }
  }
  if (value.profileSkus !== undefined) {
    if (
      !isRecord(value.profileSkus) ||
      !Object.values(value.profileSkus).every(
        (sku) => sku === null || typeof sku === 'string'
      )
    ) {
      throw new Error(`INVALID_TOOL_CATALOG_PROFILE_SKUS_${index}`);
    }
  }
  if (value.operationLimits !== undefined) {
    if (
      !isRecord(value.operationLimits) ||
      !Object.values(value.operationLimits).every(
        (limits) =>
          isRecord(limits) &&
          Object.entries(limits).every(
            ([key, limit]) =>
              ['maxFiles', 'maxFileBytes', 'maxPixels', 'maxDurationSeconds'].includes(key) &&
              typeof limit === 'number' &&
              Number.isFinite(limit)
          )
      )
    ) {
      throw new Error(`INVALID_TOOL_CATALOG_OPERATION_LIMITS_${index}`);
    }
  }
  const privacy = value.privacy;
  if (
    !isRecord(privacy) ||
    typeof privacy.localByDefault !== 'boolean' ||
    !validUploadPolicies.has(privacy.uploads as ToolDefinition['privacy']['uploads']) ||
    !Number.isFinite(privacy.retentionHours) ||
    (privacy.outputRetentionHours !== undefined &&
      !Number.isFinite(privacy.outputRetentionHours))
  ) {
    throw new Error(`INVALID_TOOL_CATALOG_PRIVACY_${index}`);
  }
}

const parseToolDefinitions = (value: unknown): ToolDefinition[] => {
  if (!Array.isArray(value)) throw new Error('INVALID_TOOL_CATALOG_TOOLS');
  return value.map((tool, index) => {
    assertToolDefinition(tool, index);
    return tool;
  });
};

if (!Number.isInteger(rawCatalog.version) || rawCatalog.version < 1) {
  throw new Error('INVALID_TOOL_CATALOG_VERSION');
}

export const toolCatalogVersion = rawCatalog.version;
export const toolDefinitions = parseToolDefinitions(rawCatalog.tools);

const byId = new Map(toolDefinitions.map((tool) => [tool.id, tool]));
const byLegacyId = new Map(
  toolDefinitions.flatMap((tool) => tool.legacyIds.map((legacyId) => [legacyId, tool] as const))
);

export const getToolDefinition = (id: string) => byId.get(id) ?? byLegacyId.get(id) ?? null;

export const canonicalToolRoute = (id: string, kind?: ToolKind) => {
  const tool = getToolDefinition(id);
  if (!tool || (kind && tool.kind !== kind)) return null;
  return tool.route;
};

export const workflowForLegacyTool = (legacyId: string) => {
  const tool = byLegacyId.get(legacyId);
  return tool?.kind === 'tool' ? tool : null;
};
