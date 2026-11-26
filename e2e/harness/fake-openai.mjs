#!/usr/bin/env node
// @ts-check
// A stand-in OpenAI endpoint for verify-askdb: answers the Responses and Chat Completions APIs
// with the text in <run-dir>/model-reply.txt, read on every request, and appends each request
// body to <run-dir>/model-requests.jsonl. askdb-run.mjs starts and stops it; run it by hand
// only to debug it:  node fake-openai.mjs <run-dir> <port>
import { appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const [runDir, portArg] = process.argv.slice(2);
if (!runDir || !portArg) {
  console.error("usage: fake-openai.mjs <run-dir> <port>");
  process.exit(2);
}

function replyText() {
  try {
    return readFileSync(join(runDir, "model-reply.txt"), "utf8");
  } catch {
    return "```sql\nSELECT 1\n```";
  }
}

/** @param {string} text */
function responsesBody(text) {
  return {
    id: "resp_verify",
    object: "response",
    created_at: 0,
    model: "gpt-4o-mini",
    status: "completed",
    incomplete_details: null,
    output: [
      { type: "message", id: "msg_verify", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] },
    ],
    usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 2 },
  };
}

/** @param {string} text */
function chatBody(text) {
  return {
    id: "chatcmpl_verify",
    object: "chat.completion",
    created: 0,
    model: "gpt-4o-mini",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  const send = (/** @type {number} */ status, /** @type {unknown} */ json) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(json));
  };
  if (req.method === "GET" && req.url === "/__verify/health") return send(200, { ok: true, runDir });
  if (req.method === "POST" && (req.url === "/v1/responses" || req.url === "/v1/chat/completions")) {
    appendFileSync(join(runDir, "model-requests.jsonl"), JSON.stringify({ at: new Date().toISOString(), path: req.url, body }) + "\n");
    const text = replyText();
    return send(200, req.url === "/v1/responses" ? responsesBody(text) : chatBody(text));
  }
  send(404, { error: { message: `fake-openai: no route for ${req.method} ${req.url}` } });
});

server.listen(Number(portArg), "127.0.0.1", () => {
  console.log(`fake-openai listening on http://127.0.0.1:${portArg}`);
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
