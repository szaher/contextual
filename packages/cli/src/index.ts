#!/usr/bin/env node
import { Command } from 'commander';
import { injectCommand } from './commands/inject';
import { initCommand } from './commands/init';
import { validateCommand } from './commands/validate';
import { proposeCommand } from './commands/propose';
import { applyCommand } from './commands/apply';
import { sessionsCommand } from './commands/sessions';
import { driftCommand } from './commands/drift';
import { daemonCommand, dashboardCommand } from './commands/daemon';
import { runCommand } from './commands/run';

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

program.parse();
