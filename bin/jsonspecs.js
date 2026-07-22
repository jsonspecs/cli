#!/usr/bin/env node
const { CliError } = require('../lib/errors');
const { createTerminal } = require('../lib/terminal');
const { version } = require('../package.json');

function printHelp(options = {}) {
  const terminal = createTerminal(options);
  const c = terminal.out;
  console.log(`${c.bold(`jsonspecs-cli v${version}`)}

${c.bold('Commands:')}
  jsonspecs init <project-name> [--color auto|always|never]
  jsonspecs sandbox [--host HOST] [--port PORT] [--color auto|always|never]
  jsonspecs build [--json] [--quiet] [--fail-on-warning] [--color auto|always|never]
  jsonspecs validate [--json] [--quiet] [--fail-on-warning] [--color auto|always|never]
  jsonspecs test [--json] [--quiet] [--color auto|always|never]

${c.bold('Color:')}
  auto is default. NO_COLOR disables color. FORCE_COLOR enables color.
  --json output is always machine-readable and never colorized.
`);
}

(async function main() {
  const [, , command, ...args] = process.argv;
  try {
    const flags = {
      json: args.includes('--json'),
      quiet: args.includes('--quiet'),
      failOnWarning: args.includes('--fail-on-warning'),
      color: colorModeFromArgs(args)
    };
    switch (command) {
      case 'init':
        return require('../lib/commands/init')(args[0], process.cwd(), flags);
      case 'sandbox':
        return require('../lib/commands/sandbox')(process.cwd(), { host: valueAfter(args, '--host'), port: valueAfter(args, '--port'), color: flags.color });
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
        const code = require('../lib/commands/test')(process.cwd(), flags);
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
        return printHelp(flags);
      default:
        throw new CliError(`Unknown command: ${command}`);
    }
  } catch (err) {
    const terminal = createTerminal({ color: colorModeFromArgsSafe(args) });
    if (err instanceof CliError) {
      console.error(terminal.cliError(err.message));
      process.exit(err.exitCode || 1);
    }
    console.error(err);
    process.exit(1);
  }
})();

function valueAfter(args, flag) { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }

function colorModeFromArgs(args) {
  if (args.includes('--no-color')) return 'never';
  const inline = args.find((arg) => arg.startsWith('--color='));
  const value = inline ? inline.slice('--color='.length) : valueAfter(args, '--color');
  if (!value) return 'auto';
  if (value === 'auto' || value === 'always' || value === 'never') return value;
  throw new CliError(`Invalid --color value: ${value}. Use auto, always or never.`);
}

function colorModeFromArgsSafe(args) {
  try {
    return colorModeFromArgs(args);
  } catch (_) {
    return 'auto';
  }
}
