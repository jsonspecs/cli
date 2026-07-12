const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const runInit = require('../lib/commands/init');
const runValidate = require('../lib/commands/validate');
const runBuild = require('../lib/commands/build');
const runTest = require('../lib/commands/test');
const { compileSnapshot } = require('jsonspecs');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jsonspecs-cli-'));
}

test('init creates a scaffolded rules project', () => {
  const root = tmpdir();
  runInit('demo', root);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'rules', 'library', 'order_amount_required.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'samples', 'order.ok.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'operators', 'node', 'index.js')), true);
});

test('validate succeeds for scaffolded project', () => {
  const root = tmpdir();
  runInit('demo', root);
  const code = runValidate(path.join(root, 'demo'));
  assert.equal(code, 0);
});

test('build writes snapshot and build-info', () => {
  const root = tmpdir();
  runInit('demo', root);
  const code = runBuild(path.join(root, 'demo'));
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'dist', 'snapshot.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'dist', 'build-info.json')), true);
  const snapshot = require(path.join(root, 'demo', 'dist', 'snapshot.json'));
  assert.equal(compileSnapshot(snapshot).kind, 'prepared-jsonspecs');
});

test('test executes generated positive and negative samples', () => {
  const root = tmpdir(); runInit('demo', root);
  assert.equal(runTest(path.join(root, 'demo')), 0);
});

test('studio boots through introspection API on loopback', async (t) => {
  const root = tmpdir(); runInit('demo', root); const projectRoot = path.join(root, 'demo');
  const manifestFile = path.join(projectRoot, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(manifestFile)); manifest.studio.port = 0; fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const project = require('../lib/project').resolveProject(projectRoot);
  const runtime = require('../lib/studio-server').startStudio(project); t.after(() => { runtime.server.close(); for (const watcher of runtime.ctx.watchers) watcher.close(); });
  await new Promise((resolve) => runtime.server.listening ? resolve() : runtime.server.once('listening', resolve));
  const health = await fetch(`http://127.0.0.1:${runtime.server.address().port}/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(Object.hasOwn(runtime.ctx.compiled, 'registry'), false);
});

test('validate succeeds with project-local custom operators', () => {
  const root = tmpdir();
  runInit('demo', root);
  const projectRoot = path.join(root, 'demo');
  fs.writeFileSync(path.join(projectRoot, 'operators', 'node', 'index.js'), `module.exports = {
  check: {
    amount_gt_zero(rule, ctx) {
      const value = ctx.get(rule.field);
      if (!value.ok) return { status: 'FAIL', actual: undefined };
      const n = Number(value.value);
      return { status: Number.isFinite(n) && n > 0 ? 'OK' : 'FAIL', actual: value.value };
    }
  },
  predicate: {},
  meta: {
    operators: {
      amount_gt_zero: { description: 'должно быть больше нуля' }
    }
  }
};\n`, 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'rules', 'library', 'order_amount_positive.json'), JSON.stringify({
    id: 'library.order.amount_positive',
    type: 'rule',
    description: 'Сумма заказа должна быть больше нуля',
    role: 'check',
    operator: 'amount_gt_zero',
    level: 'ERROR',
    code: 'ORDER.AMOUNT.POSITIVE',
    message: 'Сумма заказа должна быть больше нуля',
    field: 'order.amount'
  }, null, 2));
  fs.writeFileSync(path.join(projectRoot, 'rules', 'entrypoints', 'order_validation.json'), JSON.stringify({
    id: 'entrypoints.order.validation',
    type: 'pipeline',
    description: 'Пример проверки заказа',
    strict: false,
    flow: [
      { rule: 'library.order.amount_required' },
      { rule: 'library.order.amount_positive' }
    ],
    entrypoint: true,
    required_context: []
  }, null, 2));

  const code = runValidate(projectRoot);
  assert.equal(code, 0);
  const { engine } = require('../lib/engine').createCliEngine(require('../lib/project').resolveProject(projectRoot));
  const loaded = require('../lib/loader-fs').loadArtifactsFromDir(path.join(projectRoot, 'rules'));
  const prepared = engine.compile(loaded.artifacts, { sources: loaded.sources });
  assert.equal(engine.runPipeline(prepared, { pipelineId: 'entrypoints.order.validation', payload: { order: { amount: -1 } } }).status, 'ERROR');
});
