/**
 * buoy billing - Manage subscription and billing
 *
 * buoy billing           - Show current plan and usage
 * buoy billing upgrade   - Upgrade to Team plan
 * buoy billing portal    - Open billing portal (manage payment method, view invoices)
 * buoy billing invoices  - List recent invoices
 */

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import {
  isLoggedIn,
  getBillingStatus,
  getInvoices,
  createCheckoutSession,
  createPortalSession,
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

export function createBillingCommand(): Command {
  const cmd = new Command('billing');

  cmd
    .description('Manage subscription and billing')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await showBillingStatus(options);
    });

  cmd.addCommand(createUpgradeCommand());
  cmd.addCommand(createPortalCommand());
  cmd.addCommand(createInvoicesCommand());

  return cmd;
}

async function showBillingStatus(options: { json?: boolean }): Promise<void> {
  if (!isLoggedIn()) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Not logged in' }));
    } else {
      error('Not logged in');
      info('Run `buoy login` first');
    }
    process.exit(1);
  }

  const spin = spinner('Loading billing info...').start();

  try {
    const result = await getBillingStatus();

    spin.stop();

    if (!result.ok) {
      if (options.json) {
        console.log(JSON.stringify({ error: result.error }));
      } else {
        error(result.error || 'Failed to get billing info');
      }
      process.exit(1);
    }

    const billing = result.data!;

    if (options.json) {
      console.log(JSON.stringify(billing, null, 2));
      return;
    }

    header('Billing');
    newline();

    // Plan info
    const planColor = billing.plan.id === 'team' ? chalk.green : billing.plan.id === 'enterprise' ? chalk.magenta : chalk.gray;
    keyValue('Plan', planColor(billing.plan.name));

    // User limit
    if (billing.limits.users) {
      keyValue('Users', `${billing.limits.currentUsers}/${billing.limits.users}`);
    } else {
      keyValue('Users', `${billing.limits.currentUsers} (unlimited)`);
    }

    // Subscription status
    if (billing.subscription) {
      keyValue('Status', chalk.green('Active subscription'));
    } else if (billing.trial?.active) {
      keyValue('Status', chalk.yellow(`Trial (${billing.trial.daysRemaining} days left)`));
    } else {
      keyValue('Status', chalk.gray('Free plan'));
    }

    newline();

    // Payment alert
    if (billing.paymentAlert) {
      warning(`Payment ${billing.paymentAlert.status}`);
      info(`${billing.paymentAlert.daysRemaining} days until account restriction`);
      info('Run `buoy billing portal` to update payment method');
      newline();
    }

    // Cancellation pending
    if (billing.cancellation) {
      warning('Cancellation requested');
      info(`Reason: ${billing.cancellation.reason}`);
      info('Your subscription remains active until the end of the billing period.');
      newline();
    }

    // Usage this month
    header('Usage This Month');
    newline();
    keyValue('Scans', String(billing.usage.scans));
    keyValue('API Calls', String(billing.usage.apiCalls));
    keyValue('Storage', formatBytes(billing.usage.storageBytes));
    newline();

    // Features
    if (billing.plan.features.length > 0) {
      header('Features');
      newline();
      for (const feature of billing.plan.features) {
        console.log(`  ${chalk.green('✓')} ${feature}`);
      }
      newline();
    }

    // Upgrade prompt for free users
    if (billing.plan.id === 'free') {
      console.log(chalk.dim('─'.repeat(50)));
      console.log(
        chalk.dim('💡 ') +
        'Run ' +
        chalk.cyan('buoy billing upgrade') +
        ' to unlock Team features'
      );
    }
  } catch (err) {
    spin.fail('Failed to load billing info');
    const message = err instanceof Error ? err.message : String(err);
    error(message);
    process.exit(1);
  }
}

function createUpgradeCommand(): Command {
  return new Command('upgrade')
    .description('Upgrade to Team plan ($25/dev/month)')
    .action(async () => {
      if (!isLoggedIn()) {
        error('Not logged in');
        info('Run `buoy login` first');
        process.exit(1);
      }

      const spin = spinner('Creating checkout session...').start();

      try {
        // Check current plan first
        const statusResult = await getBillingStatus();
        if (statusResult.ok && statusResult.data?.plan.id === 'team') {
          spin.stop();
          info('You are already on the Team plan');
          info('Run `buoy billing portal` to manage your subscription');
          return;
        }

        const result = await createCheckoutSession();

        spin.stop();

        if (!result.ok) {
          error(result.error || 'Failed to create checkout session');
          process.exit(1);
        }

        info('Opening checkout page...');
        newline();

        try {
          await open(result.data!.checkoutUrl);
          success('Browser opened!');
        } catch {
          info('Please visit this URL to complete your upgrade:');
          console.log(chalk.cyan(result.data!.checkoutUrl));
        }

        newline();
        console.log(chalk.bold('Team Plan - $25/dev/month'));
        console.log(chalk.dim('  ($20/dev/month billed annually)'));
        console.log('');
        console.log('  • Unlimited repos');
        console.log('  • GitHub PR comments');
        console.log('  • Slack & Teams alerts');
        console.log('  • Cloud history & trends');
        console.log('  • Figma Monitor plugin');
      } catch (err) {
        spin.fail('Failed to start upgrade');
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
      }
    });
}

function createPortalCommand(): Command {
  return new Command('portal')
    .description('Open billing portal to manage payment method and invoices')
    .action(async () => {
      if (!isLoggedIn()) {
        error('Not logged in');
        info('Run `buoy login` first');
        process.exit(1);
      }

      const spin = spinner('Opening billing portal...').start();

      try {
        const result = await createPortalSession();

        spin.stop();

        if (!result.ok) {
          if (result.error?.includes('No billing account')) {
            info('No billing account found');
            info('Run `buoy billing upgrade` to subscribe to Team');
            return;
          }
          error(result.error || 'Failed to open billing portal');
          process.exit(1);
        }

        try {
          await open(result.data!.portalUrl);
          success('Billing portal opened in browser');
        } catch {
          info('Please visit this URL:');
          console.log(chalk.cyan(result.data!.portalUrl));
        }

        newline();
        info('In the portal you can:');
        info('  • Update payment method');
        info('  • View and download invoices');
        info('  • Cancel subscription');
      } catch (err) {
        spin.fail('Failed to open billing portal');
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
      }
    });
}

function createInvoicesCommand(): Command {
  return new Command('invoices')
    .description('List recent invoices')
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

      const spin = spinner('Loading invoices...').start();

      try {
        const result = await getInvoices();

        spin.stop();

        if (!result.ok) {
          if (options.json) {
            console.log(JSON.stringify({ error: result.error }));
          } else {
            error(result.error || 'Failed to load invoices');
          }
          process.exit(1);
        }

        const invoices = result.data?.invoices || [];

        if (options.json) {
          console.log(JSON.stringify({ invoices }, null, 2));
          return;
        }

        if (invoices.length === 0) {
          info('No invoices found');
          return;
        }

        header('Invoices');
        newline();

        for (const invoice of invoices) {
          const statusColor =
            invoice.status === 'paid' ? chalk.green :
            invoice.status === 'open' ? chalk.yellow :
            chalk.red;

          const amount = formatCurrency(invoice.amountDue, invoice.currency);
          const date = new Date(invoice.createdAt).toLocaleDateString();

          console.log(
            `  ${chalk.bold(invoice.number)} - ${amount} - ${statusColor(invoice.status)} - ${chalk.dim(date)}`
          );
        }

        newline();
        info('Run `buoy billing portal` to view full invoice details');
      } catch (err) {
        spin.fail('Failed to load invoices');
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
      }
    });
}

// Utility functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
