import { zip } from 'fflate';

export type ZipInput = { name: string; blob: Blob };
export type CreateZipOptions = {
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  signal?: AbortSignal;
};

const safeZipName = (raw: string) => {
  const leaf = String(raw || 'output')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop() || 'output';
  return leaf.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+$/, 'output').slice(0, 180);
};

const uniqueName = (raw: string, used: Set<string>) => {
  const safe = safeZipName(raw);
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : '';
  let candidate = safe;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem} (${index})${extension}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

const abortIfNeeded = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('ABORTED');
};

export const createZipBlob = async (inputs: ZipInput[], options: CreateZipOptions = {}) => {
  if (!inputs.length) throw new Error('ZIP_EMPTY');
  abortIfNeeded(options.signal);
  const used = new Set<string>();
  const entries: Record<string, Uint8Array> = {};
  for (const input of inputs) {
    abortIfNeeded(options.signal);
    const name = uniqueName(input.name, used);
    entries[name] = new Uint8Array(await input.blob.arrayBuffer());
  }
  abortIfNeeded(options.signal);

  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let terminate: (() => void) | null = null;
    const cleanup = () => options.signal?.removeEventListener('abort', onAbort);
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      try {
        terminate?.();
      } catch {}
      finishReject(new Error('ABORTED'));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    try {
      terminate = zip(entries, { level: options.level ?? 6 }, (error, bytes) => {
        if (settled) return;
        if (error) {
          finishReject(error);
          return;
        }
        if (
          !bytes ||
          bytes.byteLength < 22 ||
          bytes[0] !== 0x50 ||
          bytes[1] !== 0x4b
        ) {
          finishReject(new Error('ZIP_EXPORT_FAILED'));
          return;
        }
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        settled = true;
        cleanup();
        resolve(new Blob([copy.buffer], { type: 'application/zip' }));
      });
    } catch (error) {
      finishReject(error);
    }
  });
};
