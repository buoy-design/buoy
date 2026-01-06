import { Command } from "commander";
import {
  createDockCommand,
  createScanCommand,
  createDriftCommand,
  createStatusCommand,
  createTokensCommand,
  createAnchorCommand,
  createPluginsCommand,
  createCICommand,
  createCheckCommand,
  createBaselineCommand,
  createExplainCommand,
  createCompareCommand,
  createAuditCommand,
  createGraphCommand,
  createImportCommand,
  createHistoryCommand,
  createBeginCommand,
  createSkillCommand,
  // Cloud commands
  createLoginCommand,
  createLogoutCommand,
  createWhoamiCommand,
  createLinkCommand,
  createUnlinkCommand,
  createSyncCommand,
  createGitHubCommand,
  createBillingCommand,
} from "./commands/index.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("buoy")
    .description("Design drift detection for the AI era")
    .version("0.0.1");

  // Add commands
  program.addCommand(createDockCommand());
  program.addCommand(createScanCommand());
  program.addCommand(createDriftCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createTokensCommand());
  program.addCommand(createAnchorCommand());
  program.addCommand(createPluginsCommand());
  program.addCommand(createCICommand());
  program.addCommand(createCheckCommand());
  program.addCommand(createBaselineCommand());
  program.addCommand(createExplainCommand());
  program.addCommand(createCompareCommand());
  program.addCommand(createAuditCommand());
  program.addCommand(createGraphCommand());
  program.addCommand(createImportCommand());
  program.addCommand(createHistoryCommand());
  program.addCommand(createBeginCommand());
  program.addCommand(createSkillCommand());

  // Cloud commands
  program.addCommand(createLoginCommand());
  program.addCommand(createLogoutCommand());
  program.addCommand(createWhoamiCommand());
  program.addCommand(createLinkCommand());
  program.addCommand(createUnlinkCommand());
  program.addCommand(createSyncCommand());
  program.addCommand(createGitHubCommand());
  program.addCommand(createBillingCommand());

  return program;
}

// Re-export config utilities for user config files
export { defineConfig } from "./config/schema.js";
export type { BuoyConfig } from "./config/schema.js";
