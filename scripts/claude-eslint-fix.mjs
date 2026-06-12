// PostToolUse hook (LO-79). After an Edit/Write to a TypeScript file under
// src/, run `eslint --fix` on just that file so Next 16 breaking-change lint
// issues surface immediately (AGENTS.md: "this is NOT the Next.js you know").
// Always exits 0 — lint feedback is advisory, it never blocks the edit.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

let event = {};
try {
  event = JSON.parse(readStdin() || "{}");
} catch {
  process.exit(0);
}

const ti = event?.tool_input ?? event?.toolInput ?? {};
const file = String(ti.file_path ?? ti.path ?? "").replace(/\\/g, "/");
if (!/src\/.*\.(ts|tsx)$/.test(file)) process.exit(0);

const res = spawnSync("npx", ["eslint", "--fix", file], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});
const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
if (res.status && out) {
  // Surface remaining lint problems to the transcript without blocking.
  console.error(`eslint (${file}):\n${out.slice(0, 2000)}`);
}
process.exit(0);
