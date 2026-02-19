import type { FormatFactoryTool } from '../logic/formatFactory/types';

export const formatFactoryTools: FormatFactoryTool[] = [
  {
    id: 'webp',
    name: 'WebP 转换器',
    nameEn: 'WebP Converter',
    description: 'Web 格式 · 双向转换',
    descriptionEn: 'Web Format · Two-way Conversion',
    icon: '🖼️',
    tag: 'WEB 现代格式',
    status: 'ready'
  },
  {
    id: 'jpeg',
    name: 'JPEG 压缩器',
    nameEn: 'JPEG Compressor',
    description: '极限压缩 · 批量处理',
    descriptionEn: 'Extreme Compression · Batch Processing',
    icon: '✨',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'resize',
    name: '图片尺寸调整',
    nameEn: 'Image Resizer',
    description: '改宽高 · 保持比例',
    descriptionEn: 'Resize Width/Height · Keep Aspect Ratio',
    icon: '📏',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'rotate',
    name: '图片旋转/翻转',
    nameEn: 'Rotate & Flip',
    description: '旋转角度 · 镜像翻转',
    descriptionEn: 'Rotate Angle · Mirror Flip',
    icon: '🔄',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'filter',
    name: '图片滤镜',
    nameEn: 'Image Filters',
    description: '黑白/复古/反色',
    descriptionEn: 'Grayscale / Sepia / Invert',
    icon: '🎛️',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'watermark',
    name: '图片去水印',
    nameEn: 'Watermark Remover',
    description: '智能裁剪 · 手动框选',
    descriptionEn: 'Smart Crop · Manual Selection',
    icon: '💧',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'live',
    name: 'Live Photo 转换器',
    nameEn: 'Live Photo Converter',
    description: 'HEIC 静态图 · MOV 视频选帧',
    descriptionEn: 'HEIC Still · MOV Frame Selection',
    icon: '📱',
    tag: '移动端格式',
    status: 'ready'
  },
  {
    id: 'pdf',
    name: 'PDF 转图片',
    nameEn: 'PDF to Image',
    description: '拆分页面 · 长图拼接',
    descriptionEn: 'Split Pages · Long Image Stitching',
    icon: '📄',
    tag: 'PDF 工具',
    status: 'ready'
  },
  {
    id: 'pdf2word',
    name: 'PDF 转 Word',
    nameEn: 'PDF to Word',
    description: '提取文本 · 导出 DOC',
    descriptionEn: 'Extract Text · Export DOC',
    icon: '📝',
    tag: '文档工具',
    status: 'ready'
  },
  {
    id: 'word2pdf',
    name: 'Word 转 PDF',
    nameEn: 'Word to PDF',
    description: '提取文本 · 导出 PDF',
    descriptionEn: 'Extract Text · Export PDF',
    icon: '📄',
    tag: '文档工具',
    status: 'ready'
  },
  {
    id: 'txt2pdf',
    name: 'TXT 转 PDF',
    nameEn: 'TXT to PDF',
    description: '纯文本排版 · 导出 PDF',
    descriptionEn: 'Text Layout · Export PDF',
    icon: '🧷',
    tag: '文档工具',
    status: 'ready'
  },
  {
    id: 'img2pdf',
    name: '图片转 PDF',
    nameEn: 'Image to PDF',
    description: '多图合并成文档',
    descriptionEn: 'Merge Images into Document',
    icon: '📑',
    tag: 'PDF 工具',
    status: 'ready'
  },
  {
    id: 'gif',
    name: '视频转 GIF',
    nameEn: 'Video to GIF',
    description: '视频转动图 · 10s/20MB',
    descriptionEn: 'Video to Animation · 10s/20MB limit',
    icon: '🎞️',
    tag: '视频工具',
    status: 'ready'
  },
  {
    id: 'ico',
    name: 'ICO 生成器',
    nameEn: 'ICO Generator',
    description: '多尺寸 PNG 打包下载',
    descriptionEn: 'Multi-size PNG Pack Download',
    icon: '📐',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'ingredient-list',
    name: 'FDA配料表生成器',
    nameEn: 'FDA Ingredient Generator',
    description: '输入文字 · 一键生成标签图',
    descriptionEn: 'Input Text · One-click Label Gen',
    icon: '🧾',
    tag: 'AI 免费工具',
    status: 'ready'
  }
];
