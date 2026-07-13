const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

const CODES = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
};

function normalizeColorMode(mode = 'auto') {
  if (mode === true) return 'always';
  if (mode === false) return 'never';
  if (mode === 'always' || mode === 'never' || mode === 'auto') return mode;
  return 'auto';
}

function shouldUseColor(mode = 'auto', stream = process.stdout, env = process.env) {
  const normalized = normalizeColorMode(mode);
  if (normalized === 'always') return true;
  if (normalized === 'never') return false;
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return Boolean(stream && stream.isTTY);
}

function makePalette(mode = 'auto', stream = process.stdout) {
  const enabled = shouldUseColor(mode, stream);
  const wrap = (code) => (value) => {
    const text = String(value);
    return enabled ? `${CODES[code]}${text}${CODES.reset}` : text;
  };
  return {
    enabled,
    bold: wrap('bold'),
    dim: wrap('dim'),
    red: wrap('red'),
    green: wrap('green'),
    yellow: wrap('yellow'),
    cyan: wrap('cyan'),
  };
}

function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, '');
}

function prefix(palette) {
  return palette.dim('[jsonspecs-cli]');
}

function statusColor(status, palette) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'OK' || normalized === 'PASS' || normalized === 'CONTINUE') return palette.green;
  if (normalized === 'WARNING' || normalized === 'OK_WITH_WARNINGS') return palette.yellow;
  if (normalized === 'ERROR' || normalized === 'FAIL' || normalized === 'FAILED' || normalized === 'ABORT' || normalized === 'EXCEPTION') return palette.red;
  return (value) => String(value);
}

function icon(kind, palette) {
  if (kind === 'ok') return palette.green('✓');
  if (kind === 'warn') return palette.yellow('!');
  if (kind === 'error') return palette.red('✖');
  if (kind === 'reload') return palette.cyan('↻');
  return '•';
}

function formatKeyValue(label, value, palette) {
  if (value === undefined || value === null || value === '') return null;
  return `  ${palette.dim(`${label}:`)} ${palette.cyan(value)}`;
}

function formatDiagnostics(diagnostics = [], options = {}) {
  const palette = makePalette(options.color, process.stderr);
  return diagnostics.map((item, index) => formatDiagnostic(item, index, palette)).join('\n');
}

function formatDiagnostic(item = {}, index, palette) {
  const level = String(item.level || 'error').toLowerCase();
  const mark = level === 'warning' ? icon('warn', palette) : icon('error', palette);
  const code = item.code || 'DIAGNOSTIC';
  const headerColor = level === 'warning' ? palette.yellow : palette.red;
  const lines = [
    `${mark} ${headerColor(`[${code}]`)} ${item.phase ? palette.dim(item.phase) : ''}`.trimEnd(),
    formatKeyValue('file', item.location, palette),
    formatKeyValue('artifact', item.artifactId, palette),
    formatKeyValue('pipeline', item.pipelineId, palette),
    formatKeyValue('rule', item.ruleId, palette),
    formatKeyValue('path', item.path, palette),
    `  ${palette.dim('message:')} ${item.message || String(item)}`,
  ].filter(Boolean);
  if (index > 0) lines.unshift('');
  return lines.join('\n');
}

function createTerminal(options = {}) {
  const out = makePalette(options.color, process.stdout);
  const err = makePalette(options.color, process.stderr);
  return {
    out,
    err,
    prefix: () => prefix(out),
    errorPrefix: () => prefix(err),
    ok(label, details) {
      return `${prefix(out)} ${icon('ok', out)} ${out.green(label)}${details ? ` ${out.dim(`(${details})`)}` : ''}`;
    },
    fail(label, details) {
      return `${prefix(err)} ${icon('error', err)} ${err.red(label)}${details ? ` ${err.dim(`(${details})`)}` : ''}`;
    },
    info(label, value) {
      return `${prefix(out)} ${out.dim(`${label}:`)} ${out.cyan(value)}`;
    },
    testResult(item) {
      const label = item.ok ? 'PASS' : 'FAIL';
      const color = item.ok ? out.green : out.red;
      const failures = item.failures.length ? ` ${out.dim('—')} ${out.red(item.failures.join('; '))}` : '';
      return `${icon(item.ok ? 'ok' : 'error', out)} ${color(label)} ${out.cyan(item.file)}${item.status ? ` ${out.dim(`[${item.status}]`)}` : ''}${failures}`;
    },
    testSummary(failed, total) {
      const passed = total - failed;
      const ok = failed === 0;
      return `${prefix(out)} ${icon(ok ? 'ok' : 'error', out)} test ${ok ? out.green('OK') : out.red('FAILED')} ${out.dim(`(${passed}/${total})`)}`;
    },
    diagnosticHeader(label) {
      return `${prefix(err)} ${icon('error', err)} ${err.red(label)}`;
    },
    formatDiagnostics(diagnostics) {
      return formatDiagnostics(diagnostics, options);
    },
    cliError(message) {
      return `${prefix(err)} ${icon('error', err)} ${err.red(message)}`;
    },
    studio(message, kind = 'info') {
      const mark = icon(kind, out);
      const color = kind === 'ok' ? out.green : kind === 'error' ? out.red : kind === 'warn' ? out.yellow : out.cyan;
      return `${out.dim('[studio]')} ${mark} ${color(message)}`;
    },
    status(status) {
      return statusColor(status, out)(status);
    },
  };
}

module.exports = {
  createTerminal,
  formatDiagnostics,
  makePalette,
  normalizeColorMode,
  shouldUseColor,
  stripAnsi,
};
