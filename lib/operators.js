"use strict";

/**
 * Загружает внешние operator packs, явно объявленные authoring-проектом.
 *
 * CLI не знает о предметных пакетах и ничего не регистрирует сам. И локальные
 * пути, и npm-пакеты разрешаются относительно `manifest.json` проекта, поэтому
 * зависимость принадлежит пакету правил, а не глобальной установке CLI.
 */

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { CliError } = require("./errors");

function createOperators(project) {
  const operators = Object.create(null);
  const sources = Object.create(null);
  const packs = [];

  for (const spec of getNodeOperatorPackSpecs(project?.manifest)) {
    const loaded = loadOperatorPack(spec, project?.root);
    packs.push(describeOperatorPack(spec, project));
    for (const [name, definition] of Object.entries(loaded)) {
      validateDefinition(name, definition, spec);
      if (Object.prototype.hasOwnProperty.call(operators, name)) {
        throw new CliError(`Operator pack "${spec}": operator "${name}" is already provided by "${sources[name]}"`);
      }
      operators[name] = definition;
      sources[name] = spec;
    }
  }

  return {
    operators: Object.freeze(operators),
    meta: { operators: {} },
    operatorSources: Object.freeze(sources),
    operatorPacks: Object.freeze(packs.map((pack) => Object.freeze(pack))),
  };
}

function getNodeOperatorPackSpecs(manifest) {
  const specs = manifest?.operatorPacks?.node;
  if (specs == null) return [];
  if (!Array.isArray(specs)) throw new CliError("manifest.json: operatorPacks.node must be an array of module specifiers");
  for (const spec of specs) {
    if (typeof spec !== "string" || !spec) throw new CliError("manifest.json: every operatorPacks.node item must be a non-empty string");
  }
  return specs;
}

function loadOperatorPack(spec, projectRoot = process.cwd()) {
  const projectRequire = createRequire(path.join(path.resolve(projectRoot), "manifest.json"));
  let pack;
  try {
    pack = projectRequire(spec);
  } catch (error) {
    throw new CliError(`Failed to load operator pack "${spec}": ${error.message}`);
  }

  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    throw new CliError(`Operator pack "${spec}" must export an operator map`);
  }
  return pack;
}

function resolveOperatorPack(spec, projectRoot = process.cwd()) {
  const projectRequire = createRequire(path.join(path.resolve(projectRoot), "manifest.json"));
  try {
    return projectRequire.resolve(spec);
  } catch (error) {
    throw new CliError(`Failed to resolve operator pack "${spec}": ${error.message}`);
  }
}

function resolveOperatorPackRoot(spec, projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  const resolved = resolveOperatorPack(spec, root);
  if (isLocalSpecifier(spec)) {
    const candidate = path.resolve(root, spec);
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      return fs.realpathSync(stat.isDirectory() ? candidate : path.dirname(candidate));
    }
    return fs.realpathSync(path.dirname(resolved));
  }
  return findPackageRoot(resolved) || fs.realpathSync(path.dirname(resolved));
}

function describeOperatorPack(spec, project) {
  const root = resolveOperatorPackRoot(spec, project?.root);
  const packageIdentity = readPackageIdentity(root);
  return {
    specifier: spec,
    id: packageIdentity?.name || `${project?.manifest?.project?.id || "jsonspecs-project"}:${spec}`,
    version: packageIdentity?.version || project?.manifest?.project?.version || "unknown",
    digest: `sha256:${hashOperatorPackRoot(root)}`,
  };
}

function hashOperatorPackRoot(root) {
  const hash = crypto.createHash("sha256");
  for (const file of operatorPackFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const body = fs.readFileSync(file);
    hash.update(relative, "utf8");
    hash.update("\0");
    hash.update(String(body.length), "utf8");
    hash.update("\0");
    hash.update(body);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function operatorPackFiles(root) {
  const files = [];
  walk(root, files);
  return files.sort(compareUtf16);
}

function walk(dir, files) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => compareUtf16(left.name, right.name));
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile()) files.push(full);
  }
}

function clearOperatorPackCache(root) {
  const resolvedRoot = fs.realpathSync(root);
  for (const key of Object.keys(require.cache)) {
    const relative = path.relative(resolvedRoot, key);
    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
      delete require.cache[key];
    }
  }
}

function isLocalSpecifier(spec) {
  return spec.startsWith(".") || path.isAbsolute(spec);
}

function findPackageRoot(resolvedFile) {
  let current = fs.realpathSync(path.dirname(resolvedFile));
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readPackageIdentity(root) {
  const packageFile = path.join(root, "package.json");
  if (!fs.existsSync(packageFile)) return null;
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    if (typeof packageJson.name !== "string" || !packageJson.name || typeof packageJson.version !== "string" || !packageJson.version) return null;
    return { name: packageJson.name, version: packageJson.version };
  } catch (_) {
    return null;
  }
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateDefinition(name, definition, spec) {
  if (!name) throw new CliError(`Operator pack "${spec}" contains an empty operator name`);
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new CliError(`Operator pack "${spec}": "${name}" must be { schema, evaluate }`);
  }
  if (typeof definition.schema !== "object" || definition.schema === null || Array.isArray(definition.schema)) {
    throw new CliError(`Operator pack "${spec}": "${name}.schema" must be a closed JSON Schema object`);
  }
  if (typeof definition.evaluate !== "function") {
    throw new CliError(`Operator pack "${spec}": "${name}.evaluate" must be a function`);
  }
}

module.exports = {
  createOperators,
  getNodeOperatorPackSpecs,
  clearOperatorPackCache,
  describeOperatorPack,
  hashOperatorPackRoot,
  loadOperatorPack,
  resolveOperatorPack,
  resolveOperatorPackRoot,
};
