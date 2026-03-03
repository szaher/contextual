import { Command } from 'commander';
import { execSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOME = process.env.HOME || process.env.USERPROFILE || '~';
const PLUGIN_ID = 'ctxkit@ctxl';
const MARKETPLACE_NAME = 'ctxl';
const PLUGIN_NAME = 'ctxkit';
const PLUGINS_DIR = join(HOME, '.claude', 'plugins');

export const pluginCommand = new Command('plugin')
  .description('Manage the Claude Code ctxkit plugin');

/**
 * Locate the @ctxl/claude-plugin package directory (has .claude-plugin/plugin.json).
 */
function resolvePluginPkg(): string | null {
  // CLI at <root>/@ctxl/cli/dist/commands/plugin.js  (global npm)
  //     or <root>/packages/cli/dist/commands/plugin.js (monorepo)
  const relative = resolve(__dirname, '../../../claude-plugin');
  if (existsSync(join(relative, '.claude-plugin', 'plugin.json'))) {
    return relative;
  }

  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    const globalPlugin = join(globalRoot, '@ctxl', 'claude-plugin');
    if (existsSync(join(globalPlugin, '.claude-plugin', 'plugin.json'))) {
      return globalPlugin;
    }
  } catch {
    // npm not available
  }

  return null;
}

/**
 * Walk up from the CLI binary to find a git repo root that contains
 * .claude-plugin/marketplace.json. Returns null for global npm installs.
 */
function resolveMarketplaceRoot(): string | null {
  let dir = resolve(__dirname);
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(join(dir, '.claude-plugin', 'marketplace.json')) &&
      existsSync(join(dir, '.git'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function hasClaudeCli(): boolean {
  try {
    execSync('claude --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function claudeExec(args: string): boolean {
  const result = spawnSync('claude', args.split(' '), {
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: true,
  });
  return result.status === 0;
}

function settingsFilePath(scope: string): string {
  return scope === 'project'
    ? join(process.cwd(), '.claude', 'settings.json')
    : join(HOME, '.claude', 'settings.json');
}

/**
 * Read the plugin version from plugin package's package.json.
 */
function getPluginVersion(pluginDir: string): string {
  const pkgJson = readJsonFile(join(pluginDir, 'package.json'));
  return (pkgJson?.version as string) || '0.1.0';
}

/**
 * Directly install the plugin by copying files to the cache and updating
 * installed_plugins.json + settings.json. This bypasses the marketplace
 * system when `claude plugin marketplace add` fails (e.g. global npm installs
 * where the plugin package is not in a git repo root).
 */
function installPluginDirect(pluginDir: string, scope: string): void {
  const version = getPluginVersion(pluginDir);
  const cachePath = join(PLUGINS_DIR, 'cache', MARKETPLACE_NAME, PLUGIN_NAME, version);

  // Copy plugin files to cache
  if (existsSync(cachePath)) {
    rmSync(cachePath, { recursive: true });
  }
  mkdirSync(dirname(cachePath), { recursive: true });
  cpSync(pluginDir, cachePath, { recursive: true });

  // Update installed_plugins.json
  const installedPath = join(PLUGINS_DIR, 'installed_plugins.json');
  const installed = (readJsonFile(installedPath) ?? { version: 2, plugins: {} }) as Record<string, unknown>;
  if (!installed.plugins || typeof installed.plugins !== 'object') {
    installed.plugins = {};
  }
  const plugins = installed.plugins as Record<string, unknown[]>;

  const entry = {
    scope,
    ...(scope === 'project' ? { projectPath: process.cwd() } : {}),
    installPath: cachePath,
    version,
    installedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  // Replace existing entries for same scope or add new
  const existing = Array.isArray(plugins[PLUGIN_ID]) ? plugins[PLUGIN_ID] : [];
  const filtered = existing.filter((e) => (e as Record<string, unknown>).scope !== scope);
  filtered.push(entry);
  plugins[PLUGIN_ID] = filtered;

  writeJsonFile(installedPath, installed);

  // Update enabledPlugins in settings.json
  const sPath = settingsFilePath(scope);
  const settings = (readJsonFile(sPath) ?? {}) as Record<string, unknown>;
  if (typeof settings.enabledPlugins !== 'object' || settings.enabledPlugins === null || Array.isArray(settings.enabledPlugins)) {
    settings.enabledPlugins = {};
  }
  (settings.enabledPlugins as Record<string, boolean>)[PLUGIN_ID] = true;
  writeJsonFile(sPath, settings);
}

/**
 * Directly uninstall the plugin by removing cache files and config entries.
 */
function uninstallPluginDirect(scope: string): void {
  // Remove from installed_plugins.json
  const installedPath = join(PLUGINS_DIR, 'installed_plugins.json');
  const installed = readJsonFile(installedPath) as Record<string, unknown> | null;
  if (installed?.plugins && typeof installed.plugins === 'object') {
    const plugins = installed.plugins as Record<string, unknown[]>;
    if (Array.isArray(plugins[PLUGIN_ID])) {
      plugins[PLUGIN_ID] = plugins[PLUGIN_ID].filter(
        (e) => (e as Record<string, unknown>).scope !== scope,
      );
      if (plugins[PLUGIN_ID].length === 0) {
        delete plugins[PLUGIN_ID];
      }
      writeJsonFile(installedPath, installed);
    }
  }

  // Remove from enabledPlugins in settings.json
  const sPath = settingsFilePath(scope);
  const settings = readJsonFile(sPath) as Record<string, unknown> | null;
  if (settings?.enabledPlugins && typeof settings.enabledPlugins === 'object' && !Array.isArray(settings.enabledPlugins)) {
    const ep = settings.enabledPlugins as Record<string, boolean>;
    if (ep[PLUGIN_ID] !== undefined) {
      delete ep[PLUGIN_ID];
      writeJsonFile(sPath, settings);
    }
  }

  // Clean up cache (only if no remaining installs for this plugin)
  const afterInstalled = readJsonFile(installedPath) as Record<string, unknown> | null;
  const afterPlugins = afterInstalled?.plugins as Record<string, unknown[]> | undefined;
  if (!afterPlugins?.[PLUGIN_ID] || afterPlugins[PLUGIN_ID].length === 0) {
    const cacheDir = join(PLUGINS_DIR, 'cache', MARKETPLACE_NAME);
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true });
    }
  }

  // Clean up marketplace entries
  const kmPath = join(PLUGINS_DIR, 'known_marketplaces.json');
  const km = readJsonFile(kmPath) as Record<string, unknown> | null;
  if (km?.[MARKETPLACE_NAME]) {
    delete km[MARKETPLACE_NAME];
    writeJsonFile(kmPath, km);
  }

  const extra = settings?.extraKnownMarketplaces as Record<string, unknown> | undefined;
  if (extra?.[MARKETPLACE_NAME]) {
    delete extra[MARKETPLACE_NAME];
    if (settings) writeJsonFile(sPath, settings);
  }
}

// ---- install ----

pluginCommand
  .command('install')
  .description('Register the ctxkit plugin with Claude Code')
  .option('--scope <scope>', 'Installation scope: user or project', 'user')
  .option('--from <path>', 'Path to the marketplace root (git repo with .claude-plugin/marketplace.json)')
  .action((options) => {
    const scope = options.scope as string;
    if (scope !== 'user' && scope !== 'project') {
      console.error(`Invalid scope: ${scope}. Must be "user" or "project".`);
      process.exit(1);
    }

    if (!hasClaudeCli()) {
      console.error('claude CLI is required but not found on PATH.');
      console.error('Install Claude Code: https://docs.anthropic.com/en/docs/claude-code');
      process.exit(1);
    }

    // Try the marketplace flow first (works when in a git repo)
    const fromPath = options.from as string | undefined;
    const marketplaceRoot = fromPath ?? resolveMarketplaceRoot();

    if (marketplaceRoot) {
      console.log(`Found marketplace at: ${marketplaceRoot}`);
      console.log('Registering ctxl marketplace...');
      if (claudeExec(`plugin marketplace add "${marketplaceRoot}" --scope ${scope}`)) {
        console.log('Installing ctxkit plugin...');
        if (claudeExec(`plugin install ${PLUGIN_ID} --scope ${scope}`)) {
          console.log(`Plugin ${PLUGIN_ID} installed successfully (scope: ${scope})`);
          console.log('Start a new Claude Code session to activate the plugin.');
          return;
        }
      }
      console.log('Marketplace registration not available, using direct install...');
    }

    // Fallback: direct install (copy plugin to cache, write config)
    const pluginDir = resolvePluginPkg();
    if (!pluginDir) {
      console.error('Could not locate @ctxl/claude-plugin package.');
      console.error('Make sure it is installed (npm install -g @ctxl/claude-plugin).');
      process.exit(1);
    }

    console.log(`Found plugin at: ${pluginDir}`);
    console.log('Installing plugin directly...');
    installPluginDirect(pluginDir, scope);
    console.log(`Plugin ${PLUGIN_ID} installed successfully (scope: ${scope})`);
    console.log('Start a new Claude Code session to activate the plugin.');
  });

// ---- uninstall ----

pluginCommand
  .command('uninstall')
  .description('Unregister the ctxkit plugin from Claude Code')
  .option('--scope <scope>', 'Installation scope: user or project', 'user')
  .action((options) => {
    const scope = options.scope as string;
    if (scope !== 'user' && scope !== 'project') {
      console.error(`Invalid scope: ${scope}. Must be "user" or "project".`);
      process.exit(1);
    }

    if (hasClaudeCli()) {
      claudeExec(`plugin uninstall ${PLUGIN_ID} --scope ${scope}`);
      claudeExec(`plugin marketplace remove ${MARKETPLACE_NAME} --scope ${scope}`);
    }

    // Also clean up via direct method
    uninstallPluginDirect(scope);

    console.log(`Plugin ${PLUGIN_ID} uninstalled (scope: ${scope})`);
  });

// ---- status ----

pluginCommand
  .command('status')
  .description('Check ctxkit plugin registration status')
  .action(() => {
    console.log('=== ctxkit plugin status ===\n');

    const pluginDir = resolvePluginPkg();
    if (pluginDir) {
      console.log(`Plugin package: ${pluginDir}`);
    } else {
      console.log('Plugin package: not found');
    }

    const marketplaceRoot = resolveMarketplaceRoot();
    if (marketplaceRoot) {
      console.log(`Marketplace:    ${marketplaceRoot}`);
    }

    let mcpAvailable = false;
    try {
      execSync('which ctxkit-mcp', { encoding: 'utf-8', stdio: 'pipe' });
      mcpAvailable = true;
    } catch {
      // not on PATH
    }
    console.log(`ctxkit-mcp:     ${mcpAvailable ? 'available on PATH' : 'not found on PATH'}`);

    // Check installed_plugins.json
    const installedPath = join(PLUGINS_DIR, 'installed_plugins.json');
    const installed = readJsonFile(installedPath);
    const installedPlugins = (installed as Record<string, unknown>)?.plugins as Record<string, unknown[]> | undefined;
    const pluginEntries = installedPlugins?.[PLUGIN_ID];

    console.log('');
    if (pluginEntries && Array.isArray(pluginEntries) && pluginEntries.length > 0) {
      console.log('Installed: yes');
      for (const entry of pluginEntries) {
        const e = entry as Record<string, unknown>;
        console.log(`  Scope: ${e.scope || 'unknown'}`);
        console.log(`  Path:  ${e.installPath || 'unknown'}`);
        console.log(`  Version: ${e.version || 'unknown'}`);
      }
    } else {
      console.log('Installed: no');
    }

    // Check enabledPlugins
    console.log('');
    for (const scope of ['user', 'project'] as const) {
      const sPath = settingsFilePath(scope);
      const settings = readJsonFile(sPath);
      const plugins = (settings && typeof settings.enabledPlugins === 'object' && !Array.isArray(settings.enabledPlugins))
        ? settings.enabledPlugins as Record<string, boolean>
        : {};

      const enabled = plugins[PLUGIN_ID] === true;
      console.log(`Enabled (${scope}): ${enabled ? 'yes' : 'no'}`);
    }

    // Check installed plugin contents
    if (pluginEntries && Array.isArray(pluginEntries) && pluginEntries.length > 0) {
      const installPath = (pluginEntries[0] as Record<string, unknown>).installPath as string;
      if (installPath) {
        console.log('');
        const hasHooks = existsSync(join(installPath, 'hooks', 'hooks.json'));
        const hasSkills = existsSync(join(installPath, 'skills'));
        const hasMcp = existsSync(join(installPath, '.mcp.json'));
        console.log(`Hooks:  ${hasHooks ? 'yes' : 'no'}`);
        console.log(`Skills: ${hasSkills ? 'yes' : 'no'}`);
        console.log(`MCP:    ${hasMcp ? 'yes' : 'no'}`);
      }
    }
  });
