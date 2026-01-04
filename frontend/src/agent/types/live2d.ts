export interface ModelIndexItem {
  name: string;
  path: string;
  configFile: string;
  version: number;
}

export interface ModelListCDN {
  messages: string[];
  models: string | string[];
}

export interface ModelList {
  name: string;
  paths: string[];
  message: string;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'none';

export interface Config {
  waifuPath: string;
  apiPath?: string;
  cdnPath?: string;
  assetsPath?: string;
  cubism2Path?: string;
  modelId?: number;
  tools?: string[];
  drag?: boolean;
  disableIdle?: boolean;
  logLevel?: LogLevel;
  onChat?: () => void;
}

export type Time = {
  hour: string;
  text: string;
}[];

export interface Tips {
  message: {
    default: string[];
    console: string;
    copy: string;
    visibilitychange: string;
    changeSuccess: string;
    changeFail: string;
    photo: string;
    goodbye: string;
    hitokoto: string;
    welcome: string;
    referrer: string;
    hoverBody: string | string[];
    tapBody: string | string[];
    [key: string]: unknown;
  };
  time: Time;
  mouseover: {
    selector: string;
    text: string | string[];
  }[];
  click: {
    selector: string;
    text: string | string[];
  }[];
  seasons: {
    date: string;
    text: string | string[];
  }[];
  models: ModelList[];
}
