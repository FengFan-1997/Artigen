export type FormatFactoryToolStatus = 'ready' | 'soon';

export type FormatFactoryToolId =
  | 'webp'
  | 'jpeg'
  | 'watermark'
  | 'live'
  | 'pdf'
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
