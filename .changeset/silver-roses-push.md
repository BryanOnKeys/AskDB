---
"@askdb/http-api": patch
---

Reject non-decimal `--port` values in `askdb-http`: only ASCII digits in 1–65535 are accepted, so `0x50`, `1e3`, `80.0`, `+80` and values with surrounding spaces now fail with `Invalid --port` instead of listening on a different port.
