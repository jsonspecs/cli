# Testing guide

## Release gates

```bash
npm test
npm run test:pack
npm run verify
```

The unit/integration suite covers:

- RC.5 scaffold generation and top-level sample `pipelineId`;
- a single fv2 build path shared by validate, build, test, and Sandbox;
- JCS `sourceHash` and compileSnapshot acceptance;
- authoring metadata exclusion from the executable hash;
- sorted exports and complete-closure rejection;
- source-file locations in diagnostics;
- project-relative npm and local operator packs using `{schema, evaluate}`, immutable
  package digests, and recursive local hot reload;
- recursive sample discovery, required expectations, one-to-one issue matching, and
  sample coverage for every export;
- Sandbox exports, human-readable pipeline titles, native v3 playground input, native
  `when` rendering, playground execution, and SPA fallback;
- color, JSON, quiet, and warning-gate output modes.

`npm run test:pack` additionally creates real rules and CLI tarballs, installs both in a
clean CommonJS consumer, and executes `init`, `validate`, `test`, and `build` through the
installed `jsonspecs` binary.

## Recommended follow-ups

- Clean ESM consumer coverage for external operator packages.
- A fixture package with nested conditions, custom `inputs`/`params`, dictionaries, and
  wildcard aggregation.
- A release check that the tagged rules source commit equals the implementation pinned by
  `jsonspecs/spec` conformance metadata.
