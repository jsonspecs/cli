"use strict";

/** Собирает проверенный fv2 snapshot и внешние сведения о сборке. */

const path = require("node:path");
const { resolveProject } = require("../project");
const { buildProject, warningDiagnostics } = require("../project-build");
const { ensureDir, writeJson } = require("../fs-utils");
const { createTerminal } = require("../terminal");

function getRulesVersion() {
  try { return require("@jsonspecs/rules/package.json").version || "unknown"; }
  catch (_) { return "unknown"; }
}

function runBuild(cwd = process.cwd(), options = {}) {
  const terminal = createTerminal(options);
  const project = resolveProject(cwd);
  const bundle = buildProject(project);
  const validation = bundle.validation;
  const artifactCount = Object.keys(bundle.artifacts).length;

  if (!validation.ok) {
    if (options.json) console.log(JSON.stringify(validation.diagnostics, null, 2));
    else if (!options.quiet) {
      console.error(terminal.diagnosticHeader("build failed"));
      console.error(terminal.formatDiagnostics(validation.diagnostics));
    }
    return 1;
  }

  const warnings = warningDiagnostics(validation.diagnostics);
  if (warnings.length > 0 && options.failOnWarning) {
    if (options.json) {
      console.log(JSON.stringify({
        ok: false,
        artifactCount,
        warningCount: warnings.length,
        diagnosticCount: validation.diagnostics.length,
        reason: "--fail-on-warning",
        diagnostics: warnings,
      }, null, 2));
    } else if (!options.quiet) {
      console.error(terminal.warningHeader("build warnings"));
      console.error(terminal.formatDiagnostics(warnings));
      console.error(terminal.fail("build failed", `${warnings.length} warnings (--fail-on-warning)`));
    }
    return 1;
  }

  ensureDir(project.distDir);
  const snapshotFile = path.join(project.distDir, project.manifest.build.snapshotFile);
  const buildInfoFile = path.join(project.distDir, project.manifest.build.buildInfoFile);
  const rulesVersion = getRulesVersion();
  const buildInfo = {
    project: {
      id: project.manifest.project.id,
      title: project.manifest.project.title,
      version: project.manifest.project.version,
    },
    runtime: {
      package: "@jsonspecs/rules",
      version: rulesVersion,
    },
    builtAt: new Date().toISOString(),
    specVersion: bundle.snapshot.specVersion,
    sourceHash: bundle.snapshot.sourceHash,
    exports: bundle.snapshot.exports,
    artifactCount,
    warningCount: warnings.length,
    diagnosticCount: validation.diagnostics.length,
    operatorPacks: bundle.operatorPacks || [],
    operators: Object.keys(bundle.operatorSources || {}).sort(compareUtf16),
  };

  writeJson(snapshotFile, bundle.snapshot);
  writeJson(buildInfoFile, buildInfo);

  if (options.json) {
    console.log(JSON.stringify({
      ok: true,
      snapshotFile,
      buildInfoFile,
      sourceHash: bundle.snapshot.sourceHash,
      warningCount: warnings.length,
      diagnosticCount: validation.diagnostics.length,
      diagnostics: warnings,
    }, null, 2));
  } else if (!options.quiet) {
    if (warnings.length > 0) {
      console.error(terminal.warningHeader("build warnings"));
      console.error(terminal.formatDiagnostics(warnings));
    }
    console.log(terminal.ok("build OK"));
    console.log(terminal.info("snapshot", snapshotFile));
    console.log(terminal.info("build info", buildInfoFile));
    console.log(terminal.info("source hash", bundle.snapshot.sourceHash));
    if (warnings.length > 0) console.log(terminal.info("warnings", warnings.length));
  }
  return 0;
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

module.exports = runBuild;
