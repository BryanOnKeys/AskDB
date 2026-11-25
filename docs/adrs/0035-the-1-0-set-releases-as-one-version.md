# ADR 0035: The 1.0 set releases as one version

**Status:** accepted · 2026-11-06

## Decision

The 12 packages of the 1.0 set (ADR 0030) are one `fixed` group in `.changeset/config.json`. Every release publishes all 12 at one version, a package with no change included. `@askdb/studio`, `@askdb/enrich` and `@askdb/rag` stay outside the group, on `0.x`.

| Question | Decision |
|---|---|
| The first release candidate | `1.0.0-rc.1`, and `0.2.0-rc.1` for the three `0.x` packages. `pnpm version-packages` restarts the prerelease counter when the pre tag changes. |
| The dist-tag of a prerelease | `latest`, until 1.0.0. From 1.0.0, a prerelease publishes under its pre tag and a stable version under `latest`. |
| The `1.0.0` CHANGELOG entry | It lists only the changes of the release candidates. |

## Why

- One number names a set that works together. With a number for each package, a host cannot tell which versions go together.
- Changesets does not restart the prerelease counter when the pre tag changes. Without the restart, the first release candidate is `1.0.0-rc.47`.
- Trusted publishing sets one dist-tag for each publish and cannot move another tag later. No stable version exists yet for `latest` to protect.

## Options

| | Option | Why it lost |
|---|---|---|
| A | A `fixed` group of the 12, a counter that restarts at `rc.1`, the `latest` dist-tag and a `1.0.0` entry for the release candidates only | **Chosen.** |
| B | A `linked` group of the 12 | Packages with no change keep older numbers, so the numbers do not show which versions go together. |
| C | A separate version for each package | It has the same fault as B, for every package. |
| D | No counter restart | The numbers suggest 46 earlier release candidates. |
| E | Versions set by hand in the PR that enters `rc` | `main` then holds versions that npm does not have, and the release workflow publishes each such version. |
| F | An `rc` dist-tag for the release candidates | `npm install askdb` stays on the last beta, and the workflow, the lab target and every install command change. |
| G | A `1.0.0` entry that lists every change since the first beta | It repeats 289 entries that each beta's own entry already lists. |

## Keep

| Rule | Checked by |
|---|---|
| The `fixed` group holds exactly the 1.0 set of ADR 0030, and `linked` stays empty. | review |
| After a pre-tag change, the counter of each public package restarts. The version step fails when a public package stays on another prerelease line. | `scripts/prerelease-counter.test.mjs` |
| Only the Version PR adds a version that npm does not have. No one sets a version by hand. | `scripts/check-unpublished-versions.test.mjs` |
| A breaking change to one of the 12 is a `major` changeset, unless it stays inside an experimental surface of ADR 0030. | review |
| After 1.0.0, a major in one of the 12 moves all 12. | review |
| A breaking change to Studio, `@askdb/enrich` or `@askdb/rag` is a `minor`, never a `major`: a `major` moves that package to 1.0. | review |
| Between `1.0.0-rc.1` and 1.0.0, a breaking change needs the maintainer's decision. The tooling does not enforce the freeze. | review |
| The 1.0.0 release changes both publish paths, `release.yml` and the root `release` script, to the new dist-tag rule. | review |
| A new public package outside the 1.0 set stays out of the group. | review |

`docs/release.md` holds the release steps.
