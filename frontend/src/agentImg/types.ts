export type AgentImgMode = 'normal' | 'deep';

export type AgentImgDirectionOption = {
  id: string;
  title: string;
  summary: string;
  styleTags: string[];
  negativeTags?: string[];
  suggested?: {
    imageSize?: string;
    steps?: number;
    guidanceScale?: number;
    seed?: number;
  };
};

export type AgentImgPromptResult = {
  prompt: string;
  negativePrompt: string;
  params?: {
    imageSize?: string;
    steps?: number;
    guidanceScale?: number;
    seed?: number;
  };
};
