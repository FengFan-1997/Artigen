import { describe, expect, test, vi } from 'vitest';
import {
  loadInitialEditorImport,
  resolveLegacyResource,
  takeInitialEditorImport
} from './editorImport';

describe('Editor V2 compatibility imports', () => {
  test('takes transferId first and removes stale legacy localStorage immediately', () => {
    const removeItem = vi.fn();
    const source = takeInitialEditorImport({
      transferId: '11111111-1111-4111-8111-111111111111',
      img: 'https://cdn.example/old.png'
    }, {
      getItem: () => JSON.stringify({ value: 'data:image/png;base64,AA==' }),
      removeItem
    });

    expect(source).toEqual({
      kind: 'transfer',
      value: '11111111-1111-4111-8111-111111111111'
    });
    expect(removeItem).toHaveBeenCalledWith('imageEditor:prefill_v1');
  });

  test('consumes a transfer through authenticated API requests and accepts only scoped asset paths', async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    const authenticatedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input: String(input), init });
      if (requests.length === 1) {
        return new Response(JSON.stringify({
          transfer: { assetUrl: '/api/assets/22222222-2222-4222-8222-222222222222' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 });
    });

    const file = await loadInitialEditorImport({
      kind: 'transfer',
      value: '11111111-1111-4111-8111-111111111111'
    }, {
      authenticatedFetch,
      apiUrl: (path) => `https://api.example.test${path}`
    });

    expect(requests.map((request) => request.input)).toEqual([
      'https://api.example.test/api/editor/transfers/11111111-1111-4111-8111-111111111111/consume',
      'https://api.example.test/api/assets/22222222-2222-4222-8222-222222222222'
    ]);
    expect(requests[0].init?.method).toBe('POST');
    expect(file.type).toBe('image/png');
  });

  test('never sends app credentials, auth headers, or referrer data to an external legacy URL', async () => {
    const publicFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 })
    );
    const authenticatedFetch = vi.fn();
    const externalUrl = 'https://images.example.test/photo.png?signature=external-value';

    await loadInitialEditorImport({ kind: 'legacy', value: externalUrl }, {
      pageOrigin: 'https://artigen.example.test',
      apiBase: '/api',
      publicFetch,
      authenticatedFetch
    });

    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(publicFetch).toHaveBeenCalledTimes(1);
    const [url, init] = publicFetch.mock.calls[0];
    expect(url).toBe(externalUrl);
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  test('treats only configured app /files paths as credentialed resources', () => {
    expect(resolveLegacyResource(
      '/files/generated/example.png',
      'https://artigen.example.test',
      'https://api.example.test/api'
    )).toEqual({
      url: 'https://api.example.test/files/generated/example.png',
      trustedAppResource: true
    });
    expect(resolveLegacyResource(
      'https://external.example.test/files/example.png',
      'https://artigen.example.test',
      'https://api.example.test/api'
    ).trustedAppResource).toBe(false);
  });

  test('rejects a transfer response that attempts to redirect authenticated fetches externally', async () => {
    const authenticatedFetch = vi.fn(async () => new Response(JSON.stringify({
      transfer: { assetUrl: 'https://evil.example.test/collect' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(loadInitialEditorImport({
      kind: 'transfer',
      value: '11111111-1111-4111-8111-111111111111'
    }, { authenticatedFetch, apiUrl: (path) => path })).rejects.toThrow('EDITOR_TRANSFER_INVALID_RESPONSE');
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });
});
