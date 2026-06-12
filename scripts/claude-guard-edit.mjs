/**
 * PreToolUse guard (LO-78). Reads a Claude Code hook event on stdin and blocks
 * Edit/Write to two classes of file:
 *   1. .env* — prevents an F-031-style secret leak via a doc/file edit.
 *   2. Already-applied migrations drizzle/00NN_*.sql — prevents a silent
 *      rewrite of applied SQL, which would desync the journal (F-034 / LO-41).
 *
 * Exit 0 = allow. Exit 2 + stderr = block with a reason (Claude Code convention).
 */

import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function filePathFrom(event) {
  const ti = event?.tool_input ?? event?.toolInput ?? {};
  return ti.file_path ?? ti.path ?? ti.filePath ?? "";
}

const raw = readStdin();
let event = {};
try {
  event = JSON.parse(raw || "{}");
} catch {
  process.exit(0); // can't parse → don't block
}

const tool = event?.tool_name ?? event?.toolName ?? "";
if (!/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) process.exit(0);

const file = String(filePathFrom(event)).replace(/\\/g, "/");

// 1. .env files (allow .env.example — it carries no secrets).
if (/(^|\/)\.env(\.[A-Za-z0-9_]+)?$/.test(file) && !/\.env\.example$/.test(file)) {
  console.error(
    `Blocked: refusing to edit ${file}. Secrets live in .env* — set them in the Vercel/Railway dashboard, not via a file edit (F-031).`,
  );
  process.exit(2);
}

// 2. Applied migrations are immutable. Author a NEW migration instead.
if (/drizzle\/00\d\d_.*\.sql$/.test(file)) {
  console.error(
    `Blocked: ${file} is an applied migration. Editing it desyncs the journal (F-034/LO-41). Add a new drizzle/00NN_*.sql migration instead.`,
  );
  process.exit(2);
}

process.exit(0);
