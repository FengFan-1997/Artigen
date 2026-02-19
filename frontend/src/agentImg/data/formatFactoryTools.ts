import type { FormatFactoryTool } from '../logic/formatFactory/types';

export const formatFactoryTools: FormatFactoryTool[] = [
  {
    id: 'webp',
    name: 'WebP 转换器',
    nameEn: 'WebP Converter',
    description: 'Web 格式 · 双向转换',
    descriptionEn: 'Web Format · Two-way Conversion',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    tag: 'WEB 现代格式',
    status: 'ready'
  },
  {
    id: 'jpeg',
    name: 'JPEG 压缩器',
    nameEn: 'JPEG Compressor',
    description: '极限压缩 · 批量处理',
    descriptionEn: 'Extreme Compression · Batch Processing',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'resize',
    name: '图片尺寸调整',
    nameEn: 'Image Resizer',
    description: '改宽高 · 保持比例',
    descriptionEn: 'Resize Width/Height · Keep Aspect Ratio',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'rotate',
    name: '图片旋转/翻转',
    nameEn: 'Rotate & Flip',
    description: '旋转角度 · 镜像翻转',
    descriptionEn: 'Rotate Angle · Mirror Flip',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'filter',
    name: '图片滤镜',
    nameEn: 'Image Filters',
    description: '黑白/复古/反色',
    descriptionEn: 'Grayscale / Sepia / Invert',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="14.31" y1="8" x2="20.05" y2="17.94"></line><line x1="9.69" y1="8" x2="21.17" y2="8"></line><line x1="7.38" y1="12" x2="13.12" y2="2.06"></line><line x1="9.69" y1="16" x2="3.95" y2="6.06"></line><line x1="14.31" y1="16" x2="2.83" y2="16"></line><line x1="16.62" y1="12" x2="10.88" y2="21.94"></line></svg>',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'watermark',
    name: '图片去水印',
    nameEn: 'Watermark Remover',
    description: '智能裁剪 · 手动框选',
    descriptionEn: 'Smart Crop · Manual Selection',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'live',
    name: 'Live Photo 转换器',
    nameEn: 'Live Photo Converter',
    description: 'HEIC 静态图 · MOV 视频选帧',
    descriptionEn: 'HEIC Still · MOV Frame Selection',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
    tag: '移动端格式',
    status: 'ready'
  },
  {
    id: 'pdf',
    name: 'PDF 转图片',
    nameEn: 'PDF to Image',
    description: '拆分页面 · 长图拼接',
    descriptionEn: 'Split Pages · Long Image Stitching',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    tag: 'PDF 工具',
    status: 'ready'
  },
  {
    id: 'pdf2word',
    name: 'PDF 转 Word',
    nameEn: 'PDF to Word',
    description: '提取文本 · 导出 DOC',
    descriptionEn: 'Extract Text · Export DOC',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    tag: '文档工具',
    status: 'ready'
  },
  {
    id: 'word2pdf',
    name: 'Word 转 PDF',
    nameEn: 'Word to PDF',
    description: '提取文本 · 导出 PDF',
    descriptionEn: 'Extract Text · Export PDF',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    tag: '文档工具',
    status: 'ready'
  },
  {
    id: 'txt2pdf',
    name: 'TXT 转 PDF',
    nameEn: 'TXT to PDF',
    description: '纯文本排版 · 导出 PDF',
    descriptionEn: 'Text Layout · Export PDF',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M2 15h10"></path><path d="M9 18l3-3-3-3"></path></svg>',
    tag: '文档工具',
    status: 'ready'
  },
  {
    id: 'img2pdf',
    name: '图片转 PDF',
    nameEn: 'Image to PDF',
    description: '多图合并成文档',
    descriptionEn: 'Merge Images into Document',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    tag: 'PDF 工具',
    status: 'ready'
  },
  {
    id: 'gif',
    name: '视频转 GIF',
    nameEn: 'Video to GIF',
    description: '视频转动图 · 10s/20MB',
    descriptionEn: 'Video to Animation · 10s/20MB limit',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>',
    tag: '视频工具',
    status: 'ready'
  },
  {
    id: 'ico',
    name: 'ICO 生成器',
    nameEn: 'ICO Generator',
    description: '多尺寸 PNG 打包下载',
    descriptionEn: 'Multi-size PNG Pack Download',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.73 6.12l-9.6-5.33a1.92 1.92 0 0 0-1.86 0l-9.6 5.33A1.92 1.92 0 0 0 0 7.8v8.4a1.92 1.92 0 0 0 .96 1.68l9.6 5.33a1.92 1.92 0 0 0 1.86 0l9.6-5.33a1.92 1.92 0 0 0 .96-1.68V7.8a1.92 1.92 0 0 0-.97-1.68z"></path><line x1="12" y1="2.24" x2="12" y2="12"></line><line x1="3.42" y1="7.5" x2="12" y2="12"></line><line x1="12" y1="12" x2="20.58" y2="7.5"></line><line x1="12" y1="12" x2="12" y2="21.76"></line></svg>',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'ingredient-list',
    name: 'FDA配料表生成器',
    nameEn: 'FDA Ingredient Generator',
    description: '输入文字 · 一键生成标签图',
    descriptionEn: 'Input Text · One-click Label Gen',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    tag: 'AI 免费工具',
    status: 'ready'
  }
];
