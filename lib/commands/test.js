const fs = require('fs');
const path = require('path');
const { resolveProject } = require('../project');
const { loadArtifactsFromDir } = require('../loader-fs');
const { createCliEngine } = require('../engine');

function subset(expected, actual) {
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual && actual[key]) === JSON.stringify(value));
}

function runTest(cwd = process.cwd(), options = {}) {
  const project = resolveProject(cwd);
  const { artifacts, sources } = loadArtifactsFromDir(project.rulesDir);
  const { engine } = createCliEngine(project);
  const compiled = engine.compile(artifacts, { sources });
  const files = fs.existsSync(project.samplesDir) ? fs.readdirSync(project.samplesDir).filter((file) => file.endsWith('.json')).sort() : [];
  const results = [];
  for (const file of files) {
    const sample = JSON.parse(fs.readFileSync(path.join(project.samplesDir, file), 'utf8'));
    const result = engine.runPipeline(compiled, { pipelineId: sample.context && sample.context.pipelineId, payload: sample.payload || {}, context: sample.context || {} }, { trace: false });
    const failures = [];
    if (sample.expect) {
      if (sample.expect.status && sample.expect.status !== result.status) failures.push(`expected status ${sample.expect.status}, got ${result.status}`);
      for (const issue of sample.expect.issues || []) if (!result.issues.some((actual) => subset(issue, actual))) failures.push(`missing issue ${JSON.stringify(issue)}`);
      if (sample.expect.exact === true && (sample.expect.issues || []).length !== result.issues.length) failures.push(`expected exactly ${(sample.expect.issues || []).length} issues, got ${result.issues.length}`);
    } else if (result.status === 'ABORT') failures.push(`runtime abort: ${result.error && result.error.code}`);
    results.push({ file, ok: failures.length === 0, failures, status: result.status });
  }
  const failed = results.filter((item) => !item.ok);
  if (options.json) console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed: failed.length, results }, null, 2));
  else if (!options.quiet) {
    for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.file}${item.failures.length ? ` — ${item.failures.join('; ')}` : ''}`);
    console.log(`[jsonspecs-cli] test ${failed.length ? 'FAILED' : 'OK'} (${results.length - failed.length}/${results.length})`);
  }
  return failed.length ? 1 : 0;
}

module.exports = runTest;
