const fs = require('fs');
const path = require('path');
const { CliError } = require('./errors');
const { readJson } = require('./fs-utils');

function findProjectRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    const manifest = path.join(current, 'manifest.json');
    if (fs.existsSync(manifest)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveProject(startDir = process.cwd()) {
  const root = findProjectRoot(startDir);
  if (!root) throw new CliError('manifest.json not found. Run this command from a jsonspecs rules project.');
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = readJson(manifestPath);
  validateManifestShape(manifest, manifestPath);

  const pathsCfg = manifest.paths || {};
  const project = {
    root,
    manifestPath,
    manifest,
    rulesDir: path.resolve(root, pathsCfg.rules || './rules'),
    samplesDir: path.resolve(root, pathsCfg.samples || './samples'),
    docsDir: path.resolve(root, pathsCfg.docs || './docs'),
    distDir: path.resolve(root, pathsCfg.dist || './dist')
  };
  return project;
}

function validateManifestShape(manifest, manifestPath = 'manifest.json') {
  if (!manifest || typeof manifest !== 'object') throw new CliError(`${manifestPath}: manifest must be a JSON object`);
  const required = [
    ['specVersion', manifest.specVersion],
    ['exports', manifest.exports],
    ['project.id', manifest.project && manifest.project.id],
    ['project.version', manifest.project && manifest.project.version],
    ['project.title', manifest.project && manifest.project.title],
    ['project.description', manifest.project && manifest.project.description],
    ['project.language', manifest.project && manifest.project.language],
    ['paths.rules', manifest.paths && manifest.paths.rules],
    ['paths.samples', manifest.paths && manifest.paths.samples],
    ['paths.dist', manifest.paths && manifest.paths.dist],
    ['build.snapshotFile', manifest.build && manifest.build.snapshotFile],
    ['build.buildInfoFile', manifest.build && manifest.build.buildInfoFile]
  ];
  const missing = required.filter(([, value]) => value === undefined || value === null || value === '').map(([key]) => key);
  if (missing.length) throw new CliError(`${manifestPath}: missing required fields: ${missing.join(', ')}`);

  const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  if (!semverPattern.test(manifest.project.version)) {
    throw new CliError(`${manifestPath}: project.version must be an explicit semantic version`);
  }
  if (!semverPattern.test(manifest.specVersion)) {
    throw new CliError(`${manifestPath}: specVersion must be an explicit semantic version`);
  }

  if (!Array.isArray(manifest.exports) || manifest.exports.length === 0) {
    throw new CliError(`${manifestPath}: exports must be a non-empty array of pipeline ids`);
  }
  if (manifest.exports.some((id) => typeof id !== 'string' || !id)) {
    throw new CliError(`${manifestPath}: every exports item must be a non-empty string`);
  }
  if (new Set(manifest.exports).size !== manifest.exports.length) {
    throw new CliError(`${manifestPath}: exports must not contain duplicates`);
  }
  const sortedExports = [...manifest.exports].sort(compareUtf16);
  if (sortedExports.some((id, index) => id !== manifest.exports[index])) {
    throw new CliError(`${manifestPath}: exports must be sorted by unsigned UTF-16 code units`);
  }

  const packs = manifest.operatorPacks && manifest.operatorPacks.node;
  if (packs != null && !Array.isArray(packs)) throw new CliError(`${manifestPath}: operatorPacks.node must be an array`);

  if (manifest.catalog != null && (!manifest.catalog || typeof manifest.catalog !== 'object' || Array.isArray(manifest.catalog))) {
    throw new CliError(`${manifestPath}: catalog must be an object`);
  }
}

function toStudioManifest(manifest, operatorMeta = null) {
  return {
    name: manifest.project?.title || manifest.project?.id || 'jsonspecs sandbox',
    description: manifest.project?.description || '',
    exports: manifest.exports || [],
    fields: manifest.catalog?.fields || {},
    entrypoints: manifest.catalog?.entrypoints || {},
    artifacts: manifest.catalog?.artifacts || {},
    operators: mergeOperatorDescriptions(manifest.catalog?.operators || {}, operatorMeta?.operators || {})
  };
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mergeOperatorDescriptions(manifestOperators, metaOperators) {
  return Object.assign({}, manifestOperators || {}, metaOperators || {});
}

module.exports = { resolveProject, findProjectRoot, validateManifestShape, toStudioManifest };
