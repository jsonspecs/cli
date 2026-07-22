module.exports = {
  commands: {
    init: require('./lib/commands/init'),
    validate: require('./lib/commands/validate'),
    build: require('./lib/commands/build'),
    test: require('./lib/commands/test'),
    sandbox: require('./lib/commands/sandbox')
  }
};
