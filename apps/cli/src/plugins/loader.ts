import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { BuoyPlugin, PluginFactory } from '@buoy/core';
import { registry } from './registry.js';

const PLUGIN_PREFIX = '@buoy/plugin-';

interface LoaderOptions {
  projectRoot?: string;
  autoDiscover?: boolean;
}

export async function loadPlugin(nameOrPath: string): Promise<BuoyPlugin> {
  // Handle shorthand: "react" -> "@buoy/plugin-react"
  const moduleName = nameOrPath.startsWith('@')
    ? nameOrPath
    : `${PLUGIN_PREFIX}${nameOrPath}`;

  try {
    const imported = await import(moduleName);
    const factory: PluginFactory = imported.default || imported.plugin || imported;

    if (typeof factory !== 'function') {
      throw new Error(`Plugin ${moduleName} does not export a valid factory function`);
    }

    const plugin = await factory();
    registry.register(plugin);
    return plugin;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        `Plugin "${moduleName}" not found. Install it with: npm install ${moduleName}`
      );
    }
    throw err;
  }
}

export async function discoverPlugins(options: LoaderOptions = {}): Promise<string[]> {
  const projectRoot = options.projectRoot || process.cwd();
  const pkgPath = resolve(projectRoot, 'package.json');

  if (!existsSync(pkgPath)) {
    return [];
  }

  const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };

  return Object.keys(allDeps).filter((dep) => dep.startsWith(PLUGIN_PREFIX));
}

export async function loadDiscoveredPlugins(options: LoaderOptions = {}): Promise<BuoyPlugin[]> {
  const pluginNames = await discoverPlugins(options);
  const plugins: BuoyPlugin[] = [];

  for (const name of pluginNames) {
    try {
      const plugin = await loadPlugin(name);
      plugins.push(plugin);
    } catch (err) {
      console.warn(`Warning: Failed to load plugin ${name}:`, (err as Error).message);
    }
  }

  return plugins;
}

export { registry };
