"use strict";

/**
 * Собирает authoring-проект в нормативный snapshot rules v3.
 *
 * Файловая раскладка, `artifact.id` и manifest являются удобствами редактора.
 * Runtime получает только закрытый fv2 snapshot: id становятся ключами
 * `artifacts`, публичные pipeline берутся из `exports`, а sourceHash считается
 * по окончательному исполняемому документу.
 */

const { computeSourceHash } = require("@jsonspecs/rules");
const { loadArtifactsFromDir } = require("./loader-fs");
const { createCliEngine } = require("./engine");
const { CliError } = require("./errors");

function buildProject(project) {
  const { artifacts, sources } = loadArtifactsFromDir(project.rulesDir);
  const snapshot = createSnapshot(project.manifest, artifacts);
  let runtime;
  try {
    runtime = createCliEngine(project);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Failed to create rules engine: ${error?.message || String(error)}`);
  }
  let validation;

  try {
    validation = runtime.engine.validate(snapshot);
  } catch (error) {
    throw new CliError(error?.message || String(error));
  }

  const diagnostics = attachSourceLocations(validation.diagnostics, sources);
  return {
    ...runtime,
    artifacts,
    sources,
    snapshot,
    validation: { ...validation, diagnostics },
    prepared: validation.prepared || null,
  };
}

function createSnapshot(manifest, artifacts) {
  const sortedArtifacts = Object.fromEntries(
    Object.entries(artifacts).sort(([left], [right]) => compareUtf16(left, right)),
  );
  const snapshot = {
    format: "jsonspecs-snapshot",
    formatVersion: 2,
    specVersion: manifest.specVersion,
    exports: [...manifest.exports],
    artifacts: sortedArtifacts,
  };
  snapshot.sourceHash = computeSourceHash(snapshot);
  return snapshot;
}

function attachSourceLocations(diagnostics = [], sources = new Map()) {
  return diagnostics.map((diagnostic) => {
    if (diagnostic.location || !diagnostic.artifactId) return diagnostic;
    const source = sources.get(diagnostic.artifactId);
    return source ? { ...diagnostic, location: source.rel } : diagnostic;
  });
}

function warningDiagnostics(diagnostics = []) {
  return diagnostics.filter((item) => String(item.level || "").toLowerCase() === "warning");
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

module.exports = {
  attachSourceLocations,
  buildProject,
  compareUtf16,
  createSnapshot,
  warningDiagnostics,
};
