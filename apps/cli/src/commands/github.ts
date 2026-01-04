/**
 * buoy github - Manage GitHub App integration
 *
 * buoy github status    - Show GitHub integration status
 * buoy github connect   - Open browser to install GitHub App
 * buoy github disconnect - Remove GitHub installation
 */

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import {
  isLoggedIn,
  getApiEndpoint,
  listGitHubInstallations,
  revokeGitHubInstallation,
  getGitHubInstallUrl,
} from '../cloud/index.js';
import {
  spinner,
  success,
  error,
  info,
  warning,
  keyValue,
  newline,
  header,
} from '../output/reporters.js';

export function createGitHubCommand(): Command {
  const cmd = new Command('github');

  cmd
    .description('Manage GitHub App integration')
    .addCommand(createStatusCommand())
    .addCommand(createConnectCommand())
    .addCommand(createDisconnectCommand());

  return cmd;
}

function createStatusCommand(): Command {
  return new Command('status')
    .description('Show GitHub integration status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!isLoggedIn()) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Not logged in' }));
        } else {
          error('Not logged in');
          info('Run `buoy login` first');
        }
        process.exit(1);
      }

      const spin = spinner('Checking GitHub integration...').start();

      try {
        const result = await listGitHubInstallations();

        spin.stop();

        if (!result.ok) {
          if (options.json) {
            console.log(JSON.stringify({ error: result.error }));
          } else {
            error(result.error || 'Failed to get GitHub status');
          }
          process.exit(1);
        }

        const installations = result.data?.installations || [];

        if (options.json) {
          console.log(JSON.stringify({ installations }, null, 2));
          return;
        }

        header('GitHub Integration');
        newline();

        if (installations.length === 0) {
          info('No GitHub App installed');
          newline();
          info('Run `buoy github connect` to install the Buoy GitHub App');
          info('This enables:');
          info('  - PR comments with drift analysis');
          info('  - Check Runs for CI integration');
          info('  - Automatic scanning on push');
          return;
        }

        for (const install of installations) {
          const statusIcon = install.suspended ? chalk.red('suspended') : chalk.green('active');

          console.log(`${chalk.bold(install.accountLogin)} (${install.accountType})`);
          keyValue('  Status', statusIcon);
          keyValue('  Repositories', install.repositorySelection === 'all' ? 'All' : 'Selected');
          keyValue('  Installed', new Date(install.createdAt).toLocaleDateString());

          if (install.suspended && install.suspendedAt) {
            keyValue('  Suspended', new Date(install.suspendedAt).toLocaleDateString());
          }

          newline();
        }

        success(`${installations.length} GitHub installation(s) connected`);
      } catch (err) {
        spin.fail('Failed to check GitHub status');
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
      }
    });
}

function createConnectCommand(): Command {
  return new Command('connect')
    .description('Install the Buoy GitHub App')
    .action(async () => {
      if (!isLoggedIn()) {
        error('Not logged in');
        info('Run `buoy login` first');
        process.exit(1);
      }

      const endpoint = getApiEndpoint();
      const installUrl = getGitHubInstallUrl(endpoint);

      info('Opening browser to install the Buoy GitHub App...');
      newline();

      try {
        await open(installUrl);

        success('Browser opened!');
        newline();
        info('Complete the installation in your browser.');
        info('Choose which repositories Buoy should have access to.');
        newline();
        info('After installation, run `buoy github status` to verify.');
      } catch (err) {
        error('Failed to open browser');
        newline();
        info('Please visit this URL manually:');
        console.log(chalk.cyan(installUrl));
      }
    });
}

function createDisconnectCommand(): Command {
  return new Command('disconnect')
    .description('Remove a GitHub installation')
    .argument('[account]', 'GitHub account to disconnect (optional)')
    .option('--all', 'Disconnect all installations')
    .option('--json', 'Output as JSON')
    .action(async (account, options) => {
      if (!isLoggedIn()) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Not logged in' }));
        } else {
          error('Not logged in');
          info('Run `buoy login` first');
        }
        process.exit(1);
      }

      const spin = spinner('Getting GitHub installations...').start();

      try {
        const result = await listGitHubInstallations();

        if (!result.ok) {
          spin.fail('Failed to get installations');
          if (options.json) {
            console.log(JSON.stringify({ error: result.error }));
          } else {
            error(result.error || 'Failed to get installations');
          }
          process.exit(1);
        }

        const installations = result.data?.installations || [];

        if (installations.length === 0) {
          spin.stop();
          if (options.json) {
            console.log(JSON.stringify({ message: 'No installations to disconnect' }));
          } else {
            info('No GitHub installations to disconnect');
          }
          return;
        }

        // Filter installations to disconnect
        let toDisconnect = installations;
        if (!options.all && account) {
          toDisconnect = installations.filter(
            (i) => i.accountLogin.toLowerCase() === account.toLowerCase()
          );

          if (toDisconnect.length === 0) {
            spin.stop();
            if (options.json) {
              console.log(JSON.stringify({ error: `No installation found for ${account}` }));
            } else {
              error(`No installation found for "${account}"`);
              info('Available installations:');
              for (const i of installations) {
                info(`  - ${i.accountLogin}`);
              }
            }
            process.exit(1);
          }
        } else if (!options.all && installations.length > 1) {
          spin.stop();
          error('Multiple installations found');
          info('Specify an account name or use --all:');
          for (const i of installations) {
            info(`  buoy github disconnect ${i.accountLogin}`);
          }
          info('  buoy github disconnect --all');
          process.exit(1);
        }

        spin.text = 'Disconnecting...';

        const disconnected: string[] = [];
        const failed: string[] = [];

        for (const install of toDisconnect) {
          const deleteResult = await revokeGitHubInstallation(install.id);
          if (deleteResult.ok) {
            disconnected.push(install.accountLogin);
          } else {
            failed.push(install.accountLogin);
          }
        }

        spin.stop();

        if (options.json) {
          console.log(JSON.stringify({ disconnected, failed }));
          return;
        }

        if (disconnected.length > 0) {
          success(`Disconnected: ${disconnected.join(', ')}`);
        }

        if (failed.length > 0) {
          warning(`Failed to disconnect: ${failed.join(', ')}`);
        }

        newline();
        info('Note: This only removes the connection from Buoy.');
        info('To fully uninstall, visit GitHub Settings > Applications.');
      } catch (err) {
        spin.fail('Failed to disconnect');
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
      }
    });
}
