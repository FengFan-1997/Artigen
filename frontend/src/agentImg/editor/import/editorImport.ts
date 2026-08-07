import { authFetch, type AuthFetch } from '@/login/authFetch';
import { buildApiUrl, getApiBaseUrl } from '@/utils/api';

const LEGACY_PREFILL_KEY = 'imageEditor:prefill_v1';
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const TRANSFER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET_PATH_RE = /^\/api\/assets\/[0-9a-f-]{36}$/i;

export type InitialEditorImport =
  | { kind: 'transfer'; value: string }
  | { kind: 'legacy'; value: string };

interface ImportDependencies {
  authenticatedFetch?: AuthFetch;
  publicFetch?: typeof fetch;
  apiUrl?: (path: string) => string;
  apiBase?: string;
  pageOrigin?: string;
}

export function takeInitialEditorImport(
  query: Record<string, unknown>,
  storage?: Pick<Storage, 'getItem' | 'removeItem'> | null
): InitialEditorImport | null {
  const transferId = queryText(query.transferId);
  const directImage = queryText(query.img) || queryText(query.image);
  const useStoredPrefill = queryText(query.prefill) === '1';
  if (!transferId && !directImage && !useStoredPrefill) return null;

  let storedValue = '';
  if (storage) {
    try {
      const raw = storage.getItem(LEGACY_PREFILL_KEY);
      storage.removeItem(LEGACY_PREFILL_KEY);
      if (raw) storedValue = String(JSON.parse(raw)?.value || '').trim();
    } catch {
      try {
        storage.removeItem(LEGACY_PREFILL_KEY);
      } catch {
        // Storage may be unavailable in private or restricted browser modes.
      }
    }
  }

  if (transferId) return { kind: 'transfer', value: transferId };
  if (directImage) return { kind: 'legacy', value: directImage };
  return storedValue ? { kind: 'legacy', value: storedValue } : null;
}

export async function loadInitialEditorImport(
  source: InitialEditorImport,
  dependencies: ImportDependencies = {}
): Promise<File> {
  if (source.kind === 'transfer') return loadTransferFile(source.value, dependencies);
  return loadLegacyFile(source.value, dependencies);
}

async function loadTransferFile(
  transferId: string,
  dependencies: ImportDependencies
): Promise<File> {
  if (!TRANSFER_ID_RE.test(transferId)) throw new Error('EDITOR_TRANSFER_INVALID');
  const authenticatedFetch = dependencies.authenticatedFetch ?? authFetch;
  const apiUrl = dependencies.apiUrl ?? buildApiUrl;
  const response = await authenticatedFetch(
    apiUrl(`/api/editor/transfers/${encodeURIComponent(transferId)}/consume`),
    { method: 'POST', headers: { Accept: 'application/json' } }
  );
  if (!response.ok) throw new Error(response.status === 404 ? 'EDITOR_TRANSFER_NOT_AVAILABLE' : 'EDITOR_TRANSFER_FAILED');
  const payload = await response.json().catch(() => null) as any;
  const assetUrl = String(payload?.transfer?.assetUrl || '').trim();
  if (!ASSET_PATH_RE.test(assetUrl)) throw new Error('EDITOR_TRANSFER_INVALID_RESPONSE');
  const assetResponse = await authenticatedFetch(apiUrl(assetUrl), {
    method: 'GET',
    headers: { Accept: 'image/png,image/jpeg,image/webp' },
    cache: 'no-store',
    referrerPolicy: 'no-referrer'
  });
  if (!assetResponse.ok) throw new Error('EDITOR_TRANSFER_ASSET_FAILED');
  const blob = await checkedImageBlob(assetResponse);
  return blobToImportFile(blob, 'transfer');
}

async function loadLegacyFile(raw: string, dependencies: ImportDependencies): Promise<File> {
  const dataFile = fileFromDataUrl(raw);
  if (dataFile) return dataFile;

  const pageOrigin = dependencies.pageOrigin ?? window.location.origin;
  const apiBase = dependencies.apiBase ?? getApiBaseUrl();
  const resource = resolveLegacyResource(raw, pageOrigin, apiBase);
  const request: RequestInit = {
    method: 'GET',
    headers: { Accept: 'image/png,image/jpeg,image/webp' },
    cache: 'no-store',
    credentials: resource.trustedAppResource ? 'include' : 'omit',
    referrerPolicy: 'no-referrer'
  };
  const response = resource.trustedAppResource
    ? await (dependencies.authenticatedFetch ?? authFetch)(resource.url, request)
    : await (dependencies.publicFetch ?? fetch)(resource.url, request);
  if (!response.ok) throw new Error('EDITOR_PREFILL_FETCH_FAILED');
  const blob = await checkedImageBlob(response);
  return blobToImportFile(blob, 'legacy');
}

export function resolveLegacyResource(
  raw: string,
  pageOrigin: string,
  apiBase: string
): { url: string; trustedAppResource: boolean } {
  const value = String(raw || '').trim();
  if (!value) throw new Error('EDITOR_PREFILL_EMPTY');
  let target: URL;
  if (value.startsWith('/files/')) {
    const normalizedBase = String(apiBase || '').trim().replace(/\/$/, '');
    const fileBase = normalizedBase.endsWith('/api') ? normalizedBase.slice(0, -4) : normalizedBase;
    target = new URL(fileBase ? `${fileBase}${value}` : value, pageOrigin);
  } else {
    target = new URL(value, pageOrigin);
  }
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('EDITOR_PREFILL_PROTOCOL_UNSUPPORTED');

  const page = new URL(pageOrigin);
  const configuredApiOrigin = (() => {
    try {
      return new URL(apiBase || pageOrigin, pageOrigin).origin;
    } catch {
      return page.origin;
    }
  })();
  const trustedOrigin = target.origin === page.origin || target.origin === configuredApiOrigin;
  return {
    url: target.toString(),
    trustedAppResource: trustedOrigin && /^\/files(?:\/|$)/.test(target.pathname)
  };
}

function fileFromDataUrl(raw: string): File | null {
  const match = String(raw || '').trim().match(
    /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i
  );
  if (!match) return null;
  const encoded = match[2].replace(/\s/g, '');
  if (Math.ceil(encoded.length * 0.75) > MAX_IMPORT_BYTES) throw new Error('EDITOR_IMPORT_TOO_LARGE');
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mimeType = match[1].toLowerCase();
    return new File([bytes], `legacy-import.${extensionForMime(mimeType)}`, { type: mimeType });
  } catch {
    throw new Error('EDITOR_PREFILL_DATA_INVALID');
  }
}

async function checkedImageBlob(response: Response): Promise<Blob> {
  const blob = await response.blob();
  if (!blob.size) throw new Error('EDITOR_IMPORT_EMPTY');
  if (blob.size > MAX_IMPORT_BYTES) throw new Error('EDITOR_IMPORT_TOO_LARGE');
  if (blob.type && !/^image\/(?:png|jpeg|webp)$/i.test(blob.type)) {
    throw new Error('EDITOR_IMPORT_TYPE_UNSUPPORTED');
  }
  return blob;
}

function blobToImportFile(blob: Blob, prefix: string): File {
  const mimeType = blob.type || 'application/octet-stream';
  return new File(
    [blob],
    `${prefix}-import-${Date.now().toString(36)}.${extensionForMime(mimeType)}`,
    { type: mimeType }
  );
}

function extensionForMime(mimeType: string): string {
  if (/jpeg/i.test(mimeType)) return 'jpg';
  if (/webp/i.test(mimeType)) return 'webp';
  return 'png';
}

function queryText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim();
}
