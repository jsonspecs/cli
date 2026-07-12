const fs = require('fs');
const path = require('path');
const { CliError } = require('./errors');

function loadArtifactsFromDir(rulesDir) {
  if (!rulesDir || typeof rulesDir !== 'string') throw new CliError('rulesDir must be a non-empty string');
  const root = path.resolve(rulesDir);
  if (!fs.existsSync(root)) throw new CliError(`Rules directory not found: ${root}`);

  const artifacts = [];
  const sources = new Map();
  walk(root, root, artifacts, sources);
  return { artifacts, sources };
}

function walk(root, dir, artifacts, sources) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, artifacts, sources);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const raw = fs.readFileSync(full, 'utf8');
    const rel = path.relative(root, full).replace(/\\/g, '/');
    let obj;
    try { obj = JSON.parse(raw); } catch (error) { throw new CliError(`Invalid JSON in ${rel}: ${error.message}`); }
    if (typeof obj.id !== 'string' || !obj.id) {
      throw new CliError(`Artifact in ${rel} is missing required string field \"id\"`);
    }
    if (sources.has(obj.id)) throw new CliError(`Duplicate artifact id ${obj.id} in ${sources.get(obj.id).rel} and ${rel}`);
    artifacts.push(obj);
    sources.set(obj.id, { file: full, rel });
  }
}

module.exports = { loadArtifactsFromDir };
