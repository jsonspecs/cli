function getJsonspecsVersion() {
  try {
    const mainPath = require.resolve('jsonspecs');
    const fs = require('fs');
    const path = require('path');
    let current = path.dirname(mainPath);
    for (let i = 0; i < 4; i++) {
      const candidate = path.join(current, 'package.json');
      if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8')).version || 'unknown';
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch (_) {}
  return 'unknown';
}

const path = require('path');
const { resolveProject } = require('../project');
const { loadArtifactsFromDir } = require('../loader-fs');
const { createCliEngine, CompilationError } = require('../engine');
const { ensureDir, writeJson } = require('../fs-utils');
const { computeSourceHash, formatDiagnostics } = require('jsonspecs');

function runBuild(cwd = process.cwd(), options = {}) {
  const project = resolveProject(cwd);
  const { artifacts, sources } = loadArtifactsFromDir(project.rulesDir);
  const { engine } = createCliEngine(project);
  const validation = engine.validate(artifacts, { sources });
  if (!validation.ok) { if (options.json) console.log(JSON.stringify(validation.diagnostics, null, 2)); else if (!options.quiet) { console.error('[jsonspecs-cli] build failed:'); console.error(formatDiagnostics(validation.diagnostics)); } return 1; }

  ensureDir(project.distDir);
  const snapshotFile = path.join(project.distDir, project.manifest.build.snapshotFile);
  const buildInfoFile = path.join(project.distDir, project.manifest.build.buildInfoFile);
  const now = new Date().toISOString();
  const snapshot = {
    format: 'jsonspecs-snapshot',
    formatVersion: 1,
    sourceHash: computeSourceHash(artifacts),
    engine: { minVersion: getJsonspecsVersion() },
    artifacts,
    meta: { projectId: project.manifest.project.id, projectTitle: project.manifest.project.title, description: project.manifest.project.description }
  };
  const buildInfo = {
    projectId: project.manifest.project.id,
    projectTitle: project.manifest.project.title,
    builtAt: now,
    jsonspecsVersion: getJsonspecsVersion(),
    artifactCount: artifacts.length,
    entrypoints: artifacts.filter((a) => a.type === 'pipeline' && a.entrypoint === true).map((a) => a.id),
    nodeOperatorPacks: Array.isArray(project.manifest.operatorPacks?.node) ? project.manifest.operatorPacks.node : []
  };
  writeJson(snapshotFile, snapshot);
  writeJson(buildInfoFile, buildInfo);
  if (options.json) console.log(JSON.stringify({ ok: true, snapshotFile, buildInfoFile, sourceHash: snapshot.sourceHash }));
  else if (!options.quiet) { console.log(`[jsonspecs-cli] build OK`); console.log(`[jsonspecs-cli] snapshot: ${snapshotFile}`); console.log(`[jsonspecs-cli] build info: ${buildInfoFile}`); }
  return 0;
}

module.exports = runBuild;
