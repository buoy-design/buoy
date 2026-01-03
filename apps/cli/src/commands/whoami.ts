/**
 * buoy whoami - Show current authenticated user
 *
 * Displays account info and verifies token validity.
 */

import { Command } from 'commander';
import { isLoggedIn, readCloudConfig, clearCloudConfig } from '../cloud/config.js';
import { getMe } from '../cloud/client.js';
import { spinner, success, error, info, warning, keyValue, newline } from '../output/reporters.js';

export function createWhoamiCommand(): Command {
  const cmd = new Command('whoami');

  cmd
    .description('Show current authenticated user')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!isLoggedIn()) {
        if (options.json) {
          console.log(JSON.stringify({ loggedIn: false }));
        } else {
          warning('Not logged in');
          info('Run `buoy login` to authenticate');
        }
        return;
      }

      const config = readCloudConfig();

      // Verify token is still valid
      const spin = spinner('Verifying credentials...').start();
      const result = await getMe();

      if (!result.ok || !result.data) {
        spin.fail('Session expired');

        if (result.status === 401) {
          clearCloudConfig();
          error('Your session has expired. Please login again.');
          info('Run `buoy login` to authenticate');
        } else {
          error(`Could not verify credentials: ${result.error}`);
        }

        if (options.json) {
          console.log(JSON.stringify({ loggedIn: false, error: result.error }));
        }
        return;
      }

      spin.stop();

      const { user, account } = result.data;

      if (options.json) {
        console.log(JSON.stringify({
          loggedIn: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            githubLogin: user.githubLogin,
            role: user.role,
          },
          account: {
            id: account.id,
            name: account.name,
            slug: account.slug,
            plan: account.plan,
          },
        }, null, 2));
        return;
      }

      newline();
      success(`Logged in as ${user.name || user.email}`);
      newline();

      keyValue('Email', user.email);
      if (user.githubLogin) {
        keyValue('GitHub', `@${user.githubLogin}`);
      }
      keyValue('Role', user.role);

      newline();
      keyValue('Account', account.name);
      keyValue('Plan', account.plan);
      keyValue('Slug', account.slug);

      // Show API endpoint if not default
      if (config.apiEndpoint && !config.apiEndpoint.includes('api.buoy.design')) {
        newline();
        keyValue('API', config.apiEndpoint);
      }
    });

  return cmd;
}
