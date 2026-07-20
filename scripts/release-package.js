"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RULES_PACKAGE = "@jsonspecs/rules";
const SOURCE_DEPENDENCY = "file:../rules";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runNpm(args, options = {}) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`npm ${args.join(" ")} failed${output ? `:\n${output}` : ""}`);
  }
  return result.stdout.trim();
}

function packageRulesVersion(packageJson) {
  const version = packageJson.config && packageJson.config.rulesVersion;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("package.json config.rulesVersion must be an explicit semver version");
  }
  return version;
}

function verifySourceDependency(root, rulesRoot) {
  const packageJson = readJson(path.join(root, "package.json"));
  const rulesPackage = readJson(path.join(rulesRoot, "package.json"));
  const expectedVersion = packageRulesVersion(packageJson);

  if (packageJson.dependencies?.[RULES_PACKAGE] !== SOURCE_DEPENDENCY) {
    throw new Error(`source package must use the sibling dependency ${SOURCE_DEPENDENCY}`);
  }
  if (rulesPackage.name !== RULES_PACKAGE) {
    throw new Error(`expected ${RULES_PACKAGE} at ${rulesRoot}`);
  }
  if (rulesPackage.version !== expectedVersion) {
    throw new Error(`${RULES_PACKAGE} source version ${rulesPackage.version} does not match required ${expectedVersion}`);
  }

  return { packageJson, expectedVersion };
}

function createReleasePackage({ root, rulesRoot, outputDir }) {
  const { packageJson, expectedVersion } = verifySourceDependency(root, rulesRoot);
  const stageParent = fs.mkdtempSync(path.join(os.tmpdir(), "jsonspecs-cli-release-"));
  const stage = path.join(stageParent, "package");
  fs.mkdirSync(stage);

  try {
    for (const entry of packageJson.files || []) {
      if (entry.includes("*") || entry.includes("?")) {
        throw new Error(`release packer does not support globbed files entries: ${entry}`);
      }
      const source = safePackagePath(root, entry, "source");
      const target = safePackagePath(stage, entry, "staging target");
      if (!fs.existsSync(source)) throw new Error(`package file does not exist: ${entry}`);
      assertNoSymlinks(source, entry);
      fs.cpSync(source, target, { recursive: true });
    }

    const releasePackageJson = JSON.parse(JSON.stringify(packageJson));
    delete releasePackageJson.private;
    delete releasePackageJson.scripts;
    delete releasePackageJson.config;
    releasePackageJson.dependencies[RULES_PACKAGE] = `^${expectedVersion}`;
    fs.writeFileSync(path.join(stage, "package.json"), `${JSON.stringify(releasePackageJson, null, 2)}\n`);

    fs.mkdirSync(outputDir, { recursive: true });
    const raw = runNpm([
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      outputDir,
      stage,
    ]);
    const result = JSON.parse(raw)[0];
    if (!result || !result.filename) throw new Error("npm pack did not report a tarball");

    return {
      tarball: path.resolve(outputDir, result.filename),
      filename: result.filename,
      integrity: result.integrity,
      rulesVersion: expectedVersion,
    };
  } finally {
    fs.rmSync(stageParent, { recursive: true, force: true });
  }
}

function safePackagePath(base, entry, label) {
  if (typeof entry !== "string" || !entry || path.isAbsolute(entry)) throw new Error(`invalid absolute or empty package ${label}: ${entry}`);
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, entry);
  const relative = path.relative(resolvedBase, resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`package ${label} escapes its root: ${entry}`);
  return resolved;
}

function assertNoSymlinks(target, label) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`package files must not contain symlinks: ${label}`);
  if (!stat.isDirectory()) return;
  for (const child of fs.readdirSync(target)) assertNoSymlinks(path.join(target, child), `${label}/${child}`);
}

function packSourcePackage(sourceRoot, outputDir) {
  const raw = runNpm([
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    outputDir,
    sourceRoot,
  ]);
  const result = JSON.parse(raw)[0];
  if (!result || !result.filename) throw new Error("npm pack did not report a tarball");
  return path.resolve(outputDir, result.filename);
}

module.exports = {
  createReleasePackage,
  packageRulesVersion,
  packSourcePackage,
  readJson,
  runNpm,
  verifySourceDependency,
};
