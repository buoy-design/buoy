import { Command } from "commander";
import {
  createInitCommand,
  createScanCommand,
  createDriftCommand,
  createStatusCommand,
  createBootstrapCommand,
  createBuildCommand,
  createPluginsCommand,
  createCICommand,
  createCheckCommand,
  createExtractCommand,
  createBaselineCommand,
} from "./commands/index.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("buoy")
    .description("Design drift detection for the AI era")
    .version("0.0.1");

  // Add commands
  program.addCommand(createInitCommand());
  program.addCommand(createScanCommand());
  program.addCommand(createDriftCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createBootstrapCommand());
  program.addCommand(createBuildCommand());
  program.addCommand(createPluginsCommand());
  program.addCommand(createCICommand());
  program.addCommand(createCheckCommand());
  program.addCommand(createExtractCommand());
  program.addCommand(createBaselineCommand());

  return program;
}

// Re-export config utilities for user config files
export { defineConfig } from "./config/schema.js";
export type { BuoyConfig } from "./config/schema.js";
