#!/usr/bin/env node
/**
 * Pre-commit secret + env guard (IP-25).
 *
 * Defense-in-depth in front of the CI gitleaks job (F-032: `--no-verify` can
 * bypass CI-only scanning, and the repo has a secret-leak history). Scans the
 * STAGED diff for the same provider-specific shapes the .gitleaks.toml rules
 * catch (Telegram tokens, Gemini keys, worker secrets, generic cloud keys) and
 * blocks the commit before the secret ever enters history. Also refuses to stage
 * real `.env*` files (only `.env.example` is allowed).
 *
 * Zero dependencies — runnable from `.githooks/pre-commit` after
 * `git config core.hooksPath .githooks`.
 *
 * Run manually: `node scripts/check-secrets.mjs`
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

// #region Patterns
const SECRET_RULES = [
  { id: "telegram-bot-token", re: /\b\d{8,15}:[A-Za-z0-9_-]{35,}\b/, hint: "Telegram bot token" },
  { id: "google-gemini-api-key", re: /\bAIzaSy[A-Za-z0-9_-]{33}\b/, hint: "Google/Gemini API key" },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/, hint: "AWS access key id" },
  { id: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, hint: "private key block" },
  { id: "generic-bearer", re: /(?i)(?:secret|token|api[_-]?key|password)\s*[=:]\s*['"][A-Za-z0-9_\-]{32,}['"]/, hint: "high-entropy secret assignment" },
];

// Files that are allowed to contain secret-shaped strings (placeholders / hashes).
const ALLOW_PATHS = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /next-env\.d\.ts$/,
  /^drizzle\/.*\.sql$/,
  /\.gitleaks\.toml$/,
  /scripts\/check-secrets\.mjs$/,
];

// Redacted placeholder tokens we deliberately ship in docs/examples.
const PLACEHOLDER = /<[A-Z_]+_REDACTED>|REDACTED|example|placeholder|your[_-]?(?:token|key|secret)/i;
// #endregion

function stagedFiles() {
  try {
    const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM"], {
      encoding: "utf8",
    });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const findings = [];

for (const file of stagedFiles()) {
  // Block staging of real env files (only .env.example is permitted).
  if (/(^|\/)\.env(\.[^/]*)?$/.test(file) && !/\.env\.example$/.test(file)) {
    findings.push({ file, line: 0, rule: "env-file", hint: "real .env* file staged — never commit env files" });
    continue;
  }
  if (ALLOW_PATHS.some((re) => re.test(file))) continue;
  if (!existsSync(file)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // binary / unreadable
  }
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (PLACEHOLDER.test(line)) return;
    for (const rule of SECRET_RULES) {
      if (rule.re.test(line)) {
        findings.push({ file, line: i + 1, rule: rule.id, hint: rule.hint });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("\n\x1b[31m✗ Commit blocked — potential secret(s) detected:\x1b[0m\n");
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}] ${f.hint}`);
  }
  console.error(
    "\nRemove the secret, move it to an env var, and stage again. If this is a\n" +
      "false positive, add an allowlist entry in scripts/check-secrets.mjs.\n" +
      "(Do NOT bypass with --no-verify — the CI gitleaks job will block the push too.)\n",
  );
  process.exit(1);
}

process.exit(0);
