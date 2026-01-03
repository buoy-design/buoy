/**
 * buoy unlink - Disconnect local project from Buoy Cloud
 *
 * Removes the cloudProjectId from local config.
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { success, error, info, warning } from '../output/reporters.js';

const CONFIG_FILE = 'buoy.config.mjs';

/**
 * Get existing cloud project ID from local config
 */
function getCloudProjectId(cwd: string): string | null {
  const configPath = join(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const match = content.match(/cloudProjectId:\s*['"]([^'"]+)['"]/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove cloudProjectId from local config
 */
function removeCloudProjectId(cwd: string): boolean {
  const configPath = join(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    return false;
  }

  try {
    let content = readFileSync(configPath, 'utf-8');

    // Remove cloudProjectId line (with optional trailing comma and newline)
    content = content.replace(/,?\s*cloudProjectId:\s*['"][^'"]*['"]\s*,?/g, '');

    // Clean up any resulting double commas
    content = content.replace(/,\s*,/g, ',');
    // Clean up trailing commas before closing braces
    content = content.replace(/,(\s*\})/g, '$1');

    writeFileSync(configPath, content);
    return true;
  } catch {
    return false;
  }
}

export function createUnlinkCommand(): Command {
  const cmd = new Command('unlink');

  cmd
    .description('Disconnect local project from Buoy Cloud')
    .option('--keep-remote', 'Keep the cloud project (only unlink locally)')
    .action(async (options) => {
      const cwd = process.cwd();

      // Check for existing link
      const projectId = getCloudProjectId(cwd);
      if (!projectId) {
        warning('Project is not linked to Buoy Cloud');
        return;
      }

      // Remove from local config
      const removed = removeCloudProjectId(cwd);
      if (!removed) {
        error('Could not update buoy.config.mjs');
        info(`Remove cloudProjectId manually from your config`);
        process.exit(1);
      }

      success(`Unlinked from cloud project: ${projectId}`);

      if (!options.keepRemote) {
        info('The cloud project still exists. Use --keep-remote to silence this.');
        info('Delete it from the dashboard if no longer needed.');
      }

      info('Local scan data is preserved.');
    });

  return cmd;
}
