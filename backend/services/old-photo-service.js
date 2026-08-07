const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const { ApiError } = require('../lib/api-error');
const { fetchWithTimeout } = require('../lib/fetch-utils');
const defaultAssets = require('./asset-storage');
const fileInspection = require('./file-inspection-service');

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 32 * 1000 * 1000;
const OUTPUT_MIMES = new Set(['image/png', 'image/jpeg']);
const INPUT_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const taskError = (code, status = 502, retryable = false) => {
  return new ApiError(status, code, { retryable });
};

const abortError = () => {
  const error = new Error('TASK_CANCELLED');
  error.name = 'AbortError';
  error.code = 'TASK_CANCELLED';
  return error;
};

const isAbortError = (error, signal) => {
  return Boolean(
    signal?.aborted ||
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    error?.code === 'TASK_CANCELLED'
  );
};

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw abortError();
};

const buildOldPhotoPrompt = (operation, options = {}) => {
  const colorize = operation === 'enhance-colorize';
  const colorInstruction = colorize
    ? 'Add restrained, historically plausible color only where the source provides visual evidence; uncertain colors must remain neutral.'
    : 'Preserve the original monochrome or existing color treatment exactly; do not colorize.';
  const denoiseInstruction = options.denoise === false
    ? 'Preserve the original photographic grain; repair physical damage without general denoising or deblurring.'
    : 'Conservatively reduce noise and blur without smoothing faces, writing, edges, or authentic photographic grain.';
  return {
    prompt: [
      'Conservatively restore this exact old photograph.',
      'Repair only visible physical degradation such as dust, scratches, fading, noise, and small damaged areas.',
      denoiseInstruction,
      colorInstruction,
      'Do not add, remove, replace, merge, invent, beautify, or relocate any person, face, facial feature, expression, body part, object, clothing detail, symbol, background element, border, or scene detail.',
      'Do not change identity, age, pose, gaze, geometry, framing, crop, perspective, layout, or composition.',
      'Preserve every visible character, word, number, logo, stamp, sign, and handwritten mark exactly, including spelling, order, position, size, and line breaks.',
      'Never guess or reconstruct unreadable text; leave uncertain text unchanged.',
      'The result is a cautious visual restoration, not a factual reconstruction of missing history.'
    ].join(' '),
    negativePrompt: [
      'new face, changed identity, face swap, extra person, missing person, invented object,',
      'changed text, corrected spelling, new letters, fake logo, altered composition, crop, reframing,',
      'beautification, plastic skin, generative detail, hallucination'
    ].join(' '),
    colorize
  };
};

const extractProviderImageRefs = (response) => {
  const data = response?.data && typeof response.data === 'object' ? response.data : response;
  const list = Array.isArray(data?.images)
    ? data.images
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.output)
        ? data.output
        : [];
  return list
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return String(item.url || item.image || item.dataUrl || '').trim();
    })
    .filter(Boolean)
    .slice(0, 4);
};

const readBodyLimited = async (body, { maxBytes = MAX_IMAGE_BYTES, signal } = {}) => {
  throwIfAborted(signal);
  const readable = defaultAssets.toReadable(body);
  const chunks = [];
  let size = 0;
  const onAbort = () => {
    if (typeof readable.destroy === 'function') readable.destroy(abortError());
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for await (const chunk of readable) {
      throwIfAborted(signal);
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        if (typeof readable.destroy === 'function') readable.destroy();
        throw taskError('FILE_TOO_LARGE', 413);
      }
      chunks.push(buffer);
    }
    if (!size) throw taskError('EMPTY_IMAGE_RESULT');
    return Buffer.concat(chunks, size);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
};

const assetToProviderImage = async ({
  assetId,
  ownerUserId,
  signal,
  assetService = defaultAssets
}) => {
  const opened = await assetService.openAsset({ assetId, ownerUserId });
  const mimeType = String(opened.record?.mime_type || '').toLowerCase();
  if (!INPUT_MIMES.has(mimeType)) throw taskError('UNSUPPORTED_INPUT_TYPE', 415);
  const buffer = await readBodyLimited(opened.body, { maxBytes: MAX_IMAGE_BYTES, signal });
  throwIfAborted(signal);
  return {
    image: { mimeType, dataBase64: buffer.toString('base64') },
    mimeType,
    width: Number(opened.record?.width || 0),
    height: Number(opened.record?.height || 0)
  };
};

const isPrivateIp = (raw) => {
  const address = String(raw || '').trim().toLowerCase();
  if (!address) return true;
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224;
  }
  if (net.isIPv6(address)) {
    if (address.startsWith('::ffff:')) return isPrivateIp(address.slice(7));
    return address === '::1' || address === '::' ||
      address.startsWith('fc') || address.startsWith('fd') ||
      address.startsWith('fe8') || address.startsWith('fe9') ||
      address.startsWith('fea') || address.startsWith('feb') ||
      address.startsWith('2001:db8:');
  }
  return true;
};

const configuredOutputHosts = (env = process.env) => String(
  env.OLD_PHOTO_OUTPUT_HOSTS || env.AI_OUTPUT_ALLOWED_HOSTS || ''
)
  .split(',')
  .map((entry) => entry.trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
  .filter(Boolean);

const isAllowedOutputHost = (hostname, env = process.env) => {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.+$/g, '');
  const allowed = configuredOutputHosts(env);
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
};

const createPinnedLookup = (address, family) => (_hostname, options, callback) => {
  const resolvedFamily = Number(family) === 6 ? 6 : 4;
  const resolvedAddress = String(address);
  const resolvedOptions = typeof options === 'object' && options ? options : {};
  const done = typeof options === 'function' ? options : callback;
  if (resolvedOptions.all) {
    done(null, [{ address: resolvedAddress, family: resolvedFamily }]);
    return;
  }
  done(null, resolvedAddress, resolvedFamily);
};

const createPinnedAgent = (url) => {
  const address = String(url?.resolvedAddress || '').trim();
  const family = Number(url?.resolvedFamily || 0);
  if (!address || ![4, 6].includes(family)) throw taskError('INVALID_PROVIDER_OUTPUT');
  const options = { lookup: createPinnedLookup(address, family) };
  return url.protocol === 'https:' ? new https.Agent(options) : new http.Agent(options);
};

const assertPublicOutputUrl = async (
  rawUrl,
  env = process.env,
  resolver = dns.promises.lookup
) => {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    throw taskError('INVALID_PROVIDER_OUTPUT');
  }
  const allowHttp = String(env.NODE_ENV || '').toLowerCase() !== 'production' &&
    String(env.OLD_PHOTO_ALLOW_HTTP_OUTPUT || '') === '1';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw taskError('INVALID_PROVIDER_OUTPUT');
  }
  if (url.username || url.password) throw taskError('INVALID_PROVIDER_OUTPUT');
  const hostname = url.hostname.replace(/\.+$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw taskError('INVALID_PROVIDER_OUTPUT');
  }
  if (
    String(env.NODE_ENV || '').toLowerCase() === 'production' &&
    !isAllowedOutputHost(hostname, env)
  ) {
    throw taskError('PROVIDER_OUTPUT_HOST_NOT_ALLOWED');
  }
  const addresses = await resolver(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw taskError('INVALID_PROVIDER_OUTPUT');
  }
  Object.defineProperties(url, {
    resolvedAddress: { value: addresses[0].address },
    resolvedFamily: { value: Number(addresses[0].family) || net.isIP(addresses[0].address) }
  });
  return url;
};

const parseDataImage = (reference) => {
  const match = String(reference || '').match(/^data:(image\/(?:png|jpeg));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const compact = match[2].replace(/\s+/g, '');
  if (!compact || compact.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 8) {
    throw taskError('FILE_TOO_LARGE', 413);
  }
  const buffer = Buffer.from(compact, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw taskError('INVALID_PROVIDER_OUTPUT');
  return { buffer, mimeType: match[1].toLowerCase() };
};

const validateProviderOutputMime = async (buffer, declaredMime) => {
  const declared = String(declaredMime || '').trim().toLowerCase();
  if (![...OUTPUT_MIMES, 'application/octet-stream'].includes(declared)) {
    throw taskError('INVALID_PROVIDER_OUTPUT_TYPE');
  }
  try {
    const inspected = await fileInspection.inspectBuffer({
      buffer,
      declaredMime: declared,
      allowedMimeTypes: [...OUTPUT_MIMES],
      maxBytes: MAX_IMAGE_BYTES,
      maxPixels: MAX_IMAGE_PIXELS
    });
    return inspected.mimeType;
  } catch {
    throw taskError('INVALID_PROVIDER_OUTPUT_TYPE');
  }
};

const downloadProviderImage = async ({
  reference,
  signal,
  env = process.env,
  fetcher = fetchWithTimeout
}) => {
  const inline = parseDataImage(reference);
  if (inline) return inline;
  let url = await assertPublicOutputUrl(reference, env);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    throwIfAborted(signal);
    const response = await fetcher(
      url.toString(),
      {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'image/png,image/jpeg' },
        agent: createPinnedAgent(url),
        disableProxy: true
      },
      60_000,
      signal
    );
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = String(response.headers?.get('location') || '').trim();
      if (!location || redirects === 3) throw taskError('INVALID_PROVIDER_REDIRECT');
      url = await assertPublicOutputUrl(new URL(location, url).toString(), env);
      continue;
    }
    if (!response.ok) throw taskError('PROVIDER_OUTPUT_DOWNLOAD_FAILED', 502, true);
    const declaredMime = String(response.headers?.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const contentLength = Number(response.headers?.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw taskError('FILE_TOO_LARGE', 413);
    }
    const buffer = await readBodyLimited(response.body, { maxBytes: MAX_IMAGE_BYTES, signal });
    return { buffer, mimeType: await validateProviderOutputMime(buffer, declaredMime) };
  }
  throw taskError('INVALID_PROVIDER_REDIRECT');
};

const persistOldPhotoOutput = async ({
  reference,
  ownerUserId,
  taskId,
  expiresAt,
  signal,
  assetService = defaultAssets,
  download = downloadProviderImage
}) => {
  const downloaded = await download({ reference, signal });
  throwIfAborted(signal);
  const asset = await assetService.storeAsset({
    ownerUserId,
    buffer: downloaded.buffer,
    declaredMime: downloaded.mimeType,
    maxBytes: MAX_IMAGE_BYTES,
    maxPixels: MAX_IMAGE_PIXELS,
    expiresAt,
    retentionClass: 'generated-output',
    metadata: { source: 'old-photo-result', taskId }
  });
  throwIfAborted(signal);
  return { ...asset, persisted: true, verified: true };
};

const assertPreservedGeometry = (source, output) => {
  const sourceRatio = Number(source?.width || 0) / Number(source?.height || 0);
  const outputRatio = Number(output?.width || 0) / Number(output?.height || 0);
  if (!Number.isFinite(sourceRatio) || !Number.isFinite(outputRatio) || sourceRatio <= 0 || outputRatio <= 0) {
    throw taskError('OUTPUT_GEOMETRY_UNVERIFIED');
  }
  const relativeDifference = Math.abs(sourceRatio - outputRatio) / sourceRatio;
  if (relativeDifference > 0.02) throw taskError('OUTPUT_COMPOSITION_CHANGED');
  return true;
};

const normalizeFailureCode = (error, signal) => {
  if (signal?.reason?.code === 'TASK_LEASE_LOST') return 'TASK_LEASE_LOST';
  if (isAbortError(error, signal)) return 'TASK_CANCELLED';
  const code = String(error?.code || error?.message || 'OLD_PHOTO_FAILED').trim();
  return /^[A-Z0-9_:-]{2,100}$/.test(code) ? code : 'OLD_PHOTO_FAILED';
};

const createOldPhotoExecutor = ({
  provider,
  loadSource = assetToProviderImage,
  persistOutput = persistOldPhotoOutput,
  markRunning,
  markProviderDispatched,
  settleTask,
  releaseTask
}) => {
  return async ({
    taskId,
    ownerUserId,
    sourceAssetId,
    operation,
    options = {},
    expiresAt,
    leaseOwner,
    signal
  }) => {
    try {
      throwIfAborted(signal);
      if (typeof markRunning !== 'function') throw taskError('TASK_RUNNER_NOT_CONFIGURED', 503, true);
      await markRunning({ taskId, ...(leaseOwner ? { leaseOwner } : {}) });
      throwIfAborted(signal);

      const source = await loadSource({ assetId: sourceAssetId, ownerUserId, signal });
      throwIfAborted(signal);
      if (typeof provider !== 'function') throw taskError('IMG_PROVIDER_NOT_CONFIGURED', 503, true);
      const policy = buildOldPhotoPrompt(operation, options);
      if (typeof markProviderDispatched === 'function') {
        await markProviderDispatched({ taskId, ...(leaseOwner ? { leaseOwner } : {}) });
      }
      throwIfAborted(signal);
      const response = await provider({
        prompt: policy.prompt,
        negativePrompt: policy.negativePrompt,
        images: [source.image],
        params: {
          ...(Number.isInteger(options.seed) ? { seed: options.seed } : {})
        },
        signal
      });
      throwIfAborted(signal);

      const references = extractProviderImageRefs(response);
      if (!references.length) throw taskError('EMPTY_IMAGE_RESULT');
      const outputs = [];
      for (const reference of references) {
        const output = await persistOutput({
          reference,
          ownerUserId,
          taskId,
          expiresAt,
          signal
        });
        if (!output?.assetId || output.persisted !== true || output.verified !== true) {
          throw taskError('OUTPUT_PERSIST_FAILED', 502, true);
        }
        assertPreservedGeometry(source, output);
        outputs.push(output);
      }
      throwIfAborted(signal);
      if (typeof settleTask !== 'function') throw taskError('TASK_RUNNER_NOT_CONFIGURED', 503, true);
      const task = await settleTask({
        taskId,
        ...(leaseOwner ? { leaseOwner } : {}),
        outputAssetIds: outputs.map((output) => output.assetId),
        result: {
          assets: outputs.map((output) => ({
            assetId: output.assetId,
            mimeType: output.mimeType,
            byteSize: output.byteSize,
            width: output.width,
            height: output.height
          })),
          warnings: [{
            code: 'AI_RESTORATION_NOT_FACTUAL_RECONSTRUCTION',
            messageKey: 'warnings.ai_restoration_not_factual_reconstruction'
          }],
          restoration: { colorized: policy.colorize, sourceAssetId }
        }
      });
      return { ok: true, task, outputs };
    } catch (error) {
      const code = normalizeFailureCode(error, signal);
      const cancelled = code === 'TASK_CANCELLED';
      let released = null;
      let releaseError = null;
      if (code === 'TASK_LEASE_LOST') {
        return { ok: false, cancelled: false, error: code, released: null };
      }
      try {
        if (typeof releaseTask !== 'function') throw taskError('TASK_RUNNER_NOT_CONFIGURED', 503, true);
        released = await releaseTask({
          taskId,
          terminalStatus: cancelled ? 'cancelled' : 'failed',
          errorCode: code,
          ...(leaseOwner ? { leaseOwner } : {})
        });
      } catch (refundFailure) {
        releaseError = String(refundFailure?.code || refundFailure?.message || 'RELEASE_FAILED');
      }
      return {
        ok: false,
        cancelled,
        error: code,
        released,
        ...(releaseError ? { releaseError } : {})
      };
    }
  };
};

const createTaskRunnerRegistry = (executeTask) => {
  const active = new Map();
  const start = (input, externalSignal) => {
    const taskId = String(input?.taskId || '').trim();
    if (!taskId) throw taskError('INVALID_TASK_ID', 400);
    const existing = active.get(taskId);
    if (existing) return existing.promise;
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(abortError());
    if (externalSignal?.aborted) onExternalAbort();
    else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    const promise = Promise.resolve()
      .then(() => executeTask({ ...input, signal: controller.signal }))
      .finally(() => {
        externalSignal?.removeEventListener('abort', onExternalAbort);
        if (active.get(taskId)?.controller === controller) active.delete(taskId);
      });
    active.set(taskId, { controller, promise });
    return promise;
  };
  const cancel = (taskId) => {
    const running = active.get(String(taskId || '').trim());
    if (!running) return false;
    running.controller.abort(abortError());
    return true;
  };
  return {
    activeCount: () => active.size,
    cancel,
    has: (taskId) => active.has(String(taskId || '').trim()),
    start
  };
};

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  abortError,
  assertPreservedGeometry,
  assertPublicOutputUrl,
  assetToProviderImage,
  buildOldPhotoPrompt,
  createOldPhotoExecutor,
  createPinnedAgent,
  createPinnedLookup,
  createTaskRunnerRegistry,
  downloadProviderImage,
  extractProviderImageRefs,
  isAbortError,
  isAllowedOutputHost,
  isPrivateIp,
  normalizeFailureCode,
  parseDataImage,
  persistOldPhotoOutput,
  readBodyLimited,
  throwIfAborted,
  validateProviderOutputMime
};
