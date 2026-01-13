#!/usr/bin/env node

/**
 * Dev Server Manager
 *
 * Commands:
 *   status  - Show all running dev server instances
 *   stop    - Stop all dev servers (or specific port with --port)
 *   start   - Start a new instance (finds available port)
 */

const { execSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT_RANGE_START = 3000;
const PORT_RANGE_END = 3010;
const isWindows = process.platform === 'win32';

// Track who started servers
const TRACKER_FILE = path.join(__dirname, '..', '.dev-servers.json');

function loadTracker() {
  try {
    if (fs.existsSync(TRACKER_FILE)) {
      return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveTracker(data) {
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
}

function getProcessOnPort(port) {
  try {
    if (isWindows) {
      const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = result.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid && !isNaN(pid)) {
          // Get process info
          try {
            const taskInfo = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const match = taskInfo.match(/"([^"]+)"/);
            const processName = match ? match[1] : 'unknown';
            return { pid, processName, port };
          } catch (e) {
            return { pid, processName: 'unknown', port };
          }
        }
      }
    } else {
      const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pid = parseInt(result.trim(), 10);
      if (pid) {
        return { pid, processName: 'node', port };
      }
    }
  } catch (e) {
    // Port not in use
  }
  return null;
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true)); // Port in use
    server.once('listening', () => {
      server.close();
      resolve(false); // Port available
    });
    server.listen(port);
  });
}

async function findAvailablePort() {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const inUse = await checkPort(port);
    if (!inUse) return port;
  }
  return null;
}

function killProcess(pid) {
  try {
    if (isWindows) {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function status() {
  console.log('\n📊 Dev Server Status\n');
  console.log('Scanning ports 3000-3010...\n');

  const tracker = loadTracker();
  let found = 0;

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const proc = getProcessOnPort(port);
    if (proc) {
      found++;
      const trackerInfo = tracker[port];
      const startedBy = trackerInfo?.startedBy || 'unknown';
      const startedAt = trackerInfo?.startedAt ? new Date(trackerInfo.startedAt).toLocaleString() : 'unknown';

      console.log(`  Port ${port}: RUNNING`);
      console.log(`    PID: ${proc.pid}`);
      console.log(`    Process: ${proc.processName}`);
      console.log(`    Started by: ${startedBy}`);
      console.log(`    Started at: ${startedAt}`);
      console.log(`    URL: http://localhost:${port}`);
      console.log('');
    }
  }

  if (found === 0) {
    console.log('  No dev servers running.\n');
  } else {
    console.log(`Total: ${found} instance(s) running.\n`);
  }

  return found;
}

async function stop(targetPort) {
  const tracker = loadTracker();

  if (targetPort) {
    // Stop specific port
    const proc = getProcessOnPort(targetPort);
    if (proc) {
      console.log(`Stopping server on port ${targetPort} (PID: ${proc.pid})...`);
      killProcess(proc.pid);
      delete tracker[targetPort];
      saveTracker(tracker);
      console.log('Stopped.');
    } else {
      console.log(`No server running on port ${targetPort}.`);
    }
    return;
  }

  // Stop all
  let stopped = 0;
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const proc = getProcessOnPort(port);
    if (proc) {
      console.log(`Stopping port ${port} (PID: ${proc.pid})...`);
      killProcess(proc.pid);
      delete tracker[port];
      stopped++;
    }
  }

  saveTracker(tracker);

  if (stopped === 0) {
    console.log('No dev servers were running.');
  } else {
    console.log(`\nStopped ${stopped} server(s).`);
  }
}

async function start(source = 'manual') {
  const port = await findAvailablePort();

  if (!port) {
    console.log('Error: All ports 3000-3010 are in use. Stop some servers first.');
    process.exit(1);
  }

  console.log(`Starting dev server on port ${port}...`);
  console.log(`Started by: ${source}`);

  // Track who started it
  const tracker = loadTracker();
  tracker[port] = {
    startedBy: source,
    startedAt: new Date().toISOString(),
  };
  saveTracker(tracker);

  // Return the port - caller will actually start the server
  console.log(`\nRun: PORT=${port} npm run dev`);
  console.log(`Or:  npx next dev -p ${port}`);

  return port;
}

// Parse arguments
const args = process.argv.slice(2);
const command = args[0] || 'status';

// Check for --port flag
let targetPort = null;
const portIndex = args.indexOf('--port');
if (portIndex !== -1 && args[portIndex + 1]) {
  targetPort = parseInt(args[portIndex + 1], 10);
}

// Check for --source flag (for tracking who started)
let source = 'manual';
const sourceIndex = args.indexOf('--source');
if (sourceIndex !== -1 && args[sourceIndex + 1]) {
  source = args[sourceIndex + 1];
}

(async () => {
  switch (command) {
    case 'status':
      await status();
      break;
    case 'stop':
      await stop(targetPort);
      break;
    case 'start':
      await start(source);
      break;
    default:
      console.log('Dev Server Manager');
      console.log('');
      console.log('Usage: node dev-server.js <command> [options]');
      console.log('');
      console.log('Commands:');
      console.log('  status              Show all running dev servers');
      console.log('  stop                Stop all dev servers');
      console.log('  stop --port 3000    Stop specific port');
      console.log('  start               Find available port for new server');
      console.log('  start --source X    Track who started (e.g., "claude-code")');
      process.exit(1);
  }
})();
