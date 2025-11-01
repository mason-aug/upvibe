import { exec } from 'child_process';
import { promisify } from 'util';
import type { PackageManager } from './types.js';

const execAsync = promisify(exec);

export async function detectPackageManager(): Promise<PackageManager> {
  // Default to npm as it's always available with Node.js
  // Check in order: npm (default), yarn, pnpm
  const managers: PackageManager[] = ['npm', 'yarn', 'pnpm'];

  for (const manager of managers) {
    if (await isAvailable(manager)) {
      return manager;
    }
  }

  // npm should always be available with Node.js
  return 'npm';
}

async function isAvailable(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

export async function getPackageManagerVersion(pm: PackageManager): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`${pm} --version`);
    return stdout.trim();
  } catch {
    return null;
  }
}

export function getInstallCommand(
  pm: PackageManager,
  packageName: string,
  version: string,
  global: boolean = true
): string {
  const globalFlag = global ? '-g' : '';

  switch (pm) {
    case 'pnpm':
      return `pnpm add ${globalFlag} ${packageName}@${version}`.trim();
    case 'yarn':
      return `yarn global add ${packageName}@${version}`.trim();
    case 'npm':
      return `npm install ${globalFlag} ${packageName}@${version}`.trim();
    default:
      throw new Error(`Unknown package manager: ${pm}`);
  }
}

export async function checkAllPackageManagers(): Promise<Record<PackageManager, boolean>> {
  const results: Partial<Record<PackageManager, boolean>> = {};
  const managers: PackageManager[] = ['pnpm', 'yarn', 'npm'];

  for (const manager of managers) {
    results[manager] = await isAvailable(manager);
  }

  return results as Record<PackageManager, boolean>;
}