import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import type { PackageConfig, PackageManager, UpdateStrategy } from './types.js';
import { getInstallCommand } from './packageManager.js';

const execAsync = promisify(exec);

/**
 * Execute a command using spawn for better output handling
 * Captures stderr for error messages but suppresses stdout to not interfere with spinners
 */
function spawnAsync(command: string, options?: { env?: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';

    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'ignore', 'pipe'],  // Ignore stdin/stdout, capture stderr
      env: options?.env || process.env
    });

    // Capture stderr for error reporting
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error: any = new Error(`Command failed with exit code ${code}`);
        error.stderr = stderr.trim();
        reject(error);
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

interface UpdateResult {
  success: boolean;
  package: string;
  error?: string;
  version?: string;
  currentVersion?: string;
  updateType?: 'major' | 'minor' | 'patch' | 'none';
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
  // Force flush any pending output before starting
  if (process.stdout.isTTY) {
    process.stdout.write('');
  }

  const spinner = ora({
    text: `Checking ${chalk.bold(pkg.name)}...`,
    prefixText: '🔄',
    stream: process.stdout
  }).start();

  try {
    // Get current version before update
    const isGlobal = pkg.global !== false;
    const currentVersion = await getCurrentVersion(pkg.name, isGlobal);

    // Get target version
    const targetVersion = await getTargetVersion(pkg);

    // If target is 'latest', we need to get actual version for comparison
    let actualTargetVersion = targetVersion;
    if (targetVersion === 'latest') {
      try {
        const { stdout } = await execAsync(`npm view ${pkg.name} version`, { encoding: 'utf-8' });
        actualTargetVersion = stdout.trim();
      } catch {
        // Keep 'latest' if we can't determine actual version
      }
    }

    // Determine update type
    const updateType = determineUpdateType(currentVersion, actualTargetVersion);

    // Build version change display
    let versionDisplay = '';
    if (currentVersion && actualTargetVersion !== 'latest') {
      const updateTypeLabel = updateType !== 'none' ? ` (${updateType} update)` : '';
      versionDisplay = `${currentVersion} → ${actualTargetVersion}${updateTypeLabel}`;
      spinner.text = `Updating ${chalk.bold(pkg.name)}: ${chalk.cyan(versionDisplay)}`;
    } else if (!currentVersion) {
      versionDisplay = `installing ${actualTargetVersion}`;
      spinner.text = `Installing ${chalk.bold(pkg.name)} ${chalk.cyan(actualTargetVersion)}`;
    } else {
      versionDisplay = `updating to ${targetVersion}`;
      spinner.text = `Updating ${chalk.bold(pkg.name)} to ${targetVersion}`;
    }

    const command = getInstallCommand(
      packageManager,
      pkg.name,
      targetVersion,
      isGlobal
    );

    // Execute the update command using spawn for better control
    await spawnAsync(command, {
      env: { ...process.env, NODE_ENV: 'production' }
    });

    // Run postinstall commands if any
    if (pkg.postinstall && pkg.postinstall.length > 0) {
      spinner.text = `Running postinstall for ${chalk.bold(pkg.name)}...`;
      for (const cmd of pkg.postinstall) {
        await spawnAsync(cmd);
      }
    }

    // Success message with version change
    if (currentVersion && actualTargetVersion !== 'latest') {
      const updateTypeLabel = updateType !== 'none' ? chalk.gray(` (${updateType})`) : '';
      spinner.succeed(chalk.green(`✅ Updated ${chalk.bold(pkg.name)}: ${chalk.cyan(currentVersion)} → ${chalk.cyan(actualTargetVersion)}${updateTypeLabel}`));
    } else if (!currentVersion) {
      spinner.succeed(chalk.green(`✅ Installed ${chalk.bold(pkg.name)} ${chalk.cyan(actualTargetVersion)}`));
    } else {
      spinner.succeed(chalk.green(`✅ Updated ${chalk.bold(pkg.name)} to ${targetVersion}`));
    }

    // Force flush output to ensure spinner message is displayed immediately
    if (process.stdout.isTTY) {
      process.stdout.write('');
    }

    return {
      success: true,
      package: pkg.name,
      version: actualTargetVersion,
      currentVersion: currentVersion || undefined,
      updateType
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

    // Force flush output
    if (process.stdout.isTTY) {
      process.stdout.write('');
    }

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

async function getCurrentVersion(packageName: string, isGlobal: boolean = true): Promise<string | null> {
  try {
    const command = isGlobal
      ? `npm list -g ${packageName} --json`
      : `npm list ${packageName} --json`;

    const { stdout } = await execAsync(command, { encoding: 'utf-8' });
    const data = JSON.parse(stdout);
    const version = data.dependencies?.[packageName]?.version;

    return version || null;
  } catch (error) {
    // Package might not be installed
    return null;
  }
}

function determineUpdateType(currentVersion: string | null, targetVersion: string): 'major' | 'minor' | 'patch' | 'none' {
  if (!currentVersion || targetVersion === 'latest') {
    return 'none';
  }

  // Clean version strings (remove any pre-release/build metadata)
  const cleanVersion = (v: string) => v.split('-')[0].split('+')[0];

  const current = cleanVersion(currentVersion).split('.').map(Number);
  const target = cleanVersion(targetVersion).split('.').map(Number);

  // Handle cases where version parts might be missing
  while (current.length < 3) current.push(0);
  while (target.length < 3) target.push(0);

  const [currMajor, currMinor, currPatch] = current;
  const [targetMajor, targetMinor, targetPatch] = target;

  if (targetMajor > currMajor) {
    return 'major';
  } else if (targetMajor === currMajor && targetMinor > currMinor) {
    return 'minor';
  } else if (targetMajor === currMajor && targetMinor === currMinor && targetPatch > currPatch) {
    return 'patch';
  } else {
    return 'none';
  }
}

export async function printSummary(results: UpdateResult[]): Promise<void> {
  // Small delay to ensure all spinner outputs are flushed
  await new Promise(resolve => setImmediate(resolve));

  console.log(chalk.bold.cyan('\n📊 Update Summary:\n'));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length > 0) {
    console.log(chalk.green(`✅ Successfully updated ${successful.length} package(s):`));
    successful.forEach(r => {
      let versionInfo = '';
      if (r.currentVersion && r.version) {
        const updateTypeLabel = r.updateType && r.updateType !== 'none'
          ? chalk.gray(` (${r.updateType})`)
          : '';
        versionInfo = `: ${chalk.cyan(r.currentVersion)} → ${chalk.cyan(r.version)}${updateTypeLabel}`;
      } else if (!r.currentVersion && r.version) {
        versionInfo = `: ${chalk.cyan('new install')} → ${chalk.cyan(r.version)}`;
      } else if (r.version) {
        versionInfo = `: ${chalk.cyan(r.version)}`;
      }
      console.log(chalk.green(`   • ${r.package}${versionInfo}`));
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