# ADR 0013: A table's file is `<table>.md`, or `<schema>.<table>.md` on a collision

**Status:** accepted · 2026-09-29

## Decision

`@askdb/enrich` picks the filename when it creates a file for a table that has none. The name is `<table>.md`. When another table has the same name, the name is `<schema>.<table>.md`. When that name is taken too, a counter follows: `<schema>.<table>-<n>.md`.

Three rules apply to each candidate name:

- **Safe.** A character that a file system refuses, or reads as part of a path, becomes `_`.
- **Compared as a file system compares.** Two names are the same when APFS or NTFS stores them as one file. The key is the name in NFC, then lower case, upper case and lower case again. It does not depend on the host OS.
- **Short.** A name over 200 bytes is cut, and it ends in `~` plus 8 hex digits of a hash of the full name.

A file that exists keeps its name. The loader pairs a file with its table by the front-matter `id`, so nothing reads a table's identity from a filename. Each write into a schema directory goes through core's `saveSchemaFile()` (ADR 0028).

## Why

- With `<table>.md` for every table, `public.orders` and `archive.orders` overwrote each other. A quoted name such as `../../x` wrote outside `tables/`. A 128-character SQL Server name exceeded the 255-byte limit of a file name.
- People open these files in editors and pull requests, and most databases have one schema. The short name serves that case.
- Nothing decodes a filename. A name must only be unique, stay inside `tables/`, and fit on disk.
- The key was checked against Unicode full case folding for each single code point (Unicode 15.1), not for every string. It depends on the Unicode version of the Node runtime.

## Options

How to name the file:

| | Option | Why it lost |
|---|---|---|
| A | The bare name, schema-qualified on a collision, a counter last | **Chosen.** |
| B | Always `<schema>.<table>.md` | Each file of a one-schema database gets a `public.` prefix, and names that differ only in case still need a counter. |
| C | A reversible encoding of the identifier | Non-ASCII names become unreadable, and nothing needs to decode a filename. |
| D | A hash suffix on every name | Every name carries noise, and the name no longer shows the schema. |
| E | A counter only | `orders-2.md` does not say which schema it is, and the order in `schema.json` decides which table gets the counter. |
| F | Fail on a name that is too long | The name comes from the database, so the user cannot fix it, and the table could never be enriched. |

How a save replaces a file:

| | Option | Why it lost |
|---|---|---|
| A | Write a temp file and rename it over the target | **Chosen.** |
| B | Refuse a file that has more than one hard link | It still follows a symbolic link planted between the check and the write, and a crash can leave half a file. |
| C | Refuse the save when the file's group cannot be kept | An owner who is not in the file's group could not save their own file. |
| D | Let the new file take the directory's group | It gives the old group's access to a different group. |

## Keep

| Rule | Checked by |
|---|---|
| A tool pairs a file with its table by the front-matter `id`, never by a filename it computes. | `packages/enrich/src/workspace.test.ts` |
| A file that exists is never renamed. A name already in `tables/` is never reused, also not the name of an orphaned file. | `packages/enrich/src/workspace.test.ts` |
| Names that a file system stores as one file get different default files. | `packages/enrich/src/workspace.test.ts` |
| A default name stays inside `tables/` and within 200 bytes. | `packages/enrich/src/workspace.test.ts` |
| The comparison key and the 200-byte limit are part of `docs/contracts/schema-v2.md`. A change to either can rename a default, so it needs a new ADR. | review |
| Only `@askdb/enrich` picks a filename. Studio and the CLI do not. | review |
| Each AskDB writer into a schema directory calls `saveSchemaFile()`. | review |
| A save refuses a path outside the schema directory, and a symbolic link at the file or at a directory below the schema directory. | `packages/core/src/schema/v2/save-file.test.ts`, `packages/enrich/src/workspace.test.ts` |
| A save replaces the file by a rename. A hard link at the target is detached, not written through. | `packages/core/src/schema/v2/save-file.test.ts` |
| A save refuses a read-only file. It keeps the file's mode and group. | `packages/core/src/schema/v2/save-file.test.ts` |
| When a save cannot keep the group, the group and others each get only the access that both had. | `packages/core/src/schema/v2/save-file-ownership.test.ts` |

A table's filename depends on which tables existed when its file was created. Two directories for one database can name the same table differently.
