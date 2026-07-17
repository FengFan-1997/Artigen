import type { PixelJobIdentity, PixelWorkerResult } from './protocol';

function layerKey(projectId: string, layerId: string): string {
  return `${projectId}:${layerId}`;
}

export class PixelResultGate {
  private latest = new Map<string, PixelJobIdentity>();

  begin(identity: PixelJobIdentity): string | null {
    const key = layerKey(identity.projectId, identity.layerId);
    const replacedJobId = this.latest.get(key)?.jobId ?? null;
    this.latest.set(key, { ...identity });
    return replacedJobId === identity.jobId ? null : replacedJobId;
  }

  isCurrent(result: PixelWorkerResult, activeProjectId: string, activeRevision: number): boolean {
    if (result.projectId !== activeProjectId || result.revision !== activeRevision) return false;
    const expected = this.latest.get(layerKey(result.projectId, result.layerId));
    return Boolean(
      expected &&
      expected.jobId === result.jobId &&
      expected.sourceAssetId === result.sourceAssetId &&
      expected.revision === result.revision
    );
  }

  complete(result: PixelWorkerResult): void {
    const key = layerKey(result.projectId, result.layerId);
    const expected = this.latest.get(key);
    if (expected?.jobId === result.jobId) this.latest.delete(key);
  }

  invalidateLayer(projectId: string, layerId: string): string | null {
    const key = layerKey(projectId, layerId);
    const jobId = this.latest.get(key)?.jobId ?? null;
    this.latest.delete(key);
    return jobId;
  }

  invalidateProject(projectId: string): string[] {
    const jobIds: string[] = [];
    for (const [key, identity] of this.latest) {
      if (identity.projectId !== projectId) continue;
      jobIds.push(identity.jobId);
      this.latest.delete(key);
    }
    return jobIds;
  }

  clear(): string[] {
    const jobIds = [...this.latest.values()].map((identity) => identity.jobId);
    this.latest.clear();
    return jobIds;
  }
}
