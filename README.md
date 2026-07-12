# JSONSpecs CLI

[![CI](https://github.com/catindev/jsonspecs-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/catindev/jsonspecs-cli/actions)
[![npm](https://img.shields.io/npm/v/jsonspecs-cli)](https://www.npmjs.com/package/jsonspecs-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-green)](https://nodejs.org/)

CLI backend and local studio host for [jsonspecs](https://www.npmjs.com/package/jsonspecs) rules projects.

## Commands

- `jsonspecs init <project-name>`
- `jsonspecs studio`
- `jsonspecs validate`
- `jsonspecs build`
- `jsonspecs test`

`build` writes a deterministic, hash-verified snapshot for `jsonspecs.compileSnapshot()`. `test` executes every JSON sample: `expect.status` is exact, `expect.issues` uses subset matching, and `expect.exact: true` rejects additional issues.

## Studio architecture

`jsonspecs-cli` serves a built SPA from `/` and exposes a JSON API under `/api/*`.
The current bundled frontend is expected to be built from the separate `jsonspecs-studio-ui` project and copied into `static/`.

Studio binds to `127.0.0.1` and uses same-origin requests by default. It is a local development tool and must not be exposed as a production service.

## Runtime model

`jsonspecs-cli` is an authoring/build tool. It works with a rules project that contains:

- source rules in `rules/`
- project metadata in `manifest.json`
- project-local Node operator packs in `operators/node`
- sample payloads in `samples/`

## Custom operators

Project-local custom operators are loaded from `manifest.json`:

```json
{
  "operatorPacks": {
    "node": ["./operators/node"]
  }
}
```

A local node operator pack should export an object with `check`, `predicate` and optional `meta` sections:

```js
module.exports = {
  check: {
    amount_gt_zero(rule, ctx) {
      const got = ctx.get(rule.field);
      if (!got.ok) return { status: 'FAIL', actual: undefined };

      const n = Number(got.value);
      return { status: Number.isFinite(n) && n > 0 ? 'OK' : 'FAIL', actual: got.value };
    },
  },
  predicate: {},
  meta: {
    operators: {
      amount_gt_zero: {
        description: "должно быть больше нуля",
      },
    },
  },
};
```

### Stable operator context

Custom operators should use the runtime context passed by `jsonspecs`:

- `ctx.get(path)` — reads a payload field in a stable way
- `ctx.has(path)` — checks field presence
- `ctx.payload` — raw payload map
- `ctx.getDictionary(id)` — access a dictionary by id

Project-local operator packs should **not** import `deepGet` or `jsonspecs` directly.

## Install

```bash
npm install
npm link
```

## Test

```bash
npm test
```
