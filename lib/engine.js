const { createEngine, CompilationError } = require('@jsonspecs/rules');
const { createOperators } = require('./operators');

function createCliEngine(project) {
  const { operators, meta, operatorSources, operatorPacks } = createOperators(project);
  return {
    engine: createEngine({ operators }),
    operatorMeta: meta,
    operatorSources,
    operatorPacks
  };
}

module.exports = { createCliEngine, CompilationError };
