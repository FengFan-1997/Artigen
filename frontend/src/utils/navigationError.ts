// Browsers use different messages for a rejected dynamic import. Both automatic
// recovery and the explicit retry must reload the document to clear its cache.
export const isRouteChunkLoadError = (error: unknown): boolean => {
  const message = String((error as { message?: unknown })?.message || error || '');
  return /loading chunk|chunkloaderror|failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(message);
};
