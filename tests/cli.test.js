const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { spawnSync } = require('node:child_process');

const runInit = require('../lib/commands/init');
const runValidate = require('../lib/commands/validate');
const runBuild = require('../lib/commands/build');
const runTest = require('../lib/commands/test');
const { compileSnapshot } = require('jsonspecs');
const { enrichArtifactForUi } = require('../lib/studio-helpers');
const { stripAnsi } = require('../lib/terminal');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jsonspecs-cli-'));
}

function captureConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const stdout = [];
  const stderr = [];
  let value;
  try {
    console.log = (...args) => stdout.push(args.join(' '));
    console.error = (...args) => stderr.push(args.join(' '));
    value = fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { value, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

test('init creates a scaffolded rules project', () => {
  const root = tmpdir();
  runInit('demo', root);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'manifest.json')), true);
  assert.equal(require(path.join(root, 'demo', 'manifest.json')).project.version, '0.1.0');
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

test('manifest requires an explicit semantic ruleset version', () => {
  const root = tmpdir();
  runInit('demo', root);
  const projectRoot = path.join(root, 'demo');
  const manifestFile = path.join(projectRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.project.version = '01.0.0';
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.throws(() => require('../lib/project').resolveProject(projectRoot), /project\.version must be an explicit semantic version/);
});

test('build writes snapshot and build-info', () => {
  const root = tmpdir();
  runInit('demo', root);
  const code = runBuild(path.join(root, 'demo'));
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'dist', 'snapshot.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'demo', 'dist', 'build-info.json')), true);
  const snapshot = require(path.join(root, 'demo', 'dist', 'snapshot.json'));
  const buildInfo = require(path.join(root, 'demo', 'dist', 'build-info.json'));
  assert.equal(compileSnapshot(snapshot).kind, 'prepared-jsonspecs');
  assert.equal(buildInfo.sourceHash, snapshot.sourceHash);
  assert.equal(buildInfo.snapshotFormat, snapshot.format);
  assert.equal(buildInfo.snapshotFormatVersion, snapshot.formatVersion);
  assert.equal(snapshot.meta.rulesetVersion, '0.1.0');
  assert.equal(buildInfo.rulesetVersion, snapshot.meta.rulesetVersion);
  const result = require('jsonspecs').createEngine({ operators: require('jsonspecs').Operators })
    .runPipeline(compileSnapshot(snapshot), { payload: { order: { amount: 1500 } } });
  assert.equal(result.ruleset.rulesetVersion, '0.1.0');
});

test('test executes generated positive and negative samples', () => {
  const root = tmpdir(); runInit('demo', root);
  assert.equal(runTest(path.join(root, 'demo')), 0);
});

test('human CLI output supports ANSI color while JSON and quiet modes stay clean', () => {
  const root = tmpdir();
  runInit('demo', root);
  const projectRoot = path.join(root, 'demo');

  const testOutput = captureConsole(() => runTest(projectRoot, { color: 'always' }));
  assert.equal(testOutput.value, 0);
  assert.match(testOutput.stdout, /\u001b\[[0-9;]*m/);
  assert.match(stripAnsi(testOutput.stdout), /PASS order\.ok\.json/);
  assert.match(stripAnsi(testOutput.stdout), /test OK \(2\/2\)/);

  const jsonOutput = captureConsole(() => runValidate(projectRoot, { json: true, color: 'always' }));
  assert.doesNotMatch(jsonOutput.stdout, /\u001b\[[0-9;]*m/);
  assert.deepEqual(JSON.parse(jsonOutput.stdout), { ok: true, artifactCount: 2 });

  const quietOutput = captureConsole(() => runTest(projectRoot, { quiet: true, color: 'always' }));
  assert.equal(quietOutput.stdout, '');
  assert.equal(quietOutput.stderr, '');
});

test('validation diagnostics are structured and colorized in human mode', () => {
  const root = tmpdir();
  runInit('demo', root);
  const projectRoot = path.join(root, 'demo');
  const ruleFile = path.join(projectRoot, 'rules', 'library', 'order_amount_required.json');
  const rule = JSON.parse(fs.readFileSync(ruleFile, 'utf8'));
  delete rule.operator;
  fs.writeFileSync(ruleFile, JSON.stringify(rule, null, 2));

  const output = captureConsole(() => runValidate(projectRoot, { color: 'always' }));
  assert.equal(output.value, 1);
  assert.match(output.stderr, /\u001b\[[0-9;]*m/);
  const plain = stripAnsi(output.stderr);
  assert.match(plain, /validation failed/);
  assert.match(plain, /\[SCHEMA_VALIDATION_ERROR\]/);
  assert.match(plain, /artifact: library\.order\.amount_required/);
  assert.match(plain, /path: operator/);
  assert.match(plain, /message:/);
});

test('bin help accepts --color and emits color only when requested', () => {
  const bin = path.join(__dirname, '..', 'bin', 'jsonspecs.js');
  const colored = spawnSync(process.execPath, [bin, '--help', '--color=always'], { encoding: 'utf8' });
  assert.equal(colored.status, 0);
  assert.match(colored.stdout, /\u001b\[[0-9;]*m/);
  assert.match(stripAnsi(colored.stdout), /--color auto\|always\|never/);

  const plain = spawnSync(process.execPath, [bin, '--help', '--color=never'], { encoding: 'utf8' });
  assert.equal(plain.status, 0);
  assert.doesNotMatch(plain.stdout, /\u001b\[[0-9;]*m/);
});

test('studio boots through introspection API on loopback', async (t) => {
  const root = tmpdir(); runInit('demo', root); const projectRoot = path.join(root, 'demo');
  const manifestFile = path.join(projectRoot, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(manifestFile)); manifest.studio.port = 0; fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const sendFileCalls = [];
  const originalSendFile = express.response.sendFile;
  express.response.sendFile = function sendFile(file, options) {
    sendFileCalls.push({ file, options });
    return this.type('html').send('<!doctype html><title>jsonspecs studio</title>');
  };
  t.after(() => { express.response.sendFile = originalSendFile; });
  const project = require('../lib/project').resolveProject(projectRoot);
  const runtime = require('../lib/studio-server').startStudio(project); t.after(() => { runtime.server.close(); for (const watcher of runtime.ctx.watchers) watcher.close(); });
  await new Promise((resolve) => runtime.server.listening ? resolve() : runtime.server.once('listening', resolve));
  const health = await fetch(`http://127.0.0.1:${runtime.server.address().port}/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(Object.hasOwn(runtime.ctx.compiled, 'registry'), false);
  const deepLink = await fetch(`http://127.0.0.1:${runtime.server.address().port}/rules/library.order.amount_required`);
  assert.equal(deepLink.status, 200);
  assert.equal(sendFileCalls.length, 1);
  assert.equal(sendFileCalls[0].file, 'index.html');
  assert.equal(sendFileCalls[0].options.root, path.join(__dirname, '..', 'static'));
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

test('Studio exposes comparison-field metadata and condition steps', () => {
  const artifacts = new Map([
    ['library.compare', { id: 'library.compare', type: 'rule', field: 'order.amount', value_field: '$context.minimum' }],
    ['library.present', { id: 'library.present', type: 'rule', description: 'Сумма заполнена' }],
    ['library.condition', { id: 'library.condition', type: 'condition' }],
  ]);
  const view = {
    getArtifact(id) { return artifacts.get(id) || null; },
    getConditionModel(id) {
      return id === 'library.condition'
        ? { when: { mode: 'single', predId: 'library.present' }, steps: [{ kind: 'rule', ruleId: 'library.compare' }] }
        : null;
    },
    getPipelineSteps() { return null; },
  };
  const manifest = {
    fields: { '$context.minimum': { title: 'Минимальная сумма' } },
    artifacts: { 'library.compare': { title: 'Сравнение сумм' } },
    operators: {},
    entrypoints: {},
  };

  const rule = enrichArtifactForUi('library.compare', view, manifest);
  assert.equal(rule.display.valueField.title, 'Минимальная сумма');
  const condition = enrichArtifactForUi('library.condition', view, manifest);
  assert.match(condition.compiled.whenHtml, /Сумма заполнена/);
  assert.match(condition.compiled.whenHtml, /library\.present/);
  assert.equal(condition.compiled.steps.length, 1);
  assert.equal(condition.compiled.steps[0].id, 'library.compare');
  assert.equal(condition.compiled.steps[0].title, 'Сравнение сумм');
});
