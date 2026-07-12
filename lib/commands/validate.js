const { resolveProject } = require('../project');
const { loadArtifactsFromDir } = require('../loader-fs');
const { createCliEngine } = require('../engine');
const { CliError } = require('../errors');
const { formatDiagnostics } = require('jsonspecs');

function runValidate(cwd = process.cwd(), options = {}) {
  const project = resolveProject(cwd);
  const { artifacts, sources } = loadArtifactsFromDir(project.rulesDir);
  const { engine } = createCliEngine(project);
  try {
    const result = engine.validate(artifacts, { sources });
    if (!result.ok) { if (options.json) console.log(JSON.stringify(result.diagnostics, null, 2)); else if (!options.quiet) { console.error('[jsonspecs-cli] validation failed:'); console.error(formatDiagnostics(result.diagnostics)); } return 1; }
    if (options.json) console.log(JSON.stringify({ ok: true, artifactCount: artifacts.length })); else if (!options.quiet) console.log(`[jsonspecs-cli] validate OK (${artifacts.length} artifacts)`);
    return 0;
  } catch (err) {
    throw new CliError(err.message || String(err));
  }
}

module.exports = runValidate;
