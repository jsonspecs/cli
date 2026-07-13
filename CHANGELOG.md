# Changelog

## 2.1.3 — 2026-07-13

- Added colorized human CLI output for `init`, `validate`, `test`, `build`, Studio logs, and help.
- Added `--color=auto|always|never` / `--no-color` handling while keeping `--json` output ANSI-free.

## 2.1.2 — 2026-07-12

- Refreshed README and package metadata for the current ruleset version, snapshot, Studio, and release workflow.
- Added a testing guide covering current gates and recommended follow-up coverage.
- Bundled the refreshed Studio UI with fixed nested condition-tree styling.

## 2.1.1 — 2026-07-12

- Fixed Studio condition pages to render the condition predicate and executed checks as separate blocks.
- Fixed Studio comparison-rule descriptions to show the second field label.
- Replaced playground sample buttons with a compact dropdown.

## 2.1.0 — 2026-07-12

- Added required SemVer ruleset versions to manifests, snapshots, and build info.
- Removed Markdown documentation generation from Studio and refreshed the bundled UI.

## 2.0.2 — 2026-07-12

- Fixed Studio rule descriptions to prefer `catalog.fields[field].title` over `description` for human-readable field names.

## 2.0.1 — 2026-07-12

- Fixed Studio SPA deep-link fallback when the CLI is installed under a hidden parent directory such as `.nvm`.

## 2.0.0 — 2026-07-12

- Added deterministic versioned snapshots and `jsonspecs test`.
- Switched validation and Studio to the public diagnostics/introspection API.
- Fixed the generated custom operator contract.
- Bound Studio to `127.0.0.1` and removed permissive CORS by default.
- Added package metadata and pack-ready file whitelist.
- Added a reproducible sibling-repository lockfile workflow and a real packed-consumer smoke test.
- Releases now require the matching published `jsonspecs` version and publish only a sanitized registry-safe tarball from a version tag.
- Build info now records the snapshot format, format version, and source hash.
