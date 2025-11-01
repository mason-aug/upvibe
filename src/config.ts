import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import type { UpdoConfig, PackageConfig } from './types.js';

const CONFIG_FILENAME = '.upvibe.json';

export async function loadConfig(): Promise<UpdoConfig | null> {
  // Check local config first
  const localConfigPath = path.resolve(process.cwd(), CONFIG_FILENAME);

  try {
    const config = await readConfigFile(localConfigPath);
    if (config) {
      return config;
    }
  } catch {
    // Local config not found, continue
  }

  // Check home directory config
  const homeConfigPath = path.join(homedir(), CONFIG_FILENAME);

  try {
    const config = await readConfigFile(homeConfigPath);
    if (config) {
      return config;
    }
  } catch {
    // Home config not found
  }

  return null;
}

async function readConfigFile(filePath: string): Promise<UpdoConfig | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(content) as UpdoConfig;

    // Validate and set defaults
    if (!config.packages || !Array.isArray(config.packages)) {
      throw new Error('Invalid config: packages must be an array');
    }

    // Set defaults for each package
    config.packages = config.packages.map(pkg => ({
      ...pkg,
      global: pkg.global !== false, // Default to true
      strategy: pkg.strategy || 'latest'
    }));

    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function validatePackageConfig(pkg: PackageConfig): string[] {
  const errors: string[] = [];

  if (!pkg.name) {
    errors.push('Package name is required');
  }

  if (pkg.strategy === 'pinned' && !pkg.version) {
    errors.push(`Package "${pkg.name}": version is required when strategy is "pinned"`);
  }

  if (pkg.version && pkg.strategy !== 'pinned') {
    errors.push(`Package "${pkg.name}": version can only be specified when strategy is "pinned"`);
  }

  return errors;
}

export function getConfigPaths(): string[] {
  return [
    path.resolve(process.cwd(), CONFIG_FILENAME),
    path.join(homedir(), CONFIG_FILENAME)
  ];
}

export async function getConfigPath(): Promise<string> {
  // Check if local config exists
  const localConfigPath = path.resolve(process.cwd(), CONFIG_FILENAME);
  try {
    await fs.access(localConfigPath);
    return localConfigPath;
  } catch {
    // Local doesn't exist, check home
  }

  // Check if home config exists
  const homeConfigPath = path.join(homedir(), CONFIG_FILENAME);
  try {
    await fs.access(homeConfigPath);
    return homeConfigPath;
  } catch {
    // Neither exists, prefer local for new config
    return localConfigPath;
  }
}

export async function addPackageToConfig(packageName: string, options?: Partial<PackageConfig>): Promise<void> {
  const configPath = await getConfigPath();

  // Load existing config or create new one
  let config: UpdoConfig;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    // Config doesn't exist, create new one
    config = { packages: [] };
  }

  // Check if package already exists
  const existingIndex = config.packages.findIndex(pkg => pkg.name === packageName);

  const newPackage: PackageConfig = {
    name: packageName,
    global: options?.global !== false, // Default to true
    strategy: options?.strategy || 'latest', // Default to 'latest'
    ...options
  };

  if (existingIndex >= 0) {
    // Update existing package
    config.packages[existingIndex] = newPackage;
  } else {
    // Add new package
    config.packages.push(newPackage);
  }

  // Write config file with proper formatting
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function removePackageFromConfig(packageName: string): Promise<boolean> {
  const configPath = await getConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config: UpdoConfig = JSON.parse(content);

    const originalLength = config.packages.length;
    config.packages = config.packages.filter(pkg => pkg.name !== packageName);

    if (config.packages.length < originalLength) {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
