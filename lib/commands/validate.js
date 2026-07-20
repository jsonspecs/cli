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
    const warnings = warningDiagnostics(result.diagnostics);
    if (warnings.length > 0 && options.failOnWarning) {
      if (options.json) {
        console.log(JSON.stringify({
          ok: false,
          artifactCount: artifacts.length,
          warningCount: warnings.length,
          diagnosticCount: warnings.length,
          reason: '--fail-on-warning',
          diagnostics: warnings
        }, null, 2));
      } else if (!options.quiet) {
        console.error(terminal.warningHeader('validation warnings'));
        console.error(terminal.formatDiagnostics(warnings));
        console.error(terminal.fail('validate failed', `${warnings.length} warnings (--fail-on-warning)`));
      }
      return 1;
    }
    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        artifactCount: artifacts.length,
        warningCount: warnings.length,
        diagnosticCount: warnings.length,
        diagnostics: warnings
      }, null, 2));
    } else if (!options.quiet) {
      if (warnings.length > 0) {
        console.error(terminal.warningHeader('validation warnings'));
        console.error(terminal.formatDiagnostics(warnings));
      }
      const details = warnings.length > 0
        ? `${artifacts.length} artifacts, ${warnings.length} warnings`
        : `${artifacts.length} artifacts`;
      console.log(terminal.ok('validate OK', details));
    }
    return 0;
  } catch (err) {
    throw new CliError(err.message || String(err));
  }
}

function warningDiagnostics(diagnostics = []) {
  return diagnostics.filter((item) => String(item.level || '').toLowerCase() === 'warning');
}

module.exports = runValidate;
