import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authFetch } from '@/login/authFetch';
import {
  clearConvertCapabilitiesCacheForTests,
  convertWithBackend,
  preflightWordToPdf
} from './convert';

vi.mock('@/login/authFetch', () => ({ authFetch: vi.fn() }));

const authFetchMock = vi.mocked(authFetch);

const installTestFileReader = () => {
  class TestFileReader {
    result: string | ArrayBuffer | null = null;
    onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

    abort() {}

    readAsDataURL(blob: Blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          const binary = Array.from(new Uint8Array(buffer), (byte) =>
            String.fromCharCode(byte)
          ).join('');
          this.result = `data:${blob.type};base64,${btoa(binary)}`;
          this.onload?.({} as ProgressEvent<FileReader>);
        })
        .catch(() => this.onerror?.({} as ProgressEvent<FileReader>));
    }
  }
  vi.stubGlobal('FileReader', TestFileReader);
};

beforeEach(() => {
  authFetchMock.mockReset();
  clearConvertCapabilitiesCacheForTests();
});

describe('Word to PDF conversion contract', () => {
  it('requires the caller to pass the explicit UI upload consent state', async () => {
    const file = new File(['docx'], 'document.docx');
    await expect(
      convertWithBackend('word2pdf', file, { uploadConsent: false })
    ).rejects.toThrowError('WORD_UPLOAD_CONSENT_REQUIRED');
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it('preflights LibreOffice capability and reports the server file limit', async () => {
    authFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          capabilities: { officeToPdf: true, maxFileBytes: 24 * 1024 * 1024 }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    await expect(preflightWordToPdf()).resolves.toEqual({
      available: true,
      maxFileBytes: 24 * 1024 * 1024
    });
  });

  it('fails closed without uploading when LibreOffice is unavailable', async () => {
    authFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, capabilities: { officeToPdf: false, maxFileBytes: 1000 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const file = new File(['docx'], 'document.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    await expect(convertWithBackend('word2pdf', file, { uploadConsent: true })).rejects.toThrowError(
      'CONVERTER_UNAVAILABLE'
    );
    expect(authFetchMock).toHaveBeenCalledTimes(1);
    expect(authFetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('propagates cancellation to the in-flight server conversion request', async () => {
    installTestFileReader();
    const controller = new AbortController();
    authFetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            capabilities: { officeToPdf: true, maxFileBytes: 1000 }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockImplementationOnce((_input, init) => {
        expect(init?.signal).toBe(controller.signal);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        });
      });
    const file = new File(['docx'], 'document.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    const pending = convertWithBackend('word2pdf', file, {
      signal: controller.signal,
      uploadConsent: true
    });
    await vi.waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sends explicit upload consent and validates the returned PDF magic bytes', async () => {
    installTestFileReader();
    authFetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, capabilities: { officeToPdf: true, maxFileBytes: 1000 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            filename: 'document.pdf',
            mimeType: 'application/pdf',
            dataBase64: 'JVBERi0xLjQK'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    const file = new File(['docx'], 'document.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    const result = await convertWithBackend('word2pdf', file, { uploadConsent: true });
    expect(result.filename).toBe('document.pdf');
    const request = authFetchMock.mock.calls[1]?.[1];
    const body = JSON.parse(String(request?.body || '{}'));
    expect(body.uploadConsent).toBe(true);
  });
});
