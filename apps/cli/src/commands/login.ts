/**
 * buoy login - Authenticate with Buoy Cloud
 *
 * Opens browser to authenticate and saves API token locally.
 */

import { Command } from 'commander';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  updateCloudConfig,
  isLoggedIn,
  getApiEndpoint,
  readCloudConfig,
} from '../cloud/config.js';
import { getMe } from '../cloud/client.js';
import { spinner, error, info, warning, keyValue, newline } from '../output/reporters.js';

const execAsync = promisify(exec);

/**
 * Open URL in default browser
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin':
      command = `open "${url}"`;
      break;
    case 'win32':
      command = `start "" "${url}"`;
      break;
    default:
      command = `xdg-open "${url}"`;
  }

  await execAsync(command);
}

/**
 * Prompt for input
 */
function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Validate API token by fetching user info
 */
async function validateToken(token: string): Promise<{
  valid: boolean;
  user?: {
    email: string;
    name: string | null;
    id: string;
  };
  account?: {
    id: string;
    name: string;
    plan: string;
  };
}> {
  // Temporarily store token to make the request
  const originalConfig = readCloudConfig();
  updateCloudConfig({ apiToken: token });

  const result = await getMe();

  if (!result.ok || !result.data) {
    // Restore original config
    updateCloudConfig(originalConfig);
    return { valid: false };
  }

  return {
    valid: true,
    user: result.data.user,
    account: result.data.account,
  };
}

export function createLoginCommand(): Command {
  const cmd = new Command('login');

  cmd
    .description('Authenticate with Buoy Cloud')
    .option('-t, --token <token>', 'API token (skip browser flow)')
    .option('--no-browser', 'Do not open browser automatically')
    .action(async (options) => {
      // Check if already logged in
      if (isLoggedIn()) {
        const config = readCloudConfig();
        warning('Already logged in');
        if (config.email) {
          keyValue('Account', config.accountName || config.email);
        }
        info('Run `buoy logout` to sign out first');
        return;
      }

      let token: string;

      if (options.token) {
        // Token provided directly
        token = options.token;
      } else {
        // Interactive login flow
        const endpoint = getApiEndpoint();
        const authUrl = `${endpoint.replace('api.', 'app.')}/cli-auth`;

        newline();
        info('Opening browser to authenticate with Buoy Cloud...');
        newline();

        if (options.browser !== false) {
          try {
            await openBrowser(authUrl);
            info('Browser opened. Complete authentication there.');
          } catch {
            warning('Could not open browser automatically.');
          }
        }

        newline();
        info(`If browser didn't open, visit: ${authUrl}`);
        newline();

        // Prompt for token
        token = await prompt('Paste your API token here: ');

        if (!token) {
          error('No token provided. Login cancelled.');
          process.exit(1);
        }
      }

      // Validate token
      const spin = spinner('Validating token...').start();

      const validation = await validateToken(token);

      if (!validation.valid) {
        spin.fail('Invalid token');
        error('The provided token is invalid or expired.');
        process.exit(1);
      }

      // Save config
      updateCloudConfig({
        apiToken: token,
        userId: validation.user?.id,
        email: validation.user?.email,
        accountId: validation.account?.id,
        accountName: validation.account?.name,
      });

      spin.succeed('Logged in successfully');
      newline();

      keyValue('Account', validation.account?.name || 'Unknown');
      keyValue('Email', validation.user?.email || 'Unknown');
      keyValue('Plan', validation.account?.plan || 'free');

      newline();
      info('You can now use:');
      info('  buoy link     - Connect this project to Buoy Cloud');
      info('  buoy whoami   - Show current user');
      info('  buoy logout   - Sign out');
    });

  return cmd;
}
