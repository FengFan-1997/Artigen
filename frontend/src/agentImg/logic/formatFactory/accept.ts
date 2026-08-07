import type { FormatFactoryToolId } from './types';
import {
  formatFactoryLimitHint,
  getFormatFactoryInputPolicy
} from './inputContracts';

export const acceptForTool = (toolId: FormatFactoryToolId) => {
  return getFormatFactoryInputPolicy(toolId).accept;
};

export const acceptHintForTool = (toolId: FormatFactoryToolId, lang: 'zh' | 'en' = 'zh') => {
  const isEn = lang === 'en';
  if (toolId === 'ingredient-list')
    return isEn ? 'Paste ingredient/formula text to generate' : '输入配方/描述文本即可';
  if (toolId === 'ico') return isEn ? 'Supports PNG / JPEG / WEBP' : '支持 PNG / JPEG / WEBP';
  if (toolId === 'jpeg') return isEn ? 'Supports PNG / JPEG / WEBP' : '支持 PNG / JPEG / WEBP';
  if (toolId === 'webp') return isEn ? 'Supports PNG / JPEG / WEBP' : '支持 PNG / JPEG / WEBP';
  if (toolId === 'resize') return isEn ? 'Supports PNG / JPEG / WEBP' : '支持 PNG / JPEG / WEBP';
  if (toolId === 'rotate') return isEn ? 'Supports PNG / JPEG / WEBP' : '支持 PNG / JPEG / WEBP';
  if (toolId === 'filter') return isEn ? 'Supports PNG / JPEG / WEBP' : '支持 PNG / JPEG / WEBP';
  if (toolId === 'watermark') return isEn ? 'Supports PNG / JPEG / WEBP' : '支持 PNG / JPEG / WEBP';
  if (toolId === 'live')
    return isEn
      ? 'Video files supported (depends on browser decoding)'
      : '支持视频文件（取决于浏览器解码能力）';
  if (toolId === 'gif')
    return isEn
      ? 'Browser-decodable video'
      : '浏览器可解码视频';
  if (toolId === 'pdf') return isEn ? 'PDF supported' : '支持 PDF';
  if (toolId === 'pdf2word')
    return isEn ? 'PDF supported (text extraction)' : '支持 PDF（提取文字导出）';
  if (toolId === 'word2pdf')
    return isEn
      ? 'DOCX · explicit server upload consent required'
      : 'DOCX · 须明确同意上传到服务器';
  if (toolId === 'txt2pdf') return isEn ? 'Supports TXT (plain text)' : '支持 TXT（纯文本）';
  if (toolId === 'img2pdf')
    return isEn ? 'Supports PNG / JPEG / WEBP (multi-select)' : '支持 PNG / JPEG / WEBP（可多选）';
  return '';
};

export const acceptAndLimitHintForTool = (
  toolId: FormatFactoryToolId,
  lang: 'zh' | 'en' = 'zh'
) => {
  const acceptHint = acceptHintForTool(toolId, lang);
  const limitHint = formatFactoryLimitHint(toolId, lang);
  return [acceptHint, limitHint].filter(Boolean).join(' · ');
};
