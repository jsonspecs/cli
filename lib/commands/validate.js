const { resolveProject } = require('../project');
const { buildProject, warningDiagnostics } = require('../project-build');
const { createTerminal } = require('../terminal');

function runValidate(cwd = process.cwd(), options = {}) {
  const terminal = createTerminal(options);
  const project = resolveProject(cwd);
  const bundle = buildProject(project);
  const result = bundle.validation;
  const artifactCount = Object.keys(bundle.artifacts).length;
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
          artifactCount,
          warningCount: warnings.length,
          diagnosticCount: result.diagnostics.length,
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
        artifactCount,
        warningCount: warnings.length,
        diagnosticCount: result.diagnostics.length,
        diagnostics: warnings
      }, null, 2));
    } else if (!options.quiet) {
      if (warnings.length > 0) {
        console.error(terminal.warningHeader('validation warnings'));
        console.error(terminal.formatDiagnostics(warnings));
      }
      const details = warnings.length > 0
        ? `${artifactCount} artifacts, ${warnings.length} warnings`
        : `${artifactCount} artifacts`;
      console.log(terminal.ok('validate OK', details));
    }
  return 0;
}

module.exports = runValidate;
