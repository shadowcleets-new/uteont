/**
 * Zod schemas for API input validation.
 * Centralized so request handlers + clients share types.
 */

import { z } from "zod";

// --- Common -------------------------------------------------------------

export const PaginationQuery = z.object({
  limit:  z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// --- Agents -------------------------------------------------------------

export const RunAgentRequest = z.object({
  siteId: z.number().int().positive(),
  cycleId: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

// --- Cycles -------------------------------------------------------------

export const CreateCycleRequest = z.object({
  goal: z.string().min(1).max(2000),
  seedTerms: z.array(z.string().min(1)).min(1).max(50),
  siteId: z.number().int().positive(),
});

export const UpdateCycleRequest = z.object({
  status: z.enum([
    "researching", "ideas-ready", "drafting", "qa",
    "staged", "published", "archived",
  ]).optional(),
  goal: z.string().min(1).max(2000).optional(),
});

// --- Keywords -----------------------------------------------------------

export const UpdateKeywordRequest = z.object({
  status: z.enum(["researched", "approved", "in-progress", "published", "shelved"]).optional(),
  shelvedReason: z.string().max(1000).optional(),
});

// --- Ideas --------------------------------------------------------------

export const UpdateIdeaRequest = z.object({
  status: z.enum(["proposed", "approved", "rejected", "drafting", "done"]).optional(),
  rejectReason: z.string().max(1000).optional(),
});

// --- Articles -----------------------------------------------------------

export const UpdateArticleRequest = z.object({
  title:           z.string().min(1).max(500).optional(),
  body:            z.string().optional(),
  metaTitle:       z.string().max(160).optional(),
  metaDescription: z.string().max(500).optional(),
  status: z.enum([
    "draft", "qa-passed", "approved", "staged", "published", "rejected",
  ]).optional(),
});

// --- Jobs (worker) ------------------------------------------------------

export const ClaimJobRequest = z.object({
  workerId: z.string().min(1).max(200),
  agentKeys: z.array(z.string().min(1)).min(1).max(50),
});

export const CompleteJobRequest = z.object({
  result: z.record(z.string(), z.unknown()),
});

export const FailJobRequest = z.object({
  error: z.string().min(1),
  retry: z.boolean().default(true),
});

// --- Approvals ----------------------------------------------------------

export const CreateApprovalRequest = z.object({
  gate:       z.enum(["A", "B", "C", "D", "E"]),
  targetType: z.enum(["idea", "article", "change"]),
  targetId:   z.number().int().positive(),
  decision:   z.enum(["approve", "reject", "edit"]),
  note:       z.string().max(2000).optional(),
  channel:    z.enum(["web", "telegram"]).default("web"),
});

// --- QA / SEO inputs (called inline by run endpoint) --------------------

export const ArticleAnalysisInput = z.object({
  article: z.string().min(1),
  targetKeyword: z.string().optional(),
});
