/**
 * buoy logout - Sign out from Buoy Cloud
 *
 * Clears stored credentials from ~/.buoy/config.json
 */

import { Command } from 'commander';
import { clearCloudConfig, isLoggedIn, readCloudConfig } from '../cloud/config.js';
import { success, info, warning } from '../output/reporters.js';

export function createLogoutCommand(): Command {
  const cmd = new Command('logout');

  cmd
    .description('Sign out from Buoy Cloud')
    .option('-f, --force', 'Force logout without confirmation')
    .action(async (options) => {
      if (!isLoggedIn()) {
        warning('Not logged in');
        return;
      }

      const config = readCloudConfig();
      const accountInfo = config.accountName || config.email || 'Unknown';

      if (!options.force && process.stdin.isTTY) {
        // Could add confirmation prompt here if desired
      }

      clearCloudConfig();
      success(`Logged out from ${accountInfo}`);

      info('Your local scan data and config are preserved.');
      info('Run `buoy login` to sign in again.');
    });

  return cmd;
}
