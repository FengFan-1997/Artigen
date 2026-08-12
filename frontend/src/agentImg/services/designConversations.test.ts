import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('@/login/authFetch', () => ({ authFetch }));

import {
  attachDesignExecutionTarget,
  createDesignConversation,
  increaseDesignExecutionBudget,
  quoteDesignAgentExecution,
  recordDesignToolQuote,
  sendDesignMessage,
  uploadDesignAttachments
} from './designConversations';
import {
  consumeLocalToolHandoff,
  createLocalToolHandoff
} from './localToolHandoff';

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

describe('design conversation client contract', () => {
  beforeEach(() => authFetch.mockReset());

  it('creates a conversation and sends only local attachment metadata during planning', async () => {
    authFetch
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        conversation: { conversationId: 'conversation-1', messages: [], executions: [] }
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        message: { messageId: 'message-1', role: 'user', text: '生成商品主视觉' }
      }, 202));
    const conversation = await createDesignConversation();
    await sendDesignMessage(conversation.conversationId, '生成商品主视觉', [{
      clientId: 'local-file-1',
      name: 'product.png',
      mimeType: 'image/png',
      byteSize: 2048
    }]);
    const init = authFetch.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      message: '生成商品主视觉',
      attachments: [{
        clientId: 'local-file-1',
        name: 'product.png',
        mimeType: 'image/png',
        byteSize: 2048
      }]
    });
    expect(String(init.body)).not.toContain('data:image');
  });

  it('uploads bytes only after routing requests cloud execution', async () => {
    authFetch.mockResolvedValueOnce(jsonResponse({
      ok: true,
      uploads: [{ clientId: 'local-file-1', assetId: 'asset-1', mimeType: 'image/png', byteSize: 4 }]
    }, 201));
    const file = new File(['test'], 'product.png', { type: 'image/png' });
    await uploadDesignAttachments('conversation-1', [{ clientId: 'local-file-1', file }]);
    const init = authFetch.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(form.getAll('files')).toEqual([file]);
    expect(JSON.parse(String(form.get('clientIds')))).toEqual(['local-file-1']);
  });

  it('records a verified quote before a tool target can be associated', async () => {
    authFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true, execution: { executionId: 'execution-1', quotedCredits: 10 } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, execution: { executionId: 'execution-1', toolTaskId: 'task-1' } }));
    await recordDesignToolQuote('conversation-1', 'execution-1', 'quote-1');
    await attachDesignExecutionTarget('conversation-1', 'execution-1', { toolTaskId: 'task-1' });
    expect(authFetch.mock.calls[0][0]).toContain('/executions/execution-1/quote');
    expect(authFetch.mock.calls[1][0]).toContain('/executions/execution-1/target');
  });

  it('uses server-side agent quote and explicit budget elevation endpoints', async () => {
    authFetch
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        quote: { canStart: false, maximumCredits: 50 },
        execution: { executionId: 'execution-1', status: 'waiting_budget' }
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        execution: { executionId: 'execution-1', status: 'queued', maxCredits: 70 }
      }));
    const blocked = await quoteDesignAgentExecution('conversation-1', 'execution-1');
    expect(blocked.quote.canStart).toBe(false);
    await increaseDesignExecutionBudget('conversation-1', 'execution-1', 70);
    expect(JSON.parse(String(authFetch.mock.calls[1][1].body))).toEqual({ maxCredits: 70 });
  });
});

describe('local tool handoff', () => {
  it('is single-use and keeps File bytes in browser memory', () => {
    const file = new File(['private'], 'private.png', { type: 'image/png' });
    const token = createLocalToolHandoff([file]);
    expect(consumeLocalToolHandoff(token)).toEqual([file]);
    expect(consumeLocalToolHandoff(token)).toEqual([]);
  });
});
