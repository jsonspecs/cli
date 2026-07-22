"use strict";

/** Запускает локальный Sandbox поверх собранного rules v3 проекта. */

const { resolveProject } = require("../project");
const { startSandbox } = require("../studio-server");

function runSandbox(cwd = process.cwd(), options = {}) {
  const project = resolveProject(cwd);
  project.manifest.sandbox = project.manifest.sandbox || {};
  if (options.host) project.manifest.sandbox.host = options.host;
  if (options.port !== undefined) project.manifest.sandbox.port = Number(options.port);
  return startSandbox(project, { color: options.color });
}

module.exports = runSandbox;
