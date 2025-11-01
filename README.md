# upvibe

> **upvibe — one command to update all your npm packages.**
> Simple. Config-driven. Always vibing.

A lightweight CLI tool that updates all your globally installed npm packages with a single command, based on a configuration file.

## Features

- 🚀 Update multiple npm packages with one command
- ➕ Add and remove packages from configuration via CLI
- 📦 Support for npm, yarn, and pnpm (auto-detects or specify)
- ⚙️ Flexible update strategies (latest, minor, patch, pinned)
- 🔧 Post-install hooks for each package
- 🎨 Beautiful progress indicators with colors and icons
- 💪 Continues on failure with proper error reporting

## Installation

```bash
# Install globally with npm
npm install -g upvibe

# Or with pnpm
pnpm add -g upvibe

# Or with yarn
yarn global add upvibe
```

### Development Installation

```bash
# Clone the repository
git clone <repository-url>
cd upvibe

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Link globally for testing
npm link
```

## Configuration

Create a `.upvibe.json` file in your project directory or home directory (`~/upvibebe.json`):

```json
{
  "packageManager": "npm",
  "packages": [
    {
      "name": "@openai/codex",
      "global": true,
      "strategy": "latest"
    },
    {
      "name": "@anthropic-ai/claude-code",
      "global": true,
      "strategy": "latest"
    },
    {
      "name": "create-react-app",
      "global": true,
      "postinstall": ["echo 'CRA updated!'"]
    }
  ]
}
```

### Configuration Options

#### Top-level Options
- **`packageManager`** (optional): Preferred package manager (`"npm"`, `"yarn"`, or `"pnpm"`). If not specified, defaults to npm.

#### Package Options
- **`name`** (required): The npm package name
- **`global`**: Whether to install globally with `-g` flag (default: `true`)
- **`strategy`**: Update strategy (default: `"latest"`)
  - `"latest"`: Always update to the latest version
  - `"minor"`: Update to latest minor version (1.2.x → 1.3.x)
  - `"patch"`: Update to latest patch version (1.2.3 → 1.2.4)
  - `"pinned"`: Install specific version (requires `version` field)
- **`version`**: Specific version to install (only with `strategy: "pinned"`)
- **`postinstall`**: Array of shell commands to run after installation

## Usage

### Update all packages

```bash
upvibe update
# or use short command
upvibe u
```

This command:
1. Reads configuration from `.upvibe.json` (local) or `~/upvibebe.json` (home)
2. Selects package manager in order of priority:
   - Command line option (`--manager`)
   - Config file setting (`packageManager`)
   - Auto-detect (defaults to npm, then yarn, then pnpm)
3. Updates all configured packages
4. Shows progress with colors and icons
5. Runs post-install commands if configured
6. Returns exit code 1 if any updates failed

### Specify package manager

```bash
upvibe update --manager pnpm
upvibe update -m yarn
```

### Add a package to configuration

```bash
# Add with defaults (global: true, strategy: latest)
upvibe add typescript

# Add with specific strategy
upvibe add eslint --strategy patch
upvibe add prettier -s minor

# Add with pinned version
upvibe add @types/node --strategy pinned --version 20.10.5

# Add as local package
upvibe add some-package --global false

# Add with post-install commands
upvibe add create-react-app --postinstall "echo 'CRA installed!'"
```

Options:
- `-g, --global <boolean>`: Install globally (default: `true`)
- `-s, --strategy <strategy>`: Update strategy - `latest`, `minor`, `patch`, `pinned` (default: `latest`)
- `-v, --version <version>`: Specific version (required for `pinned` strategy)
- `-p, --postinstall <commands...>`: Post-install commands to run

### Remove a package from configuration

```bash
upvibe remove typescript
```

### List configured packages

```bash
upvibe list
```

Shows all configured packages with their settings:
- Package name
- Scope (global/local)
- Update strategy
- Version (if pinned)
- Post-install commands count

### Check system compatibility

```bash
upvibe doctor
```

Runs a system check showing:
- Node.js version compatibility
- Available package managers and versions
- Default package manager
- Configuration file status and validation

## Example Output

```bash
$ upvibe update

🚀 Updating packages with npm...

🔄 Updating @openai/codex...
✅ Updated @openai/codex to latest
🔄 Updating @anthropic-ai/claude-code...
✅ Updated @anthropic-ai/claude-code to latest
🔄 Updating typescript...
✅ Updated typescript to 5.3.3
🔄 Updating prettier...
✅ Updated prettier to latest

📊 Update Summary:

✅ Successfully updated 4 package(s):
   • @openai/codex (latest)
   • @anthropic-ai/claude-code (latest)
   • typescript (5.3.3)
   • prettier (latest)
```

## Requirements

- Node.js 18+
- npm, yarn, or pnpm

## License

MIT
