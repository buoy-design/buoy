// apps/cli/src/commands/architect.ts
/**
 * Buoy Architect Command
 *
 * Analyzes a codebase, diagnoses design system maturity,
 * and creates a PR with suggested design tokens.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { writeFile } from 'fs/promises';
import {
  spinner,
  success,
  error,
  info,
  warning,
  header,
  keyValue,
  newline,
} from '../output/reporters.js';
import { DesignSystemArchitect } from '../services/architect.js';
import { GitHubArchitectClient, parseRepoString } from '../integrations/index.js';
import type { SuggestedToken } from '@buoy-design/core';

export function createArchitectCommand(): Command {
  const cmd = new Command('architect')
    .description('Diagnose design system maturity and create improvement PR')
    .option('--no-ai', 'Skip AI analysis (use heuristics only)')
    .option('--no-pr', 'Skip PR creation (just output diagnosis)')
    .option('--json', 'Output as JSON')
    .option(
      '--github-token <token>',
      'GitHub token for PR creation (or use GITHUB_TOKEN env)'
    )
    .option(
      '--github-repo <repo>',
      'GitHub repo in owner/repo format (or use GITHUB_REPOSITORY env)'
    )
    .option(
      '--output <path>',
      'Write generated tokens to file instead of creating PR'
    )
    .action(async (options) => {
      const spin = spinner('Analyzing codebase...');

      try {
        const projectRoot = process.cwd();

        // Initialize architect
        const architect = new DesignSystemArchitect();

        // Run analysis
        const result = await architect.analyze({
          projectRoot,
          noAI: !options.ai,
          onProgress: (msg) => {
            spin.text = msg;
          }
        });

        spin.stop();

        const { diagnosis } = result;

        // JSON output
        if (options.json) {
          console.log(JSON.stringify({
            diagnosis,
            generatedTokens: result.generatedTokensFile
          }, null, 2));
          return;
        }

        // Display diagnosis
        header('Design System Diagnosis');
        newline();

        // Maturity score with visual
        const scoreBar = createScoreBar(diagnosis.maturityScore);
        console.log(`${chalk.bold('Maturity Score:')} ${scoreBar} ${diagnosis.maturityScore}/100`);
        console.log(`${chalk.bold('Level:')} ${formatMaturityLevel(diagnosis.maturityLevel)}`);
        newline();

        // CSS Analysis
        console.log(chalk.bold.underline('CSS Analysis'));
        keyValue('Unique Colors', String(diagnosis.cssAnalysis.uniqueColors));
        keyValue('Unique Spacing Values', String(diagnosis.cssAnalysis.uniqueSpacing));
        keyValue('Unique Fonts', String(diagnosis.cssAnalysis.uniqueFonts));
        keyValue('Tokenization', `${diagnosis.cssAnalysis.tokenizationScore}%`);
        keyValue('Hardcoded Values', String(diagnosis.cssAnalysis.hardcodedValues));
        newline();

        // Team Analysis
        console.log(chalk.bold.underline('Team Analysis'));
        keyValue('Total Contributors', String(diagnosis.teamAnalysis.totalContributors));
        keyValue('Active (90 days)', String(diagnosis.teamAnalysis.activeContributors));
        keyValue('Styling Contributors', String(diagnosis.teamAnalysis.stylingContributors));
        newline();

        // Recommendations
        if (diagnosis.recommendations.length > 0) {
          console.log(chalk.bold.underline('Recommendations'));
          for (const rec of diagnosis.recommendations) {
            const priorityIcon = rec.priority === 'high' ? '🔴'
              : rec.priority === 'medium' ? '🟡'
              : '🔵';
            console.log(`  ${priorityIcon} ${chalk.bold(rec.title)}`);
            console.log(`     ${rec.description}`);
            console.log(`     Effort: ${rec.effort} | Impact: ${rec.impact}`);
            newline();
          }
        }

        // Suggested tokens preview
        if (diagnosis.suggestedTokens.length > 0) {
          console.log(chalk.bold.underline('Suggested Tokens (Preview)'));
          const colorTokens = diagnosis.suggestedTokens.filter((t: SuggestedToken) => t.category === 'color').slice(0, 5);
          const spacingTokens = diagnosis.suggestedTokens.filter((t: SuggestedToken) => t.category === 'spacing').slice(0, 5);

          if (colorTokens.length > 0) {
            console.log('  Colors:');
            for (const token of colorTokens) {
              console.log(`    ${token.name}: ${token.value} (replaces ${token.usageCount} values)`);
            }
          }

          if (spacingTokens.length > 0) {
            console.log('  Spacing:');
            for (const token of spacingTokens) {
              console.log(`    ${token.name}: ${token.value} (replaces ${token.usageCount} values)`);
            }
          }
          newline();
        }

        // Output to file if requested
        if (options.output) {
          await writeFile(options.output, result.generatedTokensFile);
          success(`Generated tokens written to ${options.output}`);
          return;
        }

        // Create PR if requested
        if (options.pr) {
          const token = options.githubToken || process.env.GITHUB_TOKEN;
          const repo = options.githubRepo || process.env.GITHUB_REPOSITORY;

          if (!token || !repo) {
            warning('GitHub token and repo required for PR creation.');
            info('Run with --output <path> to save tokens locally instead.');
            info('Or provide --github-token and --github-repo');
            newline();

            // Still output the tokens to stdout for piping
            info('Generated design-tokens.css:');
            console.log(chalk.gray('─'.repeat(50)));
            console.log(result.generatedTokensFile);
            console.log(chalk.gray('─'.repeat(50)));
            return;
          }

          spin.start();
          spin.text = 'Creating PR...';

          try {
            const { owner, repo: repoName } = parseRepoString(repo);
            const client = new GitHubArchitectClient({
              token,
              owner,
              repo: repoName
            });

            const pr = await client.createDesignTokensPR(
              result.generatedTokensFile,
              result.prDescription
            );

            spin.stop();
            success(`Created PR #${pr.number}`);
            info(`View at: ${pr.url}`);
          } catch (err) {
            spin.stop();
            const msg = err instanceof Error ? err.message : String(err);
            error(`Failed to create PR: ${msg}`);

            // Fallback: output tokens
            info('Generated tokens:');
            console.log(result.generatedTokensFile);
          }
        } else {
          // Just output the tokens
          info('Generated design-tokens.css:');
          console.log(chalk.gray('─'.repeat(50)));
          console.log(result.generatedTokensFile);
          console.log(chalk.gray('─'.repeat(50)));
          newline();
          info('Run with GitHub token to create a PR automatically.');
        }

      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Architect failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}

function createScoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;

  const color = score >= 60 ? chalk.green
    : score >= 40 ? chalk.yellow
    : chalk.red;

  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function formatMaturityLevel(level: string): string {
  const levels: Record<string, string> = {
    'none': chalk.red('None'),
    'emerging': chalk.yellow('Emerging'),
    'defined': chalk.blue('Defined'),
    'managed': chalk.cyan('Managed'),
    'optimized': chalk.green('Optimized')
  };
  return levels[level] || level;
}
