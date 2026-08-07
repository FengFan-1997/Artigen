const catalog = require('../../shared/tools.catalog.json');

const tools = Object.freeze(catalog.tools.map((tool) => Object.freeze(tool)));
const byId = new Map(tools.map((tool) => [tool.id, tool]));
const byLegacyId = new Map(tools.flatMap((tool) => tool.legacyIds.map((id) => [id, tool])));

const getTool = (id) => byId.get(String(id || '').trim()) || byLegacyId.get(String(id || '').trim()) || null;

const assertToolOperation = (toolId, operation) => {
  const tool = getTool(toolId);
  if (!tool) return { ok: false, code: 'TOOL_NOT_FOUND', field: 'toolId' };
  const op = String(operation || '').trim();
  if (!tool.operations.includes(op)) return { ok: false, code: 'OPERATION_NOT_SUPPORTED', field: 'operation' };
  return { ok: true, tool, operation: op };
};

const resolveOperationExecution = (tool, operation) => {
  if (!tool || typeof tool !== 'object') return null;
  if (tool.execution === 'local' || tool.execution === 'server') return tool.execution;
  if (tool.execution !== 'hybrid') return null;
  const serverOperations = Array.isArray(tool.serverOperations) ? tool.serverOperations : [];
  return serverOperations.includes(String(operation || '').trim()) ? 'server' : 'local';
};

const resolveOperationSku = (tool, operation, options = {}) => {
  if (!tool || typeof tool !== 'object') return null;
  const op = String(operation || '').trim();
  const profileId = String(options?.profileId || '').trim();
  if (
    op === 'generate' &&
    profileId &&
    tool.profileSkus &&
    typeof tool.profileSkus === 'object' &&
    !Array.isArray(tool.profileSkus) &&
    Object.prototype.hasOwnProperty.call(tool.profileSkus, profileId)
  ) {
    const profileSku = tool.profileSkus[profileId];
    return typeof profileSku === 'string' && profileSku.trim()
      ? profileSku.trim()
      : null;
  }
  const operationSkus = tool.operationSkus;
  if (
    operationSkus &&
    typeof operationSkus === 'object' &&
    !Array.isArray(operationSkus) &&
    Object.prototype.hasOwnProperty.call(operationSkus, op)
  ) {
    const operationSku = operationSkus[op];
    return typeof operationSku === 'string' && operationSku.trim()
      ? operationSku.trim()
      : null;
  }
  return typeof tool.sku === 'string' && tool.sku.trim() ? tool.sku.trim() : null;
};

const isPaidOperation = (tool, operation, options = {}) => {
  return resolveOperationExecution(tool, operation) === 'server' &&
    Boolean(resolveOperationSku(tool, operation, options));
};

module.exports = {
  catalogVersion: catalog.version,
  tools,
  getTool,
  assertToolOperation,
  resolveOperationExecution,
  resolveOperationSku,
  isPaidOperation
};
