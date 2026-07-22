#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { packageRulesVersion, readJson, runNpm } = require("./release-package");

const RULES_PACKAGE = "@jsonspecs/rules";

const root = path.resolve(__dirname, "..");
const target = path.resolve(process.argv[2] || path.join(root, "..", "rules"));
const packageJson = readJson(path.join(root, "package.json"));
const version = packageRulesVersion(packageJson);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jsonspecs-cli-upstream-"));

try {
  const raw = runNpm([
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    temp,
    `${RULES_PACKAGE}@${version}`,
  ]);
  const result = JSON.parse(raw)[0];
  if (!result || !result.filename) throw new Error(`npm pack did not report the ${RULES_PACKAGE} tarball`);

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", path.join(temp, result.filename), "--strip-components=1", "-C", target], {
    encoding: "utf8",
  });
  if (tar.status !== 0) throw new Error(`failed to extract ${RULES_PACKAGE}: ${tar.stderr || tar.stdout}`);

  const installed = readJson(path.join(target, "package.json"));
  if (installed.name !== RULES_PACKAGE || installed.version !== version) {
    throw new Error(`registry returned ${installed.name}@${installed.version}, expected ${RULES_PACKAGE}@${version}`);
  }
  runNpm([
    "install",
    "--omit=dev",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
  ], { cwd: target });
  console.log(`[jsonspecs-cli] materialized published ${RULES_PACKAGE}@${version} with runtime dependencies at ${target}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
