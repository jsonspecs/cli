const express = require('express');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { CompilationError } = require('./engine');
const { resolveProject, toStudioManifest } = require('./project');
const { buildProject } = require('./project-build');
const { createStudioView } = require('./studio-view');
const { parseIJsonBuffer } = require('./i-json');
const { clearOperatorPackCache, resolveOperatorPackRoot } = require('./operators');
const { listEntrypoints, analyzePipeline, buildTree, buildFlowModel, enrichArtifactForUi, loadSamples, analysisSummary } = require('./studio-helpers');
const { createTerminal } = require('./terminal');

function startSandbox(project, options = {}) {
  const terminal = createTerminal(options);
  const ctx = Object.assign(new EventEmitter(), {
    compiled: null,
    view: null,
    engine: null,
    rulesDir: project.rulesDir,
    samplesDir: project.samplesDir,
    manifest: toStudioManifest(project.manifest),
    operatorMeta: null,
    terminal,
    project
  });
  compileIntoCtx(project, ctx, true);
  ctx.watchers = startHotReload(project, ctx);

  const app = express();
  app.use(express.raw({ type: 'application/json', limit: '2mb' }));
  app.use((req, res, next) => {
    if (!Buffer.isBuffer(req.body)) return next();
    try {
      req.body = parseIJsonBuffer(req.body);
      return next();
    } catch (error) {
      return res.status(400).json({ message: `Invalid I-JSON request body: ${error.message}` });
    }
  });
  app.get('/health', (_req, res) => {
    if (!ctx.compiled || !ctx.view) return res.status(503).json({ ok: false, reason: 'not ready' });
    res.json({ ok: true, mode: 'sandbox', projectId: project.manifest.project.id, projectTitle: project.manifest.project.title });
  });

  app.get('/api/project', (_req, res) => {
    res.json({
      projectId: project.manifest.project.id,
      projectTitle: project.manifest.project.title,
      projectDescription: project.manifest.project.description,
      runtime: 'node',
      manifest: ctx.manifest
    });
  });

  app.get('/api/entrypoints', (_req, res) => {
    res.json({ items: listEntrypoints(ctx.view, ctx.manifest) });
  });

  app.get('/api/analysis', (_req, res) => {
    res.json({ summary: analysisSummary(ctx.view, project, ctx.operatorMeta) });
  });

  app.get('/api/pipelines/:id', (req, res) => {
    const id = req.params.id;
    const pipeline = ctx.view.getArtifact(id);
    if (!pipeline || pipeline.type !== 'pipeline') return res.status(404).json({ message: `Pipeline not found: ${id}` });
    const compiledPipeline = { steps: ctx.view.getPipelineSteps(id) };
    const display = ctx.manifest.entrypoints?.[id] || ctx.manifest.artifacts?.[id] || {};
    const stats = analyzePipeline(id, ctx.view);
    const presentationPipeline = {
      ...pipeline,
      title: display.title || display.description || id,
      description: display.title || display.description || id,
    };
    res.json({ pipeline: presentationPipeline, compiled: compiledPipeline, display, stats });
  });

  app.get('/api/pipelines/:id/tree', (req, res) => {
    const id = req.params.id;
    const pipeline = ctx.view.getArtifact(id);
    if (!pipeline || pipeline.type !== 'pipeline') return res.status(404).json({ message: `Pipeline not found: ${id}` });
    res.json({ pipelineId: id, nodes: buildTree(id, ctx.view, ctx.manifest) });
  });



  app.get('/api/pipelines/:id/flow', (req, res) => {
    const id = req.params.id;
    const pipeline = ctx.view.getArtifact(id);
    if (!pipeline || pipeline.type !== 'pipeline') return res.status(404).json({ message: `Pipeline not found: ${id}` });
    res.json({ pipelineId: id, steps: buildFlowModel(id, ctx.view, ctx.manifest, new Set([id])) });
  });

  app.get('/api/rules/:id', (req, res) => {
    const id = req.params.id;
    const artifact = ctx.view.getArtifact(id);
    if (!artifact || artifact.type !== 'rule') return res.status(404).json({ message: `Rule not found: ${id}` });
    res.json(enrichArtifactForUi(id, ctx.view, ctx.manifest));
  });

  app.get('/api/conditions/:id', (req, res) => {
    const id = req.params.id;
    const artifact = ctx.view.getArtifact(id);
    if (!artifact || artifact.type !== 'condition') return res.status(404).json({ message: `Condition not found: ${id}` });
    res.json(enrichArtifactForUi(id, ctx.view, ctx.manifest));
  });

  app.get('/api/dictionaries/:id', (req, res) => {
    const id = req.params.id;
    const artifact = ctx.view.getArtifact(id);
    if (!artifact || artifact.type !== 'dictionary') return res.status(404).json({ message: `Dictionary not found: ${id}` });
    res.json(enrichArtifactForUi(id, ctx.view, ctx.manifest));
  });

  app.get('/api/artifacts/:id', (req, res) => {
    const id = req.params.id;
    const artifact = ctx.view.getArtifact(id);
    if (!artifact) return res.status(404).json({ message: `Artifact not found: ${id}` });
    res.json(enrichArtifactForUi(id, ctx.view, ctx.manifest));
  });

  app.get('/api/samples', (req, res) => {
    const pipelineId = req.query.pipelineId || null;
    res.json({ items: loadSamples(project.samplesDir, pipelineId) });
  });

  app.post('/api/playground/run', (req, res) => {
    const body = req.body ?? {};
    const pipelineId = body.pipelineId;
    if (!pipelineId || typeof pipelineId !== 'string') {
      return res.status(400).json({ message: 'pipelineId is required (string)' });
    }
    const payload = body.payload === undefined ? {} : body.payload;
    const context = body.context === undefined ? {} : body.context;
    try {
      const result = ctx.engine.runPipeline(ctx.compiled, { pipelineId, payload, context });
      return res.json(Object.assign({ pipelineId, context }, result));
    } catch (err) {
      return res.status(500).json({ message: err?.message || String(err), pipelineId });
    }
  });

  const staticDir = path.join(__dirname, '..', 'static');
  app.use(express.static(staticDir));
  app.get(/^\/(?!api\/|health$).*/, (_req, res) => {
    res.sendFile('index.html', { root: staticDir });
  });

  const port = Number(project.manifest.sandbox?.port ?? 3100);
  const host = project.manifest.sandbox?.host || '127.0.0.1';
  const server = app.listen(port, host, () => console.log(terminal.sandbox(`listening on http://${host}:${port}`, 'ok')));
  return { app, server, ctx };
}

function compileIntoCtx(project, ctx, verbose = false) {
  const bundle = buildProject(project);
  if (!bundle.validation.ok) throw new CompilationError(bundle.validation.diagnostics);
  ctx.compiled = bundle.prepared;
  ctx.view = createStudioView(bundle.engine, bundle.prepared);
  ctx.engine = bundle.engine;
  ctx.manifest = toStudioManifest(project.manifest, bundle.operatorMeta);
  ctx.operatorMeta = bundle.operatorMeta;
  if (verbose) console.log(ctx.terminal.sandbox(`compiled ${Object.keys(bundle.artifacts).length} artifacts from ${project.rulesDir}`, 'ok'));
}

function startHotReload(project, ctx) {
  const watchers = [];
  let debounceTimer = null;
  let lastFile = null;

  function reload(changedFile) {
    const rel = path.relative(project.root, changedFile);
    console.log(`\n${ctx.terminal.sandbox(`changed: ${rel}`, 'reload')}`);
    console.log(ctx.terminal.sandbox('recompiling...', 'info'));
    try {
      const nextProject = resolveProject(project.root);
      const operatorRoots = new Set([
        ...resolveLocalOperatorPackRoots(project),
        ...resolveLocalOperatorPackRoots(nextProject),
      ]);
      for (const root of operatorRoots) clearOperatorPackCache(root);
      compileIntoCtx(nextProject, ctx);
      Object.assign(project, nextProject);
      resetWatchers();
      ctx.emit('reload');
      console.log(ctx.terminal.sandbox('OK', 'ok'));
    } catch (err) {
      console.error(ctx.terminal.sandbox('COMPILATION ERROR - keeping previous version', 'error'));
      if (err instanceof CompilationError && Array.isArray(err.errors)) err.errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
      else console.error(`  ${err.message}`);
    }
  }

  function resetWatchers() {
    while (watchers.length > 0) watchers.pop().close();
    const watchRoots = [...new Set([
      project.rulesDir,
      project.manifestPath,
      ...resolveLocalOperatorPackRoots(project),
      project.samplesDir,
    ].map((item) => path.resolve(item)))];
    for (const watchRoot of watchRoots) {
      if (!fs.existsSync(watchRoot)) continue;
      const isDir = fs.statSync(watchRoot).isDirectory();
      watchers.push(fs.watch(watchRoot, { recursive: isDir }, (_event, filename) => {
        if (!filename && isDir) return;
        if (isDir && typeof filename === 'string' && filename.startsWith('.')) return;
        lastFile = isDir ? path.join(watchRoot, filename) : watchRoot;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => reload(lastFile), 150);
      }));
    }
  }

  resetWatchers();
  console.log(ctx.terminal.sandbox(`watching ${project.rulesDir}`, 'info'));
  return watchers;
}

function resolveLocalOperatorPackRoots(project) {
  const specs = Array.isArray(project.manifest.operatorPacks?.node) ? project.manifest.operatorPacks.node : [];
  return specs
    .filter((spec) => typeof spec === 'string' && (spec.startsWith('.') || spec.startsWith('/')))
    .map((spec) => resolveOperatorPackRoot(spec, project.root));
}
module.exports = { startSandbox };
