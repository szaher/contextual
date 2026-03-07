import { Command } from 'commander';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync, mkdirSync, writeFileSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const PID_FILE = join(homedir(), '.ctxl', 'daemon.pid');

export const daemonCommand = new Command('daemon')
  .description('Manage the ctxl daemon');

daemonCommand
  .command('start')
  .description('Start the daemon in the background')
  .option('--port <port>', 'Port to listen on', '3742')
  .action((options) => {
    if (existsSync(PID_FILE)) {
      const pid = readFileSync(PID_FILE, 'utf-8').trim();
      try {
        process.kill(parseInt(pid, 10), 0);
        console.log(`Daemon already running (PID ${pid})`);
        return;
      } catch {
        // Process not running, clean up stale PID file
        unlinkSync(PID_FILE);
      }
    }

    // Ensure ~/.ctxl/ directory exists
    const ctxlDir = join(homedir(), '.ctxl');
    mkdirSync(ctxlDir, { recursive: true });

    const logFile = join(ctxlDir, 'daemon.log');
    const out = openSync(logFile, 'a');
    const err = openSync(logFile, 'a');

    // Find daemon entry point via package resolution
    const require = createRequire(import.meta.url);
    const daemonEntry = require.resolve('@ctxl/daemon');

    const child = spawn('node', [daemonEntry], {
      detached: true,
      stdio: ['ignore', out, err],
      env: {
        ...process.env,
        CTXL_PORT: options.port,
      },
    });

    if (child.pid) {
      writeFileSync(PID_FILE, String(child.pid));
      child.unref();
      console.log(`Daemon started (PID ${child.pid}) on port ${options.port}`);
      console.log(`Logs: ${logFile}`);
      console.log(`Dashboard: http://localhost:${options.port}`);
    } else {
      console.error('Failed to start daemon');
      process.exit(1);
    }
  });

daemonCommand
  .command('stop')
  .description('Stop the running daemon')
  .action(() => {
    if (!existsSync(PID_FILE)) {
      console.log('No daemon is running.');
      return;
    }

    const pid = readFileSync(PID_FILE, 'utf-8').trim();
    try {
      process.kill(parseInt(pid, 10), 'SIGTERM');
      unlinkSync(PID_FILE);
      console.log(`Daemon stopped (PID ${pid})`);
    } catch {
      console.log('Daemon process not found, cleaning up PID file.');
      unlinkSync(PID_FILE);
    }
  });

daemonCommand
  .command('status')
  .description('Check daemon status')
  .option('--daemon <url>', 'Daemon URL', 'http://localhost:3742')
  .action(async (options) => {
    try {
      const res = await fetch(`${options.daemon}/api/v1/health`);
      const data = await res.json();
      console.log(`Status: ${data.status}`);
      console.log(`Version: ${data.version}`);
      console.log(`Uptime: ${Math.round(data.uptime_seconds / 60)} minutes`);
    } catch {
      console.log('Daemon is not running.');
    }
  });

// Dashboard shortcut
export const dashboardCommand = new Command('dashboard')
  .description('Open the inspection dashboard in a browser')
  .option('--port <port>', 'Dashboard port', '3742')
  .action((options) => {
    const url = `http://localhost:${options.port}`;
    console.log(`Opening dashboard at ${url}`);
    try {
      // Open browser (macOS / Linux / Windows)
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      execSync(`${cmd} ${url}`, { stdio: 'ignore' });
    } catch {
      console.log(`Please open ${url} in your browser.`);
    }
  });
