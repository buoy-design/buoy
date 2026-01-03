/**
 * AI Analysis Service
 *
 * Uses Claude + the knowledge graph to provide intelligent drift analysis.
 * The graph provides context, Claude provides understanding.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DriftSignal } from '@buoy-design/core';
import {
  GraphBuilder,
  collectGitHistory,
  findRepeatOffenders,
  type DesignSystemGraph,
} from '@buoy-design/core';

export interface AnalysisContext {
  projectRoot: string;
  prNumber?: number;
  prAuthor?: string;
  filesChanged?: string[];
}

export interface DriftAnalysis {
  signal: DriftSignal;
  analysis: string;
  isLikelyIntentional: boolean;
  confidence: number;
  suggestedAction: 'fix' | 'approve' | 'discuss';
  relatedHistory: string[];
}

export interface PRAnalysisSummary {
  overview: string;
  criticalIssues: DriftAnalysis[];
  warnings: DriftAnalysis[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export class AIAnalysisService {
  private client: Anthropic | null = null;
  private graph: DesignSystemGraph | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Build the knowledge graph for context
   */
  async buildGraph(projectRoot: string): Promise<void> {
    const builder = new GraphBuilder({ projectId: 'default' });

    // Collect git history for context
    const gitResult = await collectGitHistory(projectRoot, { maxCount: 500 });

    for (const commit of gitResult.commits) {
      const commitId = builder.addCommit(
        commit.sha,
        commit.message,
        commit.author,
        commit.authorEmail,
        commit.timestamp
      );

      for (const file of commit.filesChanged) {
        const fileId = builder.addFile(file.path, file.path);
        builder.addEdge('CHANGED', commitId, fileId, {
          createdAt: commit.timestamp,
        });
      }
    }

    for (const dev of gitResult.developers) {
      builder.addDeveloper(dev.id, dev.name, dev.email, undefined, dev.commitCount);
    }

    this.graph = builder.build();
  }

  /**
   * Get context from the graph for a specific file
   */
  private getFileContext(filePath: string): string[] {
    const context: string[] = [];

    if (!this.graph) return context;

    // Find repeat offenders
    const offenders = findRepeatOffenders(this.graph);
    const isRepeatOffender = offenders.some(o => o.file === filePath);
    if (isRepeatOffender) {
      const offender = offenders.find(o => o.file === filePath);
      context.push(`This file has ${offender?.driftCount || 0} previous drift signals (repeat offender)`);
    }

    return context;
  }

  /**
   * Analyze a single drift signal with AI
   */
  async analyzeDrift(
    signal: DriftSignal,
    context: AnalysisContext
  ): Promise<DriftAnalysis> {
    if (!this.client) {
      // Fallback without AI
      return {
        signal,
        analysis: signal.message,
        isLikelyIntentional: false,
        confidence: 0.5,
        suggestedAction: signal.severity === 'critical' ? 'fix' : 'discuss',
        relatedHistory: [],
      };
    }

    // Get graph context
    const fileContext = signal.source.location
      ? this.getFileContext(signal.source.location.split(':')[0] || '')
      : [];

    const prompt = `You are a design system expert analyzing code drift. Be concise.

Drift Signal:
- Type: ${signal.type}
- Severity: ${signal.severity}
- Component: ${signal.source.entityName}
- File: ${signal.source.location || 'unknown'}
- Message: ${signal.message}
- Found: ${signal.details.actual || 'N/A'}
- Expected: ${signal.details.expected || 'N/A'}

Context:
- PR Author: ${context.prAuthor || 'unknown'}
- Files in PR: ${context.filesChanged?.length || 0}
${fileContext.map(c => `- ${c}`).join('\n')}

Analyze this drift signal:
1. Is this likely intentional or accidental? (one sentence why)
2. What's the risk if merged? (low/medium/high + one sentence)
3. Recommended action: fix, approve, or discuss?

Be direct and practical. No fluff.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const analysisText = response.content[0]?.type === 'text'
        ? response.content[0].text
        : '';

      // Parse the response
      const isIntentional = analysisText.toLowerCase().includes('intentional') &&
                           !analysisText.toLowerCase().includes('not intentional') &&
                           !analysisText.toLowerCase().includes('unintentional');

      const suggestedAction = analysisText.toLowerCase().includes('fix') ? 'fix' as const
        : analysisText.toLowerCase().includes('approve') ? 'approve' as const
        : 'discuss' as const;

      return {
        signal,
        analysis: analysisText,
        isLikelyIntentional: isIntentional,
        confidence: 0.8,
        suggestedAction,
        relatedHistory: fileContext,
      };
    } catch (error) {
      // Fallback on error
      return {
        signal,
        analysis: `Analysis unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLikelyIntentional: false,
        confidence: 0,
        suggestedAction: 'discuss',
        relatedHistory: fileContext,
      };
    }
  }

  /**
   * Analyze all drift signals and produce a PR summary
   */
  async analyzePR(
    signals: DriftSignal[],
    context: AnalysisContext
  ): Promise<PRAnalysisSummary> {
    // Build graph if not already built
    if (!this.graph) {
      await this.buildGraph(context.projectRoot);
    }

    // Analyze critical and warning signals
    const criticals = signals.filter(s => s.severity === 'critical');
    const warnings = signals.filter(s => s.severity === 'warning');

    const criticalAnalyses: DriftAnalysis[] = [];
    const warningAnalyses: DriftAnalysis[] = [];

    // Analyze criticals (all of them)
    for (const signal of criticals) {
      const analysis = await this.analyzeDrift(signal, context);
      criticalAnalyses.push(analysis);
    }

    // Analyze warnings (limit to top 5)
    for (const signal of warnings.slice(0, 5)) {
      const analysis = await this.analyzeDrift(signal, context);
      warningAnalyses.push(analysis);
    }

    // Generate overall summary
    const overview = await this.generateOverview(signals, context, criticalAnalyses);

    // Determine risk level
    const riskLevel = criticals.length > 0 ? 'high' as const
      : warnings.length > 5 ? 'medium' as const
      : 'low' as const;

    // Generate recommendations
    const recommendations = this.generateRecommendations(criticalAnalyses, warningAnalyses);

    return {
      overview,
      criticalIssues: criticalAnalyses,
      warnings: warningAnalyses,
      recommendations,
      riskLevel,
    };
  }

  private async generateOverview(
    signals: DriftSignal[],
    context: AnalysisContext,
    criticalAnalyses: DriftAnalysis[]
  ): Promise<string> {
    if (!this.client) {
      const { critical, warning, info } = this.countBySeverity(signals);
      return `Found ${signals.length} drift signals: ${critical} critical, ${warning} warnings, ${info} info.`;
    }

    const prompt = `Summarize this PR's design system impact in 2-3 sentences:

- Total signals: ${signals.length}
- Critical: ${signals.filter(s => s.severity === 'critical').length}
- Warnings: ${signals.filter(s => s.severity === 'warning').length}
- Files affected: ${new Set(signals.map(s => s.source.location?.split(':')[0])).size}
- PR Author: ${context.prAuthor || 'unknown'}

Critical issues:
${criticalAnalyses.map(a => `- ${a.signal.message}`).join('\n') || 'None'}

Be direct. Focus on what matters for the reviewer.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });

      return response.content[0]?.type === 'text'
        ? response.content[0].text
        : 'Unable to generate overview.';
    } catch {
      const { critical, warning, info } = this.countBySeverity(signals);
      return `Found ${signals.length} drift signals: ${critical} critical, ${warning} warnings, ${info} info.`;
    }
  }

  private countBySeverity(signals: DriftSignal[]): { critical: number; warning: number; info: number } {
    return {
      critical: signals.filter(s => s.severity === 'critical').length,
      warning: signals.filter(s => s.severity === 'warning').length,
      info: signals.filter(s => s.severity === 'info').length,
    };
  }

  private generateRecommendations(
    criticals: DriftAnalysis[],
    warnings: DriftAnalysis[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for patterns
    const needsFix = [...criticals, ...warnings].filter(a => a.suggestedAction === 'fix');
    const canApprove = [...criticals, ...warnings].filter(a => a.suggestedAction === 'approve');
    const needsDiscussion = [...criticals, ...warnings].filter(a => a.suggestedAction === 'discuss');

    if (needsFix.length > 0) {
      recommendations.push(`Fix ${needsFix.length} issue${needsFix.length === 1 ? '' : 's'} before merging`);
    }

    if (canApprove.length > 0) {
      recommendations.push(`${canApprove.length} issue${canApprove.length === 1 ? ' appears' : 's appear'} intentional - consider approving with 👍`);
    }

    if (needsDiscussion.length > 0) {
      recommendations.push(`${needsDiscussion.length} issue${needsDiscussion.length === 1 ? ' needs' : 's need'} team discussion`);
    }

    // Check for repeat offenders
    const repeatFiles = new Set(
      [...criticals, ...warnings]
        .filter(a => a.relatedHistory.some(h => h.includes('repeat offender')))
        .map(a => a.signal.source.location?.split(':')[0])
    );

    if (repeatFiles.size > 0) {
      recommendations.push(`Consider refactoring ${repeatFiles.size} file${repeatFiles.size === 1 ? '' : 's'} with recurring drift`);
    }

    return recommendations;
  }
}
