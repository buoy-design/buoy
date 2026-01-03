/**
 * buoy sync - Manually sync queued scans to Buoy Cloud
 *
 * Retries uploading any scans that failed to sync previously.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  isLoggedIn,
  syncQueue,
  getQueueCount,
  clearQueue,
  getPendingScans,
} from '../cloud/index.js';
import {
  spinner,
  success,
  error,
  info,
  warning,
  keyValue,
  newline,
} from '../output/reporters.js';

export function createSyncCommand(): Command {
  const cmd = new Command('sync');

  cmd
    .description('Sync queued scans to Buoy Cloud')
    .option('--status', 'Show queue status only')
    .option('--clear', 'Clear all queued scans')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const cwd = process.cwd();

      // Check login status
      if (!isLoggedIn()) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Not logged in' }));
        } else {
          error('Not logged in');
          info('Run `buoy login` first');
        }
        process.exit(1);
      }

      const queueCount = getQueueCount(cwd);

      // Show status only
      if (options.status) {
        if (options.json) {
          const pending = getPendingScans(cwd);
          console.log(JSON.stringify({
            queueCount,
            scans: pending.map((s) => ({
              id: s.id,
              projectId: s.projectId,
              attempts: s.attempts,
              lastAttempt: s.lastAttempt,
              error: s.error,
              createdAt: s.createdAt,
            })),
          }, null, 2));
        } else {
          newline();
          keyValue('Queued scans', String(queueCount));

          if (queueCount > 0) {
            const pending = getPendingScans(cwd);
            newline();
            for (const scan of pending) {
              console.log(
                `  ${chalk.dim(scan.id)} - ${scan.attempts} attempt(s)` +
                (scan.error ? ` - ${chalk.red(scan.error)}` : '')
              );
            }
            newline();
            info(`Run ${chalk.cyan('buoy sync')} to retry uploads`);
          }
        }
        return;
      }

      // Clear queue
      if (options.clear) {
        if (queueCount === 0) {
          if (options.json) {
            console.log(JSON.stringify({ cleared: 0 }));
          } else {
            info('Queue is already empty');
          }
          return;
        }

        clearQueue(cwd);

        if (options.json) {
          console.log(JSON.stringify({ cleared: queueCount }));
        } else {
          success(`Cleared ${queueCount} queued scan(s)`);
        }
        return;
      }

      // Sync queue
      if (queueCount === 0) {
        if (options.json) {
          console.log(JSON.stringify({ synced: 0, failed: 0, remaining: 0 }));
        } else {
          info('No scans queued for sync');
        }
        return;
      }

      const spin = spinner(`Syncing ${queueCount} queued scan(s)...`).start();

      try {
        const result = await syncQueue(cwd);

        spin.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.synced > 0) {
          success(`Synced ${result.synced} scan(s)`);
        }

        if (result.failed > 0) {
          warning(`${result.failed} scan(s) failed`);
        }

        if (result.remaining > 0) {
          newline();
          info(`${result.remaining} scan(s) remaining in queue`);
          info('These will retry automatically on next scan, or run `buoy sync` again');
        } else if (result.synced > 0) {
          newline();
          success('All scans synced successfully');
        }
      } catch (err) {
        spin.fail('Sync failed');
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
      }
    });

  return cmd;
}
