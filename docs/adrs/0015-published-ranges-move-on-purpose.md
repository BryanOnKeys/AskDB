# ADR 0015: Published peer ranges move only on purpose

**Status:** accepted · 2026-09-30

## Decision

A peer range is what a host installs against. Its floor is the lowest version that AskDB needs and that has no known advisory. The floor rises by hand: for a feature or fix that AskDB depends on, or for a security fix. The changeset names the reason. Each major that the upstream project still supports stays accepted.

A bump that a range already allows moves only the lockfile. A package's own dependencies, runtime and dev, can move to the latest version in a routine update, because the host does not provide them. One runtime range is held with the peers: the `ai` range of the apps. Every AskDB package declares one `ai` range per AI SDK major.

The consumer lab pins `ai` and `@ai-sdk/openai` at the AI SDK 7 floors, and its `host-peers` scenario fails when a floor rises above those pins. The installable smoke pins the AI SDK 6 floors in the same way.

## Why

- A routine Dependabot update raised the `ai` floor in a release. AskDB needed nothing newer, and no advisory covered the older versions.
- A host pinned below a raised peer floor cannot install the release with npm. With pnpm, AskDB runs on a second AI SDK, not the host's.
- An app's `ai` range raised alone installs a second AI SDK with no peer warning.
- A raised floor on a package's own dependency never stops a host's install, and package managers install the newest match anyway.

## Options

| | Option | Why it lost |
|---|---|---|
| A | A peer floor moves only on purpose | **Chosen.** |
| B | Floors follow every bump | Each routine bump becomes a breaking install change for npm hosts, with nothing in AskDB that needs it. |
| C | Hold every published range, a package's own dependencies included | The host does not provide those, so a held floor changes nothing that a host installs. |

## Keep

| Rule | Checked by |
|---|---|
| Dependabot widens a range only when it must (`versioning-strategy: increase-if-necessary` in `.github/dependabot.yml`). | review |
| A peer floor rises by hand, and the changeset names the feature, fix or advisory. | review. The changeset check in `.github/workflows/changesets.yml` requires the changeset. |
| A host pinned at the AI SDK 7 floors installs every AskDB package with no unmet peer. | `examples/consumer-lab/test/host-peers.test.ts` |
| Every AskDB package declares one `ai` range per AI SDK major. | `examples/consumer-lab/test/host-peers.test.ts` |
| A change that raises the `ai` or `@ai-sdk/openai` floor raises the lab's pin in the same change. | `examples/consumer-lab/test/host-peers.test.ts` |
| A host at the AI SDK 6 floors installs, type-checks and runs `@askdb/core` and `@askdb/rag`. A rise of that floor moves the fixture's pins. | `examples/installable-smoke/run.sh` (`pnpm smoke:install`) |
| `@askdb/ai`'s tests pass with each of its peers at the floor. | `scripts/test-ai-sdk-floors.sh` (`pnpm test:ai-floors`) |
| The lab's Dependabot entry never moves the floor pins or the AskDB packages. A Dependabot alert on the lab's lockfile is the signal to raise a floor. | review |
| The lab's lockfile matches its manifest, so a root security update cannot bump a lab pin alone. | the `consumer-lab` job in `.github/workflows/ci.yml` |

The lab checks a floor at runtime: it does not compile AskDB against the floor. The workspace builds against the newest `ai` in its lockfile.
