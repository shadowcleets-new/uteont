/**
 * Wrap raw agent / open-web output as explicitly UNTRUSTED data before it enters
 * the Director's planner transcript. Two protections:
 *   1. Length cap — a large worker result both inflates token cost and widens
 *      the prompt-injection surface.
 *   2. Fence-breakout neutralization — strip any embedded fence markers so the
 *      content cannot close the fence early and smuggle in instructions.
 * The planner's system prompt instructs the model that everything inside these
 * markers is data to summarize, never instructions/approval.
 */

const OPEN = "<UNTRUSTED_TOOL_OUTPUT>";
const CLOSE = "</UNTRUSTED_TOOL_OUTPUT>";

export function fenceUntrusted(content: string, maxLen = 2000): string {
  let body = content.replace(/<\/?UNTRUSTED_TOOL_OUTPUT>/gi, "[fenced]");
  if (body.length > maxLen) {
    body = `${body.slice(0, maxLen)}… [truncated ${content.length - maxLen} chars]`;
  }
  return `${OPEN}\n${body}\n${CLOSE}`;
}
