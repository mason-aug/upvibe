# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **upvibe** CLI tool is a lightweight Node.js package manager utility that manages updates for multiple globally installed npm packages through a configuration file. It's written in TypeScript with strict type checking and compiles to ES modules.

## Commands

### Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript (required before running)
npm run build

# Run in development mode (direct TypeScript execution)
npm run dev

# Run compiled JavaScript
npm start
# or
node dist/index.js

# Test CLI commands locally after build
./dist/index.js update
./dist/index.js list
./dist/index.js add <package>
./dist/index.js remove <package>
./dist/index.js doctor
```

### Publishing Commands

```bash
# Build and publish to npm (build runs automatically via prepublishOnly)
npm publish

# Link globally for local testing
npm link

# Test globally after linking (using the upvibe command)
upvibe update
```

## Architecture

### Module Structure

The codebase follows a modular architecture with clear separation of concerns:

```
src/
├── index.ts         # CLI entry point - defines all commands using commander.js
├── config.ts        # Configuration file management (load, save, validate)
├── packageManager.ts # Package manager detection and command building
├── installer.ts     # Package installation/update execution logic
└── types.ts         # TypeScript interfaces and type definitions
```

### Key Architectural Patterns

1. **Configuration Loading**: Loads `.upvibe.json` from the home directory (`~/`). Configuration is validated on load.

2. **Package Manager Abstraction**: Supports npm, yarn, and pnpm through a unified interface. Detection order: CLI flag → config file → auto-detect → fallback to npm.

3. **Update Strategies**:
   - `latest`: Installs `@latest` tag
   - `minor`: Fetches current version and calculates latest minor
   - `patch`: Fetches current version and calculates latest patch
   - `pinned`: Installs exact version from config

4. **Error Handling**: Continues processing all packages even if individual updates fail. Returns exit code 1 if any failures occurred.

5. **Module System**: Uses ES modules (`"type": "module"` in package.json). All imports must use `.js` extensions even for TypeScript files.

### TypeScript Configuration

- **Target**: ES2022
- **Module**: NodeNext (for proper ES module support)
- **Strict Mode**: Enabled
- **Output**: `dist/` directory with source maps and declaration files

### CLI Command Structure

All commands are defined in `src/index.ts` using commander.js:

- `update` (`u`): Execute package updates from configuration
- `list` (`ls`): Display configured packages
- `add` (`a`): Add package to configuration
- `remove` (`rm`): Remove package from configuration
- `doctor`: Check system compatibility

### Configuration File Format

The `.upvibe.json` configuration file structure (the project includes `upvibe` itself in its configuration for self-updating):

```typescript
interface Config {
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  packages: Array<{
    name: string;
    global?: boolean;
    strategy?: 'latest' | 'minor' | 'patch' | 'pinned';
    version?: string;  // Required when strategy is 'pinned'
    postinstall?: string[];
  }>;
}
```

### Build Process

TypeScript source files are compiled to JavaScript with:
- Declaration files (`.d.ts`) for type information
- Source maps (`.js.map`) for debugging
- Executable shebang added to `dist/index.js`

The compiled code in `dist/` is what gets published to npm and executed by users.

## Important Implementation Details

1. **Child Process Execution**: Uses `child_process.spawn` with `{ shell: true }` for package manager commands. Output is piped to parent process for real-time display.

2. **Version Detection**: For minor/patch strategies, executes `npm list -g <package> --json` to get current version, then `npm view <package> versions --json` to find available versions.

3. **Global Flag**: The `--global` or `-g` flag is added to install commands based on package configuration. Default is `true`.

4. **Post-install Hooks**: Executed sequentially after successful package installation using `child_process.exec`.

5. **Progress Indicators**: Uses `ora` spinners during operations and `chalk` for colored output (green for success, red for errors, cyan for info).

6. **Exit Codes**: Returns 0 for full success, 1 if any package update failed.

## Working with the Codebase

When modifying the CLI tool:

1. Make changes to TypeScript files in `src/`
2. Run `npm run build` to compile
3. Test with `npm run dev` for quick iteration or `npm start` for production behavior
4. Use `npm link` to test as a global command
5. Ensure all imports use `.js` extensions for ES module compatibility

When adding new features:
- Add new types to `src/types.ts`
- Keep command logic in `src/index.ts`
- Put reusable logic in appropriate module files
- Maintain strict TypeScript typing throughout