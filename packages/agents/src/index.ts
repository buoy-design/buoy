// packages/agents/src/index.ts
// SDK wrapper functions for invoking Claude Code agents via CLI

import { spawn } from 'node:child_process';
import type { AnalysisOptions, AgentResult } from './types.js';

export type { AnalysisOptions, AgentResult, Finding, CodePattern, FindingSeverity } from './types.js';

/**
 * Analyze codebase for patterns, quality, and design system adherence
 */
export async function analyzeCodebase(
  files: string[],
  options: AnalysisOptions = {}
): Promise<AgentResult> {
  const fileList = files.join(', ');
  const prompt = options.question
    ? `Use the codebase-review agent to analyze these files: ${fileList}. Focus on: ${options.question}`
    : `Use the codebase-review agent to analyze these files: ${fileList}`;

  return runClaude(prompt, options);
}

/**
 * Analyze git history to understand code evolution
 */
export async function analyzeHistory(
  files: string[],
  options: AnalysisOptions = {}
): Promise<AgentResult> {
  const fileList = files.join(', ');
  const prompt = options.question
    ? `Use the history-review agent to analyze the git history of: ${fileList}. Focus on: ${options.question}`
    : `Use the history-review agent to analyze the git history of: ${fileList}`;

  return runClaude(prompt, options);
}

/**
 * Predict PR acceptance likelihood for a repository
 */
export async function predictAcceptance(
  repoPath: string,
  proposedChanges: string,
  options: AnalysisOptions = {}
): Promise<AgentResult> {
  const prompt = `Use the acceptance agent to analyze this repository and predict whether these changes would be accepted as a PR: ${proposedChanges}`;

  return runClaude(prompt, {
    ...options,
    workingDirectory: repoPath,
  });
}

/**
 * Run Claude CLI with a prompt
 */
async function runClaude(
  prompt: string,
  options: AnalysisOptions
): Promise<AgentResult> {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'text'];

    const cwd = options.workingDirectory || process.cwd();

    const child = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() });
      } else {
        resolve({
          success: false,
          output: stdout.trim(),
          error: stderr.trim() || `Claude exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        output: '',
        error: `Failed to spawn claude: ${err.message}`,
      });
    });
  });
}
