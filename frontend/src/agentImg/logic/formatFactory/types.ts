export type FormatFactoryToolStatus = 'ready' | 'soon';

export type FormatFactoryToolId =
  | 'webp'
  | 'jpeg'
  | 'resize'
  | 'rotate'
  | 'filter'
  | 'watermark'
  | 'live'
  | 'pdf'
  | 'pdf2word'
  | 'word2pdf'
  | 'img2pdf'
  | 'gif'
  | 'ico'
  | 'ingredient-list';

export type FormatFactoryTool = {
  id: FormatFactoryToolId;
  name: string;
  description: string;
  icon: string;
  tag: string;
  status: FormatFactoryToolStatus;
};
