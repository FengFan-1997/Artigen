import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearCreativeProjectDraft,
  closeCreativeProjectDraftDatabase,
  loadCreativeProjectDraft,
  saveCreativeProjectDraft
} from './projectDraftDb';

const deleteDraftDatabase = () => new Promise<void>((resolve) => {
  const request = indexedDB.deleteDatabase('artigen-creative-project-drafts');
  request.onsuccess = () => resolve();
  request.onerror = () => resolve();
  request.onblocked = () => resolve();
});

afterEach(async () => {
  closeCreativeProjectDraftDatabase();
  await deleteDraftDatabase();
});

describe('anonymous creative project drafts', () => {
  it('restores the brief and local product preview without authentication', async () => {
    const productFile = new File(['product-bytes'], 'product.png', { type: 'image/png' });
    await expect(saveCreativeProjectDraft({
      title: '秋季礼盒',
      productName: '咖啡礼盒',
      brief: '生成一套信息流视觉',
      productFile
    })).resolves.toBe(true);

    const restored = await loadCreativeProjectDraft();
    expect(restored).toMatchObject({
      id: 'current',
      title: '秋季礼盒',
      productName: '咖啡礼盒',
      brief: '生成一套信息流视觉'
    });
    expect(restored?.productFile).toMatchObject({
      name: 'product.png',
      size: 13,
      type: 'image/png'
    });
  });

  it('clears a draft only after the caller completes project creation', async () => {
    await saveCreativeProjectDraft({
      title: '待创建项目',
      productName: '',
      brief: '',
      productFile: null
    });
    await clearCreativeProjectDraft();
    await expect(loadCreativeProjectDraft()).resolves.toBeNull();
  });
});
