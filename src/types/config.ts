export interface CDNConfig {
  archives: string[];
  archiveGroup: string;
  patchArchives?: string[];
  builds?: string[];
  fileIndex?: string;
  fileIndexSize?: string;
  patchFileIndex?: string;
  patchFileIndexSize?: string;
  patchArchiveGroup?: string;
  [key: string]: any;
}

export interface BuildConfig {
  root: string;
  install: string;
  download: string;
  encoding: string;
  encodingSize: string[];
  buildName: string;
  buildPlaybuildInstaller: string;
  buildProduct: string;
  buildUid: string;
  patch: string;
  patchSize: string;
  patchConfig: string;
  [key: string]: any;
}

export interface VersionLine {
  Region: string;
  BuildConfig: string;
  CDNConfig: string;
  KeyRing?: string;
  BuildId: string;
  VersionsName: string;
  ProductConfig?: string;
}

export interface CDNLine {
  Name: string;
  Path: string;
  Hosts: string[];
  Servers: string[];
  ConfigPath: string;
}
