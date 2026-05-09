#!/usr/bin/env node

/**
 * AI Summary — Aqua-session bridge agent.
 *
 * Why this exists:
 *   The Safari Web Extension (sandboxed) talks to NodeBridge.xpc, which is
 *   launched by xpcproxy. xpcproxy-spawned processes don't get the user's
 *   GUI security session, so they can't unlock the login keychain — and the
 *   Claude CLI keeps its OAuth token there. Result: `claude --print` returns
 *   "Not logged in" no matter what env we hand it.
 *
 * The fix:
 *   This script is loaded as a LaunchAgent with LimitLoadToSessionType=Aqua,
 *   so it runs in the same security session as Finder / Terminal / Safari
 *   itself. Anything it spawns inherits keychain access.
 *
 * Protocol:
 *   - Listens on a Unix socket at ~/Library/Caches/com.altonfong.aisummary/host.sock
 *   - For each accepted connection, spawns a fresh `node host.js` and
 *     bidirectionally pipes the socket and the child's stdin/stdout.
 *   - host.js's stdin/stdout protocol is unchanged (length-prefixed JSON),
 *     so the XPC service is just a TCP-style transport adapter.
 *
 *   One-host-per-connection avoids any multiplexing logic. The XPC service
 *   opens a fresh socket per Safari request. ~50ms cold-start cost is fine
 *   compared to the LLM call.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const SOCKET_DIR = path.join(os.homedir(), 'Library/Caches/com.altonfong.aisummary');
const SOCKET_PATH = path.join(SOCKET_DIR, 'host.sock');
const HOST_JS = path.join(__dirname, 'host.js');

function log(msg) {
  // stdout is captured to /tmp/aisummary-agent.log by the LaunchAgent plist.
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function setup() {
  fs.mkdirSync(SOCKET_DIR, { recursive: true, mode: 0o700 });
  // Stale socket from a previous run blocks bind.
  try { fs.unlinkSync(SOCKET_PATH); } catch (_) { /* fine */ }
}

function handleConnection(socket) {
  log('connection accepted; spawning host.js');

  const child = spawn(process.execPath, [HOST_JS], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
    env: process.env,  // inherits Aqua session env, incl. keychain access
  });

  let closed = false;
  const closeBoth = (label) => {
    if (closed) return;
    closed = true;
    log(`closing connection (${label})`);
    try { child.kill(); } catch (_) {}
    try { socket.destroy(); } catch (_) {}
  };

  // Socket → child stdin
  socket.on('data', (chunk) => {
    if (!child.stdin.destroyed) child.stdin.write(chunk);
  });
  socket.on('end', () => closeBoth('socket end'));
  socket.on('error', (e) => { log(`socket error: ${e.message}`); closeBoth('socket error'); });

  // Child stdout → socket
  child.stdout.on('data', (chunk) => {
    if (!socket.destroyed) socket.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    log(`host.js stderr: ${chunk.toString().trim()}`);
  });
  child.on('exit', (code) => {
    log(`host.js exited code=${code}`);
    closeBoth('child exit');
  });
  child.on('error', (e) => {
    log(`host.js error: ${e.message}`);
    closeBoth('child error');
  });
}

function start() {
  setup();
  const server = net.createServer(handleConnection);
  server.listen(SOCKET_PATH, () => {
    fs.chmodSync(SOCKET_PATH, 0o600);
    log(`agent listening on ${SOCKET_PATH}`);
  });
  server.on('error', (e) => {
    log(`server error: ${e.message}`);
    process.exit(1);
  });

  const shutdown = () => {
    log('shutdown requested');
    try { server.close(); } catch (_) {}
    try { fs.unlinkSync(SOCKET_PATH); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
