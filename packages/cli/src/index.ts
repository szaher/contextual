#!/usr/bin/env node
import { Command } from 'commander';
import { injectCommand } from './commands/inject.js';
import { initCommand } from './commands/init.js';
import { validateCommand } from './commands/validate.js';
import { proposeCommand } from './commands/propose.js';
import { applyCommand } from './commands/apply.js';
import { sessionsCommand } from './commands/sessions.js';
import { driftCommand } from './commands/drift.js';
import { daemonCommand, dashboardCommand } from './commands/daemon.js';
import { runCommand } from './commands/run.js';
import { codexCommand } from './commands/codex.js';
import { pluginCommand } from './commands/plugin.js';

const program = new Command();

program
  .name('ctxkit')
  .description('Context & Memory Manager CLI')
  .version('0.1.0');

// Register subcommands
program.addCommand(injectCommand);
program.addCommand(initCommand);
program.addCommand(validateCommand);
program.addCommand(proposeCommand);
program.addCommand(applyCommand);
program.addCommand(sessionsCommand);
program.addCommand(driftCommand);
program.addCommand(daemonCommand);
program.addCommand(dashboardCommand);
program.addCommand(runCommand);
program.addCommand(codexCommand);
program.addCommand(pluginCommand);

program.parse();
