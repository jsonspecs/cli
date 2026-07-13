# JSONSpecs CLI

[![CI](https://github.com/catindev/jsonspecs-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/catindev/jsonspecs-cli/actions)
[![npm](https://img.shields.io/npm/v/jsonspecs-cli)](https://www.npmjs.com/package/jsonspecs-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-green)](https://nodejs.org/)

Authoring, validation, build, sample-test, and local Studio host for [`jsonspecs`](https://www.npmjs.com/package/jsonspecs) rules projects.

## Install

```bash
npm install --global jsonspecs-cli
```

## Commands

```bash
jsonspecs init <project-name>
jsonspecs validate
jsonspecs test
jsonspecs build
jsonspecs studio
```

| Command | Purpose |
| --- | --- |
| `init` | Creates a minimal rules project with manifest, example rules, samples, local operator pack, and output directories. |
| `validate` | Loads artifacts from `rules/` and reports structured diagnostics from the `jsonspecs` compiler. |
| `test` | Runs every JSON sample in `samples/` against the compiled project. |
| `build` | Writes deterministic `snapshot.json` and `build-info.json` into `dist/`. |
| `studio` | Starts the local SPA Studio and JSON API for exploration and playground runs. |

Human-readable CLI output is colorized automatically when stdout/stderr is a TTY. Use
`--color=always`, `--color=never`, or `--color=auto` to override detection. `NO_COLOR`
disables color and `FORCE_COLOR` enables it. `--json` output is always plain machine-readable
JSON without ANSI escape codes, and `--quiet` suppresses human output.

## Rules project layout

```text
manifest.json
rules/
  library/
  entrypoints/
  internal/
  dictionaries/
operators/
  node/
samples/
docs/
dist/
```

`docs/` is reserved for hand-written project documentation. The CLI no longer generates Markdown or Confluence-style documentation from pipelines. Studio is an exploration/playground UI; it does not expose `/api/docs/*` endpoints.

## Manifest contract

`manifest.json` must contain an explicit SemVer ruleset version:

```json
{
  "project": {
    "id": "checkout-rules",
    "version": "1.0.0",
    "title": "Checkout rules",
    "description": "Checkout validation rules",
    "language": "ru"
  }
}
```

`project.version` is copied to:

- `snapshot.meta.rulesetVersion`;
- `build-info.json.rulesetVersion`;
- runtime result `ruleset.rulesetVersion` after `jsonspecs.compileSnapshot()`.

Increment it whenever the rules package is released. Projects created before `project.version` became required must add it before running `validate`, `test`, `build`, or Studio.

The manifest also drives Studio display metadata:

- `catalog.fields[field].title` is the primary human-readable field label;
- `catalog.fields[field].description` is secondary explanatory text;
- `catalog.entrypoints[id]` and `catalog.artifacts[id]` provide titles/descriptions for pages and flow views;
- `catalog.operators` and operator-pack `meta.operators` provide operator descriptions.

## Build output

`jsonspecs build` writes a deterministic snapshot suitable for `jsonspecs.compileSnapshot()`:

```json
{
  "format": "jsonspecs-snapshot",
  "formatVersion": 1,
  "sourceHash": "...",
  "engine": { "minVersion": "2.1.1" },
  "artifacts": [],
  "meta": {
    "projectId": "checkout-rules",
    "projectTitle": "Checkout rules",
    "description": "Checkout validation rules",
    "rulesetVersion": "1.0.0"
  }
}
```

`build-info.json` duplicates deployment metadata useful for CI, Docker images, and runtime services: project id/title, ruleset version, engine version, snapshot format/version, source hash, artifact count, entrypoints, and local Node operator packs.

## Sample tests

Each `samples/*.json` file is a complete execution case:

```json
{
  "context": {
    "pipelineId": "entrypoints.order.validation",
    "currentDate": "2026-07-12"
  },
  "payload": {
    "order": { "amount": 1500 }
  },
  "expect": {
    "status": "OK",
    "exact": true,
    "issues": []
  }
}
```

`expect.status` is exact. `expect.issues` uses subset matching, so a sample can assert only stable fields such as `code`, `field`, and `level`. `expect.exact: true` rejects additional issues.

## Custom operators

Project-local custom operators are loaded from `manifest.json`:

```json
{
  "operatorPacks": {
    "node": ["./operators/node"]
  }
}
```

A local Node operator pack exports `check`, `predicate`, and optional `meta`:

```js
module.exports = {
  check: {
    amount_gt_zero(rule, ctx) {
      const got = ctx.get(rule.field);
      if (!got.ok) return { status: "FAIL", actual: undefined };

      const value = Number(got.value);
      return {
        status: Number.isFinite(value) && value > 0 ? "OK" : "FAIL",
        actual: got.value,
      };
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

Project-local operator packs should use the runtime context passed by `jsonspecs`:

- `ctx.get(path)` — stable payload/context field access;
- `ctx.has(path)` — presence check;
- `ctx.payloadKeys` — flattened payload keys;
- `ctx.getDictionary(id)` — dictionary lookup.

Do not import `jsonspecs` or `deepGet` from project-local operator packs.

## Studio

`jsonspecs studio` serves a bundled SPA from `/` and a JSON API under `/api/*`.

Current Studio capabilities:

- entrypoint list and project summary;
- pipeline flow, nested conditions, and stats;
- rule, condition, dictionary, and generic artifact pages;
- playground execution against sample payloads;
- safe `basic` trace rendering in the playground;
- SPA deep-link fallback for routes such as `/rules/<id>` and `/pipelines/<id>/playground`.

Studio binds to `127.0.0.1` by default and uses same-origin requests. It is a local development tool and must not be exposed as a production service.

The bundled frontend is built from the separate `jsonspecs-studio-ui` repository and copied into `static/`.

## Development

The source checkout intentionally depends on a sibling `../jsonspecs` checkout:

```bash
git clone https://github.com/catindev/jsonspecs.git
git clone https://github.com/catindev/jsonspecs-cli.git
cd jsonspecs-cli
npm ci
npm run verify
```

`package.json` pins the coordinated engine release in:

```json
{
  "config": {
    "jsonspecsVersion": "2.1.1",
    "jsonspecsGitRef": "v2.1.1"
  }
}
```

Advance both fields deliberately when the CLI needs a newer engine. Dependabot/Renovate will not update this pair automatically because the source dependency is intentionally a sibling checkout for reproducible local and CI builds.

## Tests

```bash
npm test
npm run test:pack
npm run verify
```

`npm run test:pack` creates real tarballs, installs them in a clean CommonJS consumer, and runs the installed CLI through `init`, `validate`, `test`, and `build`.

Current coverage and recommended additions are tracked in [TESTING.md](./TESTING.md).

## Release order

1. Publish the matching `jsonspecs` version first.
2. Update `config.jsonspecsVersion` and `config.jsonspecsGitRef` if needed.
3. Tag `jsonspecs-cli` with `v<version>`.

The tag workflow downloads the exact engine release, builds a sanitized registry-safe tarball whose dependency is `^<jsonspecsVersion>`, repeats the pack/install smoke test, publishes to npm, and creates a GitHub release.

Direct publication from the source checkout is blocked by `private: true` and a `prepublishOnly` guard.
