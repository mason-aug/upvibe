#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, validatePackageConfig, getConfigPaths, addPackageToConfig, getConfigPath, removePackageFromConfig } from './config.js';
import { detectPackageManager, checkAllPackageManagers, getPackageManagerVersion } from './packageManager.js';
import { updatePackages, printSummary } from './installer.js';
import type { PackageManager } from './types.js';

const program = new Command();

program
  .name('upvibe')
  .description('upvibe — one command to update all your npm packages')
  .version('1.2.0');

// Update command
program
  .command('update')
  .alias('u')
  .description('Update all configured packages')
  .option('-m, --manager <manager>', 'specify package manager (npm, yarn, pnpm)')
  .action(async (options) => {
    try {
      // Load configuration
      const config = await loadConfig();
      if (!config) {
        console.error(chalk.red('❌ No configuration file found!'));
        console.error(chalk.yellow(`\nLooked for ${chalk.bold('.upvibe.json')} in:`));
        getConfigPaths().forEach(path => {
          console.error(chalk.gray(`  • ${path}`));
        });
        console.error(chalk.cyan('\nCreate a .upvibe.json file with your package configuration.'));
        process.exit(1);
      }

      // Validate configuration
      const errors: string[] = [];
      for (const pkg of config.packages) {
        errors.push(...validatePackageConfig(pkg));
      }

      if (errors.length > 0) {
        console.error(chalk.red('❌ Configuration errors:'));
        errors.forEach(error => {
          console.error(chalk.red(`  • ${error}`));
        });
        process.exit(1);
      }

      if (config.packages.length === 0) {
        console.log(chalk.yellow('⚠️  No packages configured to update'));
        process.exit(0);
      }

      // Detect or use specified package manager
      let packageManager: PackageManager;
      if (options.manager) {
        if (!['npm', 'yarn', 'pnpm'].includes(options.manager)) {
          console.error(chalk.red(`❌ Invalid package manager: ${options.manager}`));
          console.error(chalk.yellow('Valid options are: npm, yarn, pnpm'));
          process.exit(1);
        }
        packageManager = options.manager as PackageManager;
      } else if (config.packageManager) {
        // Use package manager from config if specified
        packageManager = config.packageManager;
        console.log(chalk.gray(`Using package manager from config: ${packageManager}`));
      } else {
        packageManager = await detectPackageManager();
      }

      // Update packages
      const results = await updatePackages(config.packages, packageManager);

      // Print summary
      printSummary(results);

      // Exit with error code if any updates failed
      const hasFailures = results.some(r => !r.success);
      process.exit(hasFailures ? 1 : 0);

    } catch (error) {
      console.error(chalk.red('❌ Unexpected error:'), error);
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List all configured packages')
  .action(async () => {
    try {
      const config = await loadConfig();
      if (!config) {
        console.error(chalk.red('❌ No configuration file found!'));
        console.error(chalk.yellow(`\nLooked for ${chalk.bold('.upvibe.json')} in:`));
        getConfigPaths().forEach(path => {
          console.error(chalk.gray(`  • ${path}`));
        });
        process.exit(1);
      }

      if (config.packages.length === 0) {
        console.log(chalk.yellow('⚠️  No packages configured'));
        process.exit(0);
      }

      console.log(chalk.bold.cyan('\n📦 Configured Packages:\n'));

      config.packages.forEach((pkg, index) => {
        const scope = pkg.global !== false ? 'global' : 'local';
        const strategy = pkg.strategy || 'latest';

        console.log(chalk.bold(`${index + 1}. ${pkg.name}`));
        console.log(chalk.gray(`   Scope: ${scope}`));
        console.log(chalk.gray(`   Strategy: ${strategy}`));

        if (pkg.version) {
          console.log(chalk.gray(`   Version: ${pkg.version}`));
        }

        if (pkg.postinstall && pkg.postinstall.length > 0) {
          console.log(chalk.gray(`   Postinstall: ${pkg.postinstall.length} command(s)`));
        }

        console.log();
      });

    } catch (error) {
      console.error(chalk.red('❌ Error reading configuration:'), error);
      process.exit(1);
    }
  });

// Add command
program
  .command('add <package>')
  .description('Add a package to the configuration')
  .option('-g, --global <boolean>', 'install globally (default: true)', 'true')
  .option('-s, --strategy <strategy>', 'update strategy: latest, minor, patch, pinned (default: latest)', 'latest')
  .option('-v, --version <version>', 'specific version (only for pinned strategy)')
  .option('-p, --postinstall <commands...>', 'post-install commands to run')
  .action(async (packageName, options) => {
    try {
      // Parse global option
      const global = options.global === 'true' || options.global === true;

      // Validate strategy
      const validStrategies = ['latest', 'minor', 'patch', 'pinned'];
      if (!validStrategies.includes(options.strategy)) {
        console.error(chalk.red(`❌ Invalid strategy: ${options.strategy}`));
        console.error(chalk.yellow('Valid strategies are: latest, minor, patch, pinned'));
        process.exit(1);
      }

      // Validate pinned strategy requires version
      if (options.strategy === 'pinned' && !options.version) {
        console.error(chalk.red('❌ Version is required when using "pinned" strategy'));
        console.error(chalk.yellow('Use --version to specify the version'));
        process.exit(1);
      }

      // Prepare package configuration
      const packageConfig: any = {
        global,
        strategy: options.strategy
      };

      if (options.version) {
        packageConfig.version = options.version;
      }

      if (options.postinstall) {
        packageConfig.postinstall = Array.isArray(options.postinstall)
          ? options.postinstall
          : [options.postinstall];
      }

      // Add package to config
      await addPackageToConfig(packageName, packageConfig);

      const configPath = await getConfigPath();
      console.log(chalk.green(`✅ Added ${chalk.bold(packageName)} to configuration`));
      console.log(chalk.gray(`   Config file: ${configPath}`));
      console.log(chalk.gray(`   Global: ${global}`));
      console.log(chalk.gray(`   Strategy: ${options.strategy}`));

      if (options.version) {
        console.log(chalk.gray(`   Version: ${options.version}`));
      }

      if (options.postinstall) {
        console.log(chalk.gray(`   Postinstall: ${packageConfig.postinstall.length} command(s)`));
      }

      console.log(chalk.cyan('\nRun "upvibe update" to install the package'));

    } catch (error) {
      console.error(chalk.red('❌ Error adding package:'), error);
      process.exit(1);
    }
  });

// Remove command
program
  .command('remove <package>')
  .description('Remove a package from the configuration')
  .action(async (packageName) => {
    try {
      const removed = await removePackageFromConfig(packageName);

      if (removed) {
        const configPath = await getConfigPath();
        console.log(chalk.green(`✅ Removed ${chalk.bold(packageName)} from configuration`));
        console.log(chalk.gray(`   Config file: ${configPath}`));
      } else {
        console.log(chalk.yellow(`⚠️  Package ${chalk.bold(packageName)} not found in configuration`));
      }

    } catch (error) {
      console.error(chalk.red('❌ Error removing package:'), error);
      process.exit(1);
    }
  });

// Doctor command
program
  .command('doctor')
  .description('Check system for available package managers')
  .action(async () => {
    try {
      console.log(chalk.bold.cyan('\n🩺 System Check:\n'));

      // Check Node.js version
      console.log(chalk.bold('Node.js:'));
      console.log(chalk.gray(`  Version: ${process.version}`));

      const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
      if (nodeVersion >= 18) {
        console.log(chalk.green('  ✅ Version 18+ (compatible)'));
      } else {
        console.log(chalk.red(`  ❌ Version ${nodeVersion} (requires 18+)`));
      }

      // Check package managers
      console.log(chalk.bold('\nPackage Managers:'));
      const managers = await checkAllPackageManagers();
      const managerOrder: PackageManager[] = ['pnpm', 'yarn', 'npm'];

      for (const pm of managerOrder) {
        if (managers[pm]) {
          const version = await getPackageManagerVersion(pm);
          console.log(chalk.green(`  ✅ ${pm} ${version ? `(${version})` : ''}`));
        } else {
          console.log(chalk.gray(`  ○ ${pm} (not installed)`));
        }
      }

      // Detect default package manager
      const defaultPM = await detectPackageManager();
      console.log(chalk.bold(`\nDefault package manager: ${chalk.cyan(defaultPM)}`));

      // Check configuration
      console.log(chalk.bold('\nConfiguration:'));
      const config = await loadConfig();
      if (config) {
        console.log(chalk.green(`  ✅ Config file found (${config.packages.length} packages)`));

        // Validate configuration
        const errors: string[] = [];
        for (const pkg of config.packages) {
          errors.push(...validatePackageConfig(pkg));
        }

        if (errors.length > 0) {
          console.log(chalk.yellow('  ⚠️  Configuration has errors:'));
          errors.forEach(error => {
            console.log(chalk.yellow(`     • ${error}`));
          });
        }
      } else {
        console.log(chalk.yellow('  ⚠️  No config file found'));
        console.log(chalk.gray('     Searched in:'));
        getConfigPaths().forEach(path => {
          console.log(chalk.gray(`       • ${path}`));
        });
      }

      console.log();

    } catch (error) {
      console.error(chalk.red('❌ Error during system check:'), error);
      process.exit(1);
    }
  });

program.parse();
