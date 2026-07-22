#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  createReleasePackage,
  packSourcePackage,
  readJson,
  runNpm,
  verifySourceDependency,
} = require("./release-package");

const RULES_PACKAGE = "@jsonspecs/rules";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${output ? `:\n${output}` : ""}`);
  }
}

const root = path.resolve(__dirname, "..");
const rulesRoot = path.resolve(process.env.JSONSPECS_SOURCE || path.join(root, "..", "rules"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jsonspecs-cli-pack-smoke-"));

try {
  const { expectedVersion } = verifySourceDependency(root, rulesRoot);
  const tarballs = path.join(temp, "tarballs");
  fs.mkdirSync(tarballs);
  const rulesTarball = packSourcePackage(rulesRoot, tarballs);
  const cliPackage = createReleasePackage({ root, rulesRoot, outputDir: tarballs });

  const consumer = path.join(temp, "consumer");
  fs.mkdirSync(consumer);
  fs.writeFileSync(path.join(consumer, "package.json"), `${JSON.stringify({
    name: "jsonspecs-cli-pack-consumer",
    version: "1.0.0",
    private: true,
    type: "commonjs",
  }, null, 2)}\n`);
  runNpm([
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--save-exact",
    rulesTarball,
    cliPackage.tarball,
  ], { cwd: consumer });

  const installedCli = readJson(path.join(consumer, "node_modules", "jsonspecs-cli", "package.json"));
  assert.equal(installedCli.private, undefined);
  assert.equal(installedCli.scripts, undefined);
  assert.equal(installedCli.config, undefined);
  assert.equal(installedCli.dependencies[RULES_PACKAGE], `^${expectedVersion}`);
  assert.equal(installedCli.dependencies[RULES_PACKAGE].includes("file:"), false);
  assert.equal(readJson(path.join(consumer, "node_modules", "@jsonspecs", "rules", "package.json")).version, expectedVersion);

  const binary = path.join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "jsonspecs.cmd" : "jsonspecs",
  );
  run(binary, ["init", "demo"], consumer);
  const project = path.join(consumer, "demo");
  run(binary, ["validate", "--quiet"], project);
  run(binary, ["test", "--quiet"], project);
  run(binary, ["build", "--quiet"], project);

  const snapshot = path.join(project, "dist", "snapshot.json");
  assert.equal(fs.existsSync(snapshot), true);
  assert.equal(fs.existsSync(path.join(project, "dist", "build-info.json")), true);
  const cjsProbe = path.join(consumer, "probe.cjs");
  fs.writeFileSync(cjsProbe, `
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { compileSnapshot, runPipeline } = require("@jsonspecs/rules");
const prepared = compileSnapshot(JSON.parse(fs.readFileSync(${JSON.stringify(snapshot)}, "utf8")));
const result = runPipeline(prepared, {
  pipelineId: "entrypoints.order.validation",
  payload: { order: { amount: 1500 } },
});
assert.equal(result.status, "OK");
`);
  run(process.execPath, [cjsProbe], consumer);

  console.log(`[jsonspecs-cli] packed CommonJS consumer smoke OK (${RULES_PACKAGE} ${expectedVersion})`);
} finally {
  if (process.env.KEEP_PACK_SMOKE === "1") {
    console.log(`[jsonspecs-cli] kept smoke directory: ${temp}`);
  } else {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
