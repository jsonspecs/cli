# JSONSpecs CLI

[![CI](https://github.com/jsonspecs/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/jsonspecs/cli/actions)
[![npm](https://img.shields.io/npm/v/jsonspecs-cli)](https://www.npmjs.com/package/jsonspecs-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-green)](https://nodejs.org/)

Authoring, validation, build, sample-test, and local Sandbox CLI for
[`@jsonspecs/rules`](https://www.npmjs.com/package/@jsonspecs/rules) v3 projects.
Version 3 builds snapshots for `jsonspecs/spec` **1.0.0-rc.5** and
`formatVersion: 2`.

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
jsonspecs sandbox
```

| Command | Purpose |
| --- | --- |
| `init` | Creates a minimal RC.5 authoring project, samples, and an empty local operator pack. |
| `validate` | Builds the in-memory fv2 snapshot and runs the rules v3 compiler. |
| `test` | Runs every `samples/*.json` tuple against the same compiled snapshot. |
| `build` | Writes the validated `snapshot.json` and external `build-info.json`. |
| `sandbox` | Starts the local exploration and playground UI. |

Human output supports `--color=auto|always|never`. `--json` is always free of ANSI
codes and `--quiet` suppresses human output. `validate` and `build` retain the
`--fail-on-warning` CI gate for compiler diagnostics.

## Authoring project

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

Each file under `rules/` contains one artifact with an authoring-only `id`:

```json
{
  "id": "customer.name.required",
  "type": "rule",
  "operator": "not_empty",
  "field": "customer.name",
  "issue": {
    "level": "ERROR",
    "code": "CUSTOMER.NAME.REQUIRED",
    "message": "Customer name is required"
  }
}
```

The builder removes `id` from the artifact body and uses it as the key in
`snapshot.artifacts`. Pipeline and condition steps are exact string ids. Rules have no
`check|predicate` role: any rule can be used in `when`, while a rule used as a step must
have `issue`.

`manifest.json` owns the authoring metadata and public exports:

```json
{
  "specVersion": "1.0.0-rc.5",
  "exports": ["entrypoints.customer.validation"],
  "project": {
    "id": "customer-rules",
    "version": "1.0.0",
    "title": "Customer rules",
    "description": "Customer data checks",
    "language": "en"
  }
}
```

`exports` must be non-empty, unique, and sorted by unsigned UTF-16 code units. The
compiler requires the built snapshot to contain exactly their complete transitive
closure. Files, folders, titles, descriptions, ownership, and tags remain authoring
data and do not affect `sourceHash`.

## Build output

`jsonspecs build` writes the closed executable snapshot:

```json
{
  "format": "jsonspecs-snapshot",
  "formatVersion": 2,
  "specVersion": "1.0.0-rc.5",
  "exports": ["entrypoints.customer.validation"],
  "artifacts": {},
  "sourceHash": "..."
}
```

`sourceHash` is calculated by `@jsonspecs/rules` over the final snapshot using the RC.5
JCS formula. The CLI validates that exact object before writing it. `build-info.json`
stores deployment metadata outside the executable format: project version, runtime
version, build time, exports, counts, and the same source hash. Every external operator
pack is recorded with its manifest specifier, stable id, version, and a `sha256:` digest
of the deployed package files. The operator digest is separate from `sourceHash`, which
identifies only the executable snapshot.

## Samples

Each sample is a v3 evaluation tuple plus an expected projection:

```json
{
  "pipelineId": "entrypoints.customer.validation",
  "payload": { "customer": { "name": "" } },
  "context": {},
  "expect": {
    "status": "ERROR",
    "issues": [{ "code": "CUSTOMER.NAME.REQUIRED" }],
    "exact": true
  }
}
```

`pipelineId` is always explicit and top-level. `expect.status` and `expect.issues` are
required. Expected issues use one-to-one subset matching; `exact: true` also requires the
issue count to match. Samples may be nested below `samples/`, and `jsonspecs test` fails
when an exported pipeline has no sample.

## External operators

The CLI is operator-agnostic. It loads only modules explicitly declared by the project:

```json
{
  "operatorPacks": {
    "node": ["@company/payment-operators", "./operators/node"]
  }
}
```

Both npm packages and local paths are resolved relative to the rules project's
`manifest.json`, not relative to the global CLI installation. Each module exports the
rules v3 operator map directly:

```js
module.exports = {
  amount_gt_zero: {
    schema: {
      type: "object",
      properties: { field: { type: "string", minLength: 1 } },
      required: ["field"],
      additionalProperties: false,
    },
    evaluate({ field }) {
      return typeof field === "number" && field > 0 ? "PASS" : "FAIL";
    },
  },
};
```

An operator receives values resolved by core and returns exactly `PASS`, `FAIL`, or
`SKIP`. Operator descriptions for Sandbox belong in `manifest.catalog.operators`.

## Sandbox

`jsonspecs sandbox` serves the bundled SPA on `127.0.0.1` by default. Playground requests
use the native v3 tuple with a top-level `pipelineId`. The backend uses a
presentation adapter over rules v3 introspection: it classifies string steps, renders
native RC.5 `when` expressions, lists `exports`, and executes the compiled fv2 snapshot.
Sandbox is a local authoring tool and must not be exposed as a production service.

## Development

The source checkout uses a sibling rules repository:

```bash
git clone https://github.com/jsonspecs/rules.git rules
git clone https://github.com/jsonspecs/cli.git jsonspecs-cli
cd jsonspecs-cli
npm ci
npm run verify
```

`package.json.config.rulesVersion` and `rulesGitRef` pin the coordinated rules release.
The release packer replaces the local `file:../rules` dependency with `^3.0.0`, then
tests the real packed CLI in a clean CommonJS consumer.

## Release

1. Publish the matching `@jsonspecs/rules` version.
2. Update `config.rulesVersion` and `config.rulesGitRef` together.
3. Tag `jsonspecs-cli` with `v<version>`.

Publishing uses npm trusted publishing from `jsonspecs/cli` workflow `release.yml` with
`id-token: write`; no npm token is stored in the repository.
