import { getToolDefinition } from './toolCatalog';

export type ToolEntryLocation = {
  path: string;
  query?: Record<string, string>;
};

export const locationForToolEntry = (entryId: string): ToolEntryLocation | null => {
  const normalizedId = String(entryId || '').trim();
  const workflow = getToolDefinition(normalizedId);
  if (!workflow) return null;

  if (workflow.kind !== 'tool') {
    return { path: workflow.route };
  }

  const operation = workflow.legacyIds.includes(normalizedId)
    ? normalizedId
    : workflow.id === 'image-batch'
      ? 'pipeline'
      : workflow.legacyIds[0];

  return {
    path: workflow.route,
    ...(operation ? { query: { operation } } : {})
  };
};
