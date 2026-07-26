#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { dirname, resolve } = require("node:path");

const LABEL = "com.reddy.nifty-options-bridge";
const SERVICE = "NIFTY Options Upstox Analytics Token";
const plist = resolve(homedir(), "Library/LaunchAgents", `${LABEL}.plist`);
const server = resolve(__dirname, "server.js");
const log = resolve(homedir(), "Library/Logs/NiftyOptionsBridge.log");

function escape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function launchctl(...args) {
  return execFileSync("/bin/launchctl", args, { stdio: "inherit" });
}

function install() {
  mkdirSync(dirname(plist), { recursive: true });
  mkdirSync(dirname(log), { recursive: true });
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${escape(process.execPath)}</string>
    <string>${escape(server)}</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>NIFTY_UPSTOX_KEYCHAIN_SERVICE</key><string>${SERVICE}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${escape(log)}</string>
  <key>StandardErrorPath</key><string>${escape(log)}</string>
</dict></plist>\n`, { mode: 0o600 });
  try { launchctl("bootout", `gui/${process.getuid()}`, plist); } catch {}
  launchctl("bootstrap", `gui/${process.getuid()}`, plist);
  launchctl("kickstart", "-k", `gui/${process.getuid()}/${LABEL}`);
  console.log(`Installed persistent bridge: ${plist}`);
}

function start() {
  if (!existsSync(plist)) install();
  else launchctl("kickstart", "-k", `gui/${process.getuid()}/${LABEL}`);
}

function status() {
  try {
    const output = execFileSync("/usr/bin/curl", ["-fsS", "http://127.0.0.1:8787/api/health?live=1"], { encoding: "utf8", timeout: 10000 });
    console.log(output);
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    process.exitCode = 1;
  }
}

const command = process.argv[2] || "status";
if (command === "install") install();
else if (command === "start") start();
else if (command === "status") status();
else {
  console.error("Usage: node data-bridge/bridge-manager.cjs <install|start|status>");
  process.exitCode = 2;
}
