import { expect, test, type Download, type Locator, type Page, type TestInfo } from '@playwright/test';
import { unzipSync } from 'fflate';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABGklEQVR4nO3RsRXCMBBEQYcQ0AgN0H8PPMogdmZqMLa0sm6Cn9/tLLf7Y1OuJX1A9QAAqB0AALUDAKB2AADUDgCA2gEA0KfXZ9sdgMDovTGGAHhvz9M6e/jWENMBtBy/BQKAMAKAMASAMAIAANcHOIIAIIzQFWBdv7FGRQAAYC6AvQgAAAAAEEQAAAAAAAAAAAAAAAAAAAAAAAAAAABAh/EBAAAAIDg+AABzAfyzCYDg+ADC4wMAcH2Ao5sACA0PYIDxAYTHBxAcHkBw9JIAPf8EAAAAAAAAAAAAAAAAAAAAAAAYYGwAAwYAAAAAAAAAAAAAAAAAAGYGEIDhAgCgdgAA1A4AgNoBAFA7AABqBwBA7QAAqB0AALX7AcCitLp1NMT4AAAAAElFTkSuQmCC';

const pngBuffer = Buffer.from(PNG_BASE64, 'base64');
const MOCK_IMAGE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c6ff00"/>
      <stop offset="0.55" stop-color="#33d6ff"/>
      <stop offset="1" stop-color="#101014"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="#08090d"/>
  <circle cx="694" cy="294" r="220" fill="url(#bg)" opacity="0.82"/>
  <rect x="224" y="262" width="278" height="520" rx="86" fill="#f7f8ef"/>
  <rect x="286" y="192" width="154" height="106" rx="26" fill="#d7ff3f"/>
  <rect x="278" y="382" width="170" height="212" rx="28" fill="#101014" opacity="0.82"/>
  <text x="512" y="884" text-anchor="middle" fill="#f7f8ef" font-family="Arial, sans-serif" font-size="72" font-weight="700">ARTIGEN</text>
</svg>`;
const mockImageDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MOCK_IMAGE_SVG)}`;
const txtBuffer = Buffer.from(
  'Artigen visual fixture\\nThis text file is used by the toolbox PDF exporter.\\n',
  'utf8'
);

const pushU16 = (parts: Buffer[], n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  parts.push(b);
};

const pushU32 = (parts: Buffer[], n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  parts.push(b);
};

const makePdfBuffer = (pageCount = 1) => {
  const chunks: Buffer[] = [];
  const offsets: number[] = [0];
  let cursor = 0;
  const push = (value: string | Buffer) => {
    const b = typeof value === 'string' ? Buffer.from(value, 'binary') : value;
    chunks.push(b);
    cursor += b.length;
  };
  const addObject = (no: number, body: string) => {
    offsets[no] = cursor;
    push(`${no} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n');
  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(
    2,
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_value, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`
  );
  addObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let index = 0; index < pageCount; index += 1) {
    const pageNo = 4 + index * 2;
    const contentNo = pageNo + 1;
    addObject(
      pageNo,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNo} 0 R >>`
    );
    const stream = `BT /F1 24 Tf 48 96 Td (Hello Artigen PDF page ${index + 1}) Tj ET`;
    addObject(contentNo, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  const xrefOffset = cursor;
  const objectCount = 4 + pageCount * 2;
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let i = 1; i < objectCount; i += 1) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
  return Buffer.concat(chunks);
};

const makeBlankPdfBuffer = () => {
  const chunks: Buffer[] = [];
  const offsets: number[] = [0];
  let cursor = 0;
  const push = (value: string | Buffer) => {
    const b = typeof value === 'string' ? Buffer.from(value, 'binary') : value;
    chunks.push(b);
    cursor += b.length;
  };
  const addObject = (no: number, body: string) => {
    offsets[no] = cursor;
    push(`${no} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n');
  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Contents 4 0 R >>');
  addObject(4, '<< /Length 0 >>\nstream\n\nendstream');

  const xrefOffset = cursor;
  push('xref\n0 5\n0000000000 65535 f \n');
  for (let i = 1; i <= 4; i += 1) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.concat(chunks);
};

const makeDocxBuffer = () => {
  const filename = Buffer.from('word/document.xml', 'utf8');
  const content = Buffer.from(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello Artigen DOCX</w:t></w:r></w:p></w:body></w:document>',
    'utf8'
  );
  const parts: Buffer[] = [];
  const localOffset = 0;

  pushU32(parts, 0x04034b50);
  pushU16(parts, 20);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU32(parts, 0);
  pushU32(parts, content.length);
  pushU32(parts, content.length);
  pushU16(parts, filename.length);
  pushU16(parts, 0);
  parts.push(filename, content);

  const centralOffset = parts.reduce((sum, part) => sum + part.length, 0);
  pushU32(parts, 0x02014b50);
  pushU16(parts, 20);
  pushU16(parts, 20);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU32(parts, 0);
  pushU32(parts, content.length);
  pushU32(parts, content.length);
  pushU16(parts, filename.length);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU32(parts, 0);
  pushU32(parts, localOffset);
  parts.push(filename);

  const endOffset = parts.reduce((sum, part) => sum + part.length, 0);
  pushU32(parts, 0x06054b50);
  pushU16(parts, 0);
  pushU16(parts, 0);
  pushU16(parts, 1);
  pushU16(parts, 1);
  pushU32(parts, endOffset - centralOffset);
  pushU32(parts, centralOffset);
  pushU16(parts, 0);
  return Buffer.concat(parts);
};

type RuntimeIssues = {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  httpErrors: string[];
};

type VisualAudit = {
  name: string;
  status: 'ok' | 'broken-image' | 'overflow' | 'clipped' | 'low-contrast';
  screenshot: string;
  stats: ReturnType<typeof getPngVisualStats>;
  layout: {
    criticalVisibility: Array<{
      selector: string;
      text: string;
      visibleRatio: number;
      width: number;
      height: number;
      scrollClipped: boolean;
    }>;
    brokenImages: Array<{
      src: string;
      alt: string;
      cls: string;
      width: number;
      height: number;
    }>;
    mobilePanelTop?: { panelTop: number; topbarBottom: number };
  };
};

const visualAuditSummary: VisualAudit[] = [];
const externalAssetFailurePattern =
  /fonts\.(googleapis|gstatic)\.com|cdn\.packify\.ai|images\.unsplash\.com|placeholder\.com/i;

const safeJson = (value: unknown) => JSON.stringify(value);

const installRuntimeWatchers = (page: Page, allowedHttpErrors: RegExp[] = []) => {
  const issues: RuntimeIssues = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    httpErrors: []
  };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|ResizeObserver loop/i.test(text)) return;
    issues.consoleErrors.push(text);
  });

  page.on('pageerror', (err) => {
    issues.pageErrors.push(String(err?.message || err));
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    const failure = req.failure()?.errorText || '';
    if (/fonts\.(googleapis|gstatic)\.com/i.test(url)) return;
    if (/cdn\.packify\.ai/i.test(url)) return;
    if (url.startsWith('blob:') && /cancelled|ERR_ABORTED/i.test(failure)) return;
    if (/\/api\/collection\/event/i.test(url) && /ERR_ABORTED/i.test(failure)) {
      return;
    }
    if (allowedHttpErrors.some((re) => re.test(url))) return;
    issues.requestFailures.push(`${req.method()} ${url} ${failure}`.trim());
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (allowedHttpErrors.some((re) => re.test(url))) return;
    issues.httpErrors.push(`${status} ${url}`);
  });

  return issues;
};

const mockCommonApis = async (page: Page) => {
  await page.route('https://accounts.google.com/gsi/client', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'font/woff2',
      body: ''
    });
  });
  await page.route(/https:\/\/cdn\.packify\.ai\/.*/i, async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/tools/convert/capabilities', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        capabilities: { officeToPdf: false, pdfToDocx: false, maxFileBytes: 25_165_824 }
      })
    });
  });
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (
      url.includes('/api/proxy/image') ||
      url.includes('/api/img2img') ||
      url.includes('/api/generate')
    )
      return route.fallback();
    if (url.includes('/api/auth/session')) {
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({
          ok: true,
          authenticated: false,
          userId: null,
          user: null,
          csrfToken: 'csrf-guest-visual'
        })
      });
      return;
    }
    if (url.includes('/api/credits/balance')) {
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({ userId: 'user_visual', available: 120, frozen: 0 })
      });
      return;
    }
    if (url.includes('/api/credits/costs')) {
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({ generate: 15, img2img: 15 })
      });
      return;
    }
    if (url.includes('/api/credits/orders')) {
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({ orders: [] })
      });
      return;
    }
    if (url.includes('/api/tool-tasks/quote')) {
      const body = route.request().postDataJSON?.() as { toolId?: string; operation?: string } | undefined;
      const sku = body?.toolId === 'id-photo'
        ? 'workshop.professional-portrait.v1'
        : body?.toolId === 'background'
          ? 'workshop.background-scene.v1'
          : body?.toolId === 'ingredient-label'
            ? 'workshop.ingredient-layout-ai.v1'
            : 'workshop.old-photo.v1';
      const credits = body?.toolId === 'ingredient-label' ? 10 : 5;
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({
          quote: {
            quoteId: '11111111-1111-4111-8111-111111111111',
            sku,
            credits,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
          }
        })
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: safeJson({ ok: true, items: [] }) });
  });
};

const seedBrowserState = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('app_lang', 'en');
    if (!window.localStorage.getItem('app_user_id')) {
      window.localStorage.setItem('app_user_id', 'guest_visual');
    }
    if (!window.localStorage.getItem('agent_user_id')) {
      window.localStorage.setItem('agent_user_id', 'guest_visual');
    }
  });
};

const seedAuthedBrowserState = async (
  page: Page,
  generationMode: 'legacy' | 'v2' = 'legacy'
) => {
  await page.context().addCookies([
    {
      name: 'auth_token',
      value: 'e2e-http-only-session',
      url: 'http://127.0.0.1:51731',
      httpOnly: true,
      sameSite: 'Lax'
    }
  ]);
  await page.route('**/api/auth/session', async (route) => {
    const cookieHeader = (await route.request().headerValue('cookie')) || '';
    const storedSessionCookie = (await page.context().cookies(route.request().url())).some(
      (cookie) => cookie.name === 'auth_token' && cookie.value === 'e2e-http-only-session'
    );
    const hasSessionCookie =
      /(?:^|;\s*)auth_token=e2e-http-only-session(?:;|$)/.test(cookieHeader) || storedSessionCookie;
    await route.fulfill({
      status: hasSessionCookie ? 200 : 401,
      contentType: 'application/json',
      body: safeJson(
        hasSessionCookie
          ? {
              ok: true,
              authenticated: true,
              userId: 'user_visual',
              user: { id: 'user_visual', userId: 'user_visual', name: 'Visual Tester' },
              csrfToken: 'csrf-user-visual'
            }
          : { ok: true, authenticated: false, userId: null, user: null }
      )
    });
  });
  await page.addInitScript((mode) => {
    window.localStorage.removeItem('app_auth_token');
    window.localStorage.removeItem('agent_auth_token');
    window.localStorage.setItem('artigen:ai-design-task-v2-dev', mode);
    const historyKey = 'artigen_history_v2_user_visual';
    if (!window.localStorage.getItem(historyKey)) {
      window.localStorage.setItem(historyKey, JSON.stringify({ version: 2, items: [] }));
    }
  }, generationMode);
};

const waitForAuthenticatedSession = async (page: Page) => {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        userId: window.localStorage.getItem('app_user_id'),
        appBearer: window.localStorage.getItem('app_auth_token'),
        legacyBearer: window.localStorage.getItem('agent_auth_token')
      }))
    )
    .toEqual({ userId: 'user_visual', appBearer: null, legacyBearer: null });
};

const assertNoHorizontalOverflow = async (page: Page) => {
  const report = await page.evaluate(() => {
    const vw = window.innerWidth;
    const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          'button',
          'input',
          'textarea',
          'select',
          '.msg-bubble',
          '.history-item',
          '.tool-card',
          '.tool-modal-panel',
          '.result-container',
          '.panel',
          '.tool-section',
          '.editor-topbar',
          '.stage-empty',
          '.result-error',
          '.error-box',
          '.top-tip',
          '.mobile-menu',
          '.tools-popover',
          '.lang-dropdown',
          '.credits-popover',
          '.account-card',
          '.model-dropdown',
          '.side'
        ].join(',')
      )
    );
    const bad = candidates
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width <= 1 || rect.height <= 1 || style.visibility === 'hidden') return false;
        if (style.display === 'none') return false;
        if (style.overflowX === 'hidden' || style.overflowX === 'clip') return false;
        return el.scrollWidth - el.clientWidth > 4;
      })
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        text: (el.textContent || '').trim().slice(0, 80),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }));
    const outliers = Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return { el, rect, style };
      })
      .filter(
        ({ rect, style }) =>
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 1 &&
          rect.height > 1 &&
          (rect.right > vw + 3 || rect.left < -3)
      )
      .sort((a, b) => Math.max(b.rect.right - vw, -b.rect.left) - Math.max(a.rect.right - vw, -a.rect.left))
      .slice(0, 8)
      .map(({ el, rect }) => ({
        tag: el.tagName.toLowerCase(),
        cls: typeof el.className === 'string' ? el.className : '',
        text: (el.textContent || '').trim().slice(0, 80),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width)
      }));
    return { vw, docW, bad, outliers };
  });

  expect(report.docW, `document horizontal overflow: ${JSON.stringify(report)}`).toBeLessThanOrEqual(
    report.vw + 3
  );
  expect(report.bad, `element horizontal overflow: ${JSON.stringify(report.bad)}`).toEqual([]);
};

const expectCleanRuntime = (issues: RuntimeIssues, allowedConsoleErrors: RegExp[] = []) => {
  const consoleErrors = issues.consoleErrors.filter(
    (text) => !allowedConsoleErrors.some((re) => re.test(text))
  );
  expect(consoleErrors, 'console.error output').toEqual([]);
  expect(issues.pageErrors, 'pageerror output').toEqual([]);
  expect(issues.requestFailures, 'failed requests').toEqual([]);
  expect(issues.httpErrors, 'HTTP 4xx/5xx responses').toEqual([]);
};

const waitForVisualIdle = async (page: Page) => {
  const animatedFrame = page.locator('.tools-main-frame');
  if ((await animatedFrame.count()) === 1) {
    await expect(animatedFrame).toHaveCSS('opacity', '1', { timeout: 2500 });
  }
  await page.waitForTimeout(100);
};

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
};

const colorTypeChannels = (colorType: number) => {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type ${colorType}`);
};

const getPngVisualStats = (png: Buffer) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length < signature.length || !png.subarray(0, 8).equals(signature)) {
    throw new Error('Screenshot is not a PNG');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) break;
    const data = png.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || idat.length === 0) {
    throw new Error('Unsupported or empty PNG screenshot');
  }

  const channels = colorTypeChannels(colorType);
  const bpp = channels;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const row = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let src = 0;
  let count = 0;
  let opaque = 0;
  let minBrightness = 255;
  let maxBrightness = 0;
  let sum = 0;
  let sumSq = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[src++];
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev[x] || 0;
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 0xff;
      else if (filter === 2) row[x] = (value + up) & 0xff;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }

    for (let x = 0; x < stride; x += channels) {
      const r = row[x];
      let g = channels === 1 ? r : row[x + 1];
      let b = channels === 1 ? r : row[x + 2];
      const a = channels === 4 ? row[x + 3] : channels === 2 ? row[x + 1] : 255;
      if (colorType === 4) {
        g = r;
        b = r;
      }
      if (a > 0) opaque += 1;
      const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);
      sum += brightness;
      sumSq += brightness * brightness;
      count += 1;
    }
    prev.set(row);
  }

  const meanBrightness = count ? sum / count : 0;
  const variance = count ? sumSq / count - meanBrightness * meanBrightness : 0;
  const stddevBrightness = Math.sqrt(Math.max(0, variance));
  return {
    width,
    height,
    minBrightness: Math.round(minBrightness * 100) / 100,
    maxBrightness: Math.round(maxBrightness * 100) / 100,
    meanBrightness: Math.round(meanBrightness * 100) / 100,
    stddevBrightness: Math.round(stddevBrightness * 100) / 100,
    opaqueRatio: Math.round((opaque / Math.max(1, count)) * 10000) / 10000
  };
};

const assertVisualLayoutHealth = async (page: Page) => {
  const report = await page.evaluate(() => {
    const selectors = [
      '.msg-bubble',
      '.history-item-btn',
      '.result-container',
      '.tool-modal-panel',
      '.modal-container',
      '.ingredient-modal-container',
      '.panel.mobile-panel-open',
      '.image-editor-page',
      '.editor-tip',
      '.top-tip',
      '.mobile-menu',
      '.tools-popover',
      '.lang-dropdown',
      '.credits-popover',
      '.account-card',
      '.model-dropdown',
      '.side'
    ];
    selectors.push('.download-dialog');
    const blockingOverlay = document.querySelector(
      '.download-dialog-overlay, .modal-mask, .ingredient-modal-overlay, .tool-modal-overlay, .result-overlay'
    );
    const skipBehindOverlay = new Set(blockingOverlay ? ['.msg-bubble', '.history-item-btn'] : []);
    const viewport = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
    const visibleAreaRatio = (rect: DOMRect) => {
      const left = Math.max(viewport.left, rect.left);
      const right = Math.min(viewport.right, rect.right);
      const top = Math.max(viewport.top, rect.top);
      const bottom = Math.min(viewport.bottom, rect.bottom);
      const area = Math.max(0, right - left) * Math.max(0, bottom - top);
      const total = Math.max(1, rect.width * rect.height);
      return area / total;
    };

    const criticalVisibility: Array<{
      selector: string;
      text: string;
      visibleRatio: number;
      width: number;
      height: number;
    }> = [];
    for (const selector of selectors) {
      if (skipBehindOverlay.has(selector)) continue;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector)).slice(0, 6)) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (rect.width <= 1 || rect.height <= 1) continue;
        const ratio = visibleAreaRatio(rect);
        if (ratio <= 0) continue;
        const scrollViewport = el.closest<HTMLElement>('.chat-scroll')?.getBoundingClientRect();
        criticalVisibility.push({
          selector,
          text: (el.textContent || '').trim().slice(0, 80),
          visibleRatio: Math.round(ratio * 1000) / 1000,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollClipped: !!scrollViewport &&
            (rect.top < scrollViewport.top || rect.bottom > scrollViewport.bottom)
        });
      }
    }

    const mobilePanel = document.querySelector<HTMLElement>('.panel.mobile-panel-open');
    const topbar = document.querySelector<HTMLElement>('.editor-topbar');
    const mobilePanelTop =
      mobilePanel && topbar
        ? {
            panelTop: Math.round(mobilePanel.getBoundingClientRect().top),
            topbarBottom: Math.round(topbar.getBoundingClientRect().bottom)
          }
        : undefined;

    const brokenImages = Array.from(document.images)
      .filter((img) => {
        const rect = img.getBoundingClientRect();
        const style = window.getComputedStyle(img);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (rect.width <= 1 || rect.height <= 1) return false;
        return img.complete && img.naturalWidth === 0;
      })
      .slice(0, 12)
      .map((img) => {
        const rect = img.getBoundingClientRect();
        return {
          src: img.currentSrc || img.src || '',
          alt: img.alt || '',
          cls: String(img.className || ''),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });

    return { criticalVisibility, brokenImages, mobilePanelTop };
  });

  const clipped = report.criticalVisibility.filter((item) => {
    // A message crossing a scroll viewport edge is expected; individual history
    // navigation tests assert the selected result is actually in the viewport.
    if (item.selector === '.msg-bubble' && item.scrollClipped) return false;
    if (item.selector === '.msg-bubble') return item.visibleRatio < 0.18;
    if (item.selector === '.image-editor-page') return item.visibleRatio < 0.98;
    if (item.selector === '.tool-modal-panel') return item.visibleRatio < 0.58;
    if (item.selector === '.result-container') return item.visibleRatio < 0.72;
    if (item.selector === '.panel.mobile-panel-open') return item.visibleRatio < 0.82;
    return item.visibleRatio < 0.5;
  });
  expect(clipped, `critical visible area is clipped: ${JSON.stringify(clipped)}`).toEqual([]);
  expect(report.brokenImages, `visible broken images: ${JSON.stringify(report.brokenImages)}`).toEqual(
    []
  );
  if (report.mobilePanelTop) {
    expect(
      report.mobilePanelTop.panelTop,
      `mobile editor panel overlaps topbar: ${JSON.stringify(report.mobilePanelTop)}`
    ).toBeGreaterThanOrEqual(report.mobilePanelTop.topbarBottom - 2);
  }
  return report;
};

const runVisualAudit = async (page: Page, testInfo: TestInfo, name: string) => {
  await waitForVisualIdle(page);
  await assertNoHorizontalOverflow(page);
  const layout = await assertVisualLayoutHealth(page);
  const screenshot = `visual-${testInfo.project.name}-${name}.png`;
  const screenshotPath = testInfo.outputPath(screenshot);
  const png = await page.screenshot({
    path: screenshotPath,
    fullPage: false
  });
  const stats = getPngVisualStats(Buffer.from(png));
  expect(stats.width, 'screenshot width').toBeGreaterThan(100);
  expect(stats.height, 'screenshot height').toBeGreaterThan(100);
  expect(stats.opaqueRatio, 'screenshot has visible pixels').toBeGreaterThan(0.75);
  expect(stats.maxBrightness - stats.minBrightness, 'screenshot brightness range').toBeGreaterThan(
    16
  );
  expect(stats.stddevBrightness, 'screenshot visual contrast').toBeGreaterThan(4);
  const audit: VisualAudit = { name, status: 'ok', screenshot: screenshotPath, stats, layout };
  visualAuditSummary.push(audit);
  const auditPath = testInfo.outputPath(`visual-audit-${testInfo.project.name}-${name}.json`);
  await writeFile(auditPath, JSON.stringify(audit, null, 2));
  await testInfo.attach(`visual-audit-${name}`, {
    body: JSON.stringify(audit, null, 2),
    contentType: 'application/json'
  });
};

const saveScreenshot = runVisualAudit;

test.afterAll(async () => {
  await mkdir('test-results/e2e', { recursive: true });
  const statusCounts = visualAuditSummary.reduce<Record<VisualAudit['status'], number>>(
    (acc, audit) => {
      acc[audit.status] += 1;
      return acc;
    },
    { ok: 0, 'broken-image': 0, overflow: 0, clipped: 0, 'low-contrast': 0 }
  );
  await writeFile(
    'test-results/e2e/visual-audit-summary.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: visualAuditSummary.length,
        statusCounts,
        audits: visualAuditSummary
      },
      null,
      2
    )
  );
});

const disableDeepThinking = async (page: Page) => {
  const toggle = page.locator('label.toggle-btn').filter({ hasText: 'Deep Thinking' });
  await expect(toggle).toBeVisible();
  const input = toggle.locator('input[type="checkbox"]');
  if (await input.isChecked()) await toggle.click();
};

const enableDeepThinking = async (page: Page) => {
  const toggle = page.locator('label.toggle-btn').filter({ hasText: 'Deep Thinking' });
  await expect(toggle).toBeVisible();
  const input = toggle.locator('input[type="checkbox"]');
  if (!(await input.isChecked())) await toggle.click();
};

const clickSend = async (page: Page) => {
  await expect(page.locator('.send-btn')).toBeEnabled();
  await page.locator('.send-btn').click();
};

const seedLanguage = async (page: Page, lang: 'en' | 'zh') => {
  await page.addInitScript((nextLang) => {
    window.localStorage.setItem('app_lang', nextLang);
  }, lang);
};

const seedHistoryFixtures = async (page: Page, items: any[]) => {
  const locallyRecoverable = items
    .filter((item) => item?.status === 'pending' || item?.status === 'cancelled')
    .map((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      status: item.status,
      ...(item.status === 'cancelled' ? { errorCode: 'TASK_CANCELLED' } : {})
    }));
  await page.addInitScript((safeItems) => {
    window.localStorage.setItem(
      'artigen_history_v2_user_visual',
      JSON.stringify({ version: 2, items: safeItems })
    );
  }, locallyRecoverable);

  const serverItems = items
    .filter((item) => item?.status !== 'pending' && item?.status !== 'cancelled')
    .map((item) => ({
      id: item.id,
      ts: item.timestamp,
      prompt: String(item?.result?.prompt || item?.userText || 'Saved generation task'),
      negativePrompt: String(item?.result?.negativePrompt || 'none'),
      userText: String(item?.userText || 'Saved generation task'),
      images: item?.image ? [{ url: item.image }] : [],
      inputImages: Array.isArray(item?.refImages)
        ? item.refImages.map((url: string) => ({ url }))
        : []
    }));
  await page.route('**/api/images/history/**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({ ok: true, items: serverItems })
    });
  });
};

const seedGuestHistory = async (page: Page, items: unknown[]) => {
  await seedAuthedBrowserState(page);
  await seedHistoryFixtures(page, items as any[]);
};

const seedAuthedHistory = async (page: Page, items: unknown[]) => {
  await seedHistoryFixtures(page, items as any[]);
};

const makeHistoryItem = (overrides: Record<string, unknown>) => ({
  id: `h_${Math.random().toString(36).slice(2)}`,
  timestamp: Date.now(),
  userText: 'Visual history item',
  result: { prompt: 'Visual history item prompt', negativePrompt: 'blur' },
  image: null,
  status: 'success',
  ...overrides
});

const VIDEO_FIXTURE_URL = new URL('./fixtures/animated-vp8.webm.base64', import.meta.url);

const makeVideoFixture = async (_page: Page) => {
  const base64 = (await readFile(VIDEO_FIXTURE_URL, 'utf8')).trim();
  const buffer = Buffer.from(base64, 'base64');
  expect(buffer.length, 'deterministic video fixture length').toBeGreaterThan(100);
  expect(buffer.subarray(0, 4).toString('hex'), 'deterministic video fixture magic bytes').toBe(
    '1a45dfa3'
  );
  return {
    name: 'fixture.webm',
    mimeType: 'video/webm',
    buffer
  };
};

const waitForVideoReady = async (video: Locator) => {
  await expect(video).toBeVisible();
  await expect
    .poll(async () =>
      video.evaluate((node) => {
        const v = node as HTMLVideoElement;
        return v.readyState >= 1 && v.videoWidth > 0 && v.videoHeight > 0;
      })
    )
    .toBe(true);
};

const resetWorkshopTaskRecoveryState = async (page: Page) => {
  // This visual matrix intentionally treats every failure mode as an independent
  // scenario. Navigate away first so the previous app instance cannot race a
  // durable cancel write back into IndexedDB while the next scenario starts.
  await page.goto('/logo.png');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('artigen-workshop-tasks');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('WORKSHOP_TASK_DB_RESET_FAILED'));
      request.onblocked = () => reject(new Error('WORKSHOP_TASK_DB_RESET_BLOCKED'));
    });
  });
};

const openIngredientLabelFromWorkshop = async (page: Page) => {
  await page.goto('/artigen/image-workshop');
  await waitForAuthenticatedSession(page);
  await page.getByRole('button', { name: /Ingredient Label Layout/ }).click();
  await expect(page.locator('.ingredient-modal-container')).toBeVisible();
};

const openPaidProfessionalPortrait = async (page: Page) => {
  await page
    .getByRole('button', { name: /ID Photo & Professional Portrait|证件照与职业形象/ })
    .click();
  const chooser = page.locator('.standard-photo-dialog');
  await expect(chooser).toBeVisible();
  await chooser
    .getByRole('button', { name: /Open paid AI portrait|打开付费 AI 职业形象/ })
    .click();
  const dialog = page.locator('.modal-container');
  await expect(dialog).toBeVisible();
  const consent = dialog.locator('.upload-consent input');
  await expect(consent).toBeEnabled();
  await consent.check();
};

const generateIngredientLabel = async (page: Page) => {
  await page
    .locator('.ingredient-modal-container textarea.product-textarea')
    .fill('Water, Glycerin, Sodium Hyaluronate, Citric Acid');
  const button = page.locator('.ingredient-modal-container .local-layout-button');
  await expect(button).toBeEnabled();
  await button.click();
};

const generateAiIngredientLabel = async (page: Page) => {
  const dialog = page.locator('.ingredient-modal-container');
  const consent = dialog.locator('.ai-consent input');
  await expect(consent).toBeEnabled();
  await consent.check();
  const button = dialog.locator('.generate-button:not(.local-layout-button)');
  await expect(button).toBeEnabled();
  await button.click();
};

const ingredientTask = (
  status: 'success' | 'failed' | 'cancelled',
  errorCode?: string
) => ({
  taskId: 'ingredient_task_visual',
  toolId: 'ingredient-label',
  operation: 'ai-organize-source-text',
  status,
  assets: [],
  warnings: [],
  result: status === 'success'
    ? {
        assets: [],
        data: {
          layoutType: 'standard',
          sections: [{ title: 'SOURCE TEXT', content: ['Water, Glycerin, Sodium Hyaluronate'] }],
          sourceTrace: { verified: true }
        },
        warnings: []
      }
    : null,
  error: errorCode
    ? { code: errorCode, messageKey: errorCode, retryable: false }
    : null,
  receipt: {
    sku: 'workshop.ingredient-layout-ai.v1',
    quotedCredits: 10,
    chargedCredits: status === 'success' ? 10 : 0,
    refundedCredits: status === 'success' ? 0 : 10
  }
});

const oldPhotoTask = (
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled',
  options?: { assets?: Array<{ assetId: string; mimeType: string }>; errorCode?: string }
) => ({
  taskId: 'old_photo_task_visual',
  toolId: 'old-photo',
  operation: 'enhance-colorize',
  status,
  result:
    status === 'success'
      ? { assets: options?.assets ?? [], warnings: [], restoration: { colorized: true } }
      : null,
  error: options?.errorCode
    ? { code: options.errorCode, messageKey: options.errorCode, retryable: false }
    : null,
  receipt: {
    sku: 'workshop.old-photo.v1',
    quotedCredits: 5,
    chargedCredits: status === 'success' ? 5 : 0,
    refundedCredits: status === 'failed' || status === 'cancelled' ? 5 : 0
  }
});

const workshopImageTask = (
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled',
  options?: {
    toolId?: 'id-photo' | 'background';
    operation?: 'professional-portrait' | 'ai-scene';
    assets?: Array<{ assetId: string; mimeType: string }>;
    errorCode?: string;
  }
) => ({
  taskId: 'workshop_image_task_visual',
  toolId: options?.toolId || 'id-photo',
  operation: options?.operation || 'professional-portrait',
  status,
  assets: [],
  warnings: [],
  result: status === 'success'
    ? { assets: options?.assets ?? [], data: {}, warnings: [] }
    : null,
  error: options?.errorCode
    ? { code: options.errorCode, messageKey: options.errorCode, retryable: false }
    : null,
  receipt: {
    sku: options?.toolId === 'background'
      ? 'workshop.background-scene.v1'
      : 'workshop.professional-portrait.v1',
    quotedCredits: 5,
    chargedCredits: status === 'success' ? 5 : 0,
    refundedCredits: status === 'failed' || status === 'cancelled' ? 5 : 0
  }
});

type AiDesignOperation = 'directions' | 'generate';
type AiDesignTaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

const aiDesignDirections = [
  {
    id: 'studio',
    title: 'Clean Studio Product',
    summary: 'Soft shadows, crisp product edges, and bright commercial lighting.',
    prompt: 'A clean studio product hero with soft shadows.'
  },
  {
    id: 'editorial',
    title: 'Editorial Glow',
    summary: 'Magazine-style composition with restrained reflective highlights.',
    prompt: 'An editorial product scene with reflective highlights.'
  },
  {
    id: 'natural',
    title: 'Natural Shelf Scene',
    summary: 'Warm natural light with believable botanical accents.',
    prompt: 'A product on a naturally lit shelf with botanical accents.'
  },
  {
    id: 'minimal',
    title: 'Minimal Hero',
    summary: 'A single product composition with deliberate negative space.',
    prompt: 'A minimal product hero composition with negative space.'
  }
];

const aiDesignTask = (options: {
  taskId: string;
  operation: AiDesignOperation;
  status: AiDesignTaskStatus;
  assetId?: string;
  aspectRatio?: string;
  seed?: number;
  errorCode?: string;
}) => {
  const credits = options.operation === 'directions' ? 5 : 10;
  const success = options.status === 'success';
  const cancelled = options.status === 'cancelled';
  const failed = options.status === 'failed';
  const assets =
    success && options.operation === 'generate' && options.assetId
      ? [
          {
            assetId: options.assetId,
            url: `/api/assets/${options.assetId}`,
            mimeType: 'image/png',
            byteSize: pngBuffer.length
          }
        ]
      : [];
  const receipt = {
    sku: `ai-design.${options.operation}.v1`,
    quotedCredits: credits,
    chargedCredits: success ? credits : 0,
    refundedCredits: cancelled || failed ? credits : 0
  };
  const data =
    options.operation === 'directions'
      ? { directions: aiDesignDirections }
      : {
          profileId: 'standard-v1',
          aspectRatio: options.aspectRatio || '1:1',
          seed: options.seed ?? 42
        };
  return {
    taskId: options.taskId,
    toolId: 'ai-design',
    operation: options.operation,
    status: options.status,
    assets,
    warnings: [],
    result: success ? { assets, data, receipt, warnings: [] } : null,
    error:
      failed || cancelled
        ? {
            code: options.errorCode || (cancelled ? 'TASK_CANCELLED' : 'TOOL_TASK_FAILED'),
            messageKey: options.errorCode || (cancelled ? 'TASK_CANCELLED' : 'TOOL_TASK_FAILED'),
            retryable: false
          }
        : null,
    receipt
  };
};

const mockAiDesignModels = async (page: Page) => {
  await page.route('**/api/generation/models', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        models: [
          {
            id: 'standard-v1',
            name: { zh: '标准生成', en: 'Standard generation' },
            available: true,
            capabilities: ['text-to-image', 'image-reference'],
            maxReferences: 3,
            aspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
            supportsSeed: true
          }
        ]
      })
    });
  });
};

const multipartField = (body: string, field: string) => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(
    new RegExp(`name=["']${escaped}["'][^\\r\\n]*\\r?\\n\\r?\\n([^\\r\\n]*)`)
  );
  return String(match?.[1] || '').trim();
};

type PendingGenerationRecord = {
  version: 1;
  operation: AiDesignOperation;
  idempotencyKey: string;
  quote: { quoteId: string; sku: string; credits: number; expiresAt: string };
  options: Record<string, unknown>;
  files: unknown[];
  historyId: string;
  userText: string;
  refThumbs: string[];
  taskId?: string;
  createdAt: number;
};

const writePendingGenerationRecord = async (page: Page, pending: PendingGenerationRecord) => {
  await page.evaluate(async (record) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('artigen-generation-workspace', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('workspace')) {
          request.result.createObjectStore('workspace');
        }
      };
      request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('workspace', 'readwrite');
      transaction.objectStore('workspace').put(record, 'pending-generation-v1');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('INDEXEDDB_WRITE_FAILED'));
      transaction.onabort = () => reject(transaction.error || new Error('INDEXEDDB_WRITE_ABORTED'));
    });
    database.close();
  }, pending);
};

const readPendingGenerationRecord = async (page: Page) =>
  page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('artigen-generation-workspace', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('workspace')) {
          request.result.createObjectStore('workspace');
        }
      };
      request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
      request.onsuccess = () => resolve(request.result);
    });
    const value = await new Promise<any>((resolve, reject) => {
      const transaction = database.transaction('workspace', 'readonly');
      const request = transaction.objectStore('workspace').get('pending-generation-v1');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('INDEXEDDB_READ_FAILED'));
    });
    database.close();
    if (!value) return null;
    return {
      idempotencyKey: String(value.idempotencyKey || ''),
      taskId: String(value.taskId || ''),
      operation: String(value.operation || '')
    };
  });

const ingredientDownloadButton = (page: Page) =>
  page
    .locator('.ingredient-modal-container .operation-buttons button')
    .filter({ hasText: 'Download' });

const ingredientDownloadOption = (page: Page, label: string) =>
  page.locator('.download-popover .download-option, .download-modal .modal-option').filter({
    hasText: label
  });

const expectIngredientDownload = async (
  page: Page,
  label: string,
  expected: { ext: string; kind: string }
) => {
  await expect(ingredientDownloadButton(page)).toBeEnabled();
  await ingredientDownloadButton(page).click();
  return await expectDownloadFromButton(page, ingredientDownloadOption(page, label), expected);
};

const clickMessageImageAction = async (result: Locator, label: string) => {
  await result.locator('.msg-image-wrap').hover();
  const target = result.locator('.msg-image-action-btn').filter({ hasText: label });
  if (!await target.isVisible()) {
    const more = result.locator('.msg-image-action-more');
    if (await more.isVisible()) await more.click();
  }
  await target.click();
};

const expandGenerationControlsIfNeeded = async (page: Page) => {
  const toggle = page.locator('.generation-controls-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') {
    await toggle.click();
  }
};

const expectBufferSignature = (bytes: Buffer, kind: string) => {
  expect(bytes.length, `${kind} download is not empty`).toBeGreaterThan(12);
  if (kind === 'png') expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  else if (kind === 'jpg') expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  else if (kind === 'webp') {
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  } else if (kind === 'pdf') {
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(bytes.toString('latin1')).toContain('%%EOF');
  } else if (kind === 'docx') expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
  else if (kind === 'ico') {
    expect(bytes.readUInt16LE(0)).toBe(0);
    expect(bytes.readUInt16LE(2)).toBe(1);
  } else if (kind === 'svg') {
    expect(bytes.toString('utf8', 0, Math.min(bytes.length, 2000))).toMatch(/<svg/i);
  } else if (kind === 'gif') {
    expect(bytes.subarray(0, 3).toString('ascii')).toBe('GIF');
    expect(bytes.readUInt16LE(6), 'GIF width').toBeGreaterThan(0);
    expect(bytes.readUInt16LE(8), 'GIF height').toBeGreaterThan(0);
  } else if (kind === 'zip') {
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  }
};

const validateDownload = async (download: Download, expected: { ext: string; kind: string }) => {
  const suggested = download.suggestedFilename();
  expect(suggested.toLowerCase(), `download filename ${suggested}`).toMatch(
    new RegExp(`\\.${expected.ext}$`, 'i')
  );
  const path = await download.path();
  expect(path, 'download path').toBeTruthy();
  const bytes = await readFile(path as string);
  const buffer = Buffer.from(bytes);
  expectBufferSignature(buffer, expected.kind);
  return buffer;
};

const expectDownloadFromButton = async (
  page: Page,
  button: Locator,
  expected: { ext: string; kind: string }
) => {
  await expect(button).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  return await validateDownload(download, expected);
};

const expectPngLongestEdge = (bytes: Buffer, target: number) => {
  const stats = getPngVisualStats(bytes);
  expect(Math.max(stats.width, stats.height), 'PNG longest edge').toBe(target);
};

const countGifImageDescriptors = (bytes: Buffer) => {
  let count = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x2c) count += 1;
  }
  return count;
};

const countPdfPageObjects = (bytes: Buffer) => {
  expectBufferSignature(bytes, 'pdf');
  return (bytes.toString('latin1').match(/\d+\s+\d+\s+obj\s*<<\s*\/Type\s*\/Page(?!s)\b/g) || [])
    .length;
};

const unzipDownload = (bytes: Buffer) => {
  expectBufferSignature(bytes, 'zip');
  return unzipSync(new Uint8Array(bytes));
};

const blockExternalAssets = async (page: Page) => {
  await page.route(externalAssetFailurePattern, async (route) => {
    await route.abort('failed');
  });
};

test.beforeEach(async ({ page }) => {
  await seedBrowserState(page);
  await mockCommonApis(page);
});

test('external asset failures keep Artigen pages free of broken images', async ({
  page
}, testInfo) => {
  const issues = installRuntimeWatchers(page, [externalAssetFailurePattern]);
  await blockExternalAssets(page);

  await page.goto('/artigen');
  await expect(page.locator('.hero-carousel')).toBeVisible();
  await expect(page.locator('.slide-image-fallback').first()).toBeVisible({ timeout: 5000 });
  await saveScreenshot(page, testInfo, 'external-assets-landing');

  await page.goto('/artigen/image-workshop');
  await expect(page.getByRole('button', { name: /Ingredient Label Layout/ })).toBeVisible();
  await saveScreenshot(page, testInfo, 'external-assets-workshop');
  await page.getByRole('button', { name: /Ingredient Label Layout/ }).click();
  await expect(page.locator('.ingredient-modal-container')).toBeVisible();
  await saveScreenshot(page, testInfo, 'external-assets-ingredient-modal');

  await page.goto('/artigen/tools');
  await expect(page.locator('.tool-card').first()).toBeVisible();
  await saveScreenshot(page, testInfo, 'external-assets-tools');

  await importEditorFixture(page);
  await saveScreenshot(page, testInfo, 'external-assets-editor');
  expectCleanRuntime(issues, [/Failed to load resource: net::ERR_FAILED/]);
});

test('landing titlebar menus and account overlays stay visually stable', async ({
  page,
  isMobile
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen');
  await expect(page.locator('.landing-page')).toBeVisible();
  await saveScreenshot(page, testInfo, 'landing-shell-base');

  if (isMobile) {
    await page.locator('.nav-toggle').click();
    await expect(page.locator('.mobile-menu')).toBeVisible();
    await saveScreenshot(page, testInfo, 'landing-mobile-menu');
    await page.locator('.mobile-item.has-arrow').click();
    await expect(page.locator('.mobile-sub-menu')).toBeVisible();
    await saveScreenshot(page, testInfo, 'landing-mobile-tools-expanded');
    await page.mouse.click(8, 8);
  } else {
    await page.locator('.tools-container').hover();
    await expect(page.locator('.tools-popover')).toBeVisible();
    await saveScreenshot(page, testInfo, 'landing-tools-popover');
    await page.locator('.lang-switch').click();
    await expect(page.locator('.lang-dropdown')).toBeVisible();
    await saveScreenshot(page, testInfo, 'landing-language-menu');
    await page.mouse.click(8, 8);
  }

  const creditsButton = page.locator('.credits-btn');
  if ((await creditsButton.count()) > 0 && (await creditsButton.isVisible())) {
    await creditsButton.click();
    await expect(page.locator('.credits-popover')).toBeVisible();
    await saveScreenshot(page, testInfo, 'landing-credits-popover');
    await page.mouse.click(8, 8);
  }

  const avatarButton = page.locator('.avatar-btn');
  if ((await avatarButton.count()) > 0 && (await avatarButton.isVisible())) {
    await avatarButton.click();
    await expect(page.locator('.account-card')).toBeVisible();
    await saveScreenshot(page, testInfo, 'landing-account-popup');
    await page.locator('.account-overlay').click({ position: { x: 6, y: 6 } });
  }

  expectCleanRuntime(issues);
});

test('credit checkout verifies an Afdian order before adding credits', async ({ page }, testInfo) => {
  await seedAuthedBrowserState(page);
  const localOrderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const packageId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const providerOrderId = '202607171234567890123456789';
  let availableCredits = 120;
  let verifyBody: Record<string, unknown> | null = null;

  await page.route('**/api/pay/packages', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        packages: [{
          packageId,
          sku: 'credits.starter.v1',
          title: 'Starter',
          amountMinor: 990,
          currency: 'CNY',
          credits: 400
        }]
      })
    });
  });
  await page.route('**/api/pay/create-order', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        orderId: localOrderId,
        packageId,
        packageSku: 'credits.starter.v1',
        amountMinor: 990,
        amountCny: 9.9,
        currency: 'CNY',
        credits: 400,
        status: 'pending',
        payUrl: ''
      })
    });
  });
  await page.route(`**/api/pay/orders/${localOrderId}/verify`, async (route) => {
    verifyBody = route.request().postDataJSON() as Record<string, unknown>;
    availableCredits = 520;
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        orderId: localOrderId,
        credited: true,
        replayed: false,
        credits: 400
      })
    });
  });
  await page.route('**/api/credits/balance**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({ userId: 'user_visual', available: availableCredits, frozen: 0 })
    });
  });

  await page.goto('/artigen/market');
  await page.locator('.pricing-card').filter({ hasText: 'Starter' }).getByRole('button').click();
  const modal = page.locator('.pay-panel');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Afdian order number');
  await modal.locator('.pay-provider-input').fill(providerOrderId);
  await modal.getByRole('button', { name: 'Verify & add credits' }).click();

  await expect(modal.locator('.pay-hint')).toContainText('Success: +400 credits');
  await expect(modal).toContainText('520');
  expect(verifyBody).toEqual({ providerOrderId });
  await saveScreenshot(page, testInfo, 'payment-provider-order-verified');
});

test('AI shell popovers sidebars and long state screenshots stay stable', async ({
  page,
  isMobile
}, testInfo) => {
  const longText =
    'A deliberately long packaging prompt with reflective metal, transparent acrylic, bilingual label details, clean shadows, shelf context, exact brand colors, and a compact mobile layout check.';
  await seedAuthedBrowserState(page);
  await seedAuthedHistory(page, [
    makeHistoryItem({
      id: 'shell_success',
      timestamp: Date.now() - 3000,
      userText: longText,
      image: mockImageDataUrl,
      status: 'success'
    }),
    makeHistoryItem({
      id: 'shell_failed_long',
      timestamp: Date.now() - 2000,
      userText: `${longText} This generation should fail in a readable, low-weight way.`,
      status: 'failed',
      errorText:
        'Service busy. Your request is saved here so you can retry after the connection is stable.'
    }),
    makeHistoryItem({
      id: 'shell_pending',
      timestamp: Date.now() - 1000,
      userText: 'A pending item used to inspect history status layout.',
      status: 'pending',
      errorText: ''
    })
  ]);
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/ai');
  await expect(page.locator('.artigen-page')).toBeVisible();
  await page.locator('textarea.textarea').fill(longText);
  await saveScreenshot(page, testInfo, 'ai-shell-long-input');

  const creditsButton = page.locator('.credits-btn');
  if ((await creditsButton.count()) > 0 && (await creditsButton.isVisible())) {
    await creditsButton.click();
    await expect(page.locator('.credits-popover')).toBeVisible();
    await saveScreenshot(page, testInfo, 'ai-shell-credits-popover');
    await page.mouse.click(8, 8);
  }

  const avatarButton = page.locator('.avatar-btn');
  if ((await avatarButton.count()) > 0 && (await avatarButton.isVisible())) {
    await avatarButton.click();
    await expect(page.locator('.account-card')).toBeVisible();
    await saveScreenshot(page, testInfo, 'ai-shell-account-popup');
    await page.locator('.account-overlay').click({ position: { x: 6, y: 6 } });
  }

  await page.locator('.model-btn').click();
  await expect(page.locator('.model-dropdown')).toBeVisible();
  await saveScreenshot(page, testInfo, 'ai-shell-model-menu');
  await page.mouse.click(8, 8);
  await expect(page.locator('.model-dropdown')).toHaveCount(0);

  const productButton = page.locator('.toggle-btn').filter({ hasText: /Product|产品/ }).first();
  if ((await productButton.count()) > 0) {
    if (!(await page.locator('.side').isVisible())) await productButton.click();
    await expect(page.locator('.side')).toBeVisible();
    await saveScreenshot(page, testInfo, 'ai-shell-product-sidebar');
    if (isMobile) {
      await page.locator('.side-close').click();
      await expect(page.locator('.side')).toBeHidden();
    }
  }

  if (!(await page.locator('.right-side').isVisible())) {
    await page.locator('.history-toggle-btn').click();
  }
  await expect(page.locator('.right-side')).toBeVisible();
  await expect(page.locator('.history-item-btn').filter({ hasText: 'Pending' })).toBeVisible();
  await saveScreenshot(page, testInfo, 'ai-shell-history-sidebar-long-state');

  expectCleanRuntime(issues);
});

test('AI chat runs a fully mocked deep-thinking generation with fixed text and image', async ({
  page,
  isMobile
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page);
  await page.route('**/api/generate', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: safeJson({
                    options: [
                      {
                        id: 'studio',
                        title: 'Clean Studio Product',
                        summary: 'Soft shadows, crisp bottle edges, bright commercial lighting.',
                        styleTags: ['studio lighting', 'premium skincare', 'clean background'],
                        negativeTags: ['blur', 'low quality']
                      },
                      {
                        id: 'editorial',
                        title: 'Editorial Glow',
                        summary: 'Magazine-style product scene with reflective highlights.',
                        styleTags: ['editorial', 'glossy highlights', 'luxury'],
                        negativeTags: ['distorted text', 'noise']
                      },
                      {
                        id: 'natural',
                        title: 'Natural Shelf Scene',
                        summary: 'Warm natural light with soft botanical accents.',
                        styleTags: ['natural light', 'botanical', 'warm tone'],
                        negativeTags: ['overexposed', 'messy']
                      },
                      {
                        id: 'minimal',
                        title: 'Minimal Hero',
                        summary: 'Single product hero composition with strong negative space.',
                        styleTags: ['minimal', 'hero shot', 'negative space'],
                        negativeTags: ['clutter', 'blur']
                      }
                    ]
                  })
                }
              ]
            }
          }
        ]
      })
    });
  });
  await page.route('**/api/img2img', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({ images: [{ url: mockImageDataUrl, persisted: true }] })
    });
  });

  await page.goto('/artigen/ai');
  await page
    .locator('textarea.textarea')
    .fill('Create a premium skincare bottle campaign image with clean lighting.');
  await clickSend(page);
  await expect(page.locator('.deep-thinking-view')).toBeVisible();
  await expect(page.getByText('Clean Studio Product')).toBeVisible();
  if (isMobile) {
    const mobileDirections = await page.locator('.dt-tabs').evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      cardWidths: Array.from(node.querySelectorAll<HTMLElement>('.dt-tab')).map(
        (card) => card.getBoundingClientRect().width
      )
    }));
    expect(mobileDirections.scrollWidth).toBeGreaterThan(mobileDirections.clientWidth);
    expect(mobileDirections.cardWidths.every((width) => width >= 260)).toBe(true);
    await page.locator('.dt-btn').scrollIntoViewIfNeeded();
    await expect(page.locator('.dt-btn')).toBeVisible();
  }
  await saveScreenshot(page, testInfo, 'ai-mocked-deep-directions');

  await page.locator('.dt-btn').click();
  await expect(page.locator('.msg-media-img[alt="generated"]')).toHaveCount(1);
  await expect(
    page.getByRole('main').getByText('Clean Studio Product Soft shadows')
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-mocked-deep-result');
  expectCleanRuntime(issues);
});

test('AI task V2 confirms a server quote, returns an opaque asset, and opens Editor V2 by transfer', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page, 'v2');
  const issues = installRuntimeWatchers(page);
  const taskId = '11111111-1111-4111-8111-111111111111';
  const assetId = '22222222-2222-4222-8222-222222222222';
  const transferId = '33333333-3333-4333-8333-333333333333';
  let transferCreateCount = 0;
  let transferConsumeCount = 0;
  await mockAiDesignModels(page);
  await page.route('**/api/tool-tasks/quote', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ toolId: 'ai-design', operation: 'generate' });
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        quote: {
          quoteId: 'quote-ai-design-v2',
          sku: 'ai-design.generate.v1',
          credits: 10,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        }
      })
    });
  });
  await page.route(`**/api/tool-tasks/${taskId}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        task: aiDesignTask({ taskId, operation: 'generate', status: 'success', assetId, aspectRatio: '4:5' })
      })
    });
  });
  await page.route('**/api/tool-tasks', async (route) => {
    const body = String(route.request().postData() || '');
    expect(String(await route.request().headerValue('idempotency-key'))).toMatch(/^web:/);
    expect(multipartField(body, 'toolId')).toBe('ai-design');
    expect(multipartField(body, 'operation')).toBe('generate');
    expect(multipartField(body, 'quoteId')).toBe('quote-ai-design-v2');
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        task: aiDesignTask({ taskId, operation: 'generate', status: 'queued', aspectRatio: '4:5' })
      })
    });
  });
  await page.route(`**/api/assets/${assetId}`, async (route) => {
    await route.fulfill({ contentType: 'image/png', body: pngBuffer });
  });
  await page.route('**/api/editor/transfers', async (route) => {
    transferCreateCount += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ assetId });
    await route.fulfill({ status: 201, contentType: 'application/json', body: safeJson({ ok: true, transferId }) });
  });
  await page.route(`**/api/editor/transfers/${transferId}/consume`, async (route) => {
    transferConsumeCount += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({ ok: true, transfer: { transferId, assetId, assetUrl: `/api/assets/${assetId}`, mimeType: 'image/png', byteSize: pngBuffer.length } })
    });
  });

  await page.goto('/artigen/ai');
  await disableDeepThinking(page);
  await expandGenerationControlsIfNeeded(page);
  await expect(page.getByText('Product reference')).toBeVisible();
  await page.locator('.generation-chip--ratio').filter({ hasText: '4:5' }).click();
  await page.locator('textarea.textarea').fill('Create a clean premium product hero image.');
  await clickSend(page);
  await expect(page.locator('.generation-quote-dialog')).toBeVisible();
  await expect(page.locator('.generation-quote-price')).toContainText('10');
  await page.locator('.generation-quote-confirm').click();
  const result = page.locator('.msg-media-bubble').last();
  await expect(result.locator('.msg-media-img')).toHaveCount(1);
  await expect(result.locator('.msg-media-img[alt="generated"]')).toBeVisible();
  await expect.poll(async () => page.evaluate((opaqueAssetId) => {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || '';
      if (key.startsWith('artigen_history_')) keys.push(key);
    }
    const stored = window.localStorage.getItem('artigen_history_v2_user_visual') || '';
    return {
      keys: keys.sort(),
      includesAsset: stored.includes(opaqueAssetId),
      containsSensitive:
        stored.includes('Create a clean premium product hero image.') ||
        stored.includes('/api/assets/') ||
        stored.includes('http') ||
        stored.includes('data:image')
    };
  }, assetId)).toEqual({
    keys: ['artigen_history_v2_user_visual'],
    includesAsset: true,
    containsSensitive: false
  });
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-task-v2-result');
  await result.locator('.msg-image-wrap').hover();
  await expectDownloadFromButton(
    page,
    result.locator('.msg-image-action-btn').filter({ hasText: 'Download' }),
    { ext: 'png', kind: 'png' }
  );
  await clickMessageImageAction(result, 'Edit');
  await expect.poll(() => new URL(page.url()).pathname)
    .toBe('/artigen/image-workshop/image-editor');
  await expect(page.locator('.layer-list li')).toHaveCount(1);
  await expect(page.locator('.layer-list .layer-name')).toContainText('transfer-import');
  expect(transferCreateCount).toBe(1);
  expect(transferConsumeCount).toBe(1);
  const editorUrl = new URL(page.url());
  expect(editorUrl.searchParams.get('editor')).toBe('v2');
  expect(editorUrl.searchParams.has('transferId')).toBe(false);
  expectCleanRuntime(issues);
});

test('AI task V2 charges directions and generation separately and reconfirms a variation', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page, 'v2');
  const issues = installRuntimeWatchers(page);
  await mockAiDesignModels(page);
  const quoteOperations: AiDesignOperation[] = [];
  const submittedOperations: AiDesignOperation[] = [];
  const submittedQuoteIds: string[] = [];
  const idempotencyKeys: string[] = [];
  const generatedAssetIds = [
    '44444444-4444-4444-8444-444444444441',
    '44444444-4444-4444-8444-444444444442'
  ];

  await page.route('**/api/tool-tasks/quote', async (route) => {
    const request = route.request().postDataJSON() as { operation: AiDesignOperation };
    quoteOperations.push(request.operation);
    const credits = request.operation === 'directions' ? 5 : 10;
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        quote: {
          quoteId: `quote-${request.operation}-${quoteOperations.length}`,
          sku: `ai-design.${request.operation}.v1`,
          credits,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        }
      })
    });
  });
  await page.route('**/api/tool-tasks', async (route) => {
    const body = String(route.request().postData() || '');
    const operation = multipartField(body, 'operation') as AiDesignOperation;
    const taskIndex = submittedOperations.length;
    const taskId = `55555555-5555-4555-8555-55555555555${taskIndex + 1}`;
    submittedOperations.push(operation);
    submittedQuoteIds.push(multipartField(body, 'quoteId'));
    idempotencyKeys.push(String(await route.request().headerValue('idempotency-key')));
    const assetId = operation === 'generate'
      ? generatedAssetIds[submittedOperations.filter((value) => value === 'generate').length - 1]
      : undefined;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        task: aiDesignTask({
          taskId,
          operation,
          status: 'success',
          assetId,
          aspectRatio: '1:1',
          seed: 100 + taskIndex
        })
      })
    });
  });
  await page.route('**/api/assets/*', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: pngBuffer });
  });

  await page.goto('/artigen/ai');
  await enableDeepThinking(page);
  await page.locator('textarea.textarea').fill('Create a premium serum campaign with restrained studio lighting.');
  await clickSend(page);
  await expect(page.locator('.generation-quote-dialog')).toContainText('Analyze four visual directions');
  await expect(page.locator('.generation-quote-price')).toContainText('5');
  await page.locator('.generation-quote-confirm').click();
  await expect(page.locator('.deep-thinking-view')).toBeVisible();
  await expect(page.locator('.dt-tab')).toHaveCount(4);
  await expect(page.getByText('Clean Studio Product')).toBeVisible();

  await page.locator('.dt-btn').click();
  await expect(page.locator('.generation-quote-dialog')).toContainText('Generate one image');
  await expect(page.locator('.generation-quote-price')).toContainText('10');
  await page.locator('.generation-quote-confirm').click();
  await expect(page.locator('.msg-media-img[alt="generated"]')).toHaveCount(1);

  const firstResult = page.locator('.msg-media-bubble').last();
  await clickMessageImageAction(firstResult, 'Variation');
  await expect(page.locator('.generation-quote-dialog')).toContainText('Generate one image');
  await expect(page.locator('.generation-quote-price')).toContainText('10');
  await page.locator('.generation-quote-confirm').click();
  await expect(page.locator('.msg-media-img[alt="generated"]')).toHaveCount(2);
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-task-v2-deep-and-variation');

  expect(quoteOperations).toEqual(['directions', 'generate', 'generate']);
  expect(submittedOperations).toEqual(['directions', 'generate', 'generate']);
  expect(submittedQuoteIds).toEqual([
    'quote-directions-1',
    'quote-generate-2',
    'quote-generate-3'
  ]);
  expect(new Set(idempotencyKeys).size).toBe(3);
  expect(idempotencyKeys.every((key) => /^web:/.test(key))).toBe(true);
  expectCleanRuntime(issues);
});

test('AI task V2 cancels a queued generation and clears its persisted recovery record', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page, 'v2');
  const issues = installRuntimeWatchers(page);
  await mockAiDesignModels(page);
  const taskId = '66666666-6666-4666-8666-666666666666';
  let deleteCount = 0;

  await page.route('**/api/tool-tasks/quote', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        quote: {
          quoteId: 'quote-cancel-v2',
          sku: 'ai-design.generate.v1',
          credits: 10,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        }
      })
    });
  });
  await page.route('**/api/tool-tasks', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        task: aiDesignTask({ taskId, operation: 'generate', status: 'queued' })
      })
    });
  });
  await page.route(`**/api/tool-tasks/${taskId}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      deleteCount += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({
          ok: true,
          task: aiDesignTask({ taskId, operation: 'generate', status: 'cancelled' })
        })
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        task: aiDesignTask({ taskId, operation: 'generate', status: 'running' })
      })
    });
  });

  await page.goto('/artigen/ai');
  await disableDeepThinking(page);
  await page.locator('textarea.textarea').fill('Create a product image that will be cancelled.');
  await clickSend(page);
  await page.locator('.generation-quote-confirm').click();
  await expect(page.locator('.send-btn.stop')).toBeVisible();
  await page.locator('.send-btn.stop').click();
  await expect(page.locator('.error-text').filter({ hasText: 'Cancelled' })).toBeVisible();
  await expect.poll(() => deleteCount).toBe(1);
  await expect.poll(() => readPendingGenerationRecord(page)).toBeNull();
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-task-v2-cancelled');
  expectCleanRuntime(issues);
});

test('AI task V2 resumes a response-lost submission after refresh with the original idempotency key', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page, 'v2');
  await mockAiDesignModels(page);
  const taskId = '77777777-7777-4777-8777-777777777777';
  const assetId = '88888888-8888-4888-8888-888888888888';
  const originalKey = 'web:response-lost-visual-test';
  const originalQuoteId = 'quote-response-lost-v2';
  const submittedKeys: string[] = [];
  const submittedQuoteIds: string[] = [];

  await page.route('**/api/tool-tasks', async (route) => {
    const body = String(route.request().postData() || '');
    submittedKeys.push(String(await route.request().headerValue('idempotency-key')));
    submittedQuoteIds.push(multipartField(body, 'quoteId'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        task: aiDesignTask({
          taskId,
          operation: 'generate',
          status: 'success',
          assetId,
          aspectRatio: '9:16',
          seed: 2401
        })
      })
    });
  });
  await page.route(`**/api/assets/${assetId}`, async (route) => {
    await route.fulfill({ contentType: 'image/png', body: pngBuffer });
  });

  await page.goto('/artigen/ai');
  await waitForAuthenticatedSession(page);
  await expect(page.getByRole('button', { name: 'Standard generation' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect.poll(() => readPendingGenerationRecord(page)).toBeNull();
  await writePendingGenerationRecord(page, {
    version: 1,
    operation: 'generate',
    idempotencyKey: originalKey,
    quote: {
      quoteId: originalQuoteId,
      sku: 'ai-design.generate.v1',
      credits: 10,
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    },
    options: {
      prompt: 'Recover this already-committed product generation.',
      profileId: 'standard-v1',
      aspectRatio: '9:16'
    },
    files: [],
    historyId: 'history-response-lost-v2',
    userText: 'Recover this already-committed product generation.',
    refThumbs: [],
    createdAt: Date.now()
  });
  await expect.poll(() => readPendingGenerationRecord(page)).toEqual({
    idempotencyKey: originalKey,
    taskId: '',
    operation: 'generate'
  });

  const issues = installRuntimeWatchers(page, [
    /\/api\/collection\/event/,
    /\/src\/agentImg\/index\.vue/
  ]);
  await page.reload();
  await expect(page.locator('.msg-media-img[alt="generated"]')).toBeVisible();
  await expect.poll(() => readPendingGenerationRecord(page)).toBeNull();
  expect(submittedKeys).toEqual([originalKey]);
  expect(submittedQuoteIds).toEqual([originalQuoteId]);
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-task-v2-response-loss-recovery');
  expectCleanRuntime(issues);
});

test('AI chat stores a mocked network failure on the sent message', async ({ page }, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/\/api\/img2img/]);
  await page.route('**/api/img2img', async (route) => {
    await route.abort('internetdisconnected');
  });

  await page.goto('/artigen/ai');
  await disableDeepThinking(page);
  await page.locator('textarea.textarea').fill('Simulate an interrupted network generation.');
  await clickSend(page);
  await expect(page.locator('.msg-bubble .error-text')).toHaveText('Network error, please try again.');
  await expect(
    page.getByRole('main').getByText('Simulate an interrupted network generation.')
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-mocked-network-failure-main');
  if (!(await page.locator('.right-side').isVisible())) {
    await page.locator('.history-toggle-btn').click();
  }
  await expect(
    page.locator('.history-item-btn').filter({ hasText: 'Simulate an interrupted network generation.' })
  ).toContainText('Failed');
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-mocked-network-failure-history');
  expectCleanRuntime(issues, [/ERR_INTERNET_DISCONNECTED/]);
});

test('AI chat persists a deep-thinking direction failure after refresh', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/\/api\/generate/]);
  await page.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: safeJson({ error: 'SERVER_BUSY' })
    });
  });

  await page.goto('/artigen/ai');
  await enableDeepThinking(page);
  await page.locator('textarea.textarea').fill('Make a campaign image after direction analysis.');
  await clickSend(page);
  await expect(page.locator('.msg-bubble .error-text').filter({ hasText: 'Service busy' })).toBeVisible();
  await expect(
    page.getByRole('main').getByText('Make a campaign image after direction analysis.')
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-deep-direction-failure-main');

  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByRole('main').getByText('Saved generation task')).toBeVisible();
  await expect(page.locator('.msg-bubble .error-text').filter({ hasText: 'Generation failed' })).toBeVisible();
  if (!(await page.locator('.right-side').isVisible())) {
    await page.locator('.history-toggle-btn').click();
  }
  await expect(
    page.locator('.history-item-btn').filter({ hasText: 'Saved generation task' })
  ).toContainText('Failed');
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-deep-direction-failure-after-refresh');
  expectCleanRuntime(issues, [/503|Service Unavailable/]);
});

test('AI chat keeps failed/cancelled/missing-image states visually stable', async ({
  page
}, testInfo) => {
  await seedGuestHistory(page, [
    makeHistoryItem({
      id: 'visual_missing',
      timestamp: Date.now() - 3000,
      userText: 'This generated image later disappeared',
      image: '/visual-missing-chat.png',
      status: 'success'
    }),
    makeHistoryItem({
      id: 'visual_failed',
      timestamp: Date.now() - 2000,
      userText: 'A request that failed',
      image: null,
      status: 'failed'
    }),
    makeHistoryItem({
      id: 'visual_cancelled',
      timestamp: Date.now() - 1000,
      userText: 'A request that was cancelled',
      image: null,
      status: 'cancelled'
    })
  ]);
  const issues = installRuntimeWatchers(page, [/visual-missing-chat\.png/]);
  await page.goto('/artigen/ai');
  await expect(page.locator('.msg-image-missing').first()).toBeVisible();
  await expect(page.getByText('Generation failed.')).toBeVisible();
  await expect(page.locator('#gen-visual_cancelled .error-text')).toHaveText('Cancelled');
  if (!(await page.locator('.right-side').isVisible())) {
    await page.locator('.history-toggle-btn').click();
  }
  await expect(page.locator('.right-side')).toBeVisible();
  await expect(page.locator('.history-image-missing')).toBeVisible();
  const disabledActions = await page.locator('.msg-image-actions .msg-image-action-btn:disabled').count();
  expect(disabledActions).toBeGreaterThanOrEqual(3);
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'ai-chat');
  expectCleanRuntime(issues);
});

test('AI chat keeps pending and cancelled history visible after reload', async ({
  page
}, testInfo) => {
  await seedGuestHistory(page, [
    makeHistoryItem({
      id: 'pending_after_reload',
      timestamp: Date.now() - 2000,
      userText: 'A pending request that survived a reload',
      status: 'pending'
    }),
    makeHistoryItem({
      id: 'cancelled_after_reload',
      timestamp: Date.now() - 1000,
      userText: 'A cancelled request that survived a reload',
      status: 'cancelled',
      errorText: 'Cancelled.'
    })
  ]);
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/ai');
  await expect(page.getByRole('main').getByText('Saved generation task')).toHaveCount(2);
  await expect(page.locator('#gen-pending_after_reload .error-text')).toHaveText('Pending');
  await expect(page.locator('#gen-cancelled_after_reload .error-text')).toHaveText('Cancelled');
  await page.reload();
  await expect(page.getByRole('main').getByText('Saved generation task')).toHaveCount(2);
  if (!(await page.locator('.right-side').isVisible())) {
    await page.locator('.history-toggle-btn').click();
  }
  await expect(page.locator('.history-item-btn').filter({ hasText: 'Pending' })).toHaveCount(1);
  await expect(page.locator('.history-item-btn').filter({ hasText: 'Cancelled' })).toHaveCount(1);
  await saveScreenshot(page, testInfo, 'ai-pending-cancelled-after-reload');
  expectCleanRuntime(issues);
});

test('AI chat tolerates corrupt history storage and history write failures', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page);
  await page.addInitScript(() => {
    const historyKey = 'artigen_history_v2_user_visual';
    window.localStorage.setItem(historyKey, '{not valid json');
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
      if (String(key || '') === historyKey) throw new Error('SIMULATED_HISTORY_QUOTA');
      return nativeSetItem.call(this, key, value);
    };
  });
  const issues = installRuntimeWatchers(page);
  await page.route('**/api/img2img', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({ images: [{ url: mockImageDataUrl, persisted: true }] })
    });
  });
  await page.goto('/artigen/ai');
  await disableDeepThinking(page);
  await page.locator('textarea.textarea').fill('Generate even when history storage fails.');
  await clickSend(page);
  await expect(page.locator('.msg-media-img[alt="generated"]')).toHaveCount(1);
  await saveScreenshot(page, testInfo, 'ai-storage-write-failure');
  expectCleanRuntime(issues);
});

test('AI chat shows a missing placeholder for 404 images from server history', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/visual-server-missing\.png/]);
  await page.route('**/api/images/history/**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        items: [
          {
            id: 'server_missing',
            ts: Date.now() - 1000,
            prompt: 'Server-side prompt with a missing image',
            negativePrompt: 'blur',
            userText: 'Server history image disappeared',
            images: [{ url: '/visual-server-missing.png' }],
            inputImages: []
          }
        ]
      })
    });
  });
  await page.goto('/artigen/ai');
  await expect(page.getByRole('main').getByText('Server history image disappeared')).toBeVisible();
  await expect(page.locator('.msg-image-missing')).toBeVisible();
  if (!(await page.locator('.right-side').isVisible())) {
    await page.locator('.history-toggle-btn').click();
  }
  await expect(page.locator('.history-image-missing')).toBeVisible();
  await saveScreenshot(page, testInfo, 'ai-server-history-missing-image');
  expectCleanRuntime(issues);
});

test('AI chat downloads generated images through real blob exports and keeps failures in the dialog', async ({
  page
}, testInfo) => {
  await seedGuestHistory(page, [
    makeHistoryItem({
      id: 'download_success',
      userText: 'Downloadable generated image',
      image: mockImageDataUrl,
      status: 'success'
    })
  ]);
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/ai');
  const result = page.locator('#gen-download_success');
  await expect(result.locator('.msg-media-img[alt="generated"]')).toBeVisible();

  await clickMessageImageAction(result, 'Download');
  const png1024 = await expectDownloadFromButton(
    page,
    page.locator('.download-option-btn').filter({ hasText: '1024 x 1024' }),
    { ext: 'png', kind: 'png' }
  );
  expectPngLongestEdge(png1024, 1024);
  await expect(page.locator('.download-dialog')).toHaveCount(0);

  await clickMessageImageAction(result, 'Download');
  const png2k = await expectDownloadFromButton(
    page,
    page.locator('.download-option-btn').filter({ hasText: '2048 x 2048' }),
    { ext: 'png', kind: 'png' }
  );
  expectPngLongestEdge(png2k, 2048);

  await clickMessageImageAction(result, 'Download');
  await page.locator('.download-option-btn').filter({ hasText: '4096 x 4096' }).click();
  await expect(page).toHaveURL(/\/artigen\/market/);

  await page.goto('/artigen/ai');
  await expect(page.locator('#gen-download_success .msg-media-img[alt="generated"]')).toBeVisible();
  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    (window as any).__visualNativeFetch = nativeFetch;
    window.fetch = () => Promise.reject(new TypeError('VISUAL_CORS_FAIL'));
  });
  await clickMessageImageAction(page.locator('#gen-download_success'), 'Download');
  await page.locator('.download-option-btn').filter({ hasText: '1024 x 1024' }).click();
  await expect(page.locator('.download-error')).toBeVisible();
  await expect(page.locator('.download-dialog')).toBeVisible();
  await saveScreenshot(page, testInfo, 'ai-download-failure-dialog');
  await page.evaluate(() => {
    if ((window as any).__visualNativeFetch) window.fetch = (window as any).__visualNativeFetch;
  });
  await page.locator('.download-dialog-overlay').click({ position: { x: 4, y: 4 } });
  await page.evaluate(() => {
    const proto = HTMLCanvasElement.prototype as any;
    (window as any).__visualNativeToBlob = proto.toBlob;
    proto.toBlob = function patchedToBlob(callback: (blob: Blob | null) => void) {
      callback(null);
    };
  });
  await clickMessageImageAction(page.locator('#gen-download_success'), 'Download');
  await page.locator('.download-option-btn').filter({ hasText: '1024 x 1024' }).click();
  await expect(page.locator('.download-error')).toBeVisible();
  await page.evaluate(() => {
    const nativeToBlob = (window as any).__visualNativeToBlob;
    if (nativeToBlob) HTMLCanvasElement.prototype.toBlob = nativeToBlob;
  });
  expectCleanRuntime(issues);
});

test('AI chat keeps reference failures from occupying preview slots', async ({ page }, testInfo) => {
  await seedGuestHistory(page, [
    makeHistoryItem({
      id: 'reference_failure',
      userText: 'Visible image that cannot be referenced',
      image: '/visual-reference-visible.png',
      status: 'success'
    })
  ]);
  const issues = installRuntimeWatchers(page);
  await page.route('**/visual-reference-visible.png', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: pngBuffer });
  });
  await page.goto('/artigen/ai');
  await expect(page.locator('#gen-reference_failure .msg-media-img[alt="generated"]')).toBeVisible();
  await page.evaluate(() => {
    window.fetch = () => Promise.reject(new TypeError('VISUAL_REFERENCE_FETCH_FAIL'));
    const proto = HTMLCanvasElement.prototype as any;
    proto.toBlob = function patchedToBlob(callback: (blob: Blob | null) => void) {
      callback(null);
    };
  });
  await clickMessageImageAction(page.locator('#gen-reference_failure'), 'Reference');
  await expect(page.locator('.top-tip')).toBeVisible();
  await expect(page.locator('.mini-preview-item:visible')).toHaveCount(0);
  await saveScreenshot(page, testInfo, 'ai-reference-failure-no-preview');
  expectCleanRuntime(issues);
});

test('AI chat closes stale overlays while switching history and language', async ({
  page,
  isMobile
}, testInfo) => {
  await seedGuestHistory(page, [
    makeHistoryItem({
      id: 'overlay_success',
      timestamp: Date.now() - 2000,
      userText: 'History item with a downloadable image',
      image: mockImageDataUrl,
      status: 'success'
    }),
    makeHistoryItem({
      id: 'overlay_pending',
      timestamp: Date.now() - 1000,
      userText: 'History item still processing',
      status: 'pending',
      errorText: ''
    })
  ]);
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/ai');
  const result = page.locator('#gen-overlay_success');
  await expect(result.locator('.msg-media-img[alt="generated"]')).toBeVisible();
  await clickMessageImageAction(result, 'Download');
  await expect(page.locator('.download-dialog')).toBeVisible();
  if (isMobile) {
    await page.locator('.download-dialog-overlay').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('.download-dialog')).toHaveCount(0);
    if (!(await page.locator('.right-side').isVisible())) {
      await page.locator('.history-toggle-btn').click();
    }
    await page
      .locator('.history-item-btn')
      .filter({ hasText: 'Pending' })
      .click();
  } else {
    await page
      .locator('.history-item-btn')
      .filter({ hasText: 'Pending' })
      .click();
  }
  await expect(page.locator('.download-dialog')).toHaveCount(0);
  const pendingResult = page.locator('#gen-overlay_pending');
  await expect(pendingResult.locator('.error-text')).toHaveText('Pending');
  await expect(pendingResult).toBeInViewport({ ratio: 0.5 });

  const langSwitch = page.locator('.lang-switch').first();
  if (await langSwitch.isVisible()) {
    await langSwitch.click();
    await page.locator('.lang-option').filter({ hasText: 'ZH' }).click();
    await expect(pendingResult.locator('.error-text')).toHaveText('处理中');
    await expect(pendingResult).toBeInViewport({ ratio: 0.5 });
  }

  await saveScreenshot(page, testInfo, 'ai-history-language-overlay-switch');
  expectCleanRuntime(issues);
});

test('AI chat ignores stale image responses after cancellation and later requests', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/\/api\/img2img/]);
  let requestNo = 0;
  await page.route('**/api/img2img', async (route) => {
    requestNo += 1;
    const current = requestNo;
    if (current === 1) await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({ images: [{ url: mockImageDataUrl, persisted: true }] })
    }).catch(() => {});
  });

  await page.goto('/artigen/ai');
  await disableDeepThinking(page);
  await page.locator('textarea.textarea').fill('First request that will be cancelled.');
  await clickSend(page);
  await expect(page.locator('.loading-bubble')).toBeVisible();
  await page.locator('.send-btn').click();
  await expect(page.locator('.msg-bubble .error-text').filter({ hasText: 'Cancelled' })).toBeVisible();

  await page.locator('textarea.textarea').fill('Second request that should win.');
  await clickSend(page);
  await expect(page.locator('.msg-media-img[alt="generated"]')).toHaveCount(1);
  await expect(
    page.locator('.history-item-btn').filter({ hasText: 'First request that will be cancelled.' })
  ).toContainText('Cancelled');
  await expect(
    page.locator('.history-item-btn').filter({ hasText: 'Second request that should win.' })
  ).not.toContainText('Failed');
  await saveScreenshot(page, testInfo, 'ai-stale-response-after-cancel');
  expectCleanRuntime(issues, [/ERR_ABORTED|ERR_INTERNET_DISCONNECTED|499/]);
});

test('image workshop handles generated missing result without layout break', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/visual-missing-workshop\.png/]);
  await page.route('**/api/tool-tasks', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        task: workshopImageTask('success', {
          assets: [{ assetId: 'visual-missing-workshop', mimeType: 'image/png' }]
        })
      })
    });
  });
  await page.route('**/api/assets/visual-missing-workshop', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/artigen/image-workshop');
  await waitForAuthenticatedSession(page);
  await openPaidProfessionalPortrait(page);
  await page.locator('.modal-container input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await page.locator('.modal-container .generate-btn').click();
  await expect(page.locator('.result-image-missing')).toBeVisible();
  await expect(page.locator('.result-btn').first()).toBeDisabled();
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'workshop-missing-result');
  expectCleanRuntime(issues);
});

test('image workshop keeps API failures and empty results inside the result modal', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/\/api\/tool-tasks/]);
  let requestCount = 0;
  await page.route('**/api/tool-tasks', async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: safeJson({
          error: { code: 'SERVER_BUSY', messageKey: 'SERVER_BUSY', retryable: true }
        })
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({ task: workshopImageTask('success', { assets: [] }) })
    });
  });

  await page.goto('/artigen/image-workshop');
  await waitForAuthenticatedSession(page);
  await openPaidProfessionalPortrait(page);
  await page.locator('.modal-container input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await page.locator('.modal-container .generate-btn').click();
  await expect(page.locator('.result-error')).toContainText('Service busy');
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'workshop-service-failure');
  await page.locator('.result-header .close-btn').click();

  await openPaidProfessionalPortrait(page);
  await page.locator('.modal-container input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await page.locator('.modal-container .generate-btn').click();
  await expect(page.locator('.result-error')).toContainText('integrity checks');
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'workshop-empty-result-error');
  expectCleanRuntime(issues, [/503|Service Unavailable/]);
});

test('image workshop covers upload tools across service failures, empty results, and missing images', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [
    /\/api\/tool-tasks/,
    /\/api\/assets\/old-photo-missing/,
    /visual-workshop-missing/
  ]);
  let activeMode: 'busy' | 'empty' | 'missing' = 'busy';
  await page.route('**/api/tool-tasks', async (route) => {
    if (activeMode === 'busy') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: safeJson({
          ok: false,
          error: { code: 'SERVER_BUSY', messageKey: 'SERVER_BUSY', retryable: true }
        })
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        task: oldPhotoTask('success', {
          assets:
            activeMode === 'missing'
              ? [{ assetId: 'old-photo-missing', mimeType: 'image/png' }]
              : []
        })
      })
    });
  });
  await page.route('**/api/assets/old-photo-missing', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  const runTool = async (
    toolName: 'ID Photo & Professional Portrait' | 'AI Old Photo Enhancement'
  ) => {
    for (const mode of ['busy', 'empty', 'missing'] as const) {
      activeMode = mode;
      await resetWorkshopTaskRecoveryState(page);
      await page.goto('/artigen/image-workshop');
      await waitForAuthenticatedSession(page);
      if (toolName === 'ID Photo & Professional Portrait') {
        await openPaidProfessionalPortrait(page);
      } else {
        await page.getByRole('button', { name: new RegExp(toolName) }).click();
      }

      await page.locator('.modal-container input[type="file"]').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: pngBuffer
      });
      if (toolName === 'AI Old Photo Enhancement') {
        const consent = page.locator('.modal-container .upload-consent input');
        await expect(consent).toBeEnabled();
        await consent.check();
      }
      await page.locator('.modal-container .generate-btn').click();

      if (mode === 'missing') {
        await expect(page.locator('.result-image-missing')).toBeVisible();
        await expect(page.locator('.result-btn').first()).toBeDisabled();
      } else {
        await expect(page.locator('.result-error')).toBeVisible();
      }
      await saveScreenshot(page, testInfo, `workshop-${toolScreenshotName(toolName)}-${mode}`);
      // A 503 can arrive after the server has accepted the idempotency key, so
      // closing that ambiguous result intentionally starts durable cancellation.
      // This test isolates visual states instead; the next iteration navigates
      // away and clears its IndexedDB fixture before starting.
      if (mode !== 'busy') {
        await page.locator('.result-header .close-btn').click();
      }
    }
  };

  await runTool('ID Photo & Professional Portrait');
  await runTool('AI Old Photo Enhancement');
  expectCleanRuntime(issues, [/503|Service Unavailable|404|Not Found/]);
});

test('image workshop keeps ingredient-layout API errors inside its modal', async ({ page }, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/\/api\/tool-tasks/]);
  await page.route('**/api/tool-tasks', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: safeJson({
        error: { code: 'SERVER_BUSY', messageKey: 'SERVER_BUSY', retryable: true }
      })
    });
  });
  await page.goto('/artigen/image-workshop');
  await page.getByRole('button', { name: /Ingredient Label Layout/ }).click();
  await expect(page.locator('.ingredient-modal-container')).toBeVisible();
  await page
    .locator('.ingredient-modal-container textarea.product-textarea')
    .fill('Water, Glycerin, Sodium Hyaluronate');
  await generateAiIngredientLabel(page);
  await expect(page.locator('.ingredient-modal-container .error-text')).toBeVisible();
  await expect(page.locator('.ant-message')).toHaveCount(0);
  await saveScreenshot(page, testInfo, 'workshop-fda-service-failure');
  expectCleanRuntime(issues, [/503|Service Unavailable/]);
});

test('ingredient label handles invalid and empty AI responses inside the modal', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page);
  let responseNo = 0;
  await page.route('**/api/tool-tasks', async (route) => {
    responseNo += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        task: ingredientTask(
          'failed',
          responseNo === 1 ? 'OUTPUT_INVALID' : 'INGREDIENT_SOURCE_MISMATCH'
        )
      })
    });
  });

  await openIngredientLabelFromWorkshop(page);
  await page
    .locator('.ingredient-modal-container textarea.product-textarea')
    .fill('Water, Glycerin, Sodium Hyaluronate');
  await generateAiIngredientLabel(page);
  await expect(page.locator('.ingredient-modal-container .error-text')).toContainText(
    'did not pass'
  );
  await expect(page.locator('.ant-message')).toHaveCount(0);
  await saveScreenshot(page, testInfo, 'workshop-fda-invalid-json');

  await expect(page.locator('.ingredient-modal-container .ai-consent input')).toBeEnabled();
  await generateAiIngredientLabel(page);
  await expect(page.locator('.ingredient-modal-container .error-text')).toContainText(
    'introduced content'
  );
  await expect(page.locator('.ant-message')).toHaveCount(0);
  await saveScreenshot(page, testInfo, 'workshop-fda-empty-response');
  expectCleanRuntime(issues);
});

test('ingredient label downloads PNG SVG and PDF with real artifacts', async ({ page }, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page);
  let paidTaskPosts = 0;
  await page.route('**/api/tool-tasks', async (route) => {
    if (route.request().method() === 'POST') paidTaskPosts += 1;
    await route.fallback();
  });

  await openIngredientLabelFromWorkshop(page);
  await generateIngredientLabel(page);
  await expect(page.locator('.ingredient-modal-container .editorBox.generated img')).toBeVisible();
  await expectIngredientDownload(page, 'PNG', { ext: 'png', kind: 'png' });
  await expectIngredientDownload(page, 'SVG', { ext: 'svg', kind: 'svg' });
  const pdfBytes = await expectIngredientDownload(page, 'PDF', { ext: 'pdf', kind: 'pdf' });
  expect(pdfBytes.length, 'ingredient PDF is not blank').toBeGreaterThan(900);
  expect(paidTaskPosts, 'local source layout must not upload or charge').toBe(0);
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'workshop-fda-downloads-success');
  expectCleanRuntime(issues);
});

test('ingredient label keeps export failures inside its modal', async ({ page }, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page);

  await openIngredientLabelFromWorkshop(page);
  await generateIngredientLabel(page);
  await expect(page.locator('.ingredient-modal-container .editorBox.generated img')).toBeVisible();
  await page.evaluate(() => {
    const proto = HTMLCanvasElement.prototype as any;
    proto.toBlob = function patchedToBlob(callback: (blob: Blob | null) => void) {
      callback(null);
    };
  });
  await ingredientDownloadButton(page).click();
  await ingredientDownloadOption(page, 'PNG').click();
  await expect(page.locator('.ingredient-modal-container .error-text')).toContainText(
    'Export failed'
  );
  await expect(page.locator('.ingredient-modal-container')).toBeVisible();
  await saveScreenshot(page, testInfo, 'workshop-fda-export-failure');
  expectCleanRuntime(issues);
});

test('paid workshop operations submit only server-owned enums and source text through tool tasks', async ({
  page
}) => {
  await seedAuthedBrowserState(page);
  const requestBodies: string[] = [];
  await page.route('**/api/tool-tasks', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postData() || '';
    requestBodies.push(body);
    const isIngredient = body.includes('ingredient-label');
    const isBackground = body.includes('background');
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        task: isIngredient
          ? ingredientTask('success')
          : workshopImageTask('success', {
              toolId: isBackground ? 'background' : 'id-photo',
              operation: isBackground ? 'ai-scene' : 'professional-portrait',
              assets: [{ assetId: 'workshop-contract-output', mimeType: 'image/png' }]
            })
      })
    });
  });
  await page.route('**/api/assets/workshop-contract-output', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: pngBuffer });
  });

  await page.goto('/artigen/image-workshop');
  await waitForAuthenticatedSession(page);
  await openPaidProfessionalPortrait(page);
  await page.locator('.modal-container input[type="file"]').setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await page.locator('.modal-container .generate-btn').click();
  await expect(page.locator('.result-image')).toBeVisible();
  await page.locator('.result-header .close-btn').click();

  await page.getByRole('button', { name: /AI Background/ }).click();
  const backgroundDialog = page.locator('.modal-overlay .modal-container');
  await backgroundDialog.locator('input[type="file"]').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await backgroundDialog.getByRole('button', { name: /^Add$/ }).click();
  const backgroundConsent = backgroundDialog.locator('.upload-consent input');
  await expect(backgroundConsent).toBeEnabled();
  await backgroundConsent.check();
  await expect(backgroundDialog.locator('.add-btn')).toBeEnabled();
  await backgroundDialog.locator('.add-btn').click();
  await expect(page.locator('.result-image')).toBeVisible();
  await page.locator('.result-header .close-btn').click();

  await openIngredientLabelFromWorkshop(page);
  await page
    .locator('.ingredient-modal-container textarea.product-textarea')
    .fill('Water, Glycerin, Sodium Hyaluronate');
  await generateAiIngredientLabel(page);
  await expect(page.locator('.ingredient-modal-container .editorBox.generated img')).toBeVisible();

  expect(requestBodies).toHaveLength(3);
  const [portrait, background, ingredient] = requestBodies;
  expect(portrait).toContain('professional-portrait');
  expect(portrait).toContain('"style":"finance"');
  expect(background).toContain('ai-scene');
  expect(background).toContain('"presetId":"studio-white"');
  expect(background).toContain('"mode":"add"');
  expect(ingredient).toContain('ai-organize-source-text');
  expect(ingredient).toContain('"sourceText":"Water, Glycerin, Sodium Hyaluronate"');
  for (const body of requestBodies) {
    expect(body).not.toMatch(/"(?:prompt|provider|model|price|cost|sku)"\s*:/i);
  }
});

test('image workshop Chinese error copy stays contained in the result modal', async ({
  page
}, testInfo) => {
  await seedLanguage(page, 'zh');
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/\/api\/tool-tasks/]);
  await page.route('**/api/tool-tasks', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: safeJson({
        error: { code: 'SERVER_BUSY', messageKey: 'SERVER_BUSY', retryable: true }
      })
    });
  });
  await page.goto('/artigen/image-workshop');
  await waitForAuthenticatedSession(page);
  await openPaidProfessionalPortrait(page);
  await page.locator('.modal-container input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await page.locator('.modal-container .generate-btn').click();
  await expect(page.locator('.result-error')).toContainText('服务繁忙');
  await saveScreenshot(page, testInfo, 'workshop-zh-service-failure');
  expectCleanRuntime(issues, [/503|Service Unavailable/]);
});

test('image workshop ignores delayed results after closing or switching tools', async ({
  page
}, testInfo) => {
  await seedAuthedBrowserState(page);
  const issues = installRuntimeWatchers(page, [/\/api\/tool-tasks/]);
  let requestNo = 0;
  await page.route('**/api/tool-tasks', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({ task: workshopImageTask('cancelled', { errorCode: 'TASK_CANCELLED' }) })
      });
      return;
    }
    requestNo += 1;
    const current = requestNo;
    if (current === 1) await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        task: current === 1
          ? workshopImageTask('success', {
              assets: [{ assetId: 'portrait-success', mimeType: 'image/png' }]
            })
          : oldPhotoTask('success', {
              assets: [{ assetId: 'old-photo-success', mimeType: 'image/png' }]
            })
      })
    }).catch(() => {});
  });
  await page.route('**/api/assets/portrait-success', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: pngBuffer });
  });
  await page.route('**/api/assets/old-photo-success', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: pngBuffer });
  });

  await page.goto('/artigen/image-workshop');
  await waitForAuthenticatedSession(page);
  await openPaidProfessionalPortrait(page);
  await page.locator('.modal-container input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await page.locator('.modal-container .generate-btn').click();
  await expect(page.locator('.result-container')).toBeVisible();
  await page.locator('.result-header .close-btn').click();
  await expect(page.locator('.result-container')).toHaveCount(0);
  await page.waitForTimeout(900);
  await expect(page.locator('.result-container')).toHaveCount(0);

  await page.getByRole('button', { name: /AI Old Photo Enhancement/ }).click();
  await page.locator('.modal-container input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  const oldPhotoConsent = page.locator('.modal-container .upload-consent input');
  await expect(oldPhotoConsent).toBeEnabled();
  await oldPhotoConsent.check();
  await page.locator('.modal-container .generate-btn').click();
  await expect(page.locator('.result-image').last()).toBeVisible();
  await expect(page.locator('.result-title')).toContainText('AI Old Photo Enhancement');
  await saveScreenshot(page, testInfo, 'workshop-stale-request-guard');
  expectCleanRuntime(issues);
});

test('format factory reports invalid file inside the tool panel', async ({ page }, testInfo) => {
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/tools/pdf-text-word?operation=pdf2word');
  await expect(page.locator('.tool-modal-panel')).toBeVisible();
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles({
    name: 'not-a-pdf.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a pdf')
  });
  await expect(page.locator('.error-box')).toContainText('Unsupported file type.');
  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'format-factory-error');
  expectCleanRuntime(issues);
});

test('format factory modal clears the mobile header and keeps its scroll and focus contracts', async ({
  page
}) => {
  await page.goto('/artigen/tools/image-batch?operation=webp');
  const panel = page.locator('.tool-modal-panel');
  const title = page.locator('.tool-modal-name');
  await expect(panel).toBeVisible();
  await expect(title).toHaveText('WebP Converter');

  const layout = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.header');
    const modalPanel = document.querySelector<HTMLElement>('.tool-modal-panel');
    const modalTitle = document.querySelector<HTMLElement>('.tool-modal-name');
    if (!header || !modalPanel || !modalTitle) {
      throw new Error('Format Factory modal shell is missing');
    }
    const headerRect = header.getBoundingClientRect();
    const panelRect = modalPanel.getBoundingClientRect();
    const titleRect = modalTitle.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      headerBottom: headerRect.bottom,
      panelBottom: panelRect.bottom,
      titleTop: titleRect.top,
      overflowY: getComputedStyle(modalPanel).overflowY,
      scrollHeight: modalPanel.scrollHeight,
      clientHeight: modalPanel.clientHeight
    };
  });

  if (layout.viewportWidth <= 980) {
    expect(layout.titleTop, `modal title overlaps header: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(
      layout.headerBottom
    );
    expect(layout.panelBottom).toBeLessThanOrEqual(layout.viewportHeight);
    if (layout.viewportWidth <= 640) {
      expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
    } else {
      expect(layout.scrollHeight).toBeGreaterThanOrEqual(layout.clientHeight);
    }
  }
  expect(['auto', 'scroll']).toContain(layout.overflowY);

  const closeButton = page.locator('.tool-modal-close');
  await closeButton.focus();
  await page.keyboard.press('Shift+Tab');
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.tool-modal-panel'))))
    .toBe(true);
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
});

test('format factory handles damaged files, no-text PDFs, and oversized files', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const issues = installRuntimeWatchers(page);

  await page.goto('/artigen/tools/pdf-text-word?operation=pdf2word');
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles({
    name: 'blank.pdf',
    mimeType: 'application/pdf',
    buffer: makeBlankPdfBuffer()
  });
  await page.locator('.tool-card-panel').last().locator('.btn.primary').first().click();
  await expect(page.locator('.tool-modal-panel .error-box')).toContainText('OCR is not supported', {
    timeout: 45_000
  });
  await saveScreenshot(page, testInfo, 'format-no-text-pdf');

  await closeFormatModal(page);
  await page.goto('/artigen/tools/pdf-text-word?operation=pdf2word');
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles({
    name: 'damaged.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nthis is not a valid pdf body\n%%EOF')
  });
  await page.locator('.tool-card-panel').last().locator('.btn.primary').first().click();
  await expect(page.locator('.tool-modal-panel .error-box')).toBeVisible({ timeout: 45_000 });
  await saveScreenshot(page, testInfo, 'format-damaged-pdf');

  await closeFormatModal(page);
  await page.goto('/artigen/tools/image-batch?operation=webp');
  await page.locator('.tool-modal-panel input[type="file"]').evaluate((node) => {
    const input = node as HTMLInputElement;
    const file = new File(['oversized-marker'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 40 * 1024 * 1024 + 1 });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.tool-modal-panel .error-box')).toContainText('File is too large.');
  await saveScreenshot(page, testInfo, 'format-too-large-file');

  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'format-oversized-file');
  expectCleanRuntime(issues);
});

test('format factory keeps successful batch outputs when one file is damaged', async ({
  page
}, testInfo) => {
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/tools/image-batch?operation=webp');
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles([
    { name: 'fixture.png', mimeType: 'image/png', buffer: pngBuffer },
    { name: 'damaged.png', mimeType: 'image/png', buffer: Buffer.from('not a real image') }
  ]);
  const outputPanel = page.locator('.tool-card-panel').last();
  const startButton = outputPanel.locator('.btn.primary').first();
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page.locator('.tool-modal-panel .error-box')).toContainText('failed', {
    timeout: 45_000
  });
  await expect(outputPanel.locator('.meta-row').filter({ hasText: 'OUTPUT' }).first()).toBeVisible();
  const downloadButton = outputPanel.locator('.btn.ghost').filter({ hasText: 'Download' }).first();
  await expectDownloadFromButton(page, downloadButton, expectedDownloadForTool('webp'));
  await saveScreenshot(page, testInfo, 'format-batch-partial-failure');
  expectCleanRuntime(issues);
});

test('format factory downloads every batch output from Download all', async ({ page }, testInfo) => {
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/tools/image-batch?operation=webp');
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles([
    { name: 'fixture-a.png', mimeType: 'image/png', buffer: pngBuffer },
    { name: 'fixture-b.png', mimeType: 'image/png', buffer: pngBuffer }
  ]);
  const outputPanel = page.locator('.tool-card-panel').last();
  await outputPanel.locator('.btn.primary').first().click();
  await expect(page.locator('.batch-item')).toHaveCount(2, { timeout: 45_000 });
  const downloadAll = outputPanel.locator('.btn.ghost').filter({ hasText: 'Download all' }).first();
  const downloads: Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await downloadAll.click();
  await downloadAll.click({ force: true }).catch(() => {});
  await expect.poll(() => downloads.length, { timeout: 5000 }).toBe(1);
  await page.waitForTimeout(500);
  expect(downloads, 'Download all should ignore rapid duplicate clicks').toHaveLength(1);
  const zipBytes = await validateDownload(downloads[0], { ext: 'zip', kind: 'zip' });
  const entries = unzipDownload(zipBytes);
  expect(Object.keys(entries).sort()).toEqual(['fixture-a.webp', 'fixture-b.webp']);
  for (const bytes of Object.values(entries)) expectBufferSignature(Buffer.from(bytes), 'webp');
  await saveScreenshot(page, testInfo, 'format-batch-download-all');
  expectCleanRuntime(issues);
});

test('format factory exports PDF page ranges as a real ZIP and preserves image PDF order', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  const issues = installRuntimeWatchers(page);

  await page.goto('/artigen/tools/pdf-image?operation=pdf');
  await expect(page.locator('.tool-modal-name')).toHaveText('PDF to Images');
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles({
    name: 'three-pages.pdf',
    mimeType: 'application/pdf',
    buffer: makePdfBuffer(3)
  });
  await expect(page.locator('.tool-modal-panel .meta-row').first()).toContainText('3 pages');
  await page.locator('.tool-modal-panel select.control').first().selectOption('range');
  await page.locator('.tool-modal-panel input.control[type="text"]').fill('2-3');
  const pdfOutput = page.locator('.tool-card-panel').last();
  await pdfOutput.locator('.btn.primary').first().click();
  await expect(page.locator('.tool-modal-panel .batch-item')).toHaveCount(2, { timeout: 60_000 });
  const zipBytes = await expectDownloadFromButton(
    page,
    pdfOutput.locator('.btn.ghost').filter({ hasText: 'Download all' }).first(),
    { ext: 'zip', kind: 'zip' }
  );
  const zipEntries = unzipDownload(zipBytes);
  expect(Object.keys(zipEntries).sort()).toEqual([
    'three-pages_p2.png',
    'three-pages_p3.png'
  ]);
  for (const bytes of Object.values(zipEntries)) {
    expectBufferSignature(Buffer.from(bytes), 'png');
  }
  await saveScreenshot(page, testInfo, 'format-pdf-range-real-zip');

  await closeFormatModal(page);
  await page.goto('/artigen/tools/pdf-image?operation=img2pdf');
  await expect(page.locator('.tool-modal-name')).toHaveText('Images to PDF');
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles([
    { name: '03-last.png', mimeType: 'image/png', buffer: pngBuffer },
    { name: '01-first.png', mimeType: 'image/png', buffer: pngBuffer },
    { name: '02-middle.png', mimeType: 'image/png', buffer: pngBuffer }
  ]);
  const orderItems = page.locator('.tool-modal-panel .pipeline-list li');
  await expect(orderItems).toHaveCount(3);
  await orderItems.filter({ hasText: '01-first.png' }).getByRole('button', { name: 'Move up' }).click();
  await expect(page.locator('.tool-modal-panel .pipeline-list .batch-name')).toHaveText([
    '1. 01-first.png',
    '2. 03-last.png',
    '3. 02-middle.png'
  ]);
  const imagePdfOutput = page.locator('.tool-card-panel').last();
  await imagePdfOutput.locator('.btn.primary').first().click();
  await expect(imagePdfOutput.locator('.meta-row').filter({ hasText: 'OUTPUT' })).toBeVisible({
    timeout: 60_000
  });
  const imagePdfBytes = await expectDownloadFromButton(
    page,
    imagePdfOutput.locator('.btn.ghost').filter({ hasText: /^Download$/ }).first(),
    { ext: 'pdf', kind: 'pdf' }
  );
  expect(countPdfPageObjects(imagePdfBytes), 'image PDF page count').toBe(3);
  await saveScreenshot(page, testInfo, 'format-image-pdf-sorted');
  expectCleanRuntime(issues);
});

test('format factory Word conversion requires consent and fails closed without local fallback', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  const issues = installRuntimeWatchers(page);
  let convertMode: 'empty' | 'timeout' | 'unavailable' = 'empty';
  let conversionRequests = 0;
  await page.route('**/api/tools/convert/capabilities', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        capabilities: { officeToPdf: true, pdfToDocx: false, maxFileBytes: 25_165_824 }
      })
    });
  });
  await page.route('**/api/tools/convert', async (route) => {
    conversionRequests += 1;
    if (convertMode === 'empty') {
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({ ok: true, filename: 'empty.pdf', mimeType: 'application/pdf', dataBase64: '' })
      });
      return;
    }
    if (convertMode === 'timeout') {
      await route.fulfill({
        contentType: 'application/json',
        body: safeJson({ ok: false, error: 'CONVERT_TIMEOUT' })
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({ ok: false, error: 'CONVERTER_UNAVAILABLE' })
    });
  });

  for (const mode of ['empty', 'timeout', 'unavailable'] as const) {
    convertMode = mode;
    await page.goto('/artigen/tools/document-pdf?operation=word2pdf');
    await expect(page.locator('.tool-modal-name')).toHaveText('Word to PDF (Server Fidelity)');
    await page.locator('.tool-modal-panel input[type="file"]').setInputFiles({
      name: `fixture-${mode}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: makeDocxBuffer()
    });
    const outputPanel = page.locator('.tool-card-panel').last();
    const startButton = outputPanel.locator('.btn.primary').first();
    await expect(page.getByText('LibreOffice fidelity conversion is available')).toBeVisible();
    await expect(startButton).toBeDisabled();
    expect(conversionRequests, 'Word must not upload before explicit consent').toBe(
      ['empty', 'timeout', 'unavailable'].indexOf(mode)
    );
    await page.locator('.tool-modal-panel .upload-consent input').check();
    await expect(startButton).toBeEnabled();
    await startButton.click();
    const expectedError =
      mode === 'empty'
        ? 'Conversion failed'
        : mode === 'timeout'
          ? 'Conversion timed out'
          : 'LibreOffice fidelity service is unavailable';
    await expect(page.locator('.tool-modal-panel .error-box')).toContainText(expectedError, {
      timeout: 45_000
    });
    await expect(outputPanel.locator('.meta-row').filter({ hasText: 'OUTPUT' })).toHaveCount(0);
    await expect(
      outputPanel.locator('.btn.ghost').filter({ hasText: /^Download$/ }).first()
    ).toBeDisabled();
    expect(conversionRequests).toBe(
      ['empty', 'timeout', 'unavailable'].indexOf(mode) + 1
    );
    await saveScreenshot(page, testInfo, `format-word-backend-${mode}-fail-closed`);
    await closeFormatModal(page);
  }

  await page.unroute('**/api/tools/convert/capabilities');
  await page.route('**/api/tools/convert/capabilities', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: safeJson({
        ok: true,
        capabilities: { officeToPdf: false, pdfToDocx: false, maxFileBytes: 25_165_824 }
      })
    });
  });
  await page.goto('/artigen/tools/document-pdf?operation=word2pdf');
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles({
    name: 'fixture-no-capability.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: makeDocxBuffer()
  });
  await expect(page.getByText('LibreOffice fidelity conversion is currently unavailable')).toBeVisible();
  await page.locator('.tool-modal-panel .upload-consent input').check();
  await expect(page.locator('.tool-card-panel').last().locator('.btn.primary').first()).toBeDisabled();
  expect(conversionRequests, 'Capability failure must prevent upload').toBe(3);
  expectCleanRuntime(issues);
});

test('format factory runs video tools with a generated WebM fixture', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as any).__formatWorkerStats = { constructed: 0, terminated: 0 };
    window.Worker = new Proxy(NativeWorker, {
      construct(Target, args) {
        const worker = Reflect.construct(Target, args) as Worker;
        (window as any).__formatWorkerStats.constructed += 1;
        const nativeTerminate = worker.terminate.bind(worker);
        worker.terminate = () => {
          (window as any).__formatWorkerStats.terminated += 1;
          nativeTerminate();
        };
        return worker;
      }
    });
  });
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/tools/video-frame?operation=live');
  const videoFixture = await makeVideoFixture(page);
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles(videoFixture);
  await waitForVideoReady(page.locator('.tool-modal-panel .preview-video').first());
  let outputPanel = page.locator('.tool-card-panel').last();
  await outputPanel.locator('.btn.primary').first().click();
  await expect(outputPanel.locator('.meta-row').filter({ hasText: 'OUTPUT' }).first()).toBeVisible({
    timeout: 45_000
  });
  await expectDownloadFromButton(
    page,
    outputPanel.locator('.btn.ghost').filter({ hasText: 'Download' }).first(),
    expectedDownloadForTool('live')
  );
  await saveScreenshot(page, testInfo, 'format-video-live-success');
  await closeFormatModal(page);

  await page.goto('/artigen/tools/video-gif?operation=gif');
  const gifFixture = await makeVideoFixture(page);
  await page.locator('.tool-modal-panel input[type="file"]').setInputFiles(gifFixture);
  await waitForVideoReady(page.locator('.tool-modal-panel .preview-video').first());
  outputPanel = page.locator('.tool-card-panel').last();
  const startButton = outputPanel.locator('.btn.primary').first();
  await expect(startButton).toBeEnabled();
  const inputs = page.locator('.tool-modal-panel input.control[type="number"]');
  await expect(inputs).toHaveCount(5);
  await inputs.nth(0).fill('0');
  await inputs.nth(1).fill('0.8');
  await inputs.nth(2).fill('4');
  await inputs.nth(3).fill('120');
  await inputs.nth(4).fill('32');
  await expect(inputs.nth(0)).toHaveValue('0');
  await expect(inputs.nth(1)).toHaveValue('0.8');
  await expect(inputs.nth(2)).toHaveValue('4');
  await expect(inputs.nth(3)).toHaveValue('120');
  await expect(inputs.nth(4)).toHaveValue('32');
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(outputPanel.locator('.meta-row').filter({ hasText: 'OUTPUT' }).first()).toBeVisible({
    timeout: 60_000
  });
  const gifBytes = await expectDownloadFromButton(
    page,
    outputPanel.locator('.btn.ghost').filter({ hasText: 'Download' }).first(),
    expectedDownloadForTool('gif')
  );
  expect(countGifImageDescriptors(gifBytes), 'GIF has multiple image frames').toBeGreaterThanOrEqual(2);

  const workerBaseline = await page.evaluate(() => ({ ...(window as any).__formatWorkerStats }));
  await inputs.nth(1).fill('1.2');
  await inputs.nth(2).fill('24');
  await inputs.nth(3).fill('960');
  await outputPanel.locator('.btn.primary').first().click();
  await expect
    .poll(async () => page.evaluate(() => (window as any).__formatWorkerStats.constructed))
    .toBeGreaterThan(workerBaseline.constructed);
  await expect(outputPanel.locator('.btn.danger')).toBeVisible();
  await outputPanel.locator('.btn.danger').click();
  await expect(page.locator('.tool-modal-panel .error-box')).toContainText('Cancelled');
  await expect
    .poll(async () => page.evaluate(() => (window as any).__formatWorkerStats.terminated))
    .toBeGreaterThan(workerBaseline.terminated);
  await page.waitForTimeout(1200);
  await expect(outputPanel.locator('.meta-row').filter({ hasText: 'OUTPUT' })).toHaveCount(0);
  await saveScreenshot(page, testInfo, 'format-video-gif-success');
  expectCleanRuntime(issues);
});

const workshopTools = [
  {
    name: 'ID Photo & Professional Portrait',
    modal: '.standard-photo-dialog',
    title: 'ID Photo & Professional Portrait',
    kind: 'id-choice'
  },
  {
    name: 'AI Old Photo Enhancement',
    modal: '.modal-container',
    title: 'AI Old Photo Enhancement',
    kind: 'paid-upload-guest'
  },
  {
    name: 'Ingredient Label Layout',
    modal: '.ingredient-modal-container',
    title: 'Ingredient Label Layout',
    kind: 'ingredient'
  },
  {
    name: 'AI Background',
    modal: '.modal-container',
    title: 'Get Started with AI Product Photography Now',
    kind: 'background'
  },
  {
    name: 'Image Editor 2.0',
    modal: '',
    title: '',
    kind: 'route'
  }
] as const;

const formatTools = [
  { workflow: 'image-batch', id: 'webp', name: 'WebP Converter', file: 'image', run: true },
  { workflow: 'image-batch', id: 'jpeg', name: 'JPEG Compressor', file: 'image', run: true },
  { workflow: 'image-batch', id: 'resize', name: 'Resize Image', file: 'image', run: true },
  { workflow: 'image-batch', id: 'rotate', name: 'Rotate / Flip', file: 'image', run: true },
  { workflow: 'image-batch', id: 'filter', name: 'Image Filters', file: 'image', run: true },
  {
    workflow: 'privacy-redaction',
    id: 'watermark',
    name: 'Privacy Redaction',
    file: 'image',
    run: true
  },
  {
    workflow: 'video-frame',
    id: 'live',
    name: 'Video Frame Picker',
    file: 'video',
    run: false
  },
  { workflow: 'pdf-image', id: 'pdf', name: 'PDF to Images', file: 'pdf', run: true },
  {
    workflow: 'pdf-text-word',
    id: 'pdf2word',
    name: 'PDF Text to Word',
    file: 'pdf',
    run: true
  },
  {
    workflow: 'document-pdf',
    id: 'word2pdf',
    name: 'Word to PDF (Server Fidelity)',
    file: 'docx',
    run: false
  },
  { workflow: 'document-pdf', id: 'txt2pdf', name: 'TXT to PDF', file: 'txt', run: true },
  { workflow: 'pdf-image', id: 'img2pdf', name: 'Images to PDF', file: 'image', run: true },
  { workflow: 'video-gif', id: 'gif', name: 'Video to GIF', file: 'video', run: false },
  { workflow: 'favicon', id: 'ico', name: 'Favicon / ICO', file: 'image', run: true }
] as const;

const formatToolsWithMultipleInput = new Set([
  'webp',
  'jpeg',
  'resize',
  'rotate',
  'filter',
  'img2pdf'
]);

const toolScreenshotName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const filePayloadFor = (kind: (typeof formatTools)[number]['file']) => {
  if (kind === 'pdf') {
    return {
      name: 'fixture.pdf',
      mimeType: 'application/pdf',
      buffer: makePdfBuffer()
    };
  }
  if (kind === 'docx') {
    return {
      name: 'fixture.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: makeDocxBuffer()
    };
  }
  if (kind === 'txt') {
    return { name: 'fixture.txt', mimeType: 'text/plain', buffer: txtBuffer };
  }
  return { name: 'fixture.png', mimeType: 'image/png', buffer: pngBuffer };
};

const expectedDownloadForTool = (id: string) => {
  const byTool: Record<string, { ext: string; kind: string }> = {
    webp: { ext: 'webp', kind: 'webp' },
    jpeg: { ext: 'jpg', kind: 'jpg' },
    resize: { ext: 'png', kind: 'png' },
    rotate: { ext: 'png', kind: 'png' },
    filter: { ext: 'png', kind: 'png' },
    watermark: { ext: 'png', kind: 'png' },
    live: { ext: 'png', kind: 'png' },
    pdf: { ext: 'png', kind: 'png' },
    pdf2word: { ext: 'docx', kind: 'docx' },
    word2pdf: { ext: 'pdf', kind: 'pdf' },
    txt2pdf: { ext: 'pdf', kind: 'pdf' },
    img2pdf: { ext: 'pdf', kind: 'pdf' },
    gif: { ext: 'gif', kind: 'gif' },
    ico: { ext: 'ico', kind: 'ico' }
  };
  return byTool[id] || { ext: 'bin', kind: 'bin' };
};

const closeFormatModal = async (page: Page) => {
  await page.locator('.tool-modal-close').click();
  await expect(page.locator('.tool-modal-panel')).toHaveCount(0);
};

const prepareFormatTool = async (page: Page, id: string) => {
  if (id === 'resize') {
    await page.locator('.tool-modal-panel input.control[type="number"]').nth(2).fill('32');
  }
  if (id === 'pdf') {
    await page.locator('.tool-modal-panel select.control').first().selectOption('page');
  }
  if (id === 'gif') {
    const inputs = page.locator('.tool-modal-panel input.control[type="number"]');
    await inputs.nth(0).fill('0');
    await inputs.nth(1).fill('0.6');
    await inputs.nth(2).fill('4');
    await inputs.nth(3).fill('96');
    await inputs.nth(4).fill('32');
  }
};

const importEditorFixture = async (page: Page) => {
  await page.goto('/artigen/image-workshop/image-editor?editor=legacy');
  await expect(page).toHaveURL(/\/artigen\/image-workshop\/image-editor\?editor=legacy$/);
  await page.locator('input.file-input').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await expect.poll(async () => page.locator('.layer-item').count()).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.stage-image').first()).toBeVisible();
};

const importEditorV2Fixture = async (page: Page) => {
  await page.goto('/artigen/image-workshop/image-editor?editor=v2');
  await expect(page.locator('.editor-v2')).toBeVisible();
  await page.locator('.editor-v2 input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await expect(page.locator('.layer-list > li')).toHaveCount(1);
  await expect(page.getByRole('main', { name: '设计画板' })).toBeVisible();
  await expect(page.locator('canvas[aria-label="可交互图片画板"]')).toBeVisible();
};

const openEditorPanel = async (page: Page, panel: 'layers' | 'tools', isMobile: boolean) => {
  if (!isMobile) return;
  const target = panel === 'layers' ? 0 : 1;
  const panelSelector = panel === 'layers' ? '.panel.left.mobile-panel-open' : '.panel.right.mobile-panel-open';
  if ((await page.locator(panelSelector).count()) > 0) return;
  await page.locator('.topbar-btn.mobile-only').nth(target).click();
  await expect(page.locator(panelSelector)).toBeVisible();
};

const closeEditorMobilePanel = async (page: Page, panel: 'layers' | 'tools') => {
  const panelSelector =
    panel === 'layers' ? '.panel.left.mobile-panel-open' : '.panel.right.mobile-panel-open';
  const panelLocator = page.locator(panelSelector);
  if ((await panelLocator.count()) === 0) return;
  await panelLocator.locator('.panel-close').click();
  await expect(panelLocator).toHaveCount(0);
};

const closeActiveEditorTool = async (page: Page) => {
  const cancelButton = page.locator('.smart-inline .tool-btn[title="Cancel"]').last();
  if ((await cancelButton.count()) > 0 && (await cancelButton.isVisible())) {
    await cancelButton.click();
  }
};

test('stable workshop and tool routes preserve canonical legacy redirects', async ({ page }) => {
  await page.goto('/artigen/image-workshop/id-photo');
  await expect(page).toHaveURL(/\/artigen\/image-workshop\/id-photo$/);
  await expect(
    page
      .getByRole('dialog', { name: 'ID Photo & Professional Portrait' })
      .getByRole('heading', { name: 'ID Photo & Professional Portrait' })
  ).toBeVisible();

  await page.goto('/artigen/tools/image-batch');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/artigen/tools/image-batch');
  await expect.poll(() => new URL(page.url()).searchParams.get('operation')).toBe('pipeline');
  const batchDialog = page.getByRole('dialog', { name: 'Image Batch Processor' });
  await expect(
    batchDialog.getByRole('heading', { name: 'Image Batch Processor' })
  ).toBeVisible();
  await batchDialog.getByRole('button', { name: 'WebP Converter' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('operation')).toBe('webp');
  await expect(
    page
      .getByRole('dialog', { name: 'WebP Converter' })
      .getByRole('heading', { name: 'WebP Converter' })
  ).toBeVisible();

  await page.goto('/artigen/image-workshop?tool=old_photo&campaign=e2e');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/artigen/image-workshop/old-photo');
  let redirected = new URL(page.url());
  expect(redirected.searchParams.get('operation')).toBe('old_photo');
  expect(redirected.searchParams.get('campaign')).toBe('e2e');
  expect(redirected.searchParams.has('tool')).toBe(false);
  await expect(
    page
      .locator('.modal-container')
      .getByRole('heading', { name: 'AI Old Photo Enhancement' })
  ).toBeVisible();

  await page.goto('/artigen/tools?tool=resize&campaign=e2e');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/artigen/tools/image-batch');
  redirected = new URL(page.url());
  expect(redirected.searchParams.get('operation')).toBe('resize');
  expect(redirected.searchParams.get('campaign')).toBe('e2e');
  expect(redirected.searchParams.has('tool')).toBe(false);
  await expect(
    page
      .getByRole('dialog', { name: 'Resize Image' })
      .getByRole('heading', { name: 'Resize Image' })
  ).toBeVisible();

  await page.goto('/artigen/image-editor?editor=legacy');
  await expect(page).toHaveURL(/\/artigen\/image-workshop\/image-editor\?editor=legacy$/);
  await expect(page.locator('.image-editor-page')).toBeVisible();
});

test('authenticated UI state is bootstrapped from an HttpOnly Cookie session without stored bearer tokens', async ({
  page
}) => {
  await seedAuthedBrowserState(page);
  await page.goto('/artigen');
  await waitForAuthenticatedSession(page);
  const clientState = await page.evaluate(() => ({
    visibleCookies: document.cookie,
    appBearer: window.localStorage.getItem('app_auth_token'),
    legacyBearer: window.localStorage.getItem('agent_auth_token')
  }));
  expect(clientState.visibleCookies).not.toContain('auth_token=');
  expect(clientState.appBearer).toBeNull();
  expect(clientState.legacyBearer).toBeNull();
});

test('image workshop opens every tool without relying on external generation APIs', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/image-workshop');

  for (const tool of workshopTools) {
    await page.getByRole('button', { name: new RegExp(tool.name) }).click();

    if (tool.kind === 'route') {
      await expect(page).toHaveURL(/\/artigen\/image-workshop\/image-editor/);
      await expect(page.locator('.editor-v2')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await saveScreenshot(page, testInfo, `workshop-${toolScreenshotName(tool.name)}`);
      await page.goto('/artigen/image-workshop');
      continue;
    }

    await expect(page.locator(tool.modal)).toBeVisible();
    await expect(page.getByText(tool.title).first()).toBeVisible();

    if (tool.kind === 'id-choice') {
      await expect(page.getByRole('heading', { name: 'Standard ID Photo' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'AI Professional Portrait' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create locally for free' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open paid AI portrait' })).toBeVisible();
    }

    if (tool.kind === 'paid-upload-guest') {
      await page.locator(`${tool.modal} input[type="file"]`).setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: pngBuffer
      });
      await expect(page.locator(`${tool.modal} .preview-img`).first()).toBeVisible();
      await expect(page.locator(`${tool.modal} .upload-consent input`)).toBeDisabled();
      await expect(page.locator(`${tool.modal} .generate-btn`)).toBeDisabled();
      await expect(page.locator(`${tool.modal} [role="alert"]`)).toContainText(
        'Sign in before requesting a quote.'
      );
    }

    if (tool.kind === 'ingredient') {
      await page
        .locator(`${tool.modal} textarea.product-textarea`)
        .fill('Water, Glycerin, Sodium Hyaluronate, Citric Acid');
      await expect(page.locator(`${tool.modal} .local-layout-button`)).toBeEnabled();
    }

    if (tool.kind === 'background') {
      await expect(page.locator(`${tool.modal} .bg-card`).first()).toBeVisible();
      await page.locator(`${tool.modal} input[type="file"]`).setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: pngBuffer
      });
      await expect(page.locator(`${tool.modal} .editor-panel`)).toBeVisible();
      await expect(page.locator(`${tool.modal} .cutout-img`).first()).toBeVisible();
      await expect(page.locator(`${tool.modal} .add-btn`)).toBeEnabled();
    }

    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, testInfo, `workshop-${toolScreenshotName(tool.name)}`);
    if (tool.kind === 'id-choice') {
      await page.locator(`${tool.modal} button[aria-label="Close"]`).click();
    } else {
      await page.locator(`${tool.modal} .close-btn, ${tool.modal} .ingredient-close-btn`).first().click();
    }
    await expect(page.locator(tool.modal)).toHaveCount(0);
  }

  expectCleanRuntime(issues);
});

test('format factory opens every legacy operation and runs local-capable paths', async ({
  page
}, testInfo) => {
  test.setTimeout(210_000);
  const issues = installRuntimeWatchers(page);
  for (const tool of formatTools) {
    await page.goto(`/artigen/tools/${tool.workflow}?operation=${tool.id}`);
    await expect(page.locator('.tool-modal-panel')).toBeVisible();
    await expect(page.locator('.tool-modal-name')).toHaveText(tool.name);
    const fileInput = page.locator('.tool-modal-panel input[type="file"]');
    if (formatToolsWithMultipleInput.has(tool.id)) {
      await expect(fileInput).toHaveAttribute('multiple', '');
    } else {
      await expect(fileInput).not.toHaveAttribute('multiple', '');
    }
    if (tool.id === 'live') {
      await expect(page.locator('.file-drop-sub')).toContainText('max 200 MB');
      await expect(page.locator('.file-drop-sub')).toContainText('up to 10 min');
    }
    if (tool.id === 'pdf' || tool.id === 'pdf2word') {
      await expect(page.locator('.file-drop-sub')).toContainText('max 80 MB');
    }
    if (tool.id === 'word2pdf') {
      await expect(page.locator('.file-drop-sub')).toContainText('max 40 MB');
    }

    const outputPanel = page.locator('.tool-card-panel').last();
    const startButton = outputPanel.locator('.btn.primary').first();
    if (tool.file === 'video') {
      await expect(fileInput).toHaveAttribute('accept', 'video/*');
      await expect(startButton).toBeDisabled();
    } else {
      await fileInput.setInputFiles(filePayloadFor(tool.file));
      await expect(page.locator('.tool-modal-panel .meta-row').first()).toBeVisible();
      await prepareFormatTool(page, tool.id);
      if (tool.id === 'word2pdf') {
        await expect(
          page.getByText('LibreOffice fidelity conversion is currently unavailable')
        ).toBeVisible();
        await page.locator('.tool-modal-panel .upload-consent input').check();
        await expect(startButton).toBeDisabled();
      } else {
        await expect(startButton).toBeEnabled();
      }
    }

    if (tool.run) {
      await startButton.click();
      await expect(startButton).toBeEnabled({ timeout: 45_000 });
      await expect(page.locator('.tool-modal-panel .progress-box')).toHaveCount(0, {
        timeout: 45_000
      });
      await expect(outputPanel.locator('.meta-row').filter({ hasText: 'OUTPUT' }).first()).toBeVisible({
        timeout: 45_000
      });
      await expect(page.locator('.tool-modal-panel .error-box')).toHaveCount(0);
      const downloadButton = outputPanel.locator('.btn.ghost').filter({ hasText: 'Download' }).first();
      await expect(downloadButton).toBeEnabled();
      const bytes = await expectDownloadFromButton(
        page,
        downloadButton,
        expectedDownloadForTool(tool.id)
      );
      if (tool.id === 'txt2pdf' || tool.id === 'img2pdf') {
        expect(countPdfPageObjects(bytes), `${tool.id} PDF page count`).toBe(1);
      }
      await outputPanel.scrollIntoViewIfNeeded();
    }

    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, testInfo, `format-tool-${toolScreenshotName(tool.name)}`);
    await closeFormatModal(page);
  }

  expectCleanRuntime(issues);
});

test('image editor V2 imports exactly one ordinary layer and exposes artboard, local, and export contracts', async ({
  page,
  isMobile
}, testInfo) => {
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/image-workshop/image-editor?editor=v2');
  await expect(page.locator('.editor-v2')).toBeVisible();
  await expect(page.getByText('每次导入只创建一个普通图层，不会自动拆分或破坏原图。')).toBeVisible();

  await page.locator('.editor-v2 input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await expect(page.locator('.layer-list > li')).toHaveCount(1);
  await expect(page.locator('.layer-list .layer-name')).toContainText('fixture');
  await expect(page.locator('canvas[aria-label="可交互图片画板"]')).toBeVisible();

  if (isMobile) {
    await page.getByRole('button', { name: '打开属性面板' }).click();
    await expect(page.locator('.right-panel.mobile-open')).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: '画板', exact: true })).toBeVisible();
  await expect(page.getByLabel('宽度 px')).toHaveValue('1200');
  await expect(page.getByLabel('高度 px')).toHaveValue('1200');
  await expect(page.getByRole('heading', { name: '本地实验工具' })).toBeVisible();
  await expect(page.getByRole('button', { name: '非破坏裁剪' })).toBeVisible();
  await expect(page.getByRole('button', { name: '多边形抠图' })).toBeVisible();
  await expect(page.getByRole('button', { name: '实验去背景' })).toBeVisible();
  await expect(page.getByRole('button', { name: '清晰度增强' })).toBeVisible();

  if (isMobile) {
    await page.locator('.right-panel.mobile-open').getByRole('button', { name: '关闭面板' }).click();
  }
  const exportButton = page.getByRole('button', { name: '导出', exact: true });
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  const exportDialog = page.getByRole('dialog', { name: '导出设计' });
  await expect(exportDialog).toBeVisible();
  await expect(exportDialog.getByLabel('格式')).toHaveValue('png');
  await expect(exportDialog.getByLabel('尺寸')).toHaveValue('1');
  await expect(exportDialog.getByLabel('范围')).toHaveValue('artboard');
  const exportedPng = await expectDownloadFromButton(
    page,
    exportDialog.getByRole('button', { name: '下载图片' }),
    { ext: 'png', kind: 'png' }
  );
  const exportedStats = getPngVisualStats(exportedPng);
  expect({ width: exportedStats.width, height: exportedStats.height }).toEqual({
    width: 1200,
    height: 1200
  });
  await expect(exportDialog).toHaveCount(0);

  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, isMobile ? 'image-editor-v2-contract-mobile' : 'image-editor-v2-contract');
  expectCleanRuntime(issues);
});

test('image editor V2 mobile tool modes collapse panels and keep the canvas controls reachable', async ({
  page,
  isMobile
}, testInfo) => {
  test.skip(!isMobile, 'Mobile sheet semantics only apply below the editor breakpoint.');
  const issues = installRuntimeWatchers(page);
  await importEditorV2Fixture(page);

  const propertiesButton = page.getByRole('button', { name: '打开属性面板' });
  await propertiesButton.click();
  const propertiesPanel = page.locator('.right-panel.mobile-open');
  await expect(propertiesPanel).toBeVisible();
  await propertiesPanel.getByRole('button', { name: '非破坏裁剪' }).click();
  await expect(page.locator('.right-panel')).not.toHaveClass(/mobile-open/);
  await expect(page.locator('.mobile-tool-strip')).toBeVisible();
  await expect(page.locator('canvas[aria-label="可交互图片画板"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出', exact: true })).toBeVisible();
  await page.locator('.mobile-tool-strip').getByRole('button', { name: '完成' }).click();

  await propertiesButton.click();
  await expect(propertiesPanel).toBeVisible();
  await propertiesPanel.getByRole('button', { name: '多边形抠图' }).click();
  await expect(page.locator('.right-panel')).not.toHaveClass(/mobile-open/);
  const cutoutDialog = page.getByRole('dialog', { name: '手动多边形抠图' });
  await expect(cutoutDialog).toBeVisible();
  await expect(cutoutDialog.getByLabel('多边形锚点画布')).toBeVisible();
  await cutoutDialog.getByRole('button', { name: '关闭抠图' }).click();
  await expect(cutoutDialog).toHaveCount(0);

  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, 'image-editor-v2-mobile-tool-strip');
  expectCleanRuntime(issues);
});

test('legacy image editor import, bad file notice, and mobile panels remain available behind the rollback flag', async ({
  page,
  isMobile
}, testInfo) => {
  const issues = installRuntimeWatchers(page);
  await page.goto('/artigen/image-workshop/image-editor?editor=legacy');
  await page.locator('input.file-input').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: pngBuffer
  });
  await expect.poll(async () => page.locator('.layer-item').count()).toBeGreaterThanOrEqual(1);
  const initialLayerCount = await page.locator('.layer-item').count();
  await expect(page.locator('.stage-image').first()).toBeVisible();
  await page.locator('input.file-input').setInputFiles({
    name: 'broken.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image')
  });
  await expect(page.locator('.editor-tip')).toBeVisible();
  await expect(page.locator('.layer-item')).toHaveCount(initialLayerCount);

  if (isMobile) {
    for (let i = 0; i < 3; i += 1) {
      await openEditorPanel(page, 'tools', true);
      await closeEditorMobilePanel(page, 'tools');
      await openEditorPanel(page, 'layers', true);
      await closeEditorMobilePanel(page, 'layers');
    }
    await openEditorPanel(page, 'tools', true);
    const panelTop = await page.locator('.panel.right.mobile-panel-open').evaluate((panel) => {
      const p = panel.getBoundingClientRect();
      const topbar = document.querySelector('.editor-topbar')?.getBoundingClientRect();
      return { panelTop: p.top, topbarBottom: topbar?.bottom || 0 };
    });
    expect(panelTop.panelTop).toBeGreaterThanOrEqual(panelTop.topbarBottom - 2);
    await closeEditorMobilePanel(page, 'tools');
    await expect(page.locator('.topbar-right .topbar-btn[title="Export"]')).toBeEnabled();
    await expect(page.locator('.topbar-right .topbar-btn[title="Import"]')).toBeEnabled();
  }

  await assertNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, isMobile ? 'image-editor-mobile' : 'image-editor-desktop');
  expectCleanRuntime(issues, [/ERR_TIMED_OUT/]);
});

test('legacy image editor smart tool modes remain stable behind the rollback flag', async ({
  page,
  isMobile
}, testInfo) => {
  const issues = installRuntimeWatchers(page);
  await importEditorFixture(page);
  await openEditorPanel(page, 'tools', isMobile);

  await page.locator('.smart-btn[title="Crop"]').click();
  await expect(page.locator('.crop-overlay')).toBeVisible();
  await saveScreenshot(page, testInfo, 'image-editor-crop-mode');
  await closeActiveEditorTool(page);

  await page.locator('.smart-btn[title="Rotate"]').click();
  await expect(page.locator('.straighten-panel')).toBeVisible();
  await saveScreenshot(page, testInfo, 'image-editor-rotate-mode');
  await closeActiveEditorTool(page);

  await page.locator('.smart-btn[title="Cut out"]').click();
  await expect(page.locator('.straighten-panel')).toBeVisible();
  await page.locator('.straighten-panel .tool-btn').filter({ hasText: 'Auto' }).click();
  await saveScreenshot(page, testInfo, 'image-editor-cutout-mode');
  await closeActiveEditorTool(page);

  await page.locator('.smart-btn[title="Restore"]').click();
  await expect(page.locator('.straighten-panel')).toContainText('Strength', { timeout: 15_000 });
  await saveScreenshot(page, testInfo, 'image-editor-restore-mode');
  await closeActiveEditorTool(page);

  const upscale = page.locator('.smart-btn[title="2× Upscale"]');
  await upscale.click();
  await expect(upscale).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator('.stage-image').first()).toBeVisible();
  await saveScreenshot(page, testInfo, 'image-editor-upscale-mode');
  expectCleanRuntime(issues);
});

test('legacy image editor export and failure notices remain stable behind the rollback flag', async ({
  page,
  isMobile
}, testInfo) => {
  const issues = installRuntimeWatchers(page);
  await importEditorFixture(page);
  const exportButton = page.locator('.topbar-right .topbar-btn[title="Export"]');
  await expectDownloadFromButton(page, exportButton, { ext: 'png', kind: 'png' });
  await saveScreenshot(page, testInfo, 'image-editor-export-success');

  await openEditorPanel(page, 'layers', isMobile);
  const layerCount = await page.locator('.layer-item').count();
  for (let i = 0; i < layerCount; i += 1) {
    await page.locator('.layer-item').nth(i).locator('.icon-btn').click();
    await page.locator('.layer-menu-float .menu-item').filter({ hasText: 'Hide layer' }).click();
  }
  if (isMobile && (await page.locator('.mobile-panel-mask').isVisible())) {
    await closeEditorMobilePanel(page, 'layers');
    await expect(exportButton).toBeEnabled();
  }
  await exportButton.click();
  await expect(page.locator('.editor-tip')).toContainText('No visible image');
  await saveScreenshot(page, testInfo, 'image-editor-export-no-visible');

  await importEditorFixture(page);
  await page.evaluate(() => {
    const proto = HTMLCanvasElement.prototype as any;
    proto.toBlob = function patchedToBlob(callback: (blob: Blob | null) => void) {
      callback(null);
    };
  });
  await exportButton.click();
  await expect(page.locator('.editor-tip')).toContainText('Export failed');
  await saveScreenshot(page, testInfo, 'image-editor-export-toblob-failure');
  expectCleanRuntime(issues);
});
