import type { BuoyPlugin, PluginMetadata } from '@buoy/core';

export class PluginRegistry {
  private plugins: Map<string, BuoyPlugin> = new Map();

  register(plugin: BuoyPlugin): void {
    this.plugins.set(plugin.metadata.name, plugin);
  }

  get(name: string): BuoyPlugin | undefined {
    return this.plugins.get(name);
  }

  getAll(): BuoyPlugin[] {
    return Array.from(this.plugins.values());
  }

  getScanners(): BuoyPlugin[] {
    return this.getAll().filter((p) => typeof p.scan === 'function');
  }

  getReporters(): BuoyPlugin[] {
    return this.getAll().filter((p) => typeof p.report === 'function');
  }

  getByDetection(framework: string): BuoyPlugin | undefined {
    return this.getAll().find((p) =>
      p.metadata.detects?.includes(framework.toLowerCase())
    );
  }

  list(): PluginMetadata[] {
    return this.getAll().map((p) => p.metadata);
  }
}

export const registry = new PluginRegistry();
