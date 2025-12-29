// packages/plugin-github/src/index.ts
import type { BuoyPlugin, DriftResult, ReportContext } from '@buoy/core';

const plugin: BuoyPlugin = {
  metadata: {
    name: '@buoy/plugin-github',
    version: '0.0.1',
    description: 'GitHub PR comment integration for Buoy',
  },

  async report(_results: DriftResult, _context: ReportContext): Promise<void> {
    // Implementation in next task
    console.log('GitHub plugin placeholder');
  },
};

export default () => plugin;
export { plugin };
