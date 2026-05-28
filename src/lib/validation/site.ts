import { z } from "zod";

export const CMS_PLATFORMS = [
  "wordpress", "vercel", "shopify", "webflow", "ghost", "static", "none",
] as const;

export const siteCreateSchema = z.object({
  key: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens"),
  name: z.string().min(1).max(120),
  domain: z.string().url(),
  locale: z.string().min(2).max(20),
  cmsPlatform: z.enum(CMS_PLATFORMS).default("none"),
  niche: z.string().max(400).optional(),
  audience: z.string().max(400).optional(),
  voiceGuide: z.string().max(2000).optional(),
  contentPillars: z.array(z.string().min(1).max(80)).max(20).default([]),
  bannedPhrases: z.array(z.string().min(1).max(120)).max(100).default([]),
  defaultCategories: z.array(z.string().min(1).max(80)).max(50).default([]),
  sitemapUrl: z.string().url().optional(),
  gscPropertyId: z.string().max(200).optional(),
  ga4PropertyId: z.string().max(200).optional(),
});

export const siteUpdateSchema = siteCreateSchema
  .partial()
  .omit({ key: true, domain: true, cmsPlatform: true });
  // key/domain/cmsPlatform immutable post-creation (per spec §3)

export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
