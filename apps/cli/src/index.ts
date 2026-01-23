import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import {
  createDockCommand,
  createPluginsCommand,
  createCheckCommand,
  createBaselineCommand,
  createBeginCommand,
  createFixCommand,
  createShowCommand,
  createDriftCommand,
  createTokensCommand,
  createComponentsCommand,
  createScanCommand,
  createCommandsCommand,
  createAhoyCommand,
} from "./commands/index.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("buoy")
    .description("Catch design drift before it ships")
    .version(pkg.version)
    .configureHelp({
      sortSubcommands: false,
      subcommandTerm: (cmd) => cmd.name(),
    })
    .addHelpText(
      "after",
      `
Command Groups:
  For AI Agents      show (components, tokens, drift, health, all, history)
  Getting Started    begin, dock (config, skills, agents, context, hooks)
  CI/Hooks           check, baseline
  Fixing             fix
  Plugins            plugins
  Ahoy (Cloud)       ahoy (login, logout, status, github, gitlab, billing, plans)

Quick Start:
  $ buoy                    # auto-launches wizard if no config
  $ buoy show all           # everything an AI agent needs
  $ buoy show drift         # design system violations
  $ buoy dock               # set up config, skills, agents, hooks
`,
    );

  // === For AI Agents (primary interface) ===
  program.addCommand(createShowCommand());
  program.addCommand(createDriftCommand());
  program.addCommand(createTokensCommand());
  program.addCommand(createComponentsCommand());
  program.addCommand(createScanCommand());

  // === Getting Started ===
  const beginCommand = createBeginCommand();
  program.addCommand(beginCommand);
  program.addCommand(createDockCommand());
  program.addCommand(createCommandsCommand());

  // === CI/Hooks ===
  program.addCommand(createCheckCommand());
  program.addCommand(createBaselineCommand());

  // === Fixing ===
  program.addCommand(createFixCommand());

  // === Plugins ===
  program.addCommand(createPluginsCommand());

  // === Ahoy (Cloud) ===
  program.addCommand(createAhoyCommand());

  return program;
}

// Re-export config utilities for user config files
export { defineConfig } from "./config/schema.js";
export type { BuoyConfig } from "./config/schema.js";
