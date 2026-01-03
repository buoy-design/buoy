import { Command } from "commander";
import chalk from "chalk";
import {
  spinner,
  success,
  error,
  info,
  header,
  keyValue,
  newline,
  setJsonMode,
} from "../output/reporters.js";
import {
  GraphBuilder,
  getGraphStats,
  exportToDOT,
  exportToCytoscape,
  exportToJSON,
  findUnusedTokens,
  findUntestedComponents,
  findUndocumentedComponents,
  findRepeatOffenders,
  calculateCoverage,
  collectGitHistory,
  collectUsages,
  collectImports,
} from "@buoy-design/core";

export function createGraphCommand(): Command {
  const cmd = new Command("graph")
    .description("Build and query the design system knowledge graph")
    .addCommand(createBuildCommand())
    .addCommand(createQueryCommand())
    .addCommand(createExportCommand())
    .addCommand(createStatsCommand());

  return cmd;
}

// ============================================================================
// Build Command
// ============================================================================

function createBuildCommand(): Command {
  return new Command("build")
    .description("Build the knowledge graph from the codebase")
    .option("--git", "Include git history", true)
    .option("--no-git", "Skip git history collection")
    .option("--usages", "Include token/component usages", true)
    .option("--no-usages", "Skip usage collection")
    .option("--imports", "Include import relationships", true)
    .option("--no-imports", "Skip import collection")
    .option("--since <date>", "Only include commits since date (ISO format)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner("Building knowledge graph...");
      const projectRoot = process.cwd();

      try {
        const builder = new GraphBuilder({ projectId: "default" });
        const stats = {
          commits: 0,
          developers: 0,
          tokenUsages: 0,
          componentUsages: 0,
          imports: 0,
          files: new Set<string>(),
        };

        // Collect git history
        if (options.git) {
          spin.text = "Collecting git history...";
          const gitResult = await collectGitHistory(projectRoot, {
            since: options.since ? new Date(options.since) : undefined,
            includeStats: true,
          });

          // Add commits to graph
          for (const commit of gitResult.commits) {
            const commitId = builder.addCommit(
              commit.sha,
              commit.message,
              commit.author,
              commit.authorEmail,
              commit.timestamp
            );

            // Track files
            for (const file of commit.filesChanged) {
              const fileId = builder.addFile(file.path, file.path);
              stats.files.add(file.path);
              builder.addEdge("CHANGED", commitId, fileId, {
                createdAt: commit.timestamp,
              });
            }
          }

          // Add developers
          for (const dev of gitResult.developers) {
            const devId = builder.addDeveloper(
              dev.id,
              dev.name,
              dev.email,
              undefined,
              dev.commitCount
            );

            // Link to commits
            for (const commit of gitResult.commits) {
              if (commit.authorEmail === dev.email) {
                const commitId = `commit:${commit.sha}`;
                builder.addEdge("AUTHORED", devId, commitId);
              }
            }
          }

          stats.commits = gitResult.commits.length;
          stats.developers = gitResult.developers.length;
        }

        // Collect usages
        if (options.usages) {
          spin.text = "Collecting token and component usages...";
          const usageResult = await collectUsages({ projectRoot });

          // Track hardcoded values as potential tokens
          for (const usage of usageResult.hardcodedValues) {
            stats.files.add(usage.filePath);
          }

          stats.tokenUsages = usageResult.tokenUsages.length;
          stats.componentUsages = usageResult.componentUsages.length;
        }

        // Collect imports
        if (options.imports) {
          spin.text = "Collecting import relationships...";
          const importResult = await collectImports({ projectRoot });

          for (const imp of importResult.imports) {
            if (!imp.isExternal) {
              const sourceId = builder.addFile(imp.sourceFile, imp.sourceFile);
              const targetId = builder.addFile(imp.targetFile, imp.targetFile);
              builder.addEdge("IMPORTS", sourceId, targetId, {
                createdAt: new Date(),
              });
              stats.files.add(imp.sourceFile);
              stats.files.add(imp.targetFile);
            }
          }

          stats.imports = importResult.imports.filter((i) => !i.isExternal)
            .length;
        }

        spin.stop();

        const graph = builder.build();
        const graphStats = getGraphStats(graph);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                stats: {
                  nodes: graphStats.nodeCount,
                  edges: graphStats.edgeCount,
                  commits: stats.commits,
                  developers: stats.developers,
                  files: stats.files.size,
                  imports: stats.imports,
                },
                nodesByType: graphStats.nodesByType,
                edgesByType: graphStats.edgesByType,
              },
              null,
              2
            )
          );
          return;
        }

        success("Graph built successfully!");
        newline();

        header("Graph Statistics");
        keyValue("Total nodes", String(graphStats.nodeCount));
        keyValue("Total edges", String(graphStats.edgeCount));
        newline();

        header("Collected");
        keyValue("Commits", String(stats.commits));
        keyValue("Developers", String(stats.developers));
        keyValue("Files", String(stats.files.size));
        keyValue("Import relationships", String(stats.imports));
        newline();

        if (Object.keys(graphStats.nodesByType).length > 0) {
          header("Nodes by Type");
          for (const [type, count] of Object.entries(graphStats.nodesByType)) {
            keyValue(type, String(count));
          }
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Graph build failed: ${message}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Query Command
// ============================================================================

function createQueryCommand(): Command {
  return new Command("query")
    .description("Query the knowledge graph")
    .argument("<question>", "What to query (e.g., 'unused tokens')")
    .option("--json", "Output as JSON")
    .action(async (question, options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner("Building graph for query...");
      const projectRoot = process.cwd();

      try {
        // Build a quick graph for querying
        const builder = new GraphBuilder({ projectId: "default" });

        // For now, we'll build a minimal graph for queries
        // In production, this would load from SQLite
        spin.text = "Collecting data...";

        const gitResult = await collectGitHistory(projectRoot, { maxCount: 100 });
        for (const dev of gitResult.developers) {
          builder.addDeveloper(dev.id, dev.name, dev.email, undefined, dev.commitCount);
        }

        spin.stop();

        const graph = builder.build();

        // Parse and execute query
        const queryLower = question.toLowerCase();
        let result: unknown = null;

        if (queryLower.includes("unused") && queryLower.includes("token")) {
          result = findUnusedTokens(graph);
          if (options.json) {
            console.log(JSON.stringify({ unusedTokens: result }, null, 2));
          } else {
            header("Unused Tokens");
            const tokens = result as string[];
            if (tokens.length === 0) {
              info("No unused tokens found (graph may not have token data)");
            } else {
              for (const t of tokens) {
                console.log(`  ${chalk.yellow("•")} ${t}`);
              }
            }
          }
        } else if (queryLower.includes("untested") && queryLower.includes("component")) {
          result = findUntestedComponents(graph);
          if (options.json) {
            console.log(JSON.stringify({ untestedComponents: result }, null, 2));
          } else {
            header("Untested Components");
            const components = result as string[];
            if (components.length === 0) {
              info("No untested components found");
            } else {
              for (const c of components) {
                console.log(`  ${chalk.yellow("•")} ${c}`);
              }
            }
          }
        } else if (queryLower.includes("undocumented") && queryLower.includes("component")) {
          result = findUndocumentedComponents(graph);
          if (options.json) {
            console.log(JSON.stringify({ undocumentedComponents: result }, null, 2));
          } else {
            header("Undocumented Components");
            const components = result as string[];
            if (components.length === 0) {
              info("No undocumented components found");
            } else {
              for (const c of components) {
                console.log(`  ${chalk.yellow("•")} ${c}`);
              }
            }
          }
        } else if (queryLower.includes("repeat") || queryLower.includes("offender")) {
          result = findRepeatOffenders(graph);
          if (options.json) {
            console.log(JSON.stringify({ repeatOffenders: result }, null, 2));
          } else {
            header("Repeat Offenders");
            const offenders = result as Array<{ file: string; driftCount: number }>;
            if (offenders.length === 0) {
              info("No repeat offenders found");
            } else {
              for (const o of offenders) {
                console.log(
                  `  ${chalk.red("•")} ${o.file} ${chalk.dim(`(${o.driftCount} drift signals)`)}`
                );
              }
            }
          }
        } else if (queryLower.includes("coverage")) {
          result = calculateCoverage(graph);
          if (options.json) {
            console.log(JSON.stringify({ coverage: result }, null, 2));
          } else {
            header("Design System Coverage");
            const coverage = result as {
              tokenCoverage: number;
              componentCoverage: number;
              testCoverage: number;
              storyCoverage: number;
            };
            keyValue("Token usage", `${(coverage.tokenCoverage * 100).toFixed(1)}%`);
            keyValue("Test coverage", `${(coverage.testCoverage * 100).toFixed(1)}%`);
            keyValue("Story coverage", `${(coverage.storyCoverage * 100).toFixed(1)}%`);
          }
        } else {
          error(`Unknown query: "${question}"`);
          newline();
          info("Available queries:");
          info("  • unused tokens");
          info("  • untested components");
          info("  • undocumented components");
          info("  • repeat offenders");
          info("  • coverage");
          process.exit(1);
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Query failed: ${message}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Export Command
// ============================================================================

function createExportCommand(): Command {
  return new Command("export")
    .description("Export the graph for visualization")
    .option("-f, --format <format>", "Output format (json, dot, cytoscape)", "json")
    .option("-o, --output <file>", "Output file (default: stdout)")
    .action(async (options) => {
      const spin = spinner("Building graph for export...");
      const projectRoot = process.cwd();

      try {
        // Build graph
        const builder = new GraphBuilder({ projectId: "default" });

        spin.text = "Collecting data...";
        const gitResult = await collectGitHistory(projectRoot, { maxCount: 200 });

        for (const commit of gitResult.commits) {
          builder.addCommit(
            commit.sha,
            commit.message,
            commit.author,
            commit.authorEmail,
            commit.timestamp
          );
        }

        for (const dev of gitResult.developers) {
          builder.addDeveloper(dev.id, dev.name, dev.email, undefined, dev.commitCount);
        }

        spin.text = "Collecting imports...";
        const importResult = await collectImports({ projectRoot });
        for (const imp of importResult.imports) {
          if (!imp.isExternal) {
            const sourceId = builder.addFile(imp.sourceFile, imp.sourceFile);
            const targetId = builder.addFile(imp.targetFile, imp.targetFile);
            builder.addEdge("IMPORTS", sourceId, targetId);
          }
        }

        spin.stop();

        const graph = builder.build();
        let output: string;

        switch (options.format) {
          case "dot":
            output = exportToDOT(graph);
            break;
          case "cytoscape":
            output = JSON.stringify(exportToCytoscape(graph), null, 2);
            break;
          case "json":
          default:
            output = JSON.stringify(exportToJSON(graph), null, 2);
            break;
        }

        if (options.output) {
          const fs = await import("fs/promises");
          await fs.writeFile(options.output, output, "utf-8");
          success(`Graph exported to ${options.output}`);
        } else {
          console.log(output);
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Export failed: ${message}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Stats Command
// ============================================================================

function createStatsCommand(): Command {
  return new Command("stats")
    .description("Show graph statistics")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner("Analyzing codebase...");
      const projectRoot = process.cwd();

      try {
        // Collect basic stats without building full graph
        spin.text = "Analyzing git history...";
        const gitResult = await collectGitHistory(projectRoot, { maxCount: 1000 });

        spin.text = "Analyzing usages...";
        const usageResult = await collectUsages({ projectRoot });

        spin.text = "Analyzing imports...";
        const importResult = await collectImports({ projectRoot });

        spin.stop();

        const stats = {
          git: {
            commits: gitResult.commits.length,
            developers: gitResult.developers.length,
            dateRange: gitResult.stats.dateRange,
          },
          usages: {
            tokenUsages: usageResult.tokenUsages.length,
            componentUsages: usageResult.componentUsages.length,
            hardcodedValues: usageResult.hardcodedValues.length,
            filesScanned: usageResult.stats.filesScanned,
          },
          imports: {
            localImports: importResult.imports.filter((i) => !i.isExternal).length,
            externalPackages: importResult.externalDependencies.size,
            filesScanned: importResult.stats.filesScanned,
          },
        };

        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
          return;
        }

        header("Git History");
        keyValue("Commits", String(stats.git.commits));
        keyValue("Contributors", String(stats.git.developers));
        if (stats.git.dateRange) {
          keyValue(
            "Date range",
            `${stats.git.dateRange.start.toLocaleDateString()} - ${stats.git.dateRange.end.toLocaleDateString()}`
          );
        }
        newline();

        header("Token/Component Usages");
        keyValue("Token usages", String(stats.usages.tokenUsages));
        keyValue("Component usages", String(stats.usages.componentUsages));
        keyValue("Hardcoded values", String(stats.usages.hardcodedValues));
        keyValue("Files scanned", String(stats.usages.filesScanned));
        newline();

        header("Import Analysis");
        keyValue("Local imports", String(stats.imports.localImports));
        keyValue("External packages", String(stats.imports.externalPackages));
        keyValue("Files scanned", String(stats.imports.filesScanned));

        // Show top external deps
        if (importResult.externalDependencies.size > 0) {
          newline();
          header("Top External Dependencies");
          const deps = Array.from(importResult.externalDependencies).slice(0, 10);
          for (const dep of deps) {
            console.log(`  ${chalk.blue("•")} ${dep}`);
          }
          if (importResult.externalDependencies.size > 10) {
            info(`  ... and ${importResult.externalDependencies.size - 10} more`);
          }
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Stats failed: ${message}`);
        process.exit(1);
      }
    });
}
