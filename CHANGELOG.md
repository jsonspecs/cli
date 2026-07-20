# Changelog

## 2.3.0 — 2026-07-21

- Switched the CLI runtime dependency from `jsonspecs` to `@jsonspecs/rules`.
- Raised the coordinated rules package release to 2.4.0.
- Updated CI, release packaging, and packed-consumer smoke tests for the renamed rules package.

## 2.2.3 — 2026-07-20

- Switched CI and development instructions to the renamed `jsonspecs/rules` engine repository.
- Raised the coordinated `jsonspecs` engine release to 2.3.4.

## 2.2.2 — 2026-07-20

- Updated package metadata, badges, and release documentation for the `jsonspecs/cli` repository transfer.
- Switched CI to check out the coordinated engine from the GitHub organization repository.
- Raised the coordinated `jsonspecs` engine release to 2.3.3.

## 2.2.1 — 2026-07-20

- Standardized successful JSON output for `validate` and `build` with always-present `warningCount`, `diagnosticCount`, and `diagnostics`.
- Added `warningCount` and `diagnosticCount` to `build-info.json` while keeping `warnings` as a deprecated 2.x alias.
- Raised the coordinated `jsonspecs` engine release to 2.3.2.
- Pinned GitHub Actions dependencies by full commit SHA in CI and release workflows.

## 2.2.0 — 2026-07-20

- Printed warning diagnostics for successful `validate` and `build` runs.
- Added `--fail-on-warning` for `validate` and `build`.
- Included warning diagnostics in JSON output and warning counts in build info.
- Raised the coordinated `jsonspecs` engine release to 2.3.1.

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
