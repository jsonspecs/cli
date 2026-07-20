# Testing guide

## Current gates

Run before release:

```bash
npm test
npm run test:pack
npm run verify
```

What they cover today:

- scaffolded project generation;
- manifest `project.version` validation;
- project validation with built-in and local custom operators;
- deterministic snapshot and build-info generation;
- sample execution with subset and exact issue matching;
- Studio boot through the introspection API on loopback;
- Studio deep-link fallback;
- Studio field title/value-field metadata;
- condition page data with predicate and executed steps;
- packed CommonJS consumer smoke with `init`, `validate`, `test`, and `build`.

## Recommended additions

### P1

- CI assertion that `package.json.config.rulesGitRef` resolves to an `@jsonspecs/rules` package whose version equals `config.rulesVersion`.
- Studio DOM test for rendered `whenHtml` trees:
  - no browser-default list bullets;
  - `flow-cond-rules__children` has reset list styles;
  - nested `all/any` groups keep readable indentation.
- Regression test that `/api/docs/pipeline/:id` and `/api/docs/artifact/:id` stay removed or return 404.
- Pack smoke for a clean ESM consumer in addition to the current CommonJS consumer.
- Test that bundled `static/index.html` references existing hashed assets after Studio UI sync.

### P2

- Snapshot test for `/api/pipelines/:id/flow` with nested conditions and pipelines.
- Studio API contract test for `catalog.fields[field].title` priority over `description`.
- Release-package test that the sanitized tarball depends on `@jsonspecs/rules: ^<config.rulesVersion>`.
- CLI sample-test fixtures for `expect.exact: true` failure messages.
- Project migration fixture for old manifests missing `project.version`.
