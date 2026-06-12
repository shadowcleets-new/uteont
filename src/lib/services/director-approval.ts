/**
 * @file director-approval.ts
 * @description Explicit per-batch approval detection for the Director (LO-55 /
 * audit A-07). The Director only dispatches an execute batch when the USER has
 * said go THIS turn — never on a sticky conversation flag and never because the
 * model alone emitted intent:"execute". This is the human checkpoint that
 * closes the indirect-prompt-injection surface: injected job/web content can
 * fabricate an "execute" intent, but it cannot make the user type an approval.
 */

// Short, intent-bearing approval phrases. We match the WHOLE message (trimmed,
// lowercased, punctuation-stripped) against these so an approval word buried in
// a longer instruction or an injected job result does NOT count as a go.
const APPROVAL_PHRASES = new Set([
  "go", "go ahead", "goahead", "approve", "approved", "proceed", "do it",
  "doit", "ship it", "shipit", "yes", "yes go", "yes run it", "yes proceed",
  "run it", "runit", "execute", "execute it", "run", "confirm", "confirmed",
  "ok go", "okay go", "lgtm", "send it", "make it so", "go for it",
]);

export function isApprovalMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const norm = message
    .trim()
    .toLowerCase()
    .replace(/[!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return false;
  if (APPROVAL_PHRASES.has(norm)) return true;
  // Allow a leading affirmative + go ("yes, go ahead", "ok, proceed").
  const stripped = norm.replace(/^(yes|ok|okay|sure)[,\s]+/, "").trim();
  return APPROVAL_PHRASES.has(stripped);
}
