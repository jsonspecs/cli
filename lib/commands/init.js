const fs = require('fs');
const path = require('path');
const { CliError } = require('../errors');
const { ensureDir, writeJson } = require('../fs-utils');
const { createTerminal } = require('../terminal');

function runInit(projectName, cwd = process.cwd(), options = {}) {
  const terminal = createTerminal(options);
  if (!projectName || typeof projectName !== 'string') throw new CliError('Usage: jsonspecs init <project-name>');
  const root = path.resolve(cwd, projectName);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) throw new CliError(`Target directory already exists and is not empty: ${root}`);

  ensureDir(path.join(root, 'rules/library'));
  ensureDir(path.join(root, 'rules/entrypoints'));
  ensureDir(path.join(root, 'rules/internal'));
  ensureDir(path.join(root, 'rules/dictionaries'));
  ensureDir(path.join(root, 'operators/node'));
  ensureDir(path.join(root, 'samples'));
  ensureDir(path.join(root, 'docs'));
  ensureDir(path.join(root, 'dist'));

  writeJson(path.join(root, 'manifest.json'), createManifest(projectName));
  writeJson(path.join(root, 'rules/library/order_amount_required.json'), {
    id: 'library.order.amount_required',
    type: 'rule',
    operator: 'not_empty',
    field: 'order.amount',
    issue: {
      level: 'ERROR',
      code: 'ORDER.AMOUNT.REQUIRED',
      message: 'Не указана сумма заказа'
    }
  });
  writeJson(path.join(root, 'rules/entrypoints/order_validation.json'), {
    id: 'entrypoints.order.validation',
    type: 'pipeline',
    steps: ['library.order.amount_required']
  });
  writeJson(path.join(root, 'samples/order.ok.json'), {
    pipelineId: 'entrypoints.order.validation',
    payload: { order: { amount: 1500 } },
    expect: { status: 'OK', exact: true, issues: [] }
  });
  writeJson(path.join(root, 'samples/order.error.json'), {
    pipelineId: 'entrypoints.order.validation',
    payload: { order: { amount: '' } },
    expect: { status: 'ERROR', issues: [{ code: 'ORDER.AMOUNT.REQUIRED', field: 'order.amount', level: 'ERROR' }] }
  });
  fs.writeFileSync(path.join(root, 'operators/node/index.js'), operatorPackTemplate(), 'utf8');
  fs.writeFileSync(path.join(root, 'README.md'), readme(projectName), 'utf8');
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\ndist/\n', 'utf8');
  console.log(terminal.ok('initialized rules project'));
  console.log(terminal.info('path', root));
}

function createManifest(projectName) {
  return {
    specVersion: '1.0.0-rc.5',
    exports: ['entrypoints.order.validation'],
    project: {
      id: projectName,
      version: '0.1.0',
      title: projectName,
      description: 'Новый rules project на jsonspecs',
      language: 'ru'
    },
    paths: {
      rules: './rules',
      samples: './samples',
      docs: './docs',
      dist: './dist'
    },
    sandbox: {
      port: 3100
    },
    build: {
      snapshotFile: 'snapshot.json',
      buildInfoFile: 'build-info.json'
    },
    operatorPacks: {
      node: ['./operators/node']
    },
    catalog: {
      fields: {
        'order.amount': {
          title: 'Сумма заказа',
          description: 'Сумма заказа в валюте операции',
          businessDescription: 'Используется в демонстрационном примере проверки'
        }
      },
      entrypoints: {
        'entrypoints.order.validation': {
          title: 'Проверка заказа',
          description: 'Демонстрационный сценарий проверки заказа'
        }
      },
      artifacts: {
        'library.order.amount_required': {
          title: 'Сумма обязательна',
          description: 'Проверка обязательности суммы заказа'
        }
      },
      operators: {
        not_empty: {
          description: 'должно быть заполнено'
        }
      }
    }
  };
}

function operatorPackTemplate() {
  return `"use strict";\n\n/** Локальные операторы проекта в контракте @jsonspecs/rules v3. */\n\nmodule.exports = Object.freeze({\n  // amount_gt_zero: {\n  //   schema: {\n  //     type: "object",\n  //     properties: { field: { type: "string", minLength: 1 } },\n  //     required: ["field"],\n  //     additionalProperties: false,\n  //   },\n  //   evaluate({ field }) {\n  //     return typeof field === "number" && field > 0 ? "PASS" : "FAIL";\n  //   },\n  // },\n});\n`;
}

function readme(projectName) {
  return `# ${projectName}\n\nRules project for jsonspecs.\n\n## Commands\n\n- \`jsonspecs sandbox\`\n- \`jsonspecs validate\`\n- \`jsonspecs build\`\n`;
}

module.exports = runInit;
