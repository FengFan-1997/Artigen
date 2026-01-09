import type { FormatFactoryTool } from '../logic/formatFactory/types';

export const formatFactoryTools: FormatFactoryTool[] = [
  {
    id: 'webp',
    name: 'WebP 转换器',
    description: 'Web 格式 · 双向转换',
    icon: '🖼️',
    tag: 'WEB 现代格式',
    status: 'ready'
  },
  {
    id: 'jpeg',
    name: 'JPEG 压缩器',
    description: '极限压缩 · 批量处理',
    icon: '✨',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'resize',
    name: '图片尺寸调整',
    description: '改宽高 · 保持比例',
    icon: '📏',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'rotate',
    name: '图片旋转/翻转',
    description: '旋转角度 · 镜像翻转',
    icon: '🔄',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'filter',
    name: '图片滤镜',
    description: '黑白/复古/反色',
    icon: '🎛️',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'watermark',
    name: '图片去水印',
    description: '智能裁剪 · 手动框选',
    icon: '💧',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'live',
    name: 'Live Photo 转换器',
    description: 'HEIC 静态图 · MOV 视频选帧',
    icon: '📱',
    tag: '移动端格式',
    status: 'ready'
  },
  {
    id: 'pdf',
    name: 'PDF 转图片',
    description: '拆分页面 · 长图拼接',
    icon: '📄',
    tag: 'PDF 工具',
    status: 'ready'
  },
  {
    id: 'img2pdf',
    name: '图片转 PDF',
    description: '多图合并成文档',
    icon: '📑',
    tag: 'PDF 工具',
    status: 'ready'
  },
  {
    id: 'gif',
    name: '视频转 GIF',
    description: '视频转动图 · 10s/20MB',
    icon: '🎞️',
    tag: '视频工具',
    status: 'ready'
  },
  {
    id: 'ico',
    name: 'ICO 生成器',
    description: '多尺寸 PNG 打包下载',
    icon: '📐',
    tag: '通用处理',
    status: 'ready'
  },
  {
    id: 'ingredient-list',
    name: '配料表生成器',
    description: '输入文字 · 一键生成标签图',
    icon: '🧾',
    tag: 'AI 免费工具',
    status: 'ready'
  }
];
