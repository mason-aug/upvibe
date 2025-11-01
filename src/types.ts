export type UpdateStrategy = 'latest' | 'minor' | 'patch' | 'pinned';

export interface PackageConfig {
  name: string;
  global?: boolean;
  strategy?: UpdateStrategy;
  version?: string;
  postinstall?: string[];
}

export interface UpdoConfig {
  packages: PackageConfig[];
  packageManager?: PackageManager;
}

export type PackageManager = 'pnpm' | 'yarn' | 'npm';