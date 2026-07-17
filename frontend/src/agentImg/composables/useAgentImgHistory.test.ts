import { describe, expect, it } from 'vitest';
import {
  deserializeAgentImgHistory,
  serializeAgentImgHistory,
  type HistoryItem
} from './useAgentImgHistory';

const taskId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';

describe('AI generation history persistence privacy', () => {
  it('persists only opaque task metadata and never raw prompts or image URLs', () => {
    const item: HistoryItem = {
      id: 'history_private',
      timestamp: 1_700_000_000_000,
      userText: 'Launch the unreleased private product',
      result: {
        prompt: 'Product Profile: secret formula\nUser Request: private campaign',
        negativePrompt: 'competitor logo'
      },
      image: `https://private.example/assets/${assetId}?signature=secret`,
      refImages: ['data:image/png;base64,private-reference'],
      aiText: 'private model response',
      status: 'success',
      errorText: 'raw provider failure',
      taskV2: true,
      taskId,
      assetId,
      profileId: 'standard-v1',
      aspectRatio: '4:5'
    };

    const stored = serializeAgentImgHistory([item]);

    expect(stored).toContain(taskId);
    expect(stored).toContain(assetId);
    expect(stored).not.toContain('unreleased');
    expect(stored).not.toContain('secret formula');
    expect(stored).not.toContain('private.example');
    expect(stored).not.toContain('data:image');
    expect(stored).not.toContain('provider failure');
  });

  it('restores an opaque asset route with a generic label and rejects the legacy rich schema', () => {
    const stored = serializeAgentImgHistory([
      {
        id: 'history_safe',
        timestamp: 1_700_000_000_000,
        userText: 'private prompt',
        result: { prompt: 'private prompt', negativePrompt: '' },
        image: `https://private.example/${assetId}`,
        status: 'success',
        taskV2: true,
        taskId,
        assetId
      }
    ]);

    expect(deserializeAgentImgHistory(stored, 'zh')).toEqual([
      expect.objectContaining({
        id: 'history_safe',
        userText: '已保存的生成任务',
        image: `/api/assets/${assetId}`,
        taskId,
        assetId,
        status: 'success'
      })
    ]);
    expect(
      deserializeAgentImgHistory(
        JSON.stringify([
          {
            id: 'legacy',
            userText: 'raw prompt',
            image: 'https://private.example/image.png'
          }
        ])
      )
    ).toEqual([]);
  });
});
