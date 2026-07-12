const fs = require('fs');
const path = require('path');
const { renderWhenText, renderWhenTreeHtml, escapeHtml } = require('./when-render');

function listEntrypoints(view, manifest) {
  return view.listEntrypoints().map((item) => { const artifact = view.getArtifact(item.id); const meta = manifest.entrypoints?.[item.id] || {}; return { id: item.id, title: meta.title || item.description || item.id, description: meta.description || item.description || '', strict: Boolean(item.strict), requiredContext: Array.isArray(artifact.required_context) ? artifact.required_context : [] }; }).sort((a, b) => a.id.localeCompare(b.id));
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

function title(view, manifest, id) { const artifact = view.getArtifact(id); const meta = manifest.artifacts?.[id] || manifest.entrypoints?.[id] || {}; return meta.title || artifact?.description || id; }

function buildTree(rootId, view, manifest) {
  const visited = new Set([rootId]);
  function walk(steps) { return (steps || []).map((step) => { const id = step.ruleId || step.conditionId || step.pipelineId; const artifact = view.getArtifact(id); const node = { kind: step.kind, id, title: title(view, manifest, id), subtitle: artifact?.operator ? `${artifact.operator}${artifact.field ? ' · ' + artifact.field : ''}` : (artifact?.strict ? 'strict' : ''), link: step.kind === 'pipeline' ? `/pipelines/${encodeURIComponent(id)}` : `/artifacts/${encodeURIComponent(id)}`, children: [] }; if (!visited.has(id)) { visited.add(id); node.children = walk(step.kind === 'condition' ? view.getConditionModel(id)?.steps : step.kind === 'pipeline' ? view.getPipelineSteps(id) : []); } return node; }); }
  return walk(view.getPipelineSteps(rootId));
}

function buildFlowSteps(steps, view, manifest, visited) {
  return (steps || []).map((step) => {
    const id = step.ruleId || step.conditionId || step.pipelineId; const artifact = view.getArtifact(id);
    if (step.kind === 'rule') return { kind: 'rule', id, title: title(view, manifest, id), library: id.startsWith('library.'), operator: artifact?.operator || '', field: artifact?.field || '' };
    const cycle = visited.has(id); const next = new Set(visited); next.add(id);
    if (step.kind === 'pipeline') return { kind: 'pipeline', id, title: title(view, manifest, id), library: id.startsWith('library.'), strict: Boolean(artifact?.strict), steps: cycle ? [] : buildFlowSteps(view.getPipelineSteps(id), view, manifest, next) };
    const model = view.getConditionModel(id); const label = (predId) => view.getArtifact(predId)?.description || predId;
    return { kind: 'condition', id, title: title(view, manifest, id), library: id.startsWith('library.'), whenText: model?.when ? renderWhenText(model.when, label, { stripLeadingIf: true }) : '', whenHtml: model?.when ? renderWhenTreeHtml(model.when, (predId) => `<a href="/rules/${encodeURIComponent(predId)}" class="flow-cond-rule-link">${escapeHtml(label(predId))}</a>`, { className: 'flow-cond-rules' }) : '', steps: cycle ? [] : buildFlowSteps(model?.steps, view, manifest, next) };
  });
}
function buildFlowModel(id, view, manifest, visited = new Set()) { return buildFlowSteps(view.getPipelineSteps(id), view, manifest, visited); }

function enrichArtifactForUi(id, view, manifest) {
  const artifact = view.getArtifact(id); if (!artifact) return null;
  const display = { artifact: manifest.artifacts?.[id] || null, field: artifact.field ? manifest.fields?.[artifact.field] || null : null, operator: artifact.operator ? manifest.operators?.[artifact.operator] || null : null, entrypoint: manifest.entrypoints?.[id] || null };
  if (artifact.type === 'condition') { const model = view.getConditionModel(id); return { artifact, compiled: model ? { ...model, steps: buildFlowSteps(model.steps, view, manifest, new Set([id])) } : null, display }; }
  return { artifact, compiled: artifact.type === 'pipeline' ? { steps: view.getPipelineSteps(id) } : null, display };
}

function generateArtifactDoc(id, view) { const artifact = view.getArtifact(id); return artifact ? `# ${artifact.description || id}\n\n**Артефакт**: \`${id}\`\n\n\`\`\`json\n${JSON.stringify(artifact, null, 2)}\n\`\`\`` : ''; }
function generatePipelineDoc(id, view, manifest) { const artifact = view.getArtifact(id); const lines = [`# ${artifact?.description || id}`, '', `**Сценарий**: \`${id}\``, '']; for (const step of buildFlowModel(id, view, manifest, new Set([id]))) lines.push(`- **${step.title}** (\`${step.id}\`)`); return lines.join('\n'); }
function loadSamples(dir, pipelineId = null) { if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir).filter((file) => file.endsWith('.json')).flatMap((file) => { try { const body = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); return !pipelineId || body?.context?.pipelineId === pipelineId ? [{ name: file.replace(/\.json$/, ''), file, body }] : []; } catch (_) { return []; } }).sort((a, b) => a.name.localeCompare(b.name)); }
function analysisSummary(view, project, operatorMeta) { const stats = view.stats(); return { artifactCount: stats.artifacts, ruleCount: stats.byType.rule || 0, conditionCount: stats.byType.condition || 0, pipelineCount: stats.byType.pipeline || 0, dictionaryCount: stats.byType.dictionary || 0, entrypointCount: stats.entrypointCount, operatorPacks: project.manifest.operatorPacks?.node || [], operatorMeta: operatorMeta || {} }; }

module.exports = { listEntrypoints, analyzePipeline, buildTree, buildFlowModel, enrichArtifactForUi, generatePipelineDoc, generateArtifactDoc, loadSamples, analysisSummary };
