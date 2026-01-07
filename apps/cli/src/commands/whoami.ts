/**
 * buoy whoami - Show current authenticated user
 *
 * Displays account info and verifies token validity.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { isLoggedIn, readCloudConfig, clearCloudConfig } from '../cloud/config.js';
import { getMe } from '../cloud/client.js';
import { getBillingStatus } from '../cloud/index.js';
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
        // Also fetch billing for JSON output
        let billing = null;
        try {
          const billingResult = await getBillingStatus();
          if (billingResult.ok && billingResult.data) {
            billing = {
              plan: billingResult.data.plan,
              trial: billingResult.data.trial,
              subscription: billingResult.data.subscription ? true : false,
              paymentAlert: billingResult.data.paymentAlert,
            };
          }
        } catch {
          // Ignore billing errors for JSON
        }

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
          billing,
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
      keyValue('Slug', account.slug);

      // Fetch billing status for plan and trial info
      try {
        const billingResult = await getBillingStatus();
        if (billingResult.ok && billingResult.data) {
          const billing = billingResult.data;
          const planColor = billing.plan.id === 'team' ? chalk.green :
                           billing.plan.id === 'enterprise' ? chalk.magenta :
                           chalk.gray;
          keyValue('Plan', planColor(billing.plan.name));

          // Show trial status
          if (billing.trial?.active) {
            keyValue('Status', chalk.yellow(`Trial (${billing.trial.daysRemaining} days left)`));
            newline();
            info(`Run ${chalk.cyan('buoy billing upgrade')} to keep Team features`);
          } else if (billing.subscription) {
            keyValue('Status', chalk.green('Active subscription'));
          } else if (billing.plan.id === 'free') {
            keyValue('Status', chalk.dim('Free plan'));
            newline();
            info(`Run ${chalk.cyan('buoy plans')} to see upgrade options`);
          }

          // Payment alert
          if (billing.paymentAlert) {
            newline();
            warning(`Payment ${billing.paymentAlert.status}`);
            info(`${billing.paymentAlert.daysRemaining} days until account restriction`);
            info(`Run ${chalk.cyan('buoy billing portal')} to update payment method`);
          }
        } else {
          keyValue('Plan', account.plan);
        }
      } catch {
        keyValue('Plan', account.plan);
      }

      // Show API endpoint if not default
      if (config.apiEndpoint && !config.apiEndpoint.includes('api.buoy.design')) {
        newline();
        keyValue('API', config.apiEndpoint);
      }
    });

  return cmd;
}
