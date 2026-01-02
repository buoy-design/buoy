import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoUrl: text('repo_url'),
  figmaFileKeys: text('figma_file_keys'), // JSON array
  storybookUrl: text('storybook_url'),
  config: text('config'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Scans table
export const scans = sqliteTable('scans', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  status: text('status').notNull().default('pending'), // pending, running, completed, failed
  sources: text('sources').notNull(), // JSON array
  stats: text('stats'), // JSON
  errors: text('errors'), // JSON array
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Components table
export const components = sqliteTable('components', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  scanId: text('scan_id')
    .notNull()
    .references(() => scans.id),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  source: text('source').notNull(), // 'react' | 'figma' | 'storybook'
  sourceLocation: text('source_location').notNull(), // JSON
  props: text('props'), // JSON array
  variants: text('variants'), // JSON array
  tokenRefs: text('token_refs'), // JSON array
  dependencies: text('dependencies'), // JSON array
  metadata: text('metadata'), // JSON
  scannedAt: integer('scanned_at', { mode: 'timestamp' }).notNull(),
});

// Tokens table
export const tokens = sqliteTable('tokens', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  scanId: text('scan_id')
    .notNull()
    .references(() => scans.id),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  value: text('value').notNull(), // JSON
  source: text('source').notNull(), // JSON
  aliases: text('aliases'), // JSON array
  usedBy: text('usedby'), // JSON array
  metadata: text('metadata'), // JSON
  scannedAt: integer('scanned_at', { mode: 'timestamp' }).notNull(),
});

// Drift signals table
export const driftSignals = sqliteTable('drift_signals', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  scanId: text('scan_id').references(() => scans.id),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  source: text('source').notNull(), // JSON
  target: text('target'), // JSON
  message: text('message').notNull(),
  details: text('details'), // JSON
  claudeAnalysis: text('claude_analysis'),
  resolved: integer('resolved', { mode: 'boolean' }).default(false),
  resolution: text('resolution'), // JSON
  detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
});

// Intents table
export const intents = sqliteTable('intents', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  entityType: text('entity_type').notNull(), // 'component' | 'token' | 'pattern'
  entityId: text('entity_id').notNull(),
  entityName: text('entity_name').notNull(),
  decision: text('decision').notNull(), // JSON
  context: text('context'), // JSON
  status: text('status').notNull().default('active'),
  createdBy: text('created_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
});

// Snapshots table for historical tracking
export const snapshots = sqliteTable('snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  scanId: text('scan_id')
    .notNull()
    .references(() => scans.id),
  summary: text('summary').notNull(), // JSON
  componentCount: integer('component_count').notNull(),
  tokenCount: integer('token_count').notNull(),
  driftCount: integer('drift_count').notNull(),
  coverageScore: integer('coverage_score'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// GRAPH TABLES - Design System Knowledge Graph
// ============================================================================

// W3C tokens - source of truth from design tools
export const w3cTokens = sqliteTable('w3c_tokens', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  filePath: text('file_path').notNull(),
  tokenPath: text('token_path').notNull(), // "color.brand.primary"
  value: text('value').notNull(), // JSON value
  type: text('type'), // color, dimension, spacing, etc.
  description: text('description'),
  extensions: text('extensions'), // JSON vendor extensions
  importedAt: integer('imported_at', { mode: 'timestamp' }).notNull(),
});

// Git commits for history tracking
export const commits = sqliteTable('commits', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  sha: text('sha').notNull(),
  message: text('message').notNull(),
  author: text('author').notNull(),
  authorEmail: text('author_email'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  filesChanged: text('files_changed'), // JSON array of {path, status, additions, deletions}
  parentSha: text('parent_sha'),
  branch: text('branch'),
});

// Developers extracted from git history
export const developers = sqliteTable('developers', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  githubLogin: text('github_login'),
  commitCount: integer('commit_count').default(0),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
});

// Token usage locations in code
export const tokenUsages = sqliteTable('token_usages', {
  id: text('id').primaryKey(),
  tokenId: text('token_id')
    .notNull()
    .references(() => tokens.id),
  filePath: text('file_path').notNull(),
  lineNumber: integer('line_number'),
  columnNumber: integer('column_number'),
  usageType: text('usage_type').notNull(), // 'css-var' | 'tailwind' | 'js-import' | 'hardcoded'
  context: text('context'), // surrounding code snippet
  commitSha: text('commit_sha'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Component usage locations (where components are instantiated)
export const componentUsages = sqliteTable('component_usages', {
  id: text('id').primaryKey(),
  componentId: text('component_id')
    .notNull()
    .references(() => components.id),
  filePath: text('file_path').notNull(),
  lineNumber: integer('line_number'),
  propsUsed: text('props_used'), // JSON of props passed
  childrenSummary: text('children_summary'),
  commitSha: text('commit_sha'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// File imports (ES import relationships)
export const fileImports = sqliteTable('file_imports', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  sourceFile: text('source_file').notNull(),
  targetFile: text('target_file').notNull(),
  importType: text('import_type').notNull(), // 'default' | 'named' | 'namespace' | 'side-effect'
  importedNames: text('imported_names'), // JSON array
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Pull requests
export const pullRequests = sqliteTable('pull_requests', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  state: text('state').notNull(), // 'open' | 'closed' | 'merged'
  authorLogin: text('author_login'),
  baseBranch: text('base_branch'),
  headBranch: text('head_branch'),
  commits: text('commits'), // JSON array of SHAs
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  mergedAt: integer('merged_at', { mode: 'timestamp' }),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
});

// PR comments (Buoy's comments for tracking)
export const prComments = sqliteTable('pr_comments', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  prId: text('pr_id')
    .notNull()
    .references(() => pullRequests.id),
  driftSignalId: text('drift_signal_id').references(() => driftSignals.id),
  githubCommentId: text('github_comment_id'),
  body: text('body').notNull(),
  filePath: text('file_path'),
  lineNumber: integer('line_number'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Feedback from reactions to Buoy comments
export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  commentId: text('comment_id').references(() => prComments.id),
  driftSignalId: text('drift_signal_id').references(() => driftSignals.id),
  reaction: text('reaction').notNull(), // 'helpful' | 'unhelpful' | 'false_positive'
  userLogin: text('user_login'),
  context: text('context'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Storybook stories
export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  componentId: text('component_id').references(() => components.id),
  storyId: text('story_id').notNull(), // Storybook ID
  title: text('title').notNull(),
  filePath: text('file_path').notNull(),
  kind: text('kind'), // Story kind/group
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Test files
export const testFiles = sqliteTable('test_files', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  filePath: text('file_path').notNull(),
  testFramework: text('test_framework'), // 'jest' | 'vitest' | 'mocha' | etc.
  testCount: integer('test_count'),
  coveredFiles: text('covered_files'), // JSON array of file paths
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// CSS classes (including Tailwind)
export const cssClasses = sqliteTable('css_classes', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  className: text('class_name').notNull(),
  filePath: text('file_path').notNull(),
  lineNumber: integer('line_number'),
  properties: text('properties'), // JSON of CSS properties
  variablesUsed: text('variables_used'), // JSON array of var names
  isTailwind: integer('is_tailwind', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Generic graph edges for flexible relationships
export const graphEdges = sqliteTable('graph_edges', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  edgeType: text('edge_type').notNull(), // USES, IMPORTS, RENDERS, etc.
  sourceType: text('source_type').notNull(), // Token, Component, File, etc.
  sourceId: text('source_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  metadata: text('metadata'), // JSON for edge-specific data
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Type exports for use with Drizzle
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;
export type DbComponent = typeof components.$inferSelect;
export type NewDbComponent = typeof components.$inferInsert;
export type DbToken = typeof tokens.$inferSelect;
export type NewDbToken = typeof tokens.$inferInsert;
export type DbDriftSignal = typeof driftSignals.$inferSelect;
export type NewDbDriftSignal = typeof driftSignals.$inferInsert;
export type DbIntent = typeof intents.$inferSelect;
export type NewDbIntent = typeof intents.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;

// Graph table types
export type W3CToken = typeof w3cTokens.$inferSelect;
export type NewW3CToken = typeof w3cTokens.$inferInsert;
export type Commit = typeof commits.$inferSelect;
export type NewCommit = typeof commits.$inferInsert;
export type Developer = typeof developers.$inferSelect;
export type NewDeveloper = typeof developers.$inferInsert;
export type TokenUsage = typeof tokenUsages.$inferSelect;
export type NewTokenUsage = typeof tokenUsages.$inferInsert;
export type ComponentUsage = typeof componentUsages.$inferSelect;
export type NewComponentUsage = typeof componentUsages.$inferInsert;
export type FileImport = typeof fileImports.$inferSelect;
export type NewFileImport = typeof fileImports.$inferInsert;
export type PullRequest = typeof pullRequests.$inferSelect;
export type NewPullRequest = typeof pullRequests.$inferInsert;
export type PrComment = typeof prComments.$inferSelect;
export type NewPrComment = typeof prComments.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;
export type TestFile = typeof testFiles.$inferSelect;
export type NewTestFile = typeof testFiles.$inferInsert;
export type CssClass = typeof cssClasses.$inferSelect;
export type NewCssClass = typeof cssClasses.$inferInsert;
export type GraphEdge = typeof graphEdges.$inferSelect;
export type NewGraphEdge = typeof graphEdges.$inferInsert;
