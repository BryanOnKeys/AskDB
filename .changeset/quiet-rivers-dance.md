---
"@askdb/config": patch
---

Reject non-decimal `httpApi.listen.port` values: only a number, or a string of decimal digits, in 0–65535 is accepted, so `"0x50"`, `"1e3"`, `"+80"` and `"80.0"` now fail config loading instead of binding a different port. This matches the `askdb-http --port` flag (#1024) and closes #1030.

Upgrade note: a config that relied on a hex, exponent or signed port string (for example `"0x50"`) no longer loads — write the port as a plain decimal number or string instead.
