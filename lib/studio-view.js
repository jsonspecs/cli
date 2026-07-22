"use strict";

/**
 * Адаптирует компактную introspection-модель rules v3 к модели представления Studio.
 *
 * В runtime шаг — это строковый id, а тип определяется целевым артефактом. Studio
 * удобнее получить уже классифицированный шаг. Этот слой только готовит данные UI
 * и не участвует в компиляции или исполнении правил.
 */

function createStudioView(engine, prepared) {
  const view = engine.inspect(prepared);

  function getArtifact(id) {
    const artifact = view.getArtifact(id);
    return artifact ? Object.freeze({ id, ...artifact }) : null;
  }

  function getSteps(id, expectedType) {
    const artifact = getArtifact(id);
    if (!artifact || artifact.type !== expectedType) return null;
    return artifact.steps.map(toStudioStep);
  }

  function toStudioStep(id) {
    const target = getArtifact(id);
    if (!target) return { kind: "unknown", id };
    if (target.type === "rule") return { kind: "rule", ruleId: id };
    if (target.type === "condition") return { kind: "condition", conditionId: id };
    if (target.type === "pipeline") return { kind: "pipeline", pipelineId: id };
    return { kind: target.type, id };
  }

  return Object.freeze({
    listEntrypoints() {
      return view.listExports().map((id) => getArtifact(id));
    },
    listArtifacts(filter = {}) {
      return view.listArtifacts(filter).map(({ id }) => getArtifact(id));
    },
    getArtifact,
    getPipelineSteps(id) {
      return getSteps(id, "pipeline");
    },
    getConditionModel(id) {
      const artifact = getArtifact(id);
      if (!artifact || artifact.type !== "condition") return null;
      return { when: artifact.when, steps: artifact.steps.map(toStudioStep) };
    },
    stats() {
      const stats = view.stats();
      return { ...stats, entrypointCount: stats.exportCount };
    },
  });
}

module.exports = { createStudioView };
