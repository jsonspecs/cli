const { renderWhenText, renderWhenTreeHtml, escapeHtml } = require('./when-render');
const { readJson } = require('./fs-utils');
const { listSampleFiles } = require('./sample-files');

function listEntrypoints(view, manifest) {
  return view.listEntrypoints().map((item) => { const meta = manifest.entrypoints?.[item.id] || {}; return { id: item.id, title: meta.title || item.id, description: meta.description || '', strict: false, requiredContext: [] }; }).sort((a, b) => compareUtf16(a.id, b.id));
}

function analyzePipeline(rootId, view) {
  if (!view.getPipelineSteps(rootId)) return null;
  const stats = { totalSteps: 0, rules: 0, conditions: 0, pipelines: 0, maxDepth: 0, librarySteps: 0, localSteps: 0, ruleIds: [], warnings: [] };
  function walk(steps, depth, visited) {
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    for (const step of steps || []) {
      stats.totalSteps++;
      const id = step.ruleId || step.conditionId || step.pipelineId;
      if (id?.startsWith('library.')) stats.librarySteps++; else stats.localSteps++;
      if (step.kind === 'rule') { stats.rules++; stats.ruleIds.push(id); }
      else if (step.kind === 'condition') { stats.conditions++; if (!visited.has(id)) { visited.add(id); walk(view.getConditionModel(id)?.steps, depth + 1, visited); } }
      else if (step.kind === 'pipeline') { stats.pipelines++; if (!visited.has(id)) { visited.add(id); walk(view.getPipelineSteps(id), depth + 1, visited); } }
    }
  }
  walk(view.getPipelineSteps(rootId), 1, new Set([rootId]));
  const count = {}; for (const id of stats.ruleIds) count[id] = (count[id] || 0) + 1;
  const duplicates = Object.entries(count).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  if (stats.maxDepth >= 5) stats.warnings.push(`Глубина вложенности ${stats.maxDepth}. Рекомендуется не более 4`);
  if (stats.totalSteps >= 60) stats.warnings.push(`Всего шагов ${stats.totalSteps}. Сценарий может быть сложным для сопровождения`);
  const libraryPct = stats.totalSteps ? Math.round(stats.librarySteps / stats.totalSteps * 100) : 0;
  for (const [id, n] of duplicates) stats.warnings.push(`Правило ${id} встречается ${n} раза в дереве. Возможен дубль`);
  return { ...stats, libraryPct, duplicates: duplicates.slice(0, 10) };
}

function title(_view, manifest, id) { const meta = manifest.artifacts?.[id] || manifest.entrypoints?.[id] || {}; return meta.title || id; }

function buildTree(rootId, view, manifest) {
  const visited = new Set([rootId]);
  function walk(steps) { return (steps || []).map((step) => { const id = step.ruleId || step.conditionId || step.pipelineId; const artifact = view.getArtifact(id); const node = { kind: step.kind, id, title: title(view, manifest, id), subtitle: artifact?.operator ? `${artifact.operator}${artifact.field ? ' · ' + artifact.field : ''}` : '', link: step.kind === 'pipeline' ? `/pipelines/${encodeURIComponent(id)}` : `/artifacts/${encodeURIComponent(id)}`, children: [] }; if (!visited.has(id)) { visited.add(id); node.children = walk(step.kind === 'condition' ? view.getConditionModel(id)?.steps : step.kind === 'pipeline' ? view.getPipelineSteps(id) : []); } return node; }); }
  return walk(view.getPipelineSteps(rootId));
}

function buildFlowSteps(steps, view, manifest, visited) {
  return (steps || []).map((step) => {
    const id = step.ruleId || step.conditionId || step.pipelineId; const artifact = view.getArtifact(id);
    if (step.kind === 'rule') return { kind: 'rule', id, title: title(view, manifest, id), library: id.startsWith('library.'), operator: artifact?.operator || '', field: artifact?.field || '' };
    const cycle = visited.has(id); const next = new Set(visited); next.add(id);
    if (step.kind === 'pipeline') return { kind: 'pipeline', id, title: title(view, manifest, id), library: id.startsWith('library.'), strict: false, steps: cycle ? [] : buildFlowSteps(view.getPipelineSteps(id), view, manifest, next) };
    const model = view.getConditionModel(id); const label = (predId) => title(view, manifest, predId);
    return { kind: 'condition', id, title: title(view, manifest, id), library: id.startsWith('library.'), whenText: model?.when ? renderWhenText(model.when, label, { stripLeadingIf: true }) : '', whenHtml: model?.when ? renderWhenTreeHtml(model.when, (predId) => `<a href="/rules/${encodeURIComponent(predId)}" class="flow-cond-rule-link">${escapeHtml(label(predId))}</a>`, { className: 'flow-cond-rules' }) : '', steps: cycle ? [] : buildFlowSteps(model?.steps, view, manifest, next) };
  });
}
function buildFlowModel(id, view, manifest, visited = new Set()) { return buildFlowSteps(view.getPipelineSteps(id), view, manifest, visited); }

function enrichArtifactForUi(id, view, manifest) {
  const source = view.getArtifact(id); if (!source) return null;
  const authored = manifest.artifacts?.[id] || manifest.entrypoints?.[id] || {};
  // Bundled UI пока читает несколько presentation-полей формата 2.x. Они
  // вычисляются только в HTTP-ответе и никогда не попадают обратно в snapshot.
  const artifact = toPresentationArtifact(source, authored, manifest);
  const display = { artifact: manifest.artifacts?.[id] || null, field: artifact.field ? manifest.fields?.[artifact.field] || null : null, valueField: artifact.value_field ? manifest.fields?.[artifact.value_field] || null : null, operator: artifact.operator ? manifest.operators?.[artifact.operator] || null : null, entrypoint: manifest.entrypoints?.[id] || null };
  if (artifact.type === 'condition') {
    const model = view.getConditionModel(id);
    const label = (predId) => title(view, manifest, predId);
    return {
      artifact,
      compiled: model ? {
        ...model,
        whenHtml: model.when ? renderWhenTreeHtml(
          model.when,
          (predId) => `<a href="/rules/${encodeURIComponent(predId)}" class="flow-cond-rule-link">${escapeHtml(label(predId))}</a>`,
          { className: 'flow-cond-rules' },
        ) : '',
        steps: buildFlowSteps(model.steps, view, manifest, new Set([id])),
      } : null,
      display,
    };
  }
  return { artifact, compiled: artifact.type === 'pipeline' ? { steps: view.getPipelineSteps(id) } : null, display };
}

function toPresentationArtifact(artifact, authored, manifest) {
  const result = { ...artifact, description: authored.title || authored.description || artifact.id };
  if (artifact.type === 'rule') {
    result.role = artifact.issue ? 'check' : 'predicate';
    if (artifact.issue) {
      result.level = artifact.issue.level;
      result.code = artifact.issue.code;
      result.message = artifact.issue.message;
      result.meta = artifact.issue.meta;
    }
    if (typeof artifact.dictionary === 'string') {
      result.dictionary = {
        id: artifact.dictionary,
        description: manifest.artifacts?.[artifact.dictionary]?.title || artifact.dictionary,
      };
    }
  }
  return result;
}

function loadSamples(dir, pipelineId = null) { return listSampleFiles(dir).flatMap(({ file, full }) => { try { const body = readJson(full); return !pipelineId || body?.pipelineId === pipelineId ? [{ name: file.replace(/\.json$/, ''), file, body }] : []; } catch (_) { return []; } }).sort((a, b) => compareUtf16(a.name, b.name)); }
function analysisSummary(view, project, operatorMeta) { const stats = view.stats(); return { artifactCount: stats.artifacts, ruleCount: stats.byType.rule || 0, conditionCount: stats.byType.condition || 0, pipelineCount: stats.byType.pipeline || 0, dictionaryCount: stats.byType.dictionary || 0, entrypointCount: stats.entrypointCount, operatorPacks: project.manifest.operatorPacks?.node || [], operatorMeta: operatorMeta || {} }; }

function compareUtf16(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

module.exports = { listEntrypoints, analyzePipeline, buildTree, buildFlowModel, enrichArtifactForUi, loadSamples, analysisSummary };
