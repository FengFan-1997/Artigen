import type { CutoutJobIdentity } from './cutoutProtocol';

let nextGateId = 0;

export class CutoutJobGate {
  private readonly gateId = (nextGateId += 1);
  private nextJobId = 0;
  private current: CutoutJobIdentity | null = null;

  begin(sourceRevision: number): CutoutJobIdentity {
    const identity = {
      jobId: `ai-bg-${this.gateId}-${(this.nextJobId += 1)}`,
      sourceRevision
    };
    this.current = identity;
    return identity;
  }

  isCurrent(identity: CutoutJobIdentity): boolean {
    return (
      this.current?.jobId === identity.jobId &&
      this.current.sourceRevision === identity.sourceRevision
    );
  }

  complete(identity: CutoutJobIdentity): boolean {
    if (!this.isCurrent(identity)) return false;
    this.current = null;
    return true;
  }

  cancel(): CutoutJobIdentity | null {
    const cancelled = this.current;
    this.current = null;
    return cancelled;
  }
}
