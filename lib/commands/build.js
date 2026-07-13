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
const { createCliEngine } = require('../engine');
const { ensureDir, writeJson } = require('../fs-utils');
const { computeSourceHash } = require('jsonspecs');
const { createTerminal } = require('../terminal');

function runBuild(cwd = process.cwd(), options = {}) {
  const terminal = createTerminal(options);
  const project = resolveProject(cwd);
  const { artifacts, sources } = loadArtifactsFromDir(project.rulesDir);
  const { engine } = createCliEngine(project);
  const validation = engine.validate(artifacts, { sources });
  if (!validation.ok) {
    if (options.json) console.log(JSON.stringify(validation.diagnostics, null, 2));
    else if (!options.quiet) {
      console.error(terminal.diagnosticHeader('build failed'));
      console.error(terminal.formatDiagnostics(validation.diagnostics));
    }
    return 1;
  }

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
    meta: {
      projectId: project.manifest.project.id,
      projectTitle: project.manifest.project.title,
      description: project.manifest.project.description,
      rulesetVersion: project.manifest.project.version
    }
  };
  const buildInfo = {
    projectId: project.manifest.project.id,
    projectTitle: project.manifest.project.title,
    rulesetVersion: project.manifest.project.version,
    builtAt: now,
    jsonspecsVersion: getJsonspecsVersion(),
    snapshotFormat: snapshot.format,
    snapshotFormatVersion: snapshot.formatVersion,
    sourceHash: snapshot.sourceHash,
    artifactCount: artifacts.length,
    entrypoints: artifacts.filter((a) => a.type === 'pipeline' && a.entrypoint === true).map((a) => a.id),
    nodeOperatorPacks: Array.isArray(project.manifest.operatorPacks?.node) ? project.manifest.operatorPacks.node : []
  };
  writeJson(snapshotFile, snapshot);
  writeJson(buildInfoFile, buildInfo);
  if (options.json) console.log(JSON.stringify({ ok: true, snapshotFile, buildInfoFile, sourceHash: snapshot.sourceHash }));
  else if (!options.quiet) {
    console.log(terminal.ok('build OK'));
    console.log(terminal.info('snapshot', snapshotFile));
    console.log(terminal.info('build info', buildInfoFile));
    console.log(terminal.info('source hash', snapshot.sourceHash));
  }
  return 0;
}

module.exports = runBuild;
