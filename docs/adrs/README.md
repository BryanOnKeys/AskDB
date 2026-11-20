# Architecture decision records

Read this index before you change code or review a PR. Each row is a decision AskDB made between viable options, and the rule that decision leaves. Open an ADR when your change touches its rule: the ADR holds the reason and the options that lost.

A change that breaks a rule is a change to the decision. It supersedes the ADR in the same PR; it never happens silently.

## Writing an ADR

An ADR is a decision card that a reviewer reads in two minutes. The `domain-modeling` skill's `ADR-FORMAT.md` has the full format. In short:

- **Sections:** the title states the decision, then **Status**, **Decision**, **Why**, a diagram when the decision has a shape, **Options** (each option that lost, with its reason) and **Keep** (each rule, with the test that checks it, or `review`).
- **Size:** 350 words or fewer outside tables and the diagram, in plain English.
- **Content:** the decision, not the behaviour. Function names, error codes and the issue-by-issue story live in the code, the tests and git.
- **Changes:** a changed decision is a new ADR that supersedes the old one. A new case under the same decision is a test. An ADR has no dated amendment notes.
- **Index:** the PR that adds, supersedes or rewords an ADR updates its row here. The Keep cell has 25 words or fewer.

Every ADR uses this format. ADR 0034 is superseded and keeps its old text.

## Index

Numbering skips 0020.

| ADR | Status | Keep |
|---|---|---|
| [0001](0001-structured-logging-pino.md) Logs are Pino JSON, made by a factory in core | Accepted | CLI results go to stdout and diagnostics to stderr. `pino-pretty` is dev-only. |
| [0002](0002-integration-package-layout.md) One package per integration surface | Accepted | No driver import or executor in core. `@askdb/introspect` stays engine-agnostic. Dialect rules are ADR 0029's. |
| [0003](0003-postgres-partition-handling.md) Postgres partition leaves are filtered out; the parent is the table | Accepted | Plain `INHERITS` children stay tables. Foreign keys to or from a partition leaf are dropped. |
| [0004](0004-enrichment-package-boundary.md) `@askdb/enrich` is the headless authoring layer | Accepted | Authoring logic lives in `@askdb/enrich`, not in Studio or the CLI. Schema-directory file access is core's (ADRs 0027, 0028). |
| [0005](0005-askdb-config-and-env-bootstrap.md) `@askdb/config` loads `.env` and `askdb.config.*` into one snapshot | Accepted | Only `@askdb/config` reads `process.env` (one exception: ADR 0036). Apps use `getAskDbRuntimeConfig()`. The HTTP server never reloads over a host's snapshot. |
| [0006](0006-ai-provider-integration-strategy.md) Core is BYO-model; `@askdb/ai` owns the provider registry | Accepted | Core never depends on `@askdb/ai` or a provider SDK. Built-in providers and raw `LanguageModel`s are equal. A package that depends on core declares `ai`; the apps provide `zod`. |
| [0007](0007-connector-registry.md) Apps dispatch through the connector registry | Accepted (the registry's home: ADR 0008) | Apps never switch on the engine themselves. |
| [0008](0008-engine-packages-and-connector-registry.md) One package per engine; shared mechanics in `@askdb/introspect/kit` | Accepted | Don't copy kit helpers into an engine. Each engine writes its own driver `import()` with `.catch()`. Check for a package on disk, not through Node's resolver. |
| [0009](0009-studio-local-api-protection.md) Studio's local API: Host allowlist, same-origin checks, a per-launch token | Accepted | The token proves same-origin, not identity. Keep the Host check, `no-store` and frame denial. |
| [0010](0010-sql-guardrail-decision-point.md) One decision point for SQL guardrails, enforced at return and at rebind | Accepted | Only the decision point reads the modes. A rebind runs the tenant and sensitive checks again and takes tenant IDs from the scope. |
| [0011](0011-connection-labels-from-parsed-parts.md) Connection labels are built from parsed parts | Accepted | Never build a label by masking the raw string. Adapters return parts, never label text. |
| [0012](0012-sql-checks-are-defense-in-depth.md) SQL checks are a lint; the database is the security boundary | Accepted | Docs never call the checks a security boundary. A form a check can't read as the engine does is refused, not modelled. |
| [0013](0013-table-filename-scheme.md) A table's file is `<table>.md`, or `<schema>.<table>.md` on a collision | Accepted | Pair files with tables by front-matter `id`, never by filename. Write only through `saveSchemaFile()`. |
| [0014](0014-subtree-scope-expands-per-root.md) A `subtree` scope expands per root, in core | Accepted | Never fold a subtree into one ID list or drop an empty level. Each root keeps its own placeholder. |
| [0015](0015-published-ranges-move-on-purpose.md) Published peer ranges move only on purpose | Accepted | A peer floor rises by hand, named in a changeset. Raising an `ai` or `@ai-sdk/openai` floor raises the consumer lab's pin. Own dependencies can follow the latest. |
| [0016](0016-ai-config-connections-and-model-sections.md) AI config: connections in `providerConfig`, the model choice in `language` and `embedding` | Accepted | One place per provider secret. No layer picks an embedding model or keeps a table of model widths. |
| [0017](0017-sensitive-mentions-schema-wide.md) Sensitive mentions are checked against one schema-wide list | Accepted | Don't scope the check per table. Match a table-inherited column only as `table.column`. |
| [0018](0018-ask-keeps-the-trailing-semicolon.md) `ask()` keeps one trailing semicolon | Accepted | Core doesn't reshape the statement. Any other `;` throws. Remove the terminator with `/;$/`, never a pattern that starts `\s*`. |
| [0019](0019-loader-fails-closed-on-schema-directory-json.md) The loader fails closed on a stray JSON file in a schema directory | Accepted | A JSON file in a schema directory never loads without its siblings. No warning-only fallback. |
| [0021](0021-tenant-policy-draft-follows-ask-sensitivity.md) Studio's tenant-policy draft uses core's prompt formatter | Accepted | Don't render the draft's schema outside core's formatter. Never write the withheld-key notice into the draft. |
| [0022](0022-omission-withholds-mentions-in-prompts.md) Omission withholds text that names a sensitive column | Accepted | Don't trust the retriever to have filtered. Don't redact inside a sentence. Core owns the one name list. |
| [0023](0023-tenant-policy-problems-fail-strict-loads.md) Tenant policy problems fail strict loads | Accepted | Never load a strict policy with these errors. A removed table stays a warning. The check stays in `normalizeTenantPolicy`. |
| [0024](0024-tenant-ids-leave-the-sql-text.md) Tenant IDs are driver parameters by default | Accepted | Inlining never becomes the default again. An inlined ID outside printable ASCII is refused, not escaped. Hosts import `DEFAULT_TENANT_SQL_MODE`. |
| [0025](0025-config-mode-is-the-loosest-a-call-gets.md) Config mode is the loosest a call gets | Accepted | A per-call mode never loosens the config. A host doesn't resolve the mode again. |
| [0026](0026-every-prompt-follows-omission.md) Every prompt follows omission | Accepted | No prompt skips the setting or renders schema outside core's formatter. The tenant block is the one exception. |
| [0027](0027-core-reads-schema-directory-with-exact-names.md) Core reads a schema directory, names exact | Accepted | Never accept or skip a wrong-case schema file. Never copy the directory read into another package. |
| [0028](0028-core-writes-schema-directory-files.md) Core writes schema-directory files | Accepted | Never write a schema-directory file in place or through a symbolic link. No second copy of the rules. |
| [0029](0029-core-owns-built-in-dialect-specs.md) Core owns the built-in dialect specs | Accepted | Core never imports an engine package. Don't move the specs or open `DialectId` before 1.0 without a new ADR. |
| [0030](0030-1-0-promises-checked-sql-only.md) 1.0 promises checked SQL only | Accepted | Reports, summaries and MCP are not 1.0 features. A breaking change to the 1.0 set is a major; to an experimental surface, a minor. |
| [0031](0031-unused-exports-leave-before-1-0.md) Unused exports leave before 1.0 | Accepted | Don't re-export engine catalog SQL without a mode that needs it. Don't drop an internal export that another package imports. |
| [0032](0032-rebind-checks-under-the-hosts-dialect-spec.md) A rebind uses the host's dialect rules | Accepted | Never fall back to the built-in spec for a template whose rules AskDB can't recover. |
| [0033](0033-error-codes-nothing-throws-leave-before-1-0.md) Error codes nothing reports leave before 1.0 | Accepted | Don't add a code to a public union without the check that reports it. |
| [0034](0034-docs-diagrams-are-d2-rendered-at-build-time.md) Docs diagrams are D2 | Superseded by 0041 | None. |
| [0035](0035-the-1-0-set-releases-as-one-version.md) The 1.0 set releases as one version | Accepted | Don't change the `fixed` group without ADR 0030. Don't hand-set prerelease versions. Studio, enrich and rag never get a `major`. |
| [0036](0036-model-base-urls-with-credentials-are-refused.md) Model base URLs with credentials are refused | Accepted | No message repeats the URL. A new built-in provider builds its options through `baseURLOption()`. |
| [0037](0037-introspection-refuses-an-empty-artifact.md) Introspection refuses an empty artifact | Accepted | Never write a `schema.json` with no tables. The message never names the connection. |
| [0038](0038-prompt-hints-name-no-schema-table.md) Prompt hints name no schema table | Accepted | Hints name no schema table. The tenant block names no untracked table, and a table retrieval left out only on a join path. |
| [0039](0039-http-api-refuses-a-schema-it-cant-serve.md) `askdb-http` refuses a schema it can't serve | Accepted | Never fall back to PostgreSQL for an unknown engine. Don't blame the caller for the server's schema. |
| [0040](0040-approving-the-version-pr-is-the-release-approval.md) Approving the Version PR is the release approval | Accepted | An agent never approves the Version PR. No publish path skips the approval or the version check. |
| [0041](0041-docs-diagrams-are-mermaid-rendered-by-pele.md) Docs diagrams with no actors are Mermaid, rendered by pele | Accepted (supersedes 0034) | No diagram tool that needs a binary or a browser in CI, or ships JavaScript. A diagram that can't render fails the build. |
| [0042](0042-retrieval-prompt-reads-business-context-by-chunk-id.md) The retrieval prompt reads business context from the chunks | Accepted | Keep the chunker's `#biz` ids and the synthesis in step. Business context passes the same omission gates. |
| [0043](0043-default-prompt-carries-foreign-keys-and-concepts.md) The default prompt carries foreign keys, concepts, business context and notes | Accepted | Never name an untracked table or, under omission, a sensitive one. Don't truncate the schema to fit a budget. |
| [0044](0044-chart-planning-sends-no-rows.md) Chart planning sends no rows and no SQL literals | Accepted | Never put a row value or a SQL literal in the planner's prompt. `charts/` and the client don't import each other. |
| [0045](0045-unknown-schema-json-keys-warn.md) Unknown keys in `schema.json` warn | Accepted | Don't fail the load on an unknown key, and don't apply a suggested key. |
| [0046](0046-a-vulnerability-is-a-break-in-something-askdb-owns.md) A vulnerability is a break in something AskDB owns | Accepted | A check miss is a public `security-hardening` issue, not an advisory. A private report stays private until triage. |
| [0047](0047-studio-suggest-drafts-inline.md) Studio Suggest drafts inline | Accepted | Show the call count before bulk drafting. Write no draft before **Use** and **Save**. Send no sensitive column under omission. |
| [0048](0048-a-declined-question-throws.md) A declined question throws | Accepted | Never return SQL for a reply that declines. The decline doesn't move to a result field. |
| [0049](0049-quickstart-offers-a-fetchable-example.md) The Quickstart offers a fetchable example, kept equal to the page | Accepted | Don't commit generated files or add the folder to the workspace. Change the example with the page. |
| [0050](0050-docs-pages-are-markdown-first-with-a-markdown-twin.md) Docs pages are Markdown first, and each has a Markdown twin | Accepted | No layout HTML in a page. No color or font outside `tokens.css`. No font from another host. |
| [0051](0051-docs-diagrams-are-askdbs-own.md) Docs flows and sequences are drawn from a `diagram` fence | Accepted | No coordinate or color in a diagram. No diagram JavaScript. A diagram that can't be drawn fails the build. |
| [0052](0052-scripted-replays-live-in-a-private-e2e-package.md) Scripted replays live in a private `e2e` package | Accepted | Replays use the fake model and role-and-name locators. Journeys stay in one package. The task stays uncached. |
| [0053](0053-oxlint-lints-the-whole-repo.md) oxlint lints the whole repo, and a warning fails the build | Accepted | Run oxlint with warnings denied in pnpm lint and CI. One root config. Fix or allow warnings line by line. Pin oxlint exactly. |
