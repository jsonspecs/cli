"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");

const runInit = require("../lib/commands/init");
const runValidate = require("../lib/commands/validate");
const runBuild = require("../lib/commands/build");
const runTest = require("../lib/commands/test");
const { buildProject, warningDiagnostics } = require("../lib/project-build");
const { resolveProject } = require("../lib/project");
const { enrichArtifactForUi } = require("../lib/studio-helpers");
const { stripAnsi } = require("../lib/terminal");
const rules = require("@jsonspecs/rules");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jsonspecs-cli-"));
}

function scaffold(name = "demo") {
  const root = tmpdir();
  runInit(name, root, { quiet: true });
  return path.join(root, name);
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function captureConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const stdout = [];
  const stderr = [];
  let value;
  try {
    console.log = (...args) => stdout.push(args.join(" "));
    console.error = (...args) => stderr.push(args.join(" "));
    value = fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { value, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

test("init creates an RC.7 authoring project", () => {
  const projectRoot = scaffold();
  const manifest = read(path.join(projectRoot, "manifest.json"));
  const rule = read(path.join(projectRoot, "rules/library/order_amount_required.json"));
  const pipeline = read(path.join(projectRoot, "rules/entrypoints/order_validation.json"));
  const sample = read(path.join(projectRoot, "samples/order.ok.json"));
  const generatedReadme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");

  assert.equal(manifest.specVersion, "1.0.0-rc.7");
  assert.deepEqual(manifest.exports, ["entrypoints.order.validation"]);
  assert.equal(rule.role, undefined);
  assert.equal(rule.issue.code, "ORDER.AMOUNT.REQUIRED");
  assert.deepEqual(pipeline.steps, ["library.order.amount_required"]);
  assert.equal(sample.pipelineId, "entrypoints.order.validation");
  assert.equal(fs.existsSync(path.join(projectRoot, "operators/node/index.js")), true);
  assert.match(generatedReadme, /`jsonspecs test`/);
});

test("validate and build use the same fv2 snapshot", () => {
  const projectRoot = scaffold();
  assert.equal(runValidate(projectRoot, { quiet: true }), 0);
  assert.equal(runBuild(projectRoot, { quiet: true }), 0);

  const snapshot = read(path.join(projectRoot, "dist/snapshot.json"));
  const buildInfo = read(path.join(projectRoot, "dist/build-info.json"));
  assert.equal(snapshot.formatVersion, 2);
  assert.equal(snapshot.specVersion, "1.0.0-rc.7");
  assert.equal(Array.isArray(snapshot.artifacts), false);
  assert.equal(snapshot.artifacts["library.order.amount_required"].id, undefined);
  assert.equal(rules.computeSourceHash(snapshot), snapshot.sourceHash);
  assert.equal(rules.compileSnapshot(snapshot).kind, "prepared-jsonspecs");
  assert.equal(buildInfo.sourceHash, snapshot.sourceHash);
  assert.equal(buildInfo.project.version, "0.1.0");
  assert.deepEqual(buildInfo.exports, snapshot.exports);
  assert.equal(buildInfo.operatorPacks.length, 1);
  assert.deepEqual(buildInfo.operatorPacks[0], {
    specifier: "./operators/node",
    id: "demo:./operators/node",
    version: "0.1.0",
    digest: buildInfo.operatorPacks[0].digest,
  });
  assert.match(buildInfo.operatorPacks[0].digest, /^sha256:[0-9a-f]{64}$/);
});

test("CLI 4 rejects snapshots from the previous specification release", () => {
  const projectRoot = scaffold();
  const manifestFile = path.join(projectRoot, "manifest.json");
  const manifest = read(manifestFile);
  manifest.specVersion = "1.0.0-rc.6";
  write(manifestFile, manifest);

  const output = captureConsole(() => runValidate(projectRoot, { json: true, color: "never" }));
  assert.equal(output.value, 1);
  const diagnostics = JSON.parse(output.stdout);
  assert.equal(diagnostics[0]?.code, "UNSUPPORTED_SPEC_VERSION");
});

test("CLI 4 preserves RC.7 structural and exact wildcard issue paths", () => {
  const projectRoot = scaffold();
  const ruleFile = path.join(projectRoot, "rules/library/order_amount_required.json");
  const rule = read(ruleFile);
  rule.field = "order.items[*].sku";
  rule.aggregate = { mode: "ALL", onEmpty: "SKIP", issueMode: "EACH" };
  write(ruleFile, rule);

  const bundle = buildProject(resolveProject(projectRoot));
  assert.equal(bundle.validation.ok, true);
  const result = bundle.engine.runPipeline(bundle.prepared, {
    pipelineId: "entrypoints.order.validation",
    payload: { order: { items: [{ sku: "A" }, {}] } },
  });
  assert.equal(result.status, "ERROR");
  assert.equal(result.issues[0]?.field, "order.items[1].sku");

  rule.field = "order.items[*][9007199254740993].sku";
  write(ruleFile, rule);
  const exactBundle = buildProject(resolveProject(projectRoot));
  const exactResult = exactBundle.engine.runPipeline(exactBundle.prepared, {
    pipelineId: "entrypoints.order.validation",
    payload: { order: { items: [[]] } },
  });
  assert.equal(exactResult.status, "ERROR");
  assert.equal(exactResult.issues[0]?.field, "order.items[0][9007199254740993].sku");
});

test("authoring metadata does not change sourceHash", () => {
  const projectRoot = scaffold();
  assert.equal(runBuild(projectRoot, { quiet: true }), 0);
  const first = read(path.join(projectRoot, "dist/snapshot.json")).sourceHash;
  const manifestFile = path.join(projectRoot, "manifest.json");
  const manifest = read(manifestFile);
  manifest.catalog.artifacts["library.order.amount_required"].description = "Новое редакторское описание";
  write(manifestFile, manifest);
  assert.equal(runBuild(projectRoot, { quiet: true }), 0);
  assert.equal(read(path.join(projectRoot, "dist/snapshot.json")).sourceHash, first);
});

test("manifest enforces explicit sorted exports", () => {
  const projectRoot = scaffold();
  const manifestFile = path.join(projectRoot, "manifest.json");
  const manifest = read(manifestFile);
  manifest.exports = ["z.pipeline", "a.pipeline"];
  write(manifestFile, manifest);
  assert.throws(() => resolveProject(projectRoot), /exports must be sorted/);
});

test("authoring files reject duplicate JSON members before build", () => {
  const manifestProject = scaffold();
  const manifestFile = path.join(manifestProject, "manifest.json");
  const manifestText = fs.readFileSync(manifestFile, "utf8");
  fs.writeFileSync(manifestFile, manifestText.replace(
    '"specVersion": "1.0.0-rc.7",',
    '"specVersion": "1.0.0-rc.7",\n  "specVersion": "1.0.0-rc.6",',
  ));
  assert.throws(() => resolveProject(manifestProject), /Invalid JSON in manifest\.json: Duplicate object member "specVersion"/);

  const artifactProject = scaffold();
  const ruleFile = path.join(artifactProject, "rules/library/order_amount_required.json");
  const ruleText = fs.readFileSync(ruleFile, "utf8");
  fs.writeFileSync(ruleFile, ruleText.replace(
    '"operator": "not_empty",',
    '"operator": "not_empty",\n  "operator": "equals",',
  ));
  assert.throws(
    () => buildProject(resolveProject(artifactProject)),
    /Invalid JSON in library\/order_amount_required\.json: Duplicate object member "operator"/,
  );
});

test("unused authoring artifacts fail full-closure validation", () => {
  const projectRoot = scaffold();
  write(path.join(projectRoot, "rules/library/unused.json"), {
    id: "library.unused",
    type: "rule",
    operator: "not_empty",
    field: "unused",
    issue: { level: "ERROR", code: "UNUSED", message: "Unused" },
  });
  const output = captureConsole(() => runValidate(projectRoot, { color: "never" }));
  assert.equal(output.value, 1);
  assert.match(output.stderr, /UNREACHABLE_ARTIFACT/);
  assert.match(output.stderr, /library\.unused/);
});

test("validation diagnostics retain the source file", () => {
  const projectRoot = scaffold();
  const ruleFile = path.join(projectRoot, "rules/library/order_amount_required.json");
  const rule = read(ruleFile);
  delete rule.operator;
  write(ruleFile, rule);

  const output = captureConsole(() => runValidate(projectRoot, { color: "never" }));
  assert.equal(output.value, 1);
  assert.match(output.stderr, /\[INVALID_RULE\]/);
  assert.match(output.stderr, /library\/order_amount_required\.json/);
  assert.match(output.stderr, /library\.order\.amount_required/);
});

test("sample runner uses the v4 top-level pipelineId", () => {
  const projectRoot = scaffold();
  assert.equal(runTest(projectRoot, { quiet: true }), 0);

  const sampleFile = path.join(projectRoot, "samples/order.ok.json");
  const sample = read(sampleFile);
  delete sample.pipelineId;
  sample.context = { pipelineId: "entrypoints.order.validation" };
  write(sampleFile, sample);
  const result = captureConsole(() => runTest(projectRoot, { color: "never" }));
  assert.equal(result.value, 1);
  assert.match(result.stdout, /FAIL order\.ok\.json/);
});

test("sample runner rejects missing expectations and uncovered exports", () => {
  const projectRoot = scaffold();
  const okFile = path.join(projectRoot, "samples/order.ok.json");
  const errorFile = path.join(projectRoot, "samples/order.error.json");
  const okSample = read(okFile);
  delete okSample.expect;
  write(okFile, okSample);
  fs.unlinkSync(errorFile);

  const invalidExpectation = captureConsole(() => runTest(projectRoot, { json: true, color: "never" }));
  assert.equal(invalidExpectation.value, 1);
  assert.match(invalidExpectation.stdout, /expect must be an object/);

  fs.unlinkSync(okFile);
  const uncovered = captureConsole(() => runTest(projectRoot, { json: true, color: "never" }));
  assert.equal(uncovered.value, 1);
  assert.match(uncovered.stdout, /missing sample for exported pipeline entrypoints\.order\.validation/);
});

test("sample runner rejects non-I-JSON before creating an evaluation tuple", () => {
  const projectRoot = scaffold();
  const sampleFile = path.join(projectRoot, "samples/order.ok.json");
  const sampleText = fs.readFileSync(sampleFile, "utf8");
  fs.writeFileSync(sampleFile, sampleText.replace(
    '"payload": {',
    '"payload": {},\n  "payload": {',
  ));
  const result = captureConsole(() => runTest(projectRoot, { color: "never" }));
  assert.equal(result.value, 1);
  assert.match(result.stdout, /Duplicate object member "payload"/);
});

test("sample runner discovers nested samples", () => {
  const projectRoot = scaffold();
  const source = path.join(projectRoot, "samples/order.ok.json");
  const nested = path.join(projectRoot, "samples/order/ok.json");
  write(nested, read(source));
  fs.unlinkSync(source);

  const output = captureConsole(() => runTest(projectRoot, { json: true, color: "never" }));
  const result = JSON.parse(output.stdout);
  assert.equal(output.value, 0);
  assert.equal(result.results.some((item) => item.file === "order/ok.json"), true);
});

test("sample issue matching is one-to-one", () => {
  const failures = runTest.matchExpectedIssues(
    [{ code: "DUPLICATE" }, { code: "DUPLICATE" }],
    [{ code: "DUPLICATE", level: "ERROR" }, { code: "OTHER", level: "ERROR" }],
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /DUPLICATE/);

  const reorderedDetails = runTest.matchExpectedIssues(
    [{ code: "NESTED", details: { path: "order.items[0]", counts: { failed: 1, total: 2 } } }],
    [{ details: { counts: { total: 2, failed: 1 }, path: "order.items[0]" }, code: "NESTED", level: "ERROR" }],
  );
  assert.deepEqual(reorderedDetails, []);
});

test("npm operator packs resolve relative to the rules project", () => {
  const projectRoot = scaffold();
  const packRoot = path.join(projectRoot, "node_modules/@demo/operators");
  write(path.join(packRoot, "package.json"), { name: "@demo/operators", version: "1.0.0", main: "index.js" });
  fs.writeFileSync(path.join(packRoot, "index.js"), `module.exports = {
  amount_gt_zero: {
    schema: {
      type: "object",
      properties: { field: { type: "string", minLength: 1 } },
      required: ["field"],
      additionalProperties: false
    },
    evaluate({ field }) {
      return typeof field === "number" && field > 0 ? "PASS" : "FAIL";
    }
  }
};\n`);

  const manifestFile = path.join(projectRoot, "manifest.json");
  const manifest = read(manifestFile);
  manifest.operatorPacks.node = ["@demo/operators"];
  write(manifestFile, manifest);
  write(path.join(projectRoot, "rules/library/order_amount_positive.json"), {
    id: "library.order.amount_positive",
    type: "rule",
    operator: "amount_gt_zero",
    field: "order.amount",
    issue: { level: "ERROR", code: "ORDER.AMOUNT.POSITIVE", message: "Сумма должна быть положительной" },
  });
  write(path.join(projectRoot, "rules/entrypoints/order_validation.json"), {
    id: "entrypoints.order.validation",
    type: "pipeline",
    steps: ["library.order.amount_required", "library.order.amount_positive"],
  });

  const project = resolveProject(projectRoot);
  const bundle = buildProject(project);
  assert.equal(bundle.validation.ok, true);
  assert.equal(bundle.operatorSources.amount_gt_zero, "@demo/operators");
  const result = bundle.engine.runPipeline(bundle.prepared, {
    pipelineId: "entrypoints.order.validation",
    payload: { order: { amount: -1 } },
  });
  assert.equal(result.status, "ERROR");
  assert.equal(result.issues[0].code, "ORDER.AMOUNT.POSITIVE");
});

test("local operator pack digest changes with deployed files", () => {
  const projectRoot = scaffold();
  const first = buildProject(resolveProject(projectRoot));
  const operatorFile = path.join(projectRoot, "operators/node/index.js");
  fs.appendFileSync(operatorFile, "\n// deployed change\n");
  const second = buildProject(resolveProject(projectRoot));

  assert.equal(first.snapshot.sourceHash, second.snapshot.sourceHash);
  assert.notEqual(first.operatorPacks[0].digest, second.operatorPacks[0].digest);
});

test("warning gate remains deterministic when the compiler is clean", () => {
  const projectRoot = scaffold();
  const output = captureConsole(() => runValidate(projectRoot, { json: true, failOnWarning: true }));
  assert.equal(output.value, 0);
  assert.deepEqual(JSON.parse(output.stdout), {
    ok: true,
    artifactCount: 2,
    warningCount: 0,
    diagnosticCount: 0,
    diagnostics: [],
  });
  assert.deepEqual(warningDiagnostics([{ level: "warning" }, { level: "error" }]), [{ level: "warning" }]);
});

test("human output supports ANSI while JSON and quiet stay clean", () => {
  const projectRoot = scaffold();
  const human = captureConsole(() => runTest(projectRoot, { color: "always" }));
  assert.match(human.stdout, /\u001b\[[0-9;]*m/);
  assert.match(stripAnsi(human.stdout), /test OK \(2\/2\)/);
  const quiet = captureConsole(() => runTest(projectRoot, { quiet: true, color: "always" }));
  assert.equal(quiet.stdout, "");
  assert.equal(quiet.stderr, "");
});

test("bin help reports the v4 CLI", () => {
  const bin = path.join(__dirname, "..", "bin/jsonspecs.js");
  const result = spawnSync(process.execPath, [bin, "--help", "--color=never"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /jsonspecs-cli v4\.0\.1/);
  assert.match(result.stdout, /jsonspecs sandbox/);
  assert.doesNotMatch(result.stdout, /jsonspecs studio/);
  assert.doesNotMatch(result.stdout, /\u001b\[[0-9;]*m/);
});

test("bundled Sandbox creates native v4 playground input", () => {
  const source = fs.readFileSync(path.join(__dirname, "../static/assets/index-GkLfNN2H.js"), "utf8");
  assert.match(source, /JSON\.stringify\(\{pipelineId:e,context:\{currentDate:u\},payload:\{\}\}/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{context:\{pipelineId:e,currentDate:u\},payload:\{\}\}/);
  assert.doesNotMatch(source, /\.context\?\.pipelineId/);
  assert.doesNotMatch(source, /delete [A-Za-z_$][\w$]*\.context\.pipelineId/);
  assert.match(source, /pipelineId обязателен на верхнем уровне/);
  assert.match(source, /children:u\.title\|\|u\.description\|\|u\.id/);
});

test("bundled Sandbox prefixes context field titles with ($)", () => {
  const source = fs.readFileSync(path.join(__dirname, "../static/assets/index-GkLfNN2H.js"), "utf8");
  assert.doesNotMatch(source, /параметр из контекста/);
  assert.match(source, /String\(i\)\.startsWith\("\$context\."\)\?S\.jsx\("span",\{className:"human-context-badge",children:"\(\$\)"\}\):null,S\.jsx\("span",\{className:"human-field",children:i\}\)/);
  assert.match(source, /e\.isContextField\?S\.jsx\("span",\{className:"human-context-badge",children:"\(\$\)"\}\):null,S\.jsx\("span",\{className:"human-field",children:e\.fieldLabel\}\)/);
});

test("Sandbox boots and executes a v4 tuple", async (t) => {
  const projectRoot = scaffold();
  const manifestFile = path.join(projectRoot, "manifest.json");
  const manifest = read(manifestFile);
  manifest.sandbox.port = 0;
  write(manifestFile, manifest);

  const sendFileCalls = [];
  const originalSendFile = express.response.sendFile;
  express.response.sendFile = function sendFile(file, options) {
    sendFileCalls.push({ file, options });
    return this.type("html").send("<!doctype html><title>jsonspecs sandbox</title>");
  };
  t.after(() => { express.response.sendFile = originalSendFile; });

  const runtime = require("../lib/studio-server").startSandbox(resolveProject(projectRoot), { color: "never" });
  t.after(() => {
    runtime.server.close();
    for (const watcher of runtime.ctx.watchers) watcher.close();
  });
  await new Promise((resolve) => runtime.server.listening ? resolve() : runtime.server.once("listening", resolve));
  const base = `http://127.0.0.1:${runtime.server.address().port}`;

  const health = await fetch(`${base}/health`).then((response) => response.json());
  assert.equal(health.mode, "sandbox");
  const entrypoints = await fetch(`${base}/api/entrypoints`).then((response) => response.json());
  assert.deepEqual(entrypoints.items.map((item) => item.id), ["entrypoints.order.validation"]);
  const pipeline = await fetch(`${base}/api/pipelines/entrypoints.order.validation`).then((response) => response.json());
  assert.equal(pipeline.pipeline.description, "Проверка заказа");
  const response = await fetch(`${base}/api/playground/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pipelineId: "entrypoints.order.validation", payload: { order: { amount: "" } } }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, "ERROR");
  assert.equal(result.issues[0].code, "ORDER.AMOUNT.REQUIRED");

  const legacyResponse = await fetch(`${base}/api/playground/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context: { pipelineId: "entrypoints.order.validation" }, payload: { order: { amount: 1 } } }),
  });
  const legacyResult = await legacyResponse.json();
  assert.equal(legacyResponse.status, 400);
  assert.equal(legacyResult.message, "pipelineId is required (string)");

  const contextFieldResponse = await fetch(`${base}/api/playground/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pipelineId: "entrypoints.order.validation",
      context: { pipelineId: "business-context-value" },
      payload: { order: { amount: 1 } },
    }),
  });
  const contextFieldResult = await contextFieldResponse.json();
  assert.equal(contextFieldResponse.status, 200);
  assert.equal(contextFieldResult.context.pipelineId, "business-context-value");

  const duplicateResponse = await fetch(`${base}/api/playground/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"pipelineId":"entrypoints.order.validation","payload":{},"payload":{}}',
  });
  assert.equal(duplicateResponse.status, 400);
  assert.match((await duplicateResponse.json()).message, /Duplicate object member "payload"/);

  const surrogateResponse = await fetch(`${base}/api/playground/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"pipelineId":"entrypoints.order.validation","payload":{"value":"\\ud800"}}',
  });
  assert.equal(surrogateResponse.status, 400);
  assert.match((await surrogateResponse.json()).message, /unpaired high surrogate/);

  const rule = await fetch(`${base}/api/rules/library.order.amount_required`).then((response) => response.json());
  assert.equal(rule.artifact.issue.code, "ORDER.AMOUNT.REQUIRED");
  assert.equal(rule.artifact.code, "ORDER.AMOUNT.REQUIRED");

  const deepLink = await fetch(`${base}/rules/library.order.amount_required`);
  assert.equal(deepLink.status, 200);
  assert.equal(sendFileCalls.length, 1);
});

test("Sandbox reloads helper modules from a local operator pack", async (t) => {
  const projectRoot = scaffold();
  const ruleFile = path.join(projectRoot, "rules/library/order_amount_required.json");
  const pipelineFile = path.join(projectRoot, "rules/entrypoints/order_validation.json");
  const packFile = path.join(projectRoot, "operators/node/index.js");
  const helperFile = path.join(projectRoot, "operators/node/logic.js");
  write(ruleFile, {
    id: "library.demo.toggle",
    type: "rule",
    operator: "demo_toggle",
    issue: { level: "ERROR", code: "TOGGLE", message: "toggle failed" },
  });
  write(pipelineFile, {
    id: "entrypoints.order.validation",
    type: "pipeline",
    steps: ["library.demo.toggle"],
  });
  fs.writeFileSync(packFile, `const logic = require("./logic");
module.exports = {
  demo_toggle: {
    schema: { type: "object", properties: {}, additionalProperties: false },
    evaluate: () => logic(),
  },
};
`);
  fs.writeFileSync(helperFile, `module.exports = () => "FAIL";\n`);
  const project = resolveProject(projectRoot);
  project.manifest.sandbox.port = 0;
  const runtime = require("../lib/studio-server").startSandbox(project, { color: "never" });
  t.after(() => {
    for (const watcher of runtime.ctx.watchers) watcher.close();
    runtime.server.close();
  });
  const execute = () => runtime.ctx.engine.runPipeline(runtime.ctx.compiled, {
    pipelineId: "entrypoints.order.validation",
    payload: {},
  }).status;

  assert.equal(execute(), "ERROR");
  const reloaded = once(runtime.ctx, "reload");
  fs.writeFileSync(helperFile, `module.exports = () => "PASS";\n`);
  await Promise.race([
    reloaded,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Sandbox reload timeout")), 3000)),
  ]);
  assert.equal(execute(), "OK");
});

test("Sandbox renders native RC.7 when and condition steps", () => {
  const artifacts = new Map([
    ["library.compare", { id: "library.compare", type: "rule", field: "order.amount", value_field: "$context.minimum" }],
    ["library.present", { id: "library.present", type: "rule" }],
    ["library.condition", { id: "library.condition", type: "condition" }],
  ]);
  const view = {
    getArtifact(id) { return artifacts.get(id) || null; },
    getConditionModel(id) {
      return id === "library.condition"
        ? { when: "library.present", steps: [{ kind: "rule", ruleId: "library.compare" }] }
        : null;
    },
    getPipelineSteps() { return null; },
  };
  const manifest = {
    fields: { "$context.minimum": { title: "Минимальная сумма" } },
    artifacts: {
      "library.compare": { title: "Сравнение сумм" },
      "library.present": { title: "Сумма заполнена" },
    },
    operators: {},
    entrypoints: {},
  };

  const rule = enrichArtifactForUi("library.compare", view, manifest);
  assert.equal(rule.display.valueField.title, "Минимальная сумма");
  const condition = enrichArtifactForUi("library.condition", view, manifest);
  assert.match(condition.compiled.whenHtml, /Сумма заполнена/);
  assert.equal(condition.compiled.steps[0].id, "library.compare");
});
