const { resolveProject } = require('../project');
const { loadArtifactsFromDir } = require('../loader-fs');
const { createCliEngine } = require('../engine');
const { CliError } = require('../errors');
const { createTerminal } = require('../terminal');

function runValidate(cwd = process.cwd(), options = {}) {
  const terminal = createTerminal(options);
  const project = resolveProject(cwd);
  const { artifacts, sources } = loadArtifactsFromDir(project.rulesDir);
  const { engine } = createCliEngine(project);
  try {
    const result = engine.validate(artifacts, { sources });
    if (!result.ok) {
      if (options.json) console.log(JSON.stringify(result.diagnostics, null, 2));
      else if (!options.quiet) {
        console.error(terminal.diagnosticHeader('validation failed'));
        console.error(terminal.formatDiagnostics(result.diagnostics));
      }
      return 1;
    }
    if (options.json) console.log(JSON.stringify({ ok: true, artifactCount: artifacts.length }));
    else if (!options.quiet) console.log(terminal.ok('validate OK', `${artifacts.length} artifacts`));
    return 0;
  } catch (err) {
    throw new CliError(err.message || String(err));
  }
}

module.exports = runValidate;
