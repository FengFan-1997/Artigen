type ReferenceFile = Pick<File, 'name' | 'size' | 'lastModified' | 'type'>;

export const referenceFileKey = (file: ReferenceFile) =>
  JSON.stringify([file.name, file.size, file.lastModified, file.type]);

// Reject a whole over-limit selection instead of silently losing an existing
// file or truncating new references. File bytes never enter localStorage.
export function mergeReferenceFiles<T extends ReferenceFile>(
  current: readonly T[],
  incoming: readonly T[],
  options: { maxFiles?: number; maxFileBytes?: number } = {}
): { files: T[]; error: 'too-many' | 'too-large' | null } {
  if (incoming.some((file) => file.size > (options.maxFileBytes ?? Infinity))) {
    return { files: [...current], error: 'too-large' };
  }
  const unique = new Map(current.map((file) => [referenceFileKey(file), file]));
  for (const file of incoming) {
    const key = referenceFileKey(file);
    if (!unique.has(key)) unique.set(key, file);
  }
  if (unique.size > (options.maxFiles ?? 10)) return { files: [...current], error: 'too-many' };
  return { files: [...unique.values()], error: null };
}
