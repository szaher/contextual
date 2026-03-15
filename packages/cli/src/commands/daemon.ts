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
    const daemonEntry = require.resolve('@ctxkit/daemon');

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

// Dashboard command — starts daemon if needed, serves UI, opens browser
export const dashboardCommand = new Command('dashboard')
  .description('Open the inspection dashboard in a browser')
  .option('--port <port>', 'Dashboard port', '4117')
  .option('--no-open', 'Do not auto-open browser')
  .action(async (options) => {
    const port = options.port;
    const url = `http://localhost:${port}`;

    // Check if daemon is already running
    let daemonRunning = false;
    try {
      const res = await fetch(`${url}/api/v1/health`);
      if (res.ok) daemonRunning = true;
    } catch {
      // Not running
    }

    // Start daemon if not running
    if (!daemonRunning) {
      console.log('Starting daemon...');
      if (existsSync(PID_FILE)) {
        const pid = readFileSync(PID_FILE, 'utf-8').trim();
        try {
          process.kill(parseInt(pid, 10), 0);
        } catch {
          unlinkSync(PID_FILE);
        }
      }

      const ctxlDir = join(homedir(), '.ctxl');
      mkdirSync(ctxlDir, { recursive: true });

      const logFile = join(ctxlDir, 'daemon.log');
      const out = openSync(logFile, 'a');
      const err = openSync(logFile, 'a');

      const require = createRequire(import.meta.url);
      const daemonEntry = require.resolve('@ctxkit/daemon');

      const child = spawn('node', [daemonEntry], {
        detached: true,
        stdio: ['ignore', out, err],
        env: {
          ...process.env,
          CTXL_PORT: port,
        },
      });

      if (child.pid) {
        writeFileSync(PID_FILE, String(child.pid));
        child.unref();
        // Wait briefly for daemon to start
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log(`Daemon started (PID ${child.pid})`);
      } else {
        console.error('Failed to start daemon');
        process.exit(1);
      }
    }

    console.log(`Dashboard available at ${url}`);
    console.log('Press Ctrl+C to stop');

    // Open browser unless --no-open
    if (options.open !== false) {
      try {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        execSync(`${cmd} ${url}`, { stdio: 'ignore' });
      } catch {
        console.log(`Please open ${url} in your browser.`);
      }
    }
  });
