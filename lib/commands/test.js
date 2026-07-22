const { isDeepStrictEqual } = require('node:util');
const { resolveProject } = require('../project');
const { buildProject } = require('../project-build');
const { readJson } = require('../fs-utils');
const { listSampleFiles } = require('../sample-files');
const { createTerminal } = require('../terminal');

const RESULT_STATUSES = new Set(['OK', 'OK_WITH_WARNINGS', 'ERROR', 'EXCEPTION', 'ABORT']);

function subset(expected, actual) {
  return actual !== null
    && typeof actual === 'object'
    && Object.entries(expected).every(([key, value]) => (
      Object.prototype.hasOwnProperty.call(actual, key)
      && isDeepStrictEqual(actual[key], value)
    ));
}

function runTest(cwd = process.cwd(), options = {}) {
  const terminal = createTerminal(options);
  const project = resolveProject(cwd);
  const bundle = buildProject(project);
  if (!bundle.validation.ok) {
    if (options.json) console.log(JSON.stringify({ ok: false, diagnostics: bundle.validation.diagnostics }, null, 2));
    else if (!options.quiet) {
      console.error(terminal.diagnosticHeader('test compilation failed'));
      console.error(terminal.formatDiagnostics(bundle.validation.diagnostics));
    }
    return 1;
  }
  const files = listSampleFiles(project.samplesDir);
  const results = [];
  const coveredExports = new Set();
  for (const { file, full } of files) {
    let sample;
    try {
      sample = readJson(full);
    } catch (error) {
      results.push({ file, ok: false, failures: [`invalid JSON: ${error.message}`], status: null });
      continue;
    }
    const failures = validateSample(sample);
    if (typeof sample?.pipelineId === 'string' && sample.pipelineId) coveredExports.add(sample.pipelineId);
    if (failures.length > 0) {
      results.push({ file, ok: false, failures, status: null });
      continue;
    }
    const result = bundle.engine.runPipeline(bundle.prepared, {
      pipelineId: sample.pipelineId,
      payload: sample.payload,
      ...(sample.context === undefined ? {} : { context: sample.context }),
    });
    if (sample.expect.status !== result.status) failures.push(`expected status ${sample.expect.status}, got ${result.status}`);
    failures.push(...matchExpectedIssues(sample.expect.issues, result.issues));
    if (sample.expect.exact === true && sample.expect.issues.length !== result.issues.length) failures.push(`expected exactly ${sample.expect.issues.length} issues, got ${result.issues.length}`);
    results.push({ file, ok: failures.length === 0, failures, status: result.status });
  }

  for (const pipelineId of bundle.snapshot.exports) {
    if (coveredExports.has(pipelineId)) continue;
    results.push({
      file: '<coverage>',
      ok: false,
      failures: [`missing sample for exported pipeline ${pipelineId}`],
      status: null,
    });
  }

  const failed = results.filter((item) => !item.ok);
  if (options.json) console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed: failed.length, results }, null, 2));
  else if (!options.quiet) {
    for (const item of results) console.log(terminal.testResult(item));
    console.log(terminal.testSummary(failed.length, results.length));
  }
  return failed.length ? 1 : 0;
}

function validateSample(sample) {
  const failures = [];
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) return ['sample must be a JSON object'];
  if (typeof sample.pipelineId !== 'string' || !sample.pipelineId) failures.push('pipelineId must be a non-empty string');
  if (!Object.prototype.hasOwnProperty.call(sample, 'payload')) failures.push('payload is required');
  if (!sample.expect || typeof sample.expect !== 'object' || Array.isArray(sample.expect)) {
    failures.push('expect must be an object');
    return failures;
  }
  if (!RESULT_STATUSES.has(sample.expect.status)) failures.push(`expect.status must be one of ${[...RESULT_STATUSES].join(', ')}`);
  if (!Array.isArray(sample.expect.issues)) failures.push('expect.issues must be an array');
  else if (sample.expect.issues.some((issue) => !issue || typeof issue !== 'object' || Array.isArray(issue))) failures.push('every expect.issues item must be an object');
  if (sample.expect.exact !== undefined && typeof sample.expect.exact !== 'boolean') failures.push('expect.exact must be a boolean');
  return failures;
}

function matchExpectedIssues(expectedIssues, actualIssues) {
  const remaining = [...actualIssues];
  const failures = [];
  for (const expected of expectedIssues) {
    const index = remaining.findIndex((actual) => subset(expected, actual));
    if (index < 0) failures.push(`missing issue ${JSON.stringify(expected)}`);
    else remaining.splice(index, 1);
  }
  return failures;
}

module.exports = runTest;
module.exports.matchExpectedIssues = matchExpectedIssues;
module.exports.validateSample = validateSample;
