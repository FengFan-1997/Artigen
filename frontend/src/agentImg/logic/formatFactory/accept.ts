import type { FormatFactoryToolId } from './types';

export const acceptForTool = (toolId: FormatFactoryToolId) => {
  if (toolId === 'ingredient-list') return '';
  if (toolId === 'ico') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'jpeg') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'webp') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'resize') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'rotate') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'filter') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'watermark') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'live') return 'video/*';
  if (toolId === 'gif') return 'video/*';
  if (toolId === 'pdf') return 'application/pdf';
  if (toolId === 'pdf2word') return 'application/pdf';
  if (toolId === 'word2pdf')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,text/html';
  if (toolId === 'img2pdf') return 'image/png,image/jpeg,image/webp';
  return '';
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
    return isEn ? 'Video files supported (recommended < 20MB)' : '支持视频文件（建议小于 20MB）';
  if (toolId === 'pdf')
    return isEn ? 'PDF supported (recommended < 20MB)' : '支持 PDF（建议小于 20MB）';
  if (toolId === 'pdf2word')
    return isEn ? 'PDF supported (text extraction)' : '支持 PDF（提取文字导出）';
  if (toolId === 'word2pdf')
    return isEn ? 'Supports DOCX / DOC (basic rendering)' : '支持 DOCX / DOC（基础渲染）';
  if (toolId === 'img2pdf')
    return isEn ? 'Supports PNG / JPEG / WEBP (multi-select)' : '支持 PNG / JPEG / WEBP（可多选）';
  return '';
};
