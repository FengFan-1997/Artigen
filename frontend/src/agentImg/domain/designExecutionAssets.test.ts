import { describe, expect, it, vi } from 'vitest';
import {
  prepareDesignExecutionAssetIds,
  resolveDesignExecutionAssetInputs
} from './designExecutionAssets';

describe('resolveDesignExecutionAssetInputs', () => {
  it('reuses uploaded conversation assets when local File objects are gone after refresh', () => {
    expect(resolveDesignExecutionAssetInputs({
      clientIds: ['attachment-1'],
      uploads: [{ clientId: 'attachment-1', assetId: 'asset-1' }],
      availableClientIds: []
    })).toEqual({
      clientIds: ['attachment-1'],
      assetIds: ['asset-1'],
      uploadClientIds: [],
      missingClientIds: []
    });
  });

  it('separates existing assets, newly selected files, and inputs that must be reselected', () => {
    expect(resolveDesignExecutionAssetInputs({
      clientIds: ['persisted', 'selected-now', 'lost-file', 'persisted'],
      uploads: [{ clientId: 'persisted', assetId: 'asset-1' }],
      availableClientIds: ['selected-now']
    })).toEqual({
      clientIds: ['persisted', 'selected-now', 'lost-file'],
      assetIds: ['asset-1'],
      uploadClientIds: ['selected-now'],
      missingClientIds: ['lost-file']
    });
  });

  it('keeps execution input order when all assets are already registered', () => {
    expect(resolveDesignExecutionAssetInputs({
      clientIds: ['second', 'first'],
      uploads: [
        { clientId: 'first', assetId: 'asset-1' },
        { clientId: 'second', assetId: 'asset-2' }
      ],
      availableClientIds: []
    }).assetIds).toEqual(['asset-2', 'asset-1']);
  });
});

describe('prepareDesignExecutionAssetIds', () => {
  it('reuses persisted assets without asking for files again', async () => {
    const uploadMissing = vi.fn();
    await expect(prepareDesignExecutionAssetIds({
      clientIds: ['attachment-1'],
      uploads: [{ clientId: 'attachment-1', assetId: 'asset-1' }],
      availableClientIds: [],
      uploadMissing
    })).resolves.toEqual(['asset-1']);
    expect(uploadMissing).not.toHaveBeenCalled();
  });

  it('uploads only new inputs and keeps the complete input order', async () => {
    const uploadMissing = vi.fn(async (clientIds: string[]) => (
      clientIds.map((clientId) => ({ clientId, assetId: 'asset-new' }))
    ));
    await expect(prepareDesignExecutionAssetIds({
      clientIds: ['persisted', 'new-file'],
      uploads: [{ clientId: 'persisted', assetId: 'asset-old' }],
      availableClientIds: ['new-file'],
      uploadMissing
    })).resolves.toEqual(['asset-old', 'asset-new']);
    expect(uploadMissing).toHaveBeenCalledWith(['new-file']);
  });

  it('requires reselecting unavailable files and never starts a partial input set', async () => {
    const uploadMissing = vi.fn();
    await expect(prepareDesignExecutionAssetIds({
      clientIds: ['available', 'missing'],
      uploads: [],
      availableClientIds: ['available'],
      uploadMissing
    })).rejects.toMatchObject({ code: 'DESIGN_ATTACHMENTS_REQUIRED' });
    expect(uploadMissing).not.toHaveBeenCalled();
  });

  it('fails closed when an upload response omits a requested input', async () => {
    await expect(prepareDesignExecutionAssetIds({
      clientIds: ['new-file'],
      uploads: [],
      availableClientIds: ['new-file'],
      uploadMissing: async () => []
    })).rejects.toMatchObject({ code: 'DESIGN_ATTACHMENTS_REQUIRED' });
  });
});
