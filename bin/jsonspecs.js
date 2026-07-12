#!/usr/bin/env node
const { CliError } = require('../lib/errors');
const { version } = require('../package.json');

function printHelp() {
  console.log(`jsonspecs-cli v${version}\n\nCommands:\n  jsonspecs init <project-name>\n  jsonspecs studio [--host HOST] [--port PORT] [--no-open]\n  jsonspecs build [--json] [--quiet]\n  jsonspecs validate [--json] [--quiet]\n  jsonspecs test [--json] [--quiet]\n`);
}

(async function main() {
  const [, , command, ...args] = process.argv;
  const flags = { json: args.includes('--json'), quiet: args.includes('--quiet') };
  try {
    switch (command) {
      case 'init':
        return require('../lib/commands/init')(args[0]);
      case 'studio':
        return require('../lib/commands/studio')(process.cwd(), { host: valueAfter(args, '--host'), port: valueAfter(args, '--port'), openBrowser: !args.includes('--no-open') });
      case 'build': {
        const code = require('../lib/commands/build')(process.cwd(), flags);
        process.exitCode = code;
        return;
      }
      case 'validate': {
        const code = require('../lib/commands/validate')(process.cwd(), flags);
        process.exitCode = code;
        return;
      }
      case 'test': {
        const code = require('../lib/commands/test')(process.cwd(), { json: args.includes('--json'), quiet: args.includes('--quiet') });
        process.exitCode = code;
        return;
      }
      case '-v':
      case '--version':
        console.log(version);
        return;
      case '-h':
      case '--help':
      case undefined:
        return printHelp();
      default:
        throw new CliError(`Unknown command: ${command}`);
    }
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`[jsonspecs-cli] ${err.message}`);
      process.exit(err.exitCode || 1);
    }
    console.error(err);
    process.exit(1);
  }
})();

function valueAfter(args, flag) { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }
