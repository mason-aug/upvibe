import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import type { PackageConfig, PackageManager, UpdateStrategy } from './types.js';
import { getInstallCommand } from './packageManager.js';

const execAsync = promisify(exec);

interface UpdateResult {
  success: boolean;
  package: string;
  error?: string;
  version?: string;
}

export async function updatePackages(
  packages: PackageConfig[],
  packageManager: PackageManager
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];

  console.log(chalk.bold.cyan(`\n🚀 Updating packages with ${packageManager}...\n`));

  for (const pkg of packages) {
    const result = await updatePackage(pkg, packageManager);
    results.push(result);
  }

  return results;
}

async function updatePackage(
  pkg: PackageConfig,
  packageManager: PackageManager
): Promise<UpdateResult> {
  const spinner = ora({
    text: `Updating ${chalk.bold(pkg.name)}...`,
    prefixText: '🔄'
  }).start();

  try {
    const targetVersion = await getTargetVersion(pkg);
    const command = getInstallCommand(
      packageManager,
      pkg.name,
      targetVersion,
      pkg.global !== false
    );

    // Execute the update command
    spinner.text = `Installing ${chalk.bold(pkg.name)} with ${packageManager}...`;
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, NODE_ENV: 'production' }
    });

    // Run postinstall commands if any
    if (pkg.postinstall && pkg.postinstall.length > 0) {
      spinner.text = `Running postinstall for ${chalk.bold(pkg.name)}...`;
      for (const cmd of pkg.postinstall) {
        await execAsync(cmd);
      }
    }

    spinner.succeed(chalk.green(`✅ Updated ${chalk.bold(pkg.name)} to ${targetVersion}`));

    return {
      success: true,
      package: pkg.name,
      version: targetVersion
    };
  } catch (error) {
    let errorMessage: string;
    if (error instanceof Error) {
      // Extract stderr or use error message
      const execError = error as any;
      if (execError.stderr && execError.stderr.trim()) {
        errorMessage = execError.stderr.trim();
      } else {
        errorMessage = error.message;
      }
    } else {
      errorMessage = String(error);
    }

    spinner.fail(chalk.red(`❌ Failed to update ${chalk.bold(pkg.name)}`));
    console.error(chalk.gray(`   Error: ${errorMessage.split('\n')[0]}`));

    return {
      success: false,
      package: pkg.name,
      error: errorMessage.split('\n')[0]
    };
  }
}

async function getTargetVersion(pkg: PackageConfig): Promise<string> {
  const strategy = pkg.strategy || 'latest';

  switch (strategy) {
    case 'latest':
      return 'latest';

    case 'pinned':
      if (!pkg.version) {
        throw new Error('Version is required for pinned strategy');
      }
      return pkg.version;

    case 'minor':
    case 'patch':
      return await getVersionByStrategy(pkg.name, strategy);

    default:
      return 'latest';
  }
}

async function getVersionByStrategy(
  packageName: string,
  strategy: 'minor' | 'patch'
): Promise<string> {
  try {
    // Get current version
    const { stdout: currentVersionOutput } = await execAsync(
      `npm list -g ${packageName} --json`,
      { encoding: 'utf-8' }
    );

    const data = JSON.parse(currentVersionOutput);
    const currentVersion = data.dependencies?.[packageName]?.version;

    if (!currentVersion) {
      return 'latest'; // If not installed, install latest
    }

    // Get available versions
    const { stdout: versionsOutput } = await execAsync(
      `npm view ${packageName} versions --json`,
      { encoding: 'utf-8' }
    );

    const availableVersions: string[] = JSON.parse(versionsOutput);

    // Parse current version
    const [major, minor, patch] = currentVersion.split('.').map(Number);

    // Filter versions based on strategy
    const eligibleVersions = availableVersions.filter(v => {
      const [vMajor, vMinor, vPatch] = v.split('.').map(Number);

      if (strategy === 'minor') {
        return vMajor === major && (vMinor > minor || (vMinor === minor && vPatch > patch));
      } else { // patch
        return vMajor === major && vMinor === minor && vPatch > patch;
      }
    });

    // Return the latest eligible version or current if no updates
    return eligibleVersions.length > 0
      ? eligibleVersions[eligibleVersions.length - 1]
      : currentVersion;

  } catch (error) {
    // If we can't determine the version, fall back to latest
    console.warn(chalk.yellow(`⚠️  Could not determine ${strategy} version for ${packageName}, using latest`));
    return 'latest';
  }
}

export function printSummary(results: UpdateResult[]): void {
  console.log(chalk.bold.cyan('\n📊 Update Summary:\n'));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length > 0) {
    console.log(chalk.green(`✅ Successfully updated ${successful.length} package(s):`));
    successful.forEach(r => {
      console.log(chalk.green(`   • ${r.package} ${r.version ? `(${r.version})` : ''}`));
    });
  }

  if (failed.length > 0) {
    console.log(chalk.red(`\n❌ Failed to update ${failed.length} package(s):`));
    failed.forEach(r => {
      console.log(chalk.red(`   • ${r.package}: ${r.error}`));
    });
  }

  console.log();
}