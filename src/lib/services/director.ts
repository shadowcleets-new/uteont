/**
 * Director Agent — the user's single point of contact.
 *
 * Pattern: ReAct-style planner with structured JSON output. Each turn,
 * Gemini receives the conversation history + a system prompt describing
 * the tools it can call. It returns a structured intent + optional actions.
 *
 * Permission model (per operator setting): HYBRID
 *   - First plan in a conversation: propose → wait for user "go"
 *   - Once `planApproved = true`: run-and-report follow-ups in same thread
 *
 * Voice: strategist + tactical operator — concise, structured, action-first.
 */

import { completeJson, GeminiError } from "./gemini";
import {
  appendMessage,
  getMessages,
  updateConversation,
  getConversationWithSite,
  type AppendMessageInput,
} from "./conversations";
import { dispatchAgentJob } from "./jobs";
import type { Conversation, Message, Site } from "@/lib/db/schema";

// --- system prompt --------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are UTEONT's Director Agent — the user's single point of contact for SEO operations.

VOICE
- Concise + structured (strategist) and action-first (tactical operator)
- Lead with the verb when proposing action. No "I will" preamble
- State your reasoning explicitly: choose X because Y
- Ask single-focused, sharp clarifying questions when goal is underspecified
- Never hedge or apologize
- Plain prose. No emoji. No marketing fluff. Bullet lists only when truly enumerating

ROLE
You decompose the user's natural-language goal into a sequence of agent dispatches.
The user has six agents available to dispatch (listed below). You DO NOT do any
SEO work yourself — you orchestrate.

PERMISSION MODEL (hybrid)
- FIRST message of a new conversation:
  * If goal is underspecified, ask ONE clarifying question (intent: "ask")
  * Otherwise PROPOSE a plan (intent: "propose"). Do not execute yet.
  * Wait for user to say "go", "approved", "proceed", or similar before executing
- AFTER plan is approved (you will see prior assistant message with intent "execute"):
  * Run-and-report — execute follow-up dispatches directly (intent: "execute"),
    then report (intent: "report")
- When jobs complete and system messages arrive: synthesize the results into a
  natural-language report (intent: "report")

TOOLS YOU CAN DISPATCH

  research(seeds: string[], maxResults?: number)
    Discovers keyword opportunities from free sources (Google Trends, Wikipedia, Reddit)
    Use when: starting a new topic, expanding seed terms, finding ranking opportunities

  idea_generation(keywords: string[], nPerKeyword?: number)
    Turns approved keywords into article angles + briefs (uses Gemini, free tier)
    Use when: you have approved keywords and need article concepts

  content_writing(title: string, brief: string, targetKeyword: string, wordTarget?: number)
    Drafts a full markdown article (uses Gemini)
    Use when: an idea is approved and ready to draft

  qa_validation(article: string, targetKeyword?: string)
    Pure-Python checks: Flesch readability, passive voice, policy, target keyword presence
    Use when: a draft is written and needs quality gate before SEO polish

  seo_optimization(article: string, targetKeyword?: string)
    Deterministic SEO lint + meta description + JSON-LD schema generation
    Use when: a draft has passed QA and needs SEO polish

  outreach(targetSite: string, context: string, ourValue: string)
    Drafts a personalized outreach email (never sends — human review required)
    Use when: link-building campaign needs an email draft

OUTPUT
Always return JSON with this exact shape, nothing else:
{
  "intent": "ask" | "propose" | "execute" | "report",
  "text": "natural-language message to send to user (markdown OK, no triple-backticks)",
  "actions": [
    { "tool": "research" | "idea_generation" | "content_writing" | "qa_validation" | "seo_optimization" | "outreach",
      "args": { ... } }
  ]
}

- intent="ask": text is the clarifying question. actions: []
- intent="propose": text is the proposed plan in bullet form. actions: []
- intent="execute": text is a one-line confirmation of what you're dispatching.
  actions: one or more tool calls to enqueue right now
- intent="report": text is a results summary or next-step suggestion. actions: optional follow-ups
`;

export function buildSystemPrompt(site: Site | null): string {
  if (!site) {
    return [
      BASE_SYSTEM_PROMPT,
      "",
      "NO SITE SELECTED",
      "No site selected yet for this conversation. If the user describes site-specific work, ask which site (one focused question, then propose).",
    ].join("\n");
  }
  const siteBlock = [
    "SITE CONTEXT",
    `- Name: ${site.name}`,
    `- Domain: ${site.domain}`,
    `- Locale: ${site.locale}`,
    site.niche ? `- Niche: ${site.niche}` : null,
    site.audience ? `- Audience: ${site.audience}` : null,
    site.voiceGuide ? `- Voice: ${site.voiceGuide}` : null,
    site.contentPillars.length > 0
      ? `- Content pillars: ${site.contentPillars.join(", ")}`
      : null,
    site.bannedPhrases.length > 0
      ? `- Banned phrases: ${site.bannedPhrases.map((p) => `"${p}"`).join(", ")}`
      : null,
    site.defaultCategories.length > 0
      ? `- Default categories: ${site.defaultCategories.join(", ")}`
      : null,
    "",
    "All proposed work is for this site unless the user explicitly redirects to a different one. When dispatching agents, the site context above flows to the worker in the job payload — you don't need to repeat it in args.",
  ].filter(Boolean).join("\n");
  return [siteBlock, "", BASE_SYSTEM_PROMPT].join("\n");
}

// --- types ----------------------------------------------------------------

type DirectorIntent = "ask" | "propose" | "execute" | "report";

interface DirectorPlannedAction {
  tool:
    | "research"
    | "idea_generation"
    | "content_writing"
    | "qa_validation"
    | "seo_optimization"
    | "outreach";
  args: Record<string, unknown>;
}

interface DirectorResponse {
  intent: DirectorIntent;
  text: string;
  actions?: DirectorPlannedAction[];
}

// Map of tool name → agent key in the existing registry.
const TOOL_TO_AGENT: Record<DirectorPlannedAction["tool"], string> = {
  research: "research",
  idea_generation: "idea-generation",
  content_writing: "content-writing",
  qa_validation: "qa",
  seo_optimization: "seo-optimization",
  outreach: "backlink",
};

// --- main planning loop ---------------------------------------------------

interface PlanInput {
  conversation: Conversation;
  history: Message[];
  newUserMessage: string;
  surface: "web" | "telegram";
}

/**
 * Run one Director turn:
 *   1. Append the user message
 *   2. Build conversation transcript for Gemini
 *   3. Call Gemini for the structured plan
 *   4. If actions present and plan is approved, enqueue jobs
 *   5. Append assistant message
 *   6. Return the assistant message
 */
export async function runDirectorTurn(
  input: PlanInput,
): Promise<{ message: Message; response: DirectorResponse }> {
  const { conversation: _conv, site } = await getConversationWithSite(input.conversation.id);

  // 1. Persist the user's message
  await appendMessage({
    conversationId: input.conversation.id,
    role: "user",
    content: input.newUserMessage,
    surface: input.surface,
  });

  // 2. Build transcript for Gemini
  const transcriptLines: string[] = [];
  for (const m of input.history) {
    transcriptLines.push(`[${m.role}] ${m.content}`);
  }
  transcriptLines.push(`[user] ${input.newUserMessage}`);
  if (input.conversation.planApproved) {
    transcriptLines.push(
      `[system] Plan has been approved by the user; run-and-report mode active.`,
    );
  } else {
    transcriptLines.push(
      `[system] No plan approved yet; if proposing, wait for user approval before executing.`,
    );
  }
  const transcript = transcriptLines.join("\n");

  // 3. Ask Gemini
  let parsed: DirectorResponse;
  try {
    const { data } = await completeJson<DirectorResponse>(transcript, {
      systemInstruction: buildSystemPrompt(site),
      temperature: 0.4,
      maxOutputTokens: 2048,
      responseSchema: {
        type: "object",
        required: ["intent", "text"],
        properties: {
          intent: { type: "string", enum: ["ask", "propose", "execute", "report"] },
          text: { type: "string" },
          actions: {
            type: "array",
            items: {
              type: "object",
              required: ["tool", "args"],
              properties: {
                tool: {
                  type: "string",
                  enum: [
                    "research",
                    "idea_generation",
                    "content_writing",
                    "qa_validation",
                    "seo_optimization",
                    "outreach",
                  ],
                },
                args: { type: "object" },
              },
            },
          },
        },
      },
    });
    parsed = data;
  } catch (e) {
    const msg = e instanceof GeminiError ? e.message : String(e);
    // Persist an error message so the user sees something
    const errMessage = await appendMessage({
      conversationId: input.conversation.id,
      role: "assistant",
      content: `(Director couldn't plan: ${msg.slice(0, 200)})`,
      payload: { error: msg },
      surface: input.surface,
    });
    return {
      message: errMessage,
      response: { intent: "report", text: errMessage.content },
    };
  }

  // 4. If actions are present and we have permission to execute, dispatch.
  const enqueued: Array<{
    tool: string;
    jobId?: number;
    runId?: number;
    args: Record<string, unknown>;
    cached?: boolean;
  }> = [];
  const cachedResults: Array<{
    agentKey: string;
    result: Record<string, unknown>;
    sourceJobId: number | null;
  }> = [];
  if (
    parsed.intent === "execute" &&
    parsed.actions &&
    parsed.actions.length > 0
  ) {
    for (const action of parsed.actions) {
      const agentKey = TOOL_TO_AGENT[action.tool];
      if (!agentKey) continue;
      if (!site) {
        console.warn("Director enqueue blocked: conversation has no site", input.conversation.id);
        continue;
      }
      const siteSnapshot = {
        id: site.id,
        key: site.key,
        name: site.name,
        domain: site.domain,
        locale: site.locale,
        niche: site.niche,
        audience: site.audience,
        voiceGuide: site.voiceGuide,
        contentPillars: site.contentPillars,
        bannedPhrases: site.bannedPhrases,
      };
      const dispatch = await dispatchAgentJob({
        agentKey,
        siteId: site.id,
        payload: {
          ...action.args,
          _directorContext: { conversationId: input.conversation.id },
          site: siteSnapshot,
        },
      });
      if (dispatch.mode === "cached") {
        enqueued.push({ tool: action.tool, runId: dispatch.runId, args: action.args, cached: true });
        cachedResults.push({ agentKey, result: dispatch.result, sourceJobId: dispatch.sourceJobId });
      } else {
        enqueued.push({ tool: action.tool, jobId: dispatch.job.id, args: action.args });
      }
    }
    // Mark plan as approved (first execute crosses the approval threshold)
    if (!input.conversation.planApproved) {
      await updateConversation(input.conversation.id, { planApproved: true });
    }
  }

  // 5. Persist the assistant message
  const assistantPayload: AppendMessageInput["payload"] = {
    intent: parsed.intent,
    actions: parsed.actions ?? [],
    enqueued,
  };

  const assistantMsg = await appendMessage({
    conversationId: input.conversation.id,
    role: "assistant",
    content: parsed.text,
    payload: assistantPayload,
    surface: input.surface,
  });

  // Cache hits resolved synchronously. The replay suppressed its own
  // conversation message to preserve ordering; post the job-completed system
  // messages now, AFTER the assistant "executing" message.
  for (const c of cachedResults) {
    try {
      await appendMessage({
        conversationId: input.conversation.id,
        role: "system",
        content: `${c.agentKey} (cached) completed`,
        payload: {
          kind: "job-completed",
          agentKey: c.agentKey,
          jobId: c.sourceJobId,
          result: c.result,
          cached: true,
        },
      });
    } catch (e) {
      console.warn("Director: cached job-completed append failed", e);
    }
  }

  // Update conversation title/goal if first turn
  if (!input.conversation.goal && input.newUserMessage.length > 0) {
    await updateConversation(input.conversation.id, {
      goal: input.newUserMessage.slice(0, 240),
      title: input.newUserMessage.slice(0, 60),
    });
  }

  return { message: assistantMsg, response: parsed };
}

/** Convenience: re-plan based on existing transcript without a new user msg. */
export async function runDirectorReport(
  conversation: Conversation,
  systemEvent: { kind: string; jobId: number; result: unknown },
): Promise<Message> {
  const history = await getMessages(conversation.id, 60);
  const eventText = `[system] Job ${systemEvent.jobId} finished (${systemEvent.kind}). Result summary: ${JSON.stringify(systemEvent.result).slice(0, 1000)}`;
  // Insert as a system message so the user sees the event landed
  await appendMessage({
    conversationId: conversation.id,
    role: "system",
    content: eventText,
    payload: systemEvent as never,
    surface: "web",
  });
  const { message } = await runDirectorTurn({
    conversation,
    history,
    newUserMessage:
      "Job completed — summarize what came back and propose the next step.",
    surface: "web",
  });
  return message;
}
