export class AssetUrlRegistry {
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private assetRevisions = new Map<string, number>();
  private epoch = 0;

  async get(assetId: string, loadBlob: (assetId: string) => Promise<Blob | null>): Promise<string> {
    const existing = this.urls.get(assetId);
    if (existing) return existing;
    const inFlight = this.pending.get(assetId);
    if (inFlight) return inFlight;

    const epoch = this.epoch;
    const assetRevision = this.assetRevisions.get(assetId) ?? 0;
    const request = loadBlob(assetId).then((blob) => {
      if (!blob) throw new Error('ASSET_NOT_FOUND');
      if (
        epoch !== this.epoch ||
        assetRevision !== (this.assetRevisions.get(assetId) ?? 0)
      ) {
        throw new Error('ASSET_URL_INVALIDATED');
      }
      const url = URL.createObjectURL(blob);
      this.urls.set(assetId, url);
      if (this.pending.get(assetId) === request) this.pending.delete(assetId);
      return url;
    }).catch((error) => {
      if (this.pending.get(assetId) === request) this.pending.delete(assetId);
      throw error;
    });
    this.pending.set(assetId, request);
    return request;
  }

  retainOnly(assetIds: Iterable<string>): void {
    const keep = new Set(assetIds);
    for (const [assetId, url] of this.urls) {
      if (keep.has(assetId)) continue;
      URL.revokeObjectURL(url);
      this.urls.delete(assetId);
    }
    for (const assetId of this.pending.keys()) {
      if (keep.has(assetId)) continue;
      this.invalidatePending(assetId);
    }
  }

  revokeAll(): void {
    this.epoch += 1;
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.pending.clear();
  }

  private invalidatePending(assetId: string): void {
    this.assetRevisions.set(assetId, (this.assetRevisions.get(assetId) ?? 0) + 1);
    this.pending.delete(assetId);
  }
}
