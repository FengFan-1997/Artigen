import type { FormatFactoryToolId } from './types';

export const acceptForTool = (toolId: FormatFactoryToolId) => {
  if (toolId === 'ingredient-list') return '';
  if (toolId === 'ico') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'jpeg') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'webp') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'watermark') return 'image/png,image/jpeg,image/webp';
  if (toolId === 'live') return 'video/*';
  if (toolId === 'gif') return 'video/*';
  if (toolId === 'pdf') return 'application/pdf';
  if (toolId === 'img2pdf') return 'image/png,image/jpeg,image/webp';
  return '';
};

export const acceptHintForTool = (toolId: FormatFactoryToolId) => {
  if (toolId === 'ingredient-list') return '输入配方/描述文本即可';
  if (toolId === 'ico') return '支持 PNG / JPEG / WEBP';
  if (toolId === 'jpeg') return '支持 PNG / JPEG / WEBP';
  if (toolId === 'webp') return '支持 PNG / JPEG / WEBP';
  if (toolId === 'watermark') return '支持 PNG / JPEG / WEBP';
  if (toolId === 'live') return '支持视频文件（取决于浏览器解码能力）';
  if (toolId === 'gif') return '支持视频文件（建议小于 20MB）';
  if (toolId === 'pdf') return '支持 PDF（建议小于 20MB）';
  if (toolId === 'img2pdf') return '支持 PNG / JPEG / WEBP（可多选）';
  return '';
};
