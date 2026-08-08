"use strict";

const { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { dirname, resolve } = require("node:path");

const DEFAULT_EXTENSION_ORIGIN = "chrome-extension://hjgknhdbplfoeldaalpidhkahnfldjem";
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;

function validateExtensionOrigin(value) {
  if (typeof value !== "string" || !EXTENSION_ORIGIN_PATTERN.test(value)) {
    throw new Error("NIFTY bridge requires one exact Chrome extension origin: chrome-extension://<32 lowercase a-p characters>.");
  }
  return value;
}

function defaultConfigPath(environment = process.env) {
  return resolve(environment.NIFTY_BRIDGE_CONFIG_PATH || homedir(),
    environment.NIFTY_BRIDGE_CONFIG_PATH ? "" : ".config/nifty-options-bridge/config.json");
}

function loadExtensionOrigin({
  environment = process.env,
  configPath = defaultConfigPath(environment),
  defaultOrigin = DEFAULT_EXTENSION_ORIGIN
} = {}) {
  if (environment.NIFTY_EXTENSION_ORIGIN) return validateExtensionOrigin(environment.NIFTY_EXTENSION_ORIGIN);
  if (existsSync(configPath)) {
    let config;
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (cause) {
      const error = new Error("Invalid NIFTY bridge origin configuration.");
      error.cause = cause;
      throw error;
    }
    return validateExtensionOrigin(config?.extensionOrigin);
  }
  return validateExtensionOrigin(defaultOrigin);
}

function saveExtensionOrigin(origin, { configPath = defaultConfigPath() } = {}) {
  const validated = validateExtensionOrigin(origin);
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  writeFileSync(configPath, `${JSON.stringify({ extensionOrigin: validated }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(configPath, 0o600);
  return validated;
}

module.exports = {
  DEFAULT_EXTENSION_ORIGIN,
  defaultConfigPath,
  loadExtensionOrigin,
  saveExtensionOrigin,
  validateExtensionOrigin
};
