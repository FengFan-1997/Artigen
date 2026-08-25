const crypto = require('crypto');
const { posix: posixPath } = require('path');
const { ApiError } = require('../lib/api-error');
const assets = require('./asset-storage');

const AGENT_WORKSPACE_ROOT = '/tmp/artigen-workspace';

const MIME_KINDS = Object.freeze({
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'text/markdown': 'text',
  'text/plain': 'text'
});
const MIME_EXTENSIONS = Object.freeze({
  'application/pdf': ['.pdf'],
  'application/zip': ['.zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'text/markdown': ['.md', '.markdown'],
  'text/plain': ['.txt', '.md', '.csv']
});

const quoteShell = (value) => `'${String(value || '').replace(/'/g, `'\\''`)}'`;

const canonicalSourceUrl = (value) => {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:') return '';
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return '';
  }
};

const assertSourcesObserved = (sources, observedUrls) => {
  const normalizedObserved = new Set(
    (Array.isArray(observedUrls) ? observedUrls : [])
      .map(canonicalSourceUrl)
      .filter(Boolean)
  );
  const missing = (Array.isArray(sources) ? sources : [])
    .map((source) => canonicalSourceUrl(source?.url))
    .filter((url) => url && !normalizedObserved.has(url));
  if (missing.length) {
    throw new ApiError(422, 'AGENT_ARTIFACT_SOURCE_NOT_OBSERVED', {
      sourceCount: missing.length
    });
  }
  return true;
};

const inferRequiredDeliverables = (objective) => {
  const text = String(objective || '').toLowerCase();
  const websiteIntentText = text
    .replace(
      /\b(?:do not|don't|dont|must not|without)\s+(?:build|create|make|design|develop|deliver|package)\b[^.!?\n]{0,100}\b(?:website|web ?page|static site|landing page)\b[^.!?\n]*/gi,
      ' '
    )
    .replace(
      /(?:不要|不需要|无需|不必|禁止)[^。！？\n]{0,12}(?:创建|制作|开发|构建|搭建|生成|设计|交付|打包)[^。！？\n]{0,100}(?:静态网站|网页|网站|落地页)[^。！？\n]*/gi,
      ' '
    );
  const imageIntentText = text
    .replace(
      /\b(?:do not|don't|dont|must not|without)\s+(?:create|generate|make|design|deliver)\b[^.!?\n]{0,80}\b(?:image|visual|poster|mockup|concept art)\b[^.!?\n]*/gi,
      ' '
    )
    .replace(
      /(?:不要|不需要|无需|不必|禁止)[^。！？\n]{0,12}(?:创建|制作|生成|设计|交付|出)[^。！？\n]{0,80}(?:图片|设计稿|视觉稿|主视觉|海报|概念图)[^。！？\n]*/gi,
      ' '
    );
  const required = [];
  const presentationRequested =
    /(?:\bpptx\b|\bpowerpoint\b|\bslide deck\b|\bpresentation\b|演示文稿|幻灯片|路演稿)/i
      .test(text);
  if (
    /(?:\breport\b|research report|调研报告|研究报告|分析报告)/i.test(text) ||
    (/\bpdf\b|\.pdf\b/i.test(text) && !presentationRequested)
  ) {
    required.push('report');
  }
  if (/(?:\bxlsx\b|\bexcel\b|\bspreadsheet\b|电子表格|数据表格|数据分析表)/i.test(text)) {
    required.push('spreadsheet');
  }
  if (presentationRequested) {
    required.push('presentation');
  }
  const websiteRequested = (
    /\b(?:build|create|make|design|develop|deliver|package)\b.{0,40}\b(?:website|web ?page|static site|landing page)\b/i.test(websiteIntentText) ||
    /(?:创建|制作|开发|构建|搭建|生成|设计|交付|打包).{0,80}(?:静态网站|网页|网站|落地页)/i.test(websiteIntentText) ||
    /(?:静态网站|网页|网站|落地页).{0,20}(?:源码|源文件|zip|压缩包|可部署|可构建)/i.test(websiteIntentText)
  );
  if (websiteRequested) {
    required.push('website');
  }
  if (
    /\b(?:create|generate|make|design|deliver)\b.{0,40}\b(?:image|visual|poster|mockup|concept art)\b/i.test(imageIntentText) ||
    /(?:生成图片|生成图像|生成设计稿|设计稿|视觉稿|主视觉|海报|概念图|出图)/i.test(imageIntentText)
  ) {
    required.push('image');
  }
  return required;
};

const requiredDeliverablesSatisfied = (artifacts, requiredDeliverables) => {
  const rows = (Array.isArray(artifacts) ? artifacts : [])
    .filter((artifact) => artifact?.verification_status === 'passed');
  const required = Array.isArray(requiredDeliverables) ? requiredDeliverables : [];
  const has = (predicate) => rows.some(predicate);
  return required.every((type) => {
    if (type === 'report') {
      return has((artifact) => (
        artifact.role === 'pdf' && artifact.mime_type === 'application/pdf'
      )) && has((artifact) => (
        ['source', 'editable'].includes(artifact.role) &&
        [
          'text/markdown',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ].includes(artifact.mime_type)
      ));
    }
    if (type === 'spreadsheet') {
      return has((artifact) => (
        artifact.mime_type ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ));
    }
    if (type === 'presentation') {
      return has((artifact) => (
        artifact.mime_type ===
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      )) && has((artifact) => (
        artifact.role === 'preview' || artifact.mime_type === 'application/pdf'
      ));
    }
    if (type === 'website') {
      return has((artifact) => (
        ['website', 'package'].includes(artifact.role) &&
        artifact.mime_type === 'application/zip'
      ));
    }
    if (type === 'image') {
      return has((artifact) => (
        artifact.role === 'image' &&
        artifact.verification_status === 'passed' &&
        ['image/png', 'image/jpeg', 'image/webp'].includes(artifact.mime_type)
      ));
    }
    return false;
  });
};

const verificationCommand = ({ path, mimeType, role }) => {
  const target = quoteShell(path);
  const kind = MIME_KINDS[mimeType];
  const scan = `clamscan --no-summary ${target} >/dev/null`;
  if (kind === 'pdf') {
    return [
      'set -eu',
      scan,
      `pdfinfo ${target} >/dev/null`,
      `test "$(pdfinfo ${target} | awk '/^Pages:/ {print $2}')" -ge 1`
    ].join('\n');
  }
  if (kind === 'xlsx' || kind === 'pptx' || kind === 'docx') {
    const marker = kind === 'xlsx'
      ? 'xl/workbook.xml'
      : kind === 'pptx'
        ? 'ppt/presentation.xml'
        : 'word/document.xml';
    return [
      'set -eu',
      'mkdir -p /tmp/artigen-verify',
      scan,
      `unzip -t ${target} >/dev/null`,
      `unzip -Z1 ${target} | grep -Fx ${quoteShell(marker)} >/dev/null`,
      ...(kind === 'xlsx'
        ? [
            `unzip -p ${target} 'xl/worksheets/*.xml' | grep -q '<f[ >]'`,
            `unzip -Z1 ${target} | grep -E '^xl/charts/chart[0-9]+\\.xml$' >/dev/null`
          ]
        : []),
      ...(kind === 'pptx'
        ? [`unzip -Z1 ${target} | grep -E '^ppt/slides/slide[0-9]+\\.xml$' >/dev/null`]
        : []),
      `libreoffice --headless --convert-to pdf --outdir /tmp/artigen-verify ${target} >/tmp/artigen-verify/lo.log 2>&1`,
      `test -s /tmp/artigen-verify/${quoteShell(String(path).split('/').pop().replace(/\.[^.]+$/, '.pdf'))}`
    ].join('\n');
  }
  if (kind === 'zip') {
    if (role === 'website' || role === 'package') {
      return [
        'set -eu',
        scan,
        `python3 - ${target} <<'PY'`,
        'import pathlib, sys, zipfile',
        'p = pathlib.Path(sys.argv[1])',
        'with zipfile.ZipFile(p) as z:',
        '    entries = z.infolist()',
        '    assert 0 < len(entries) <= 2000',
        '    assert sum(i.file_size for i in entries) <= 200 * 1024 * 1024',
        '    for i in entries:',
        '        name = pathlib.PurePosixPath(i.filename)',
        "        assert not name.is_absolute() and '..' not in name.parts",
        '        assert not (i.flag_bits & 0x1)',
        'PY',
        'rm -rf /tmp/artigen-verify/site',
        'mkdir -p /tmp/artigen-verify/site',
        `unzip -t ${target} >/dev/null`,
        `unzip -q ${target} -d /tmp/artigen-verify/site`,
        `site_index="$(find /tmp/artigen-verify/site -type f -name index.html -print -quit)"`,
        'test -n "$site_index"',
        'python3 - "$site_index" <<\'PY\'',
        'import html.parser, pathlib, re, sys, urllib.parse',
        'class Guard(html.parser.HTMLParser):',
        '    active = {',
        '        "script": {"src"}, "img": {"src", "srcset"}, "iframe": {"src"},',
        '        "source": {"src", "srcset"}, "video": {"src", "poster"},',
        '        "audio": {"src"}, "object": {"data"}',
        '    }',
        '    def handle_starttag(self, tag, attrs):',
        '        values = dict(attrs)',
        '        keys = self.active.get(tag, set())',
        '        if tag == "link" and "stylesheet" in values.get("rel", "").lower():',
        '            keys = {"href"}',
        '        for key in keys:',
        '            value = values.get(key, "")',
        '            if any(urllib.parse.urlsplit(part.strip()).scheme in {"http", "https"}',
        '                   or part.strip().startswith("//") for part in value.split(",")):',
        '                raise ValueError(f"external active resource: {tag}.{key}")',
        'text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")',
        'if re.search(r"(?:url\\(|@import\\s+)[^;)]*(?:https?:)?//", text, re.I):',
        '    raise ValueError("external CSS resource")',
        'guard = Guard()',
        'guard.feed(text)',
        'PY',
        'browser="$(command -v chromium || command -v chromium-browser)"',
        'bwrap --unshare-net --die-with-parent --new-session --ro-bind / / --bind /tmp/artigen-verify /tmp/artigen-verify "$browser" --headless --disable-gpu --disable-dev-shm-usage --user-data-dir=/tmp/artigen-verify/chromium-desktop --window-size=1440,900 --screenshot=/tmp/artigen-verify/site-desktop.png "file://$site_index" >/tmp/artigen-verify/chromium-desktop.log 2>&1',
        'bwrap --unshare-net --die-with-parent --new-session --ro-bind / / --bind /tmp/artigen-verify /tmp/artigen-verify "$browser" --headless --disable-gpu --disable-dev-shm-usage --user-data-dir=/tmp/artigen-verify/chromium-mobile --window-size=390,844 --screenshot=/tmp/artigen-verify/site-mobile.png "file://$site_index" >/tmp/artigen-verify/chromium-mobile.log 2>&1',
        'test -s /tmp/artigen-verify/site-desktop.png',
        'test -s /tmp/artigen-verify/site-mobile.png'
      ].join('\n');
    }
    return ['set -eu', scan, `unzip -t ${target} >/dev/null`].join('\n');
  }
  if (kind === 'image') {
    return [
      'set -eu',
      scan,
      `test -s ${target}`,
      `dimensions="$(identify -format '%w %h' ${target}[0])"`,
      'set -- $dimensions',
      'test "$1" -gt 0 -a "$2" -gt 0',
      'test "$(( $1 * $2 ))" -le 64000000',
      `convert ${target}[0] -auto-orient -strip null: >/dev/null`
    ].join('\n');
  }
  if (kind === 'text') return ['set -eu', scan, `test -s ${target}`].join('\n');
  throw new ApiError(415, 'AGENT_ARTIFACT_MIME_UNSUPPORTED', { mimeType });
};

const assertArtifactDeclaration = (input = {}) => {
  const filename = String(input.filename || '').trim();
  const mimeType = String(input.mimeType || '').trim().toLowerCase();
  const role = String(input.role || '').trim();
  if (!filename || filename.length > 240 || /[\\/]/.test(filename)) {
    throw new ApiError(400, 'AGENT_ARTIFACT_FILENAME_INVALID');
  }
  const declaredPath = String(input.path || '').trim();
  const resolvedPath = declaredPath
    ? posixPath.resolve(AGENT_WORKSPACE_ROOT, declaredPath)
    : posixPath.join(AGENT_WORKSPACE_ROOT, filename);
  // Qwen may provide the already-confined workspace directory in `path` and
  // the actual leaf name in `filename`. Treat only the exact workspace root as
  // that directory form; every other declared path must still name the file.
  const path = resolvedPath === AGENT_WORKSPACE_ROOT
    ? posixPath.join(AGENT_WORKSPACE_ROOT, filename)
    : resolvedPath;
  if (
    !path.startsWith(`${AGENT_WORKSPACE_ROOT}/`) ||
    !/^\/tmp\/artigen-workspace\/[A-Za-z0-9._@+ -]+(?:\/[A-Za-z0-9._@+ -]+)*$/.test(path)
  ) {
    throw new ApiError(403, 'AGENT_ARTIFACT_PATH_FORBIDDEN');
  }
  if (!MIME_KINDS[mimeType]) {
    throw new ApiError(415, 'AGENT_ARTIFACT_MIME_UNSUPPORTED', { mimeType });
  }
  if (!MIME_EXTENSIONS[mimeType].some((extension) => filename.toLowerCase().endsWith(extension))) {
    throw new ApiError(400, 'AGENT_ARTIFACT_EXTENSION_MISMATCH');
  }
  if (!['source', 'editable', 'preview', 'pdf', 'package', 'website', 'image', 'data'].includes(role)) {
    throw new ApiError(400, 'AGENT_ARTIFACT_ROLE_INVALID');
  }
  if (role === 'image' && MIME_KINDS[mimeType] !== 'image') {
    throw new ApiError(400, 'AGENT_ARTIFACT_ROLE_MIME_MISMATCH');
  }
  const sources = Array.isArray(input.sources)
    ? input.sources.slice(0, 100).map((source) => ({
        title: String(source?.title || '').trim().slice(0, 300),
        url: String(source?.url || '').trim().slice(0, 2000)
      })).filter((source) => {
        try {
          return Boolean(source.title) && new URL(source.url).protocol === 'https:';
        } catch {
          return false;
        }
      })
    : [];
  if (role === 'pdf' && !sources.length) {
    throw new ApiError(422, 'AGENT_REPORT_SOURCES_REQUIRED');
  }
  return { path, filename, mimeType, role, sources };
};

const createAgentArtifactService = ({
  pool,
  sandbox,
  runService,
  assetStorage = assets,
  maxBytes = 100 * 1024 * 1024
} = {}) => {
  if (!pool || !sandbox || !runService) throw new TypeError('AGENT_ARTIFACT_DEPENDENCY_REQUIRED');

  const ingest = async ({ run, sandboxName, declaration, workerLease = null }) => {
    const normalized = assertArtifactDeclaration(declaration);
    if (workerLease) await runService.assertWorkerLeaseActive(workerLease);
    if (normalized.sources.length) {
      const observedUrls = await runService.listObservedSources({ runId: run.id });
      assertSourcesObserved(normalized.sources, observedUrls);
    }
    const verification = await sandbox.systemShell(
      sandboxName,
      verificationCommand(normalized),
      120
    );
    if (!verification.success) {
      throw new ApiError(422, 'AGENT_ARTIFACT_VERIFICATION_FAILED', {
        filename: normalized.filename,
        verifier: String(verification.stderr || verification.stdout || '').slice(0, 300)
      });
    }
    const read = await sandbox.readFile(sandboxName, normalized.path);
    const buffer = Buffer.from(String(read.base64 || ''), 'base64');
    if (!buffer.length || buffer.length > maxBytes) {
      throw new ApiError(
        buffer.length ? 413 : 422,
        buffer.length ? 'AGENT_ARTIFACT_TOO_LARGE' : 'AGENT_ARTIFACT_EMPTY'
      );
    }
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    if (workerLease) await runService.assertWorkerLeaseActive(workerLease);
    const stored = await assetStorage.storeAsset({
      pool,
      ownerUserId: run.user_id,
      buffer,
      declaredMime: normalized.mimeType,
      allowedMimeTypes: [normalized.mimeType],
      maxBytes,
      maxPixels: 64 * 1000 * 1000,
      retentionClass: 'generated-output',
      expiresAt: run.expires_at,
      metadata: {
        source: 'agent-run',
        runId: run.id,
        artifactRole: normalized.role
      }
    });
    const existing = await runService.findArtifactByContent?.({
      runId: run.id,
      filename: normalized.filename,
      mimeType: normalized.mimeType,
      sha256,
      assetId: stored.assetId
    });
    if (existing) return existing;
    if (workerLease) await runService.assertWorkerLeaseActive(workerLease);
    return runService.registerArtifact({
      runId: run.id,
      ...(workerLease || {}),
      assetId: stored.assetId,
      role: normalized.role,
      filename: normalized.filename,
      mimeType: normalized.mimeType,
      byteSize: buffer.length,
      sha256,
      verificationStatus: 'passed',
      verification: {
        opened: true,
        rendered: ['pdf', 'xlsx', 'pptx', 'docx'].includes(MIME_KINDS[normalized.mimeType]),
        malwareScan: 'passed',
        formulasAndCharts: MIME_KINDS[normalized.mimeType] === 'xlsx' ? true : undefined,
        desktopAndMobilePreview: MIME_KINDS[normalized.mimeType] === 'zip' &&
          ['website', 'package'].includes(normalized.role)
          ? true
          : undefined,
        sourceCount: normalized.sources.length,
        sha256
      },
      sources: normalized.sources
    });
  };

  return { ingest };
};

module.exports = {
  MIME_KINDS,
  assertArtifactDeclaration,
  assertSourcesObserved,
  canonicalSourceUrl,
  createAgentArtifactService,
  inferRequiredDeliverables,
  quoteShell,
  requiredDeliverablesSatisfied,
  verificationCommand
};
