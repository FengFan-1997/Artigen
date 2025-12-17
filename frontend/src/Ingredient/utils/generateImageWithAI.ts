import { buildLabelSectionsUnified } from './api';

type LayoutType = 'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts';

const DEFAULT_MISSING_TEXT = 'Information not provided in source text';

const WIDTH = 500;
const PADDING = 14;
const INNER_W = WIDTH - PADDING * 2;
const FONT_BODY = '13px Arial, Helvetica, sans-serif';
const FONT_BOLD = 'bold 13px Arial, Helvetica, sans-serif';
const FONT_HEADER_FACTS = 'bold 18px Arial Black, Arial, sans-serif';
const LINE_H = 17;
const SIZE_BODY = 13;

const fontStr = (size: number, bold = false) =>
  `${bold ? 'bold ' : ''}${size}px Arial, Helvetica, sans-serif`;
const lineH = (size: number) => Math.round(size + size * 0.5);

const toTitleCase = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const escapeXml = (unsafe: any) => {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
};

let ctx: CanvasRenderingContext2D | null = null;
const getCtx = (font: string) => {
  if (typeof document === 'undefined') return null;
  if (!ctx) {
    const canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
  }
  if (ctx) ctx.font = font;
  return ctx;
};

const measureTextWidth = (text: string, font: string): number => {
  const context = getCtx(font);
  return context ? context.measureText(text).width : 0;
};

const wrapText = (text: string, maxWidth: number, font: string) => {
  const context = getCtx(font);
  if (!context) return [text];
  const words = text.split(/[ \f\n\r\t\v]+/);
  const lines: string[] = [];
  if (words.length === 0) return lines;

  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = context.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines.filter((line) => line.trim() !== '');
};

const splitItems = (text: string) => {
  const t = String(text || '').trim();
  if (!t) return [] as string[];
  if (t.includes('\n'))
    return t
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s);
  if (/•|▪|‣|\u2022/.test(t))
    return t
      .split(/•|▪|‣|\u2022/)
      .map((s) => s.trim())
      .filter((s) => s);
  const parts = t
    .split(/[;；。\.]+\s*/)
    .map((s) => s.trim())
    .filter((s) => s);
  return parts.length ? parts : [t];
};

const renderDrugFacts = (sections: any[]) => {
  let svg = '';
  let y = PADDING - 10;
  const INNER_BORDER_X = 12;
  const INNER_PADDING = 10;
  const RIGHT_MARGIN = 5;
  const START_X = INNER_BORDER_X + INNER_PADDING;
  const END_X = WIDTH - INNER_BORDER_X - INNER_PADDING;
  const LINE_WIDTH = END_X - START_X - RIGHT_MARGIN;

  const SIZE_HEADER_DRUG = 36;
  const SIZE_SECTION_TITLE = 20;

  svg += `<text x="${START_X}" y="${y + lineH(SIZE_HEADER_DRUG)}" font-family="Arial Black, Arial" font-style="italic" font-weight="700" font-size="${SIZE_HEADER_DRUG}">Drug Facts</text>`;
  y += lineH(SIZE_HEADER_DRUG) + 2;

  const activeSec = sections.find((s) =>
    String(s.title || '')
      .toUpperCase()
      .includes('ACTIVE INGREDIENT')
  );
  const purposeSec = sections.find((s) =>
    String(s.title || '')
      .toUpperCase()
      .includes('PURPOSE')
  );
  const usesSecForPurpose = sections.find(
    (s) =>
      String(s.title || '')
        .toUpperCase()
        .includes('USES') && !String(s.content).includes('Use')
  );
  const finalPurposeSec = purposeSec || usesSecForPurpose;

  if (activeSec) {
    svg += `<rect x="${START_X}" y="${y + 10}" width="${END_X - START_X + RIGHT_MARGIN}" height="3" fill="black" />`;
    y += 13;

    const headerLh = lineH(SIZE_SECTION_TITLE);
    svg += `<text x="${START_X}" y="${y + headerLh}" font-family="Arial" font-weight="bold" font-style="italic" font-size="${SIZE_SECTION_TITLE}">Active Ingredient</text>`;
    svg += `<text x="${END_X}" y="${y + headerLh}" text-anchor="end" font-family="Arial" font-weight="bold" font-style="italic" font-size="${SIZE_SECTION_TITLE}">Purpose</text>`;
    y += headerLh + 2;

    const lh = 15;
    const dotW = measureTextWidth('.', fontStr(SIZE_BODY));
    const MIN_DOTS = 15;
    const MIN_GAP_WIDTH = dotW * MIN_DOTS;

    const activesList = Array.isArray(activeSec.content)
      ? (activeSec.content as any[]).map((v) => String(v)).filter((v) => v)
      : splitItems(String(activeSec.content));

    const purposeList = finalPurposeSec
      ? Array.isArray(finalPurposeSec.content)
        ? (finalPurposeSec.content as any[]).map((v) => String(v)).filter((v) => v)
        : splitItems(String(finalPurposeSec.content))
      : [];

    const numItems = Math.max(activesList.length, purposeList.length);

    for (let i = 0; i < numItems; i++) {
      const activeText = activesList[i] || '';
      const purposeText = purposeList[i] || purposeList[0] || '';

      if (!activeText && !purposeText) continue;

      const activeLen = activeText.length;
      const purposeLen = purposeText.length;
      const totalLen = activeLen + purposeLen || 1;
      const availWidthForText = Math.max(0, END_X - START_X - MIN_GAP_WIDTH);

      let activeAllocatedW = activeLen > 0 ? (activeLen / totalLen) * availWidthForText : 0;
      let purposeAllocatedW = purposeLen > 0 ? availWidthForText - activeAllocatedW : 0;

      if (activeLen > 0 && activeAllocatedW < 30) {
        activeAllocatedW = 30;
        purposeAllocatedW = Math.max(0, availWidthForText - 30);
      }
      if (purposeLen > 0 && purposeAllocatedW < 30) {
        purposeAllocatedW = 30;
        activeAllocatedW = Math.max(0, availWidthForText - 30);
      }

      const ACTIVE_WRAP_W =
        activeAllocatedW > RIGHT_MARGIN ? activeAllocatedW - RIGHT_MARGIN : activeAllocatedW;
      const PURPOSE_WRAP_W =
        purposeAllocatedW > RIGHT_MARGIN ? purposeAllocatedW - RIGHT_MARGIN : purposeAllocatedW;

      const activeLines = wrapText(activeText, ACTIVE_WRAP_W, fontStr(SIZE_BODY));
      const purposeLines = wrapText(purposeText, PURPOSE_WRAP_W, fontStr(SIZE_BODY));

      const activeH = activeLines.length * lh;
      const purposeH = purposeLines.length * lh;
      const maxH = Math.max(activeH, purposeH);

      const activeYOffset = (maxH - activeH) / 2;
      const purposeYOffset = (maxH - purposeH) / 2;

      let maxActiveLineW = 0;
      activeLines.forEach((l) => {
        const w = measureTextWidth(l, fontStr(SIZE_BODY));
        if (w > maxActiveLineW) maxActiveLineW = w;
      });

      let maxPurposeLineW = 0;
      purposeLines.forEach((l) => {
        const w = measureTextWidth(l, fontStr(SIZE_BODY));
        if (w > maxPurposeLineW) maxPurposeLineW = w;
      });

      activeLines.forEach((line, idx) => {
        const lineY = y + activeYOffset + idx * lh + lh;
        svg += `<text x="${START_X}" y="${lineY}" font-family="Arial" font-size="${SIZE_BODY}">${escapeXml(line)}</text>`;
      });

      purposeLines.forEach((line, idx) => {
        const lineY = y + purposeYOffset + idx * lh + lh;
        svg += `<text x="${END_X}" y="${lineY}" text-anchor="end" font-family="Arial" font-size="${SIZE_BODY}">${escapeXml(line)}</text>`;
      });

      if (activeText && purposeText) {
        const dotY = y + maxH / 2 + lh / 2 - 2;

        const dotStartX = START_X + maxActiveLineW + 5;
        const dotEndX = END_X - maxPurposeLineW - 5;

        const gapW = dotEndX - dotStartX;

        if (gapW > 0) {
          const dotsCount = Math.floor(gapW / dotW);
          if (dotsCount > 2) {
            const dotsStr = '.'.repeat(dotsCount);
            svg += `<text x="${dotStartX}" y="${dotY}" font-family="Arial" font-size="${SIZE_BODY}" clip-path="url(#clip${i})">${dotsStr}</text>`;
          }
        }
      }

      y += maxH + 4;
    }
    y += 4;
  }

  sections.forEach((sec) => {
    const title = String(sec.title || '').toUpperCase();
    if (
      (title.includes('ACTIVE INGREDIENT') && !title.includes('INACTIVE')) ||
      (finalPurposeSec && title === String(finalPurposeSec.title || '').toUpperCase()) ||
      title.includes('QUESTIONS') ||
      title.includes('QUESTION') ||
      title.includes('MANUFACTURER') ||
      title.includes('NDC') ||
      title.includes('LOT') ||
      title.includes('NET CONTENT')
    ) {
      return;
    }

    svg += `<rect x="${START_X}" y="${y + 8}" width="${END_X - START_X + RIGHT_MARGIN}" height="3" fill="black" />`;
    y += 12;

    const displayTitle = toTitleCase(sec.title || 'Section');
    const isMain = /USES|WARNINGS|DIRECTIONS|OTHER INFORMATION|INACTIVE INGREDIENTS/.test(title);
    const fontSize = isMain ? SIZE_SECTION_TITLE : 16;

    svg += `<text x="${START_X}" y="${y + lineH(fontSize)}" font-family="Arial" font-weight="bold" font-style="italic" font-size="${fontSize}">${escapeXml(displayTitle)}</text>`;
    y += lineH(fontSize) + 2;

    const content = sec.content || DEFAULT_MISSING_TEXT;
    const lh = 15;

    const useBullets = /WARNINGS|DIRECTIONS|OTHER INFORMATION/.test(title);

    const renderItem = (text: string, bullet = false) => {
      const prefix = bullet ? '■\u00A0' : '';
      const fullText = prefix + text.replace(/^•\s*/, '').trim();
      const lines = wrapText(fullText, LINE_WIDTH, fontStr(SIZE_BODY));
      lines.forEach((line) => {
        svg += `<text x="${START_X}" y="${y + lh}" font-family="Arial" font-size="${SIZE_BODY}">${escapeXml(line)}</text>`;
        y += lh;
      });
    };

    if (title.includes('USES') && Array.isArray(content)) {
      const arr = (content as string[]).map((s) => String(s).trim()).filter(Boolean);
      const introIdx = arr.findIndex(
        (s) => s.split(/\s+/).length > 5 || /temporarily|relieves|due to|symptom/i.test(s)
      );
      if (introIdx >= 0) {
        const intro = arr[introIdx];
        wrapText(intro, LINE_WIDTH, fontStr(SIZE_BODY)).forEach((line) => {
          svg += `<text x="${START_X}" y="${y + lh}" font-family="Arial" font-size="${SIZE_BODY}">${escapeXml(line)}</text>`;
          y += lh;
        });
        const bullets = arr.filter((_, i) => i !== introIdx);
        if (bullets.length) {
          const joined = bullets
            .map((s) => '■\u00A0' + s.replace(/^•\s*/, ''))
            .join(' \u00A0\u00A0 ');
          wrapText(joined, LINE_WIDTH, fontStr(SIZE_BODY)).forEach((line) => {
            svg += `<text x="${START_X}" y="${y + lh}" font-family="Arial" font-size="${SIZE_BODY}">${escapeXml(line)}</text>`;
            y += lh;
          });
        }
      } else {
        const joined = arr.map((s) => '■\u00A0' + s.replace(/^•\s*/, '')).join(' \u00A0\u00A0 ');
        wrapText(joined, LINE_WIDTH, fontStr(SIZE_BODY)).forEach((line) => {
          svg += `<text x="${START_X}" y="${y + lh}" font-family="Arial" font-size="${SIZE_BODY}">${escapeXml(line)}</text>`;
          y += lh;
        });
      }
    } else if (title.includes('INACTIVE INGREDIENTS')) {
      const text = Array.isArray(content) ? (content as string[]).join(', ') : String(content);
      renderItem(text, false);
    } else if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
      Object.entries(content).forEach(([key, val]) => {
        if (!val) return;
        if (key === 'groups' && Array.isArray(val)) {
          (val as any[]).forEach((g) => {
            const t = `${g.age}: ${g.dose} ${g.frequency !== '-' ? '(' + g.frequency + ')' : ''}`;
            renderItem(t, true);
          });
        } else if (key === 'general' && Array.isArray(val)) {
          val.forEach((v: string) => {
            renderItem(v, true);
          });
        } else {
          const subTitle = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          const items = Array.isArray(val) ? val : [val];
          const contentStr = items
            .map((v: any) => String(v).replace(/^•\s*/, '').trim())
            .join(', ');
          const prefix = '■\u00A0' + subTitle + ':\u00A0';
          const fullText = prefix + contentStr;

          const lines = wrapText(fullText, LINE_WIDTH, fontStr(SIZE_BODY));
          lines.forEach((line, i) => {
            if (i === 0 && line.includes(subTitle)) {
              const titleEndIdx = line.indexOf(subTitle) + subTitle.length + 1;
              const titlePart = line.substring(0, titleEndIdx);
              const restPart = line.substring(titleEndIdx);
              svg += `<text x="${START_X}" y="${y + lh}" font-family="Arial" font-size="${SIZE_BODY}"><tspan font-weight="bold">${escapeXml(titlePart)}</tspan>${escapeXml(restPart)}</text>`;
            } else {
              svg += `<text x="${START_X}" y="${y + lh}" font-family="Arial" font-size="${SIZE_BODY}">${escapeXml(line)}</text>`;
            }
            y += lh;
          });
        }
      });
    } else {
      const items = Array.isArray(content)
        ? (content as any[]).map(String)
        : splitItems(String(content));
      items.forEach((it) => {
        renderItem(it, useBullets);
      });
    }
    y += 2;
  });

  y += 8;

  const manuSec = sections.find((s) =>
    String(s.title || '')
      .toUpperCase()
      .includes('MANUFACTURER')
  );
  const ndcSec = sections.find((s) =>
    String(s.title || '')
      .toUpperCase()
      .includes('NDC')
  );
  const lotSec = sections.find((s) =>
    String(s.title || '')
      .toUpperCase()
      .includes('LOT')
  );
  const expSec = sections.find((s) =>
    String(s.title || '')
      .toUpperCase()
      .includes('EXPIRATION')
  );
  const netSec = sections.find((s) =>
    String(s.title || '')
      .toUpperCase()
      .includes('NET CONTENT')
  );

  if (manuSec || ndcSec || lotSec || expSec || netSec) {
    y += 4;
    const infoFontSize = 11;
    const infoLh = Math.round(infoFontSize * 1.4);

    if (ndcSec) {
      svg += `<text x="${START_X}" y="${y + infoLh}" font-family="Arial" font-weight="bold" font-size="${infoFontSize}">${escapeXml(ndcSec.content)}</text>`;
      y += infoLh + 2;
    }

    let lotText = '';
    if (lotSec) lotText += String(lotSec.content);
    if (expSec) {
      if (lotText) lotText += '  ';
      lotText += String(expSec.content);
    }

    if (lotText) {
      svg += `<text x="${START_X}" y="${y + infoLh}" font-family="Arial" font-size="${infoFontSize}">${escapeXml(lotText)}</text>`;
      y += infoLh + 2;
    }

    if (manuSec) {
      const manuText = String(manuSec.content);
      const lines = wrapText(manuText, LINE_WIDTH, fontStr(infoFontSize));
      lines.forEach((line) => {
        svg += `<text x="${START_X}" y="${y + infoLh}" font-family="Arial" font-size="${infoFontSize}">${escapeXml(line)}</text>`;
        y += infoLh;
      });
      y += 4;
    }

    if (netSec) {
      y += 4;
      const netText = String(netSec.content);
      svg += `<text x="${START_X}" y="${y + 14}" font-family="Arial" font-weight="bold" font-size="14">${escapeXml(netText)}</text>`;
      y += 18;
    }
  }

  return { svg, height: y + PADDING };
};

const renderSupplementFacts = (sections: any[]) => {
  let svg = '';
  let y = PADDING;

  const BORDER_X = PADDING;
  const BORDER_W = WIDTH - PADDING * 2;
  const INNER_PAD = 8;

  const CONTENT_X = BORDER_X + INNER_PAD;
  const CONTENT_W = BORDER_W - INNER_PAD * 2;
  const CONTENT_END_X = CONTENT_X + CONTENT_W;

  const col1_W = CONTENT_W * 0.65;
  const col2_W = CONTENT_W * 0.15;

  const y_start = y;

  y += INNER_PAD;

  svg += `<text x="${CONTENT_X}" y="${y + 20}" font-family="${FONT_HEADER_FACTS}" font-style="italic"  font-weight="900" font-size="26">Supplement Facts</text>`;
  y += 30;

  const serveHeaderSec = sections.find(
    (s) => s.title.toUpperCase() === 'SERVE HEADER' && s.isHeader
  );
  if (serveHeaderSec && typeof serveHeaderSec.content === 'object') {
    const { servingSize, servingsPerContainer } = serveHeaderSec.content;

    if (servingSize && servingSize !== DEFAULT_MISSING_TEXT) {
      svg += `<text x="${CONTENT_X}" y="${y + 14}" font-family="Arial" font-size="12">Serving Size: ${escapeXml(servingSize)}</text>`;
      y += 18;
    }

    if (servingsPerContainer && servingsPerContainer !== DEFAULT_MISSING_TEXT) {
      svg += `<text x="${CONTENT_X}" y="${y + 14}" font-family="Arial" font-size="12">Servings Per Container: ${escapeXml(servingsPerContainer)}</text>`;
      y += 18;
    }
  } else {
    const suggestedUseSec = sections.find((s) => s.title.toUpperCase().includes('SUGGESTED USE'));
    const content = suggestedUseSec?.content || DEFAULT_MISSING_TEXT;
    if (content !== DEFAULT_MISSING_TEXT) {
      svg += `<text x="${CONTENT_X}" y="${y + 14}" font-family="Arial" font-size="12">Serving Size: ${escapeXml(content.split(',')[0].trim() || content)}</text>`;
      y += 18;
    }
  }

  y += 4;
  svg += `<rect x="${CONTENT_X}" y="${y}" width="${CONTENT_W}" height="3" fill="black" />`;
  y += 10;

  const amountX = CONTENT_X + col1_W + col2_W / 2 - 10;
  const dvX = CONTENT_END_X - 10;

  svg += `<text x="${CONTENT_X}" y="${y + 12}" font-family="Arial" font-weight="bold" font-size="12">Dietary Ingredient</text>`;
  svg += `<text x="${amountX}" text-anchor="middle" y="${y + 12}" font-family="Arial" font-weight="bold" font-size="12">Amount</text>`;
  svg += `<text x="${dvX}" text-anchor="end" y="${y + 12}" font-family="Arial" font-weight="bold" font-size="12">%DV</text>`;
  y += 16;
  svg += `<line x1="${CONTENT_X}" y1="${y}" x2="${CONTENT_END_X}" y2="${y}" stroke="black" stroke-width="1" />`;
  y += 4;

  const factsSec = sections.find(
    (s) => s.isTable && s.title.toUpperCase().includes('SUPPLEMENT FACTS TABLE')
  );
  const actives = factsSec?.content || [];
  let hasAsterisk = false;
  let hasDagger = false;

  if (Array.isArray(actives) && actives.length > 0) {
    actives.forEach((item: any, itemIdx: number) => {
      if (item.name) {
        const amount = item.amount === DEFAULT_MISSING_TEXT ? '0' : item.amount;
        const dv = item.dv === DEFAULT_MISSING_TEXT ? '0' : item.dv;
        if (String(dv).includes('*')) {
          hasAsterisk = true;
        } else if (String(dv).includes('†')) {
          hasDagger = true;
        }
        // ---------------------------------

        const nameLines = wrapText(item.name, col1_W, FONT_BODY);

        svg += `<text x="${CONTENT_X}" y="${y + 13}" font-family="Arial" font-size="13">${escapeXml(nameLines[0])}</text>`;

        svg += `<text x="${amountX}" text-anchor="middle" y="${y + 13}" font-family="Arial" font-size="13">${escapeXml(amount)}</text>`;
        svg += `<text x="${dvX}" text-anchor="end" y="${y + 13}" font-family="Arial" font-size="13">${escapeXml(dv)}</text>`;

        y += 17;

        nameLines.slice(1).forEach((line) => {
          svg += `<text x="${CONTENT_X + 10}" y="${y + 13}" font-family="Arial" font-size="13">${escapeXml(line)}</text>`;
          y += 17;
        });

        if (itemIdx < actives.length - 1) {
          svg += `<line x1="${CONTENT_X}" y1="${y}" x2="${CONTENT_END_X}" y2="${y}" stroke="black" stroke-width="0.5" />`;
          y += 4;
        }
      }
    });
  }

  y += 4;
  svg += `<rect x="${CONTENT_X}" y="${y}" width="${CONTENT_W}" height="3" fill="black" />`;
  y += 8;

  if (hasAsterisk || hasDagger) {
    svg += `<text x="${CONTENT_X}" y="${y + 10}" font-family="Arial" font-size="11">* Daily Value not established.</text>`;
    y += 14;
    y += 4;
  }
  // -------------------------

  const declarationSections = sections.filter(
    (s) =>
      s.title.toUpperCase() === 'OTHER INGREDIENTS' ||
      s.title.toUpperCase() === 'SUGGESTED USE' ||
      s.title.toUpperCase().includes('WARNING')
  );

  declarationSections.forEach((sec) => {
    let title = (sec.title || 'OTHER INGREDIENTS').toUpperCase();
    if (title.includes('WARNING')) title = 'WARNING';
    const content = Array.isArray(sec.content) ? sec.content.join(', ') : sec.content;

    y += 8;

    const titleStr = title + ':';

    svg += `<text x="${CONTENT_X}" y="${y + LINE_H}" font-family="Arial" font-weight="bold" font-size="13">${escapeXml(titleStr)}</text>`;

    const titleW = getCtx(FONT_BOLD)?.measureText(titleStr + ' ').width || 0;

    let currentLine = '';
    const words = content.split(/\s+/).filter((w: string) => w);
    const contentParts: string[] = [];

    const SF_LINE_WIDTH = CONTENT_W - 5;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const attempt = currentLine + (currentLine ? ' ' : '') + word;

      const currentMaxWidth = contentParts.length === 0 ? SF_LINE_WIDTH - titleW : SF_LINE_WIDTH;
      const width = getCtx(FONT_BODY)?.measureText(attempt).width || 0;

      if (width < currentMaxWidth || !currentLine) {
        currentLine = attempt;
      } else {
        contentParts.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      contentParts.push(currentLine);
    }

    if (contentParts.length > 0) {
      const firstLineContent = contentParts[0];
      let firstLineX = CONTENT_X;
      let yOffset = 0;
      const firstLineWidth = getCtx(FONT_BODY)?.measureText(firstLineContent).width || 0;
      if (titleW + firstLineWidth < SF_LINE_WIDTH) {
        firstLineX = CONTENT_X + titleW;
        yOffset = LINE_H;
      } else {
        firstLineX = CONTENT_X;
        yOffset = LINE_H * 2;
      }

      // 渲染第一行内容
      svg += `<text x="${firstLineX}" y="${y + LINE_H}" font-family="Arial" font-size="13">${escapeXml(firstLineContent)}</text>`;
      y = y + yOffset;

      // 渲染后续行
      contentParts.slice(1).forEach((line) => {
        svg += `<text x="${CONTENT_X}" y="${y + LINE_H}" font-family="Arial" font-size="13">${escapeXml(line)}</text>`;
        y += LINE_H;
      });
    } else {
      y += LINE_H;
    }
  });

  const manuSec = sections.find((s) => s.title.toUpperCase().includes('MANUFACTURER'));
  if (manuSec) {
    y += 12;
    const content = Array.isArray(manuSec.content) ? manuSec.content.join(', ') : manuSec.content;
    const lines = wrapText(content, CONTENT_W, fontStr(11));
    lines.forEach((line) => {
      svg += `<text x="${CONTENT_X}" y="${y + 14}" font-family="Arial" font-size="11">${escapeXml(line)}</text>`;
      y += 14;
    });
  }

  const netSec = sections.find((s) => s.title.toUpperCase().includes('NET CONTENT'));
  if (netSec) {
    y += 12;
    const content = String(netSec.content);
    svg += `<text x="${CONTENT_X}" y="${y + 14}" font-family="Arial" font-weight="bold" font-size="14">${escapeXml(content)}</text>`;
    y += 18;
  }

  y += INNER_PAD;
  const y_end = y;

  const borderRect = `<rect x="${BORDER_X}" y="${y_start}" width="${BORDER_W}" height="${y_end - y_start}" fill="none" stroke="black" stroke-width="3" />`;
  svg = borderRect + svg;

  return { svg, height: y + PADDING };
};
const renderNutritionFacts = (sections: any[]) => {
  let svg = '';
  let y = PADDING;

  const NF_LINE_WIDTH = INNER_W - 5;

  const FONT_HEAD = 'Arial Black, Arial';
  const FONT_STD = 'Arial, Helvetica, sans-serif';

  svg += `<text x="${PADDING}" y="${y + 34}" font-family="${FONT_HEAD}" font-weight="900" font-size="34">Nutrition Facts</text>`;
  y += 42;

  const factsSec = sections.find((s) => s.title === 'NUTRITION FACTS');
  if (factsSec && factsSec.content) {
    const c = factsSec.content;
    if (c.servingSize) {
      wrapText(
        c.servingsPerContainer ? c.servingsPerContainer + ' servings per container' : '',
        NF_LINE_WIDTH,
        fontStr(14)
      ).forEach((line) => {
        svg += `<text x="${PADDING}" y="${y + 14}" font-family="${FONT_STD}" font-size="14">${escapeXml(line)}</text>`;
        y += 18;
      });
      svg += `<text x="${PADDING}" y="${y + 16}" font-family="${FONT_HEAD}" font-weight="900" font-size="16">Serving size</text>`;
      const serveSizeW = getCtx(`900 16px ${FONT_HEAD}`)?.measureText('Serving size').width || 100;
      svg += `<text x="${PADDING + serveSizeW + 5}" y="${y + 16}" font-family="${FONT_STD}" font-weight="bold" font-size="16">${escapeXml(c.servingSize)}</text>`;
      y += 22;
    }

    svg += `<rect x="${PADDING}" y="${y}" width="${INNER_W}" height="12" fill="black" />`;
    y += 16;

    svg += `<text x="${PADDING}" y="${y + 12}" font-family="${FONT_HEAD}" font-weight="900" font-size="12">Amount per serving</text>`;
    y += 14;

    svg += `<text x="${PADDING}" y="${y + 28}" font-family="${FONT_HEAD}" font-weight="900" font-size="30">Calories</text>`;
    svg += `<text x="${WIDTH - PADDING}" y="${y + 28}" text-anchor="end" font-family="${FONT_HEAD}" font-weight="900" font-size="36">${escapeXml(c.calories || '0')}</text>`;
    y += 36;

    svg += `<rect x="${PADDING}" y="${y}" width="${INNER_W}" height="5" fill="black" />`;
    y += 8;

    svg += `<text x="${WIDTH - PADDING}" y="${y + 12}" text-anchor="end" font-family="${FONT_HEAD}" font-weight="900" font-size="12">% Daily Value*</text>`;
    y += 16;

    const renderNutrient = (label: string, valObj: any, indent = false, bold = true) => {
      if (!valObj) return;
      const amount = valObj.amount || '0g';
      const dv = valObj.dv || '0%';

      svg += `<line x1="${PADDING}" y1="${y}" x2="${WIDTH - PADDING}" y2="${y}" stroke="black" stroke-width="1" />`;
      y += 14;

      const x = PADDING + (indent ? 14 : 0);
      const fontW = bold ? 'bold' : 'normal';

      svg += `<text x="${x}" y="${y}" font-family="${FONT_STD}" font-weight="${fontW}" font-size="13">${escapeXml(label)} <tspan font-weight="normal">${escapeXml(amount)}</tspan></text>`;

      if (dv) {
        svg += `<text x="${WIDTH - PADDING}" y="${y}" text-anchor="end" font-family="${FONT_STD}" font-weight="bold" font-size="13">${escapeXml(dv)}</tspan></text>`;
      }
      y += 4;
    };

    renderNutrient('Total Fat', c.totalFat);
    renderNutrient('Sodium', c.sodium);
    renderNutrient('Total Carbohydrate', c.totalCarbohydrate);
    renderNutrient('Protein', { amount: c.protein, dv: '' });

    y += 4;
    svg += `<rect x="${PADDING}" y="${y}" width="${INNER_W}" height="12" fill="black" />`;
    y += 16;

    const footnote =
      '* The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.';
    wrapText(footnote, NF_LINE_WIDTH, fontStr(10)).forEach((line) => {
      svg += `<text x="${PADDING}" y="${y + 10}" font-family="Arial" font-size="10">${escapeXml(line)}</text>`;
      y += 12;
    });
  }

  y += 10;

  const otherSecs = sections.filter(
    (s) => s.title !== 'NUTRITION FACTS' && !s.title.toUpperCase().includes('NET CONTENT')
  );
  otherSecs.forEach((sec) => {
    const title = (sec.title || '').toUpperCase();
    const content = Array.isArray(sec.content) ? sec.content.join(', ') : sec.content;
    const titleStr = title + ': ';

    y += 8;
    const full = titleStr + content;
    wrapText(full, NF_LINE_WIDTH, fontStr(12)).forEach((line, i) => {
      if (i === 0) {
        svg += `<text x="${PADDING}" y="${y + 12}" font-family="Arial" font-size="12"><tspan font-weight="bold">${escapeXml(titleStr)}</tspan>${escapeXml(line.substring(titleStr.length))}</text>`;
      } else {
        svg += `<text x="${PADDING}" y="${y + 12}" font-family="Arial" font-size="12">${escapeXml(line)}</text>`;
      }
      y += 14;
    });
  });

  const netSec = sections.find((s) => s.title.toUpperCase().includes('NET CONTENT'));
  if (netSec) {
    y += 12;
    const content = String(netSec.content);
    svg += `<text x="${PADDING}" y="${y + 14}" font-family="Arial" font-weight="bold" font-size="14">${escapeXml(content)}</text>`;
    y += 18;
  }

  return { svg, height: y + PADDING };
};

const renderStandard = (sections: any[], productName: string) => {
  let svg = '';
  let y = PADDING;

  const STANDARD_LINE_WIDTH = INNER_W - 5;

  if (productName) {
    svg += `<text x="${PADDING}" y="${y + 18}" font-family="Arial" font-weight="bold" font-size="18">${escapeXml(productName)}</text>`;
    y += 28;
  }

  sections.forEach((sec, idx) => {
    const title = (sec.title || 'INGREDIENTS').toUpperCase();
    if (title.includes('NET CONTENT')) return;

    let content = Array.isArray(sec.content) ? sec.content.join(', ') : sec.content;

    if (title.includes('CONTAINS') && title.includes('ALLERGENS')) {
      content = String(content).toUpperCase();
    }

    if (
      !content ||
      String(content).trim() === '' ||
      String(content).toUpperCase() === 'NONE' ||
      String(content).toUpperCase() === 'N/A'
    ) {
      return;
    }

    const titleStr = title + ':';

    if (idx > 0) y += 8;

    svg += `<text x="${PADDING}" y="${y + LINE_H}" font-family="Arial" font-weight="bold" font-size="13">${escapeXml(titleStr)}</text>`;

    const titleW = getCtx(FONT_BOLD)?.measureText(titleStr + ' ').width || 0;

    let currentLine = '';
    const words = content.split(/\s+/).filter((w: string) => w);
    const contentParts: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const attempt = currentLine + (currentLine ? ' ' : '') + word;

      const currentMaxWidth =
        contentParts.length === 0 ? STANDARD_LINE_WIDTH - titleW : STANDARD_LINE_WIDTH;
      const width = getCtx(FONT_BODY)?.measureText(attempt).width || 0;

      if (width < currentMaxWidth || !currentLine) {
        currentLine = attempt;
      } else {
        contentParts.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      contentParts.push(currentLine);
    }

    if (contentParts.length > 0) {
      svg += `<text x="${PADDING + titleW}" y="${y + LINE_H}" font-family="Arial" font-size="13">${escapeXml(contentParts[0])}</text>`;
      y += LINE_H;

      contentParts.slice(1).forEach((line) => {
        svg += `<text x="${PADDING}" y="${y + LINE_H}" font-family="Arial" font-size="13">${escapeXml(line)}</text>`;
        y += LINE_H;
      });
    } else {
      y += LINE_H;
    }
  });

  const netSec = sections.find((s) =>
    String(s.title || '')
      .toUpperCase()
      .includes('NET CONTENT')
  );
  if (netSec) {
    y += 12;
    const content = String(netSec.content);
    svg += `<text x="${PADDING}" y="${y + 14}" font-family="Arial" font-weight="bold" font-size="14">${escapeXml(content)}</text>`;
    y += 18;
  }

  return { svg, height: y + PADDING };
};

export async function generateImageWithAI(
  productName: string,
  ingredientsText: string,
  productType: string
): Promise<{ url: string; layoutType: LayoutType }> {
  const { sections, layoutType } = await buildLabelSectionsUnified(ingredientsText, productType);

  let result;
  if (layoutType === 'drug_facts') {
    result = renderDrugFacts(sections);
  } else if (layoutType === 'supplement_facts') {
    result = renderSupplementFacts(sections);
  } else if (layoutType === 'nutrition_facts') {
    result = renderNutritionFacts(sections);
  } else {
    result = renderStandard(sections, productName);
  }

  const outerBorderW = 2;

  const innerBorder =
    layoutType === 'drug_facts'
      ? `<rect x="12" y="12" width="${WIDTH - 24}" height="${result.height - 24}" fill="none" stroke="black" stroke-width="6"/>`
      : '';

  const finalSvg = `
      <svg width="${WIDTH}" height="${result.height}" viewBox="0 0 ${WIDTH} ${result.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${result.height}" fill="white"/>
        <rect x="${outerBorderW / 2}" y="${outerBorderW / 2}" width="${WIDTH - outerBorderW}" height="${result.height - outerBorderW}" fill="none" stroke="black" stroke-width="${outerBorderW}"/>
        ${innerBorder}
        <g fill="black">
          ${result.svg}
        </g>
      </svg>
    `;

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(finalSvg.trim());
  return { url, layoutType };
}

export default generateImageWithAI;
