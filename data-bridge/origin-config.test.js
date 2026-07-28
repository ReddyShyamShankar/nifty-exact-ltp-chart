import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import originConfig from "./origin-config.cjs";

const DEFAULT_ORIGIN = "chrome-extension://hjgknhdbplfoeldaalpidhkahnfldjem";
const PORTABLE_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

test("accepts only one exact lowercase Chrome extension origin", () => {
  assert.equal(originConfig.validateExtensionOrigin(PORTABLE_ORIGIN), PORTABLE_ORIGIN);
  for (const invalid of [
    "*",
    "https://example.com",
    `${PORTABLE_ORIGIN}/`,
    "chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnOq"
  ]) assert.throws(() => originConfig.validateExtensionOrigin(invalid), /exact Chrome extension origin/i);
});

test("persists a portable origin with restrictive permissions and reloads it on a new process", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "nifty-origin-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const configPath = join(directory, "bridge.json");

  originConfig.saveExtensionOrigin(PORTABLE_ORIGIN, { configPath });

  assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { extensionOrigin: PORTABLE_ORIGIN });
  assert.equal(statSync(configPath).mode & 0o777, 0o600);
  assert.equal(originConfig.loadExtensionOrigin({ environment: {}, configPath, defaultOrigin: DEFAULT_ORIGIN }), PORTABLE_ORIGIN);
});

test("environment override wins and the explicit legacy default remains tested", () => {
  const missingPath = join(tmpdir(), `nifty-origin-missing-${process.pid}.json`);
  assert.equal(originConfig.loadExtensionOrigin({
    environment: { NIFTY_EXTENSION_ORIGIN: PORTABLE_ORIGIN },
    configPath: missingPath,
    defaultOrigin: DEFAULT_ORIGIN
  }), PORTABLE_ORIGIN);
  assert.equal(originConfig.loadExtensionOrigin({
    environment: {}, configPath: missingPath, defaultOrigin: DEFAULT_ORIGIN
  }), DEFAULT_ORIGIN);
});

test("bridge manager origin command provides the supported new-machine setup path", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "nifty-origin-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const configPath = join(directory, "bridge.json");
  const manager = fileURLToPath(new URL("./bridge-manager.cjs", import.meta.url));

  const result = spawnSync(process.execPath, [manager, "origin", PORTABLE_ORIGIN], {
    encoding: "utf8",
    env: { ...process.env, NIFTY_BRIDGE_CONFIG_PATH: configPath }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Saved exact extension origin/);
  assert.equal(originConfig.loadExtensionOrigin({ environment: {}, configPath, defaultOrigin: DEFAULT_ORIGIN }), PORTABLE_ORIGIN);
});
