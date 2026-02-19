export const clampNumber = (v: number, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

export const normalizeCropRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const ax = Number.isFinite(a.x) ? a.x : 0;
  const ay = Number.isFinite(a.y) ? a.y : 0;
  const bx = Number.isFinite(b.x) ? b.x : 0;
  const by = Number.isFinite(b.y) ? b.y : 0;
  const left = Math.min(ax, bx);
  const right = Math.max(ax, bx);
  const top = Math.min(ay, by);
  const bottom = Math.max(ay, by);
  return { x: left, y: top, w: right - left, h: bottom - top };
};

export const clampCropRect = (
  r: { x: number; y: number; w: number; h: number },
  bounds: { w: number; h: number },
  minSize = 12
) => {
  const bw = Math.max(1, Number(bounds.w) || 1);
  const bh = Math.max(1, Number(bounds.h) || 1);
  const rw = Number.isFinite(r.w) ? r.w : 0;
  const rh = Number.isFinite(r.h) ? r.h : 0;
  const rx = Number.isFinite(r.x) ? r.x : 0;
  const ry = Number.isFinite(r.y) ? r.y : 0;
  const w = Math.min(bw, Math.max(minSize, rw));
  const h = Math.min(bh, Math.max(minSize, rh));
  const maxX = Math.max(0, bw - w);
  const maxY = Math.max(0, bh - h);
  const x = clampNumber(rx, 0, maxX);
  const y = clampNumber(ry, 0, maxY);
  return { x, y, w, h };
};

export const isPointInRect = (
  p: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number }
) => {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
};

export const rotatedRectWithMaxArea = (w: number, h: number, angleRad: number) => {
  const ww = Math.max(0, Number.isFinite(w) ? w : 0);
  const hh = Math.max(0, Number.isFinite(h) ? h : 0);
  if (!ww || !hh) return { w: 0, h: 0 };
  const a = Math.abs((Number.isFinite(angleRad) ? angleRad : 0) % (Math.PI * 2) || 0);
  const sinA = Math.abs(Math.sin(a));
  const cosA = Math.abs(Math.cos(a));
  if (sinA < 1e-7 || cosA < 1e-7) return { w: ww, h: hh };

  const widthIsLonger = ww >= hh;
  const sideLong = widthIsLonger ? ww : hh;
  const sideShort = widthIsLonger ? hh : ww;

  let wr = 0;
  let hr = 0;
  if (sideShort <= 2 * sinA * cosA * sideLong) {
    const x = 0.5 * sideShort;
    if (widthIsLonger) {
      wr = x / sinA;
      hr = x / cosA;
    } else {
      wr = x / cosA;
      hr = x / sinA;
    }
  } else {
    const cos2A = cosA * cosA - sinA * sinA;
    if (Math.abs(cos2A) < 1e-7) return { w: ww, h: hh };
    wr = (ww * cosA - hh * sinA) / cos2A;
    hr = (hh * cosA - ww * sinA) / cos2A;
  }

  return { w: Math.max(1, Math.floor(wr)), h: Math.max(1, Math.floor(hr)) };
};

export const restoreImageAlgorithm1 = (
  data: { width: number; height: number; data: Uint8ClampedArray },
  opts?: { strength?: number; denoise?: number }
) => {
  const w = Math.max(0, Math.trunc(Number(data.width) || 0));
  const h = Math.max(0, Math.trunc(Number(data.height) || 0));
  const src = data.data;
  if (!w || !h || !src || src.length < w * h * 4) {
    return { width: w, height: h, data: new Uint8ClampedArray(src || []) };
  }
  const strength = clampNumber(opts?.strength ?? 0.6, 0, 1);
  const denoise = clampNumber(opts?.denoise ?? 0.15, 0, 1);
  if (strength === 0 && denoise === 0) {
    return { width: w, height: h, data: new Uint8ClampedArray(src) };
  }
  const out = new Uint8ClampedArray(src.length);
  const tmp = denoise > 0.0001 ? new Uint8ClampedArray(src.length) : null;
  const w4 = w * 4;

  const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

  if (tmp) {
    const sigmaR = 10 + denoise * 60;
    const inv2SigmaR2 = 1 / (2 * sigmaR * sigmaR);
    const sw0 = 1;
    const sw1 = 2;
    const sw2 = 4;

    for (let y = 0; y < h; y++) {
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y;
      const y2 = y < h - 1 ? y + 1 : h - 1;
      const row0 = y0 * w4;
      const row1 = y1 * w4;
      const row2 = y2 * w4;

      for (let x = 0; x < w; x++) {
        const x0 = x > 0 ? x - 1 : 0;
        const x1 = x;
        const x2 = x < w - 1 ? x + 1 : w - 1;
        const idx = row1 + (x << 2);

        const cr = src[idx];
        const cg = src[idx + 1];
        const cb = src[idx + 2];
        const ca = src[idx + 3];
        const cy = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;

        let sumW = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;

        const add = (iy: number, ix: number, sw: number) => {
          const p = iy + (ix << 2);
          const r = src[p];
          const g = src[p + 1];
          const b = src[p + 2];
          const yv = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const dy = yv - cy;
          const rw = Math.exp(-(dy * dy) * inv2SigmaR2);
          const wgt = sw * rw;
          sumW += wgt;
          sumR += r * wgt;
          sumG += g * wgt;
          sumB += b * wgt;
        };

        add(row0, x0, sw0);
        add(row0, x1, sw1);
        add(row0, x2, sw0);
        add(row1, x0, sw1);
        add(row1, x1, sw2);
        add(row1, x2, sw1);
        add(row2, x0, sw0);
        add(row2, x1, sw1);
        add(row2, x2, sw0);

        const invW = sumW ? 1 / sumW : 1;
        tmp[idx] = clamp255((sumR * invW + 0.5) | 0);
        tmp[idx + 1] = clamp255((sumG * invW + 0.5) | 0);
        tmp[idx + 2] = clamp255((sumB * invW + 0.5) | 0);
        tmp[idx + 3] = ca;
      }
    }
  }

  const base = tmp || src;
  const s = strength;
  const softDenoiseMix = tmp ? 0.6 + 0.4 * denoise : 0;

  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y;
    const y2 = y < h - 1 ? y + 1 : h - 1;
    const row0 = y0 * w4;
    const row1 = y1 * w4;
    const row2 = y2 * w4;

    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x;
      const x2 = x < w - 1 ? x + 1 : w - 1;
      const idx = row1 + (x << 2);

      const p00 = row0 + (x0 << 2);
      const p01 = row0 + (x1 << 2);
      const p02 = row0 + (x2 << 2);
      const p10 = row1 + (x0 << 2);
      const p11 = row1 + (x1 << 2);
      const p12 = row1 + (x2 << 2);
      const p20 = row2 + (x0 << 2);
      const p21 = row2 + (x1 << 2);
      const p22 = row2 + (x2 << 2);

      const blurR =
        (base[p00] +
          (base[p01] << 1) +
          base[p02] +
          (base[p10] << 1) +
          (base[p11] << 2) +
          (base[p12] << 1) +
          base[p20] +
          (base[p21] << 1) +
          base[p22]) /
        16;
      const blurG =
        (base[p00 + 1] +
          (base[p01 + 1] << 1) +
          base[p02 + 1] +
          (base[p10 + 1] << 1) +
          (base[p11 + 1] << 2) +
          (base[p12 + 1] << 1) +
          base[p20 + 1] +
          (base[p21 + 1] << 1) +
          base[p22 + 1]) /
        16;
      const blurB =
        (base[p00 + 2] +
          (base[p01 + 2] << 1) +
          base[p02 + 2] +
          (base[p10 + 2] << 1) +
          (base[p11 + 2] << 2) +
          (base[p12 + 2] << 1) +
          base[p20 + 2] +
          (base[p21 + 2] << 1) +
          base[p22 + 2]) /
        16;

      const r = base[idx];
      const g = base[idx + 1];
      const b = base[idx + 2];

      let sr = r + (r - blurR) * s;
      let sg = g + (g - blurG) * s;
      let sb = b + (b - blurB) * s;

      if (tmp) {
        const or = src[idx];
        const og = src[idx + 1];
        const ob = src[idx + 2];
        sr = or * (1 - softDenoiseMix) + sr * softDenoiseMix;
        sg = og * (1 - softDenoiseMix) + sg * softDenoiseMix;
        sb = ob * (1 - softDenoiseMix) + sb * softDenoiseMix;
      }

      out[idx] = clamp255((sr + 0.5) | 0);
      out[idx + 1] = clamp255((sg + 0.5) | 0);
      out[idx + 2] = clamp255((sb + 0.5) | 0);
      out[idx + 3] = base[idx + 3];
    }
  }

  return { width: w, height: h, data: out };
};

const buildBackgroundMaskAlgorithm1 = (
  data: { width: number; height: number; data: Uint8ClampedArray },
  opts?: { threshold?: number }
) => {
  const w = Math.max(0, Math.trunc(Number(data.width) || 0));
  const h = Math.max(0, Math.trunc(Number(data.height) || 0));
  const src = data.data;
  const mask = new Uint8Array(Math.max(0, w * h));
  if (!w || !h || !src || src.length < w * h * 4) {
    return { width: w, height: h, mask };
  }

  const threshold = clampNumber(opts?.threshold ?? 0.35, 0, 1);
  const blockSize = Math.max(1, Math.min(16, Math.floor(Math.min(w, h) * 0.04)));
  const step = Math.max(2, Math.floor(Math.min(w, h) * 0.12));
  const samples: number[][] = [];
  const fgSamples: number[][] = [];

  const sampleBlock = (sx: number, sy: number) => {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;
    const startX = Math.max(0, Math.min(w - 1, sx));
    const startY = Math.max(0, Math.min(h - 1, sy));
    const ex = Math.min(w, startX + blockSize);
    const ey = Math.min(h, startY + blockSize);
    for (let y = startY; y < ey; y++) {
      let row = (y * w + startX) * 4;
      for (let x = startX; x < ex; x++) {
        sumR += src[row];
        sumG += src[row + 1];
        sumB += src[row + 2];
        count += 1;
        row += 4;
      }
    }
    if (!count) return [0, 0, 0];
    return [sumR / count, sumG / count, sumB / count];
  };

  const pushSample = (sx: number, sy: number) => {
    samples.push(sampleBlock(sx, sy));
  };

  pushSample(0, 0);
  pushSample(w - blockSize, 0);
  pushSample(0, h - blockSize);
  pushSample(w - blockSize, h - blockSize);
  for (let x = 0; x < w; x += step) {
    pushSample(x, 0);
    pushSample(x, h - blockSize);
  }
  for (let y = 0; y < h; y += step) {
    pushSample(0, y);
    pushSample(w - blockSize, y);
  }

  const buildReps = (list: number[], sep: number, maxCount: number) => {
    const reps: number[][] = [];
    const sep2 = sep * sep;
    for (let i = 0; i < list.length; i += 3) {
      const s = [list[i], list[i + 1], list[i + 2]];
      if (!reps.length) {
        reps.push(s);
        continue;
      }
      let best = Number.POSITIVE_INFINITY;
      for (const c of reps) {
        const d2 = dist2(s, c);
        if (d2 < best) best = d2;
      }
      if (best > sep2 * 3 && reps.length < maxCount) reps.push(s);
    }
    return reps;
  };
  const buildSigma = (list: number[], reps: number[][]) => {
    if (!list.length || !reps.length) return 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < list.length; i += 3) {
      const s = [list[i], list[i + 1], list[i + 2]];
      let best = Number.POSITIVE_INFINITY;
      for (const c of reps) {
        const d2 = dist2(s, c);
        if (d2 < best) best = d2;
      }
      sum += best;
      count += 1;
    }
    return Math.sqrt(sum / Math.max(1, count));
  };
  const toFlatList = (list: number[][]) => {
    const out: number[] = [];
    for (const s of list) {
      out.push(s[0], s[1], s[2]);
    }
    return out;
  };
  const sep = 18 + 100 * threshold;
  const dist2 = (a: number[], b: number[]) => {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    const rbar = (a[0] + b[0]) * 0.5;
    return (2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db;
  };
  const reps = buildReps(toFlatList(samples), sep, 12);
  const fgStartX = Math.round(w * 0.18);
  const fgEndX = Math.round(w * 0.82);
  const fgStartY = Math.round(h * 0.18);
  const fgEndY = Math.round(h * 0.82);
  const fgStep = Math.max(2, Math.floor(Math.min(w, h) * 0.08));
  const maxBgProbe = 30 + 260 * threshold;
  for (let y = fgStartY; y < fgEndY; y += fgStep) {
    for (let x = fgStartX; x < fgEndX; x += fgStep) {
      const s = sampleBlock(x, y);
      let best = Number.POSITIVE_INFINITY;
      for (const c of reps) {
        const d2 = dist2(s, c);
        if (d2 < best) best = d2;
      }
      if (Math.sqrt(best) >= maxBgProbe) fgSamples.push(s);
    }
  }
  if (!fgSamples.length && w > 2 && h > 2) {
    fgSamples.push(sampleBlock(Math.floor(w / 2), Math.floor(h / 2)));
  }
  const fgReps = buildReps(toFlatList(fgSamples), 16 + 80 * threshold, 8);

  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  const sampleCount = Math.max(1, samples.length);
  for (const s of samples) {
    meanR += s[0];
    meanG += s[1];
    meanB += s[2];
  }
  meanR /= sampleCount;
  meanG /= sampleCount;
  meanB /= sampleCount;
  let varSum = 0;
  for (const s of samples) varSum += dist2(s, [meanR, meanG, meanB]);
  const sigma = Math.sqrt(varSum / sampleCount);
  const sigmaBg = buildSigma(toFlatList(samples), reps);
  const sigmaFg = buildSigma(toFlatList(fgSamples), fgReps);
  const maxDist = 40 + 360 * threshold + Math.min(260, sigma * 1.6);
  const maxBgDist = 30 + 300 * threshold + Math.min(240, sigmaBg * 1.55);
  const maxFgDist = 42 + 260 * threshold + Math.min(220, sigmaFg * 1.4);
  const maxDist2 = maxDist * maxDist;
  const margin = 18 + 60 * threshold;
  const borderMean = [meanR, meanG, meanB];
  let bgCenter = borderMean.slice(0);
  let fgCenter = fgSamples.length ? fgSamples[0] : [meanR, meanG, meanB];
  const kmStep = Math.max(2, Math.floor(Math.min(w, h) / 64));
  const kmSamples: number[] = [];
  for (let y = 0; y < h; y += kmStep) {
    for (let x = 0; x < w; x += kmStep) {
      const s = sampleBlock(x, y);
      kmSamples.push(s[0], s[1], s[2]);
    }
  }
  for (let it = 0; it < 5; it++) {
    let bR = 0;
    let bG = 0;
    let bB = 0;
    let fR = 0;
    let fG = 0;
    let fB = 0;
    let bc = 0;
    let fc = 0;
    for (let i = 0; i < kmSamples.length; i += 3) {
      const s = [kmSamples[i], kmSamples[i + 1], kmSamples[i + 2]];
      const dBg = dist2(s, bgCenter);
      const dFg = dist2(s, fgCenter);
      if (dBg <= dFg) {
        bR += s[0];
        bG += s[1];
        bB += s[2];
        bc += 1;
      } else {
        fR += s[0];
        fG += s[1];
        fB += s[2];
        fc += 1;
      }
    }
    if (bc) bgCenter = [bR / bc, bG / bc, bB / bc];
    if (fc) fgCenter = [fR / fc, fG / fc, fB / fc];
  }
  const dBgBorder = dist2(bgCenter, borderMean);
  const dFgBorder = dist2(fgCenter, borderMean);
  if (dFgBorder < dBgBorder) {
    const tmp = bgCenter;
    bgCenter = fgCenter;
    fgCenter = tmp;
  }
  const centerRatio = 1.04 + threshold * 0.45;

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = 0.2126 * src[p] + 0.7152 * src[p + 1] + 0.0722 * src[p + 2];
  }
  const edge = new Float32Array(w * h);
  let edgeMax = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const a00 = gray[i - w - 1];
      const a01 = gray[i - w];
      const a02 = gray[i - w + 1];
      const a10 = gray[i - 1];
      const a12 = gray[i + 1];
      const a20 = gray[i + w - 1];
      const a21 = gray[i + w];
      const a22 = gray[i + w + 1];
      const gx = -a00 - 2 * a10 - a20 + a02 + 2 * a12 + a22;
      const gy = -a00 - 2 * a01 - a02 + a20 + 2 * a21 + a22;
      const mag = Math.hypot(gx, gy);
      edge[i] = mag;
      if (mag > edgeMax) edgeMax = mag;
    }
  }

  const isBg = (i4: number) => {
    const a = src[i4 + 3];
    if (a <= 12) return true;
    const r = src[i4];
    const g = src[i4 + 1];
    const b = src[i4 + 2];
    const idx = i4 >> 2;
    const edgeN = edgeMax > 0 ? Math.min(1, edge[idx] / edgeMax) : 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < reps.length; i++) {
      const c = reps[i];
      const dr = r - c[0];
      const dg = g - c[1];
      const db = b - c[2];
      const d2 = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d2 < best) best = d2;
    }
    if (best > maxDist2) return false;
    if (!fgReps.length) return true;
    let bestFg = Number.POSITIVE_INFINITY;
    for (let i = 0; i < fgReps.length; i++) {
      const c = fgReps[i];
      const dr = r - c[0];
      const dg = g - c[1];
      const db = b - c[2];
      const d2 = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d2 < bestFg) bestFg = d2;
    }
    const dBg = Math.sqrt(best);
    const dFg = Math.sqrt(bestFg);
    const marginEdge = margin * (1 + edgeN * 0.8);
    if (dFg <= maxFgDist && dFg + marginEdge < dBg) return false;
    const dCb = Math.sqrt(dist2([r, g, b], bgCenter));
    const dCf = Math.sqrt(dist2([r, g, b], fgCenter));
    if (dCb <= dCf * centerRatio && dBg <= maxBgDist) return true;
    if (dBg <= maxBgDist && dCb <= dCf * (centerRatio + 0.1)) return true;
    return false;
  };

  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(w * h);
  let sp = 0;
  for (let x = 0; x < w; x++) {
    const top = x;
    const bottom = (h - 1) * w + x;
    stack[sp++] = top;
    if (h > 1) stack[sp++] = bottom;
  }
  for (let y = 1; y < h - 1; y++) {
    const left = y * w;
    const right = y * w + (w - 1);
    stack[sp++] = left;
    if (w > 1) stack[sp++] = right;
  }

  while (sp > 0) {
    const idx = stack[--sp];
    if (idx < 0 || idx >= mask.length) continue;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i4 = idx * 4;
    if (!isBg(i4)) continue;
    mask[idx] = 1;
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) stack[sp++] = idx - 1;
    if (x < w - 1) stack[sp++] = idx + 1;
    if (y > 0) stack[sp++] = idx - w;
    if (y < h - 1) stack[sp++] = idx + w;
  }

  const refineMask = (srcMask: Uint8Array, mw: number, mh: number) => {
    const len = mw * mh;
    if (!len) return srcMask;
    const src = srcMask;
    const tmp = new Uint8Array(len);
    const tmp2 = new Uint8Array(len);
    const dilate = (input: Uint8Array, output: Uint8Array) => {
      for (let y = 0; y < mh; y++) {
        const y0 = y > 0 ? y - 1 : y;
        const y2 = y < mh - 1 ? y + 1 : y;
        for (let x = 0; x < mw; x++) {
          const x0 = x > 0 ? x - 1 : x;
          const x2 = x < mw - 1 ? x + 1 : x;
          let hit = 0;
          for (let yy = y0; yy <= y2 && !hit; yy++) {
            const row = yy * mw;
            for (let xx = x0; xx <= x2; xx++) {
              if (input[row + xx] === 1) {
                hit = 1;
                break;
              }
            }
          }
          output[y * mw + x] = hit;
        }
      }
    };
    const erode = (input: Uint8Array, output: Uint8Array) => {
      for (let y = 0; y < mh; y++) {
        const y0 = y > 0 ? y - 1 : y;
        const y2 = y < mh - 1 ? y + 1 : y;
        for (let x = 0; x < mw; x++) {
          const x0 = x > 0 ? x - 1 : x;
          const x2 = x < mw - 1 ? x + 1 : x;
          let keep = 1;
          for (let yy = y0; yy <= y2 && keep; yy++) {
            const row = yy * mw;
            for (let xx = x0; xx <= x2; xx++) {
              if (input[row + xx] === 0) {
                keep = 0;
                break;
              }
            }
          }
          output[y * mw + x] = keep;
        }
      }
    };
    dilate(src, tmp);
    erode(tmp, tmp2);
    erode(tmp2, tmp);
    dilate(tmp, tmp2);
    return tmp2;
  };

  const keepPrimaryForeground = (srcMask: Uint8Array, mw: number, mh: number) => {
    const len = mw * mh;
    if (!len) return srcMask;
    const fg = new Uint8Array(len);
    for (let i = 0; i < len; i++) fg[i] = srcMask[i] ? 0 : 1;
    const labels = new Int32Array(len);
    labels.fill(-1);
    const q = new Int32Array(len);
    let label = 0;
    let bestLabel = -1;
    let bestScore = -1;
    const cx0 = Math.round(mw * 0.2);
    const cx1 = Math.round(mw * 0.8);
    const cy0 = Math.round(mh * 0.2);
    const cy1 = Math.round(mh * 0.8);
    for (let i = 0; i < len; i++) {
      if (!fg[i] || labels[i] !== -1) continue;
      let qs = 0;
      let qe = 0;
      q[qe++] = i;
      labels[i] = label;
      let area = 0;
      let touchesCenter = 0;
      while (qs < qe) {
        const idx = q[qs++];
        area += 1;
        const x = idx % mw;
        const y = (idx / mw) | 0;
        if (x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) touchesCenter = 1;
        const left = x > 0 ? idx - 1 : -1;
        const right = x < mw - 1 ? idx + 1 : -1;
        const up = y > 0 ? idx - mw : -1;
        const down = y < mh - 1 ? idx + mw : -1;
        if (left >= 0 && fg[left] && labels[left] === -1) {
          labels[left] = label;
          q[qe++] = left;
        }
        if (right >= 0 && fg[right] && labels[right] === -1) {
          labels[right] = label;
          q[qe++] = right;
        }
        if (up >= 0 && fg[up] && labels[up] === -1) {
          labels[up] = label;
          q[qe++] = up;
        }
        if (down >= 0 && fg[down] && labels[down] === -1) {
          labels[down] = label;
          q[qe++] = down;
        }
      }
      const score = area * (touchesCenter ? 1.35 : 1);
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
      label += 1;
    }
    if (bestLabel < 0) return srcMask;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      const isFg = labels[i] === bestLabel;
      out[i] = isFg ? 0 : 1;
    }
    return out;
  };
  const closeForeground = (srcMask: Uint8Array, mw: number, mh: number) => {
    const len = mw * mh;
    if (!len) return srcMask;
    const fg = new Uint8Array(len);
    for (let i = 0; i < len; i++) fg[i] = srcMask[i] ? 0 : 1;
    const dil = new Uint8Array(len);
    const ero = new Uint8Array(len);
    for (let y = 0; y < mh; y++) {
      const row = y * mw;
      for (let x = 0; x < mw; x++) {
        const idx = row + x;
        let hit = 0;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(mh - 1, y + 1) && !hit; yy++) {
          const r2 = yy * mw;
          for (let xx = Math.max(0, x - 1); xx <= Math.min(mw - 1, x + 1); xx++) {
            if (fg[r2 + xx]) {
              hit = 1;
              break;
            }
          }
        }
        dil[idx] = hit;
      }
    }
    for (let y = 0; y < mh; y++) {
      const row = y * mw;
      for (let x = 0; x < mw; x++) {
        const idx = row + x;
        let keep = 1;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(mh - 1, y + 1) && keep; yy++) {
          const r2 = yy * mw;
          for (let xx = Math.max(0, x - 1); xx <= Math.min(mw - 1, x + 1); xx++) {
            if (!dil[r2 + xx]) {
              keep = 0;
              break;
            }
          }
        }
        ero[idx] = keep;
      }
    }
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = ero[i] ? 0 : 1;
    return out;
  };

  const refined = refineMask(mask, w, h);
  const primary = keepPrimaryForeground(refined, w, h);
  const closed = closeForeground(primary, w, h);
  return { width: w, height: h, mask: closed };
};

const applyBackgroundMask = (
  data: { width: number; height: number; data: Uint8ClampedArray },
  mask: Uint8Array,
  invert: boolean,
  feather?: number
) => {
  const w = Math.max(0, Math.trunc(Number(data.width) || 0));
  const h = Math.max(0, Math.trunc(Number(data.height) || 0));
  const src = data.data;
  const out = new Uint8ClampedArray(src.length);
  const len = Math.min(mask.length, w * h);
  const wInt = Math.max(1, w | 0);
  const featherStrength = clampNumber(feather ?? 0, 0, 1);
  let keepMap: Uint8Array | null = null;
  let dist: Float32Array | null = null;
  let edge: Float32Array | null = null;
  let edgeMax = 0;
  let baseRadius = 0;
  if (featherStrength > 0 && len > 0) {
    keepMap = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      const isBg = mask[i] === 1;
      keepMap[i] = invert ? (isBg ? 1 : 0) : isBg ? 0 : 1;
    }
    const boundary = new Uint8Array(len);
    for (let y = 0; y < h; y++) {
      const row = y * wInt;
      for (let x = 0; x < wInt; x++) {
        const idx = row + x;
        const v = keepMap[idx];
        if (
          (x > 0 && keepMap[idx - 1] !== v) ||
          (x < wInt - 1 && keepMap[idx + 1] !== v) ||
          (y > 0 && keepMap[idx - wInt] !== v) ||
          (y < h - 1 && keepMap[idx + wInt] !== v)
        ) {
          boundary[idx] = 1;
        }
      }
    }
    dist = new Float32Array(len);
    const big = 1e6;
    for (let i = 0; i < len; i++) dist[i] = boundary[i] ? 0 : big;
    for (let y = 0; y < h; y++) {
      const row = y * wInt;
      for (let x = 0; x < wInt; x++) {
        const i = row + x;
        let d = dist[i];
        if (x > 0) d = Math.min(d, dist[i - 1] + 1);
        if (y > 0) d = Math.min(d, dist[i - wInt] + 1);
        if (x > 0 && y > 0) d = Math.min(d, dist[i - wInt - 1] + 1.4142);
        if (x < wInt - 1 && y > 0) d = Math.min(d, dist[i - wInt + 1] + 1.4142);
        dist[i] = d;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      const row = y * wInt;
      for (let x = wInt - 1; x >= 0; x--) {
        const i = row + x;
        let d = dist[i];
        if (x < wInt - 1) d = Math.min(d, dist[i + 1] + 1);
        if (y < h - 1) d = Math.min(d, dist[i + wInt] + 1);
        if (x < wInt - 1 && y < h - 1) d = Math.min(d, dist[i + wInt + 1] + 1.4142);
        if (x > 0 && y < h - 1) d = Math.min(d, dist[i + wInt - 1] + 1.4142);
        dist[i] = d;
      }
    }
    edge = new Float32Array(len);
    const gray = new Float32Array(len);
    for (let i = 0, p = 0; i < len; i++, p += 4) {
      gray[i] = 0.2126 * src[p] + 0.7152 * src[p + 1] + 0.0722 * src[p + 2];
    }
    for (let y = 1; y < h - 1; y++) {
      const row = y * wInt;
      for (let x = 1; x < wInt - 1; x++) {
        const i = row + x;
        const a00 = gray[i - wInt - 1];
        const a01 = gray[i - wInt];
        const a02 = gray[i - wInt + 1];
        const a10 = gray[i - 1];
        const a12 = gray[i + 1];
        const a20 = gray[i + wInt - 1];
        const a21 = gray[i + wInt];
        const a22 = gray[i + wInt + 1];
        const gx = -a00 - 2 * a10 - a20 + a02 + 2 * a12 + a22;
        const gy = -a00 - 2 * a01 - a02 + a20 + 2 * a21 + a22;
        const mag = Math.hypot(gx, gy);
        edge[i] = mag;
        if (mag > edgeMax) edgeMax = mag;
      }
    }
    baseRadius = Math.max(1, Math.round(1 + featherStrength * 6));
  }
  for (let i = 0; i < len; i++) {
    const p = i * 4;
    const alpha = src[p + 3];
    if (alpha === 0) {
      out[p] = src[p];
      out[p + 1] = src[p + 1];
      out[p + 2] = src[p + 2];
      out[p + 3] = 0;
      continue;
    }

    const isBg = mask[i] === 1;
    if (featherStrength <= 0 || !keepMap || !dist || !edge) {
      const keep = invert ? isBg : !isBg;
      out[p] = src[p];
      out[p + 1] = src[p + 1];
      out[p + 2] = src[p + 2];
      out[p + 3] = keep ? alpha : 0;
      continue;
    }

    const keep = keepMap[i] === 1;
    const edgeN = edgeMax > 0 ? Math.min(1, (edge[i] || 0) / edgeMax) : 0;
    const radius = Math.max(1, baseRadius * (1 - edgeN * 0.5));
    const t = Math.min(1, (dist[i] || 0) / radius);
    const smooth = t * t * (3 - 2 * t);
    const aBlend = keep ? smooth : 1 - smooth;
    const keepAlpha = Math.max(0, Math.min(255, Math.round(alpha * aBlend)));

    out[p] = src[p];
    out[p + 1] = src[p + 1];
    out[p + 2] = src[p + 2];
    out[p + 3] = keepAlpha;
  }
  return { width: w, height: h, data: out };
};

export const removeBackgroundAlgorithm1 = (
  data: { width: number; height: number; data: Uint8ClampedArray },
  opts?: { threshold?: number; feather?: number }
) => {
  const maskInfo = buildBackgroundMaskAlgorithm1(data, opts);
  const masked = applyBackgroundMask(data, maskInfo.mask, false, opts?.feather);
  return { width: maskInfo.width, height: maskInfo.height, data: masked.data };
};

export const splitLayersAlgorithm1 = (
  data: { width: number; height: number; data: Uint8ClampedArray },
  opts?: { threshold?: number; feather?: number }
) => {
  const maskInfo = buildBackgroundMaskAlgorithm1(data, opts);
  const fg = applyBackgroundMask(data, maskInfo.mask, false, opts?.feather);
  const bg = applyBackgroundMask(data, maskInfo.mask, true, opts?.feather);
  return {
    width: maskInfo.width,
    height: maskInfo.height,
    foreground: fg.data,
    background: bg.data
  };
};

export const detectTiltAngle = (data: Pick<ImageData, 'width' | 'height' | 'data'>) => {
  const w = Math.max(0, Math.trunc(Number(data.width) || 0));
  const h = Math.max(0, Math.trunc(Number(data.height) || 0));
  if (w < 3 || h < 3) return 0;
  const src = data.data;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.2126 * src[p] + 0.7152 * src[p + 1] + 0.0722 * src[p + 2];
  }
  const bins = 181;
  const hist = new Float32Array(bins);
  const magThresh = 14;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const a00 = gray[i - w - 1];
      const a01 = gray[i - w];
      const a02 = gray[i - w + 1];
      const a10 = gray[i - 1];
      const a12 = gray[i + 1];
      const a20 = gray[i + w - 1];
      const a21 = gray[i + w];
      const a22 = gray[i + w + 1];
      const gx = -a00 - 2 * a10 - a20 + a02 + 2 * a12 + a22;
      const gy = -a00 - 2 * a01 - a02 + a20 + 2 * a21 + a22;
      const mag = Math.hypot(gx, gy);
      if (mag < magThresh) continue;
      let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
      angle += 90;
      angle = ((angle + 90) % 180) - 90;
      if (angle > 45) angle -= 90;
      if (angle < -45) angle += 90;
      const bi = clampNumber(Math.round((angle + 45) * 2), 0, bins - 1);
      hist[bi] += mag;
    }
  }
  let best = 0;
  let bestVal = -1;
  for (let i = 0; i < bins; i++) {
    const v = hist[i];
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  }
  if (bestVal <= 0) return 0;
  let sum = 0;
  let wsum = 0;
  for (let i = Math.max(0, best - 4); i <= Math.min(bins - 1, best + 4); i++) {
    const v = hist[i];
    if (v <= 0) continue;
    const a = i / 2 - 45;
    sum += a * v;
    wsum += v;
  }
  if (!wsum) return best / 2 - 45;
  return sum / wsum;
};
