import type { Config } from "drizzle-kit";
import { config as loadDotenv } from "dotenv";

// drizzle-kit CLI doesn't load .env.local by default. Next.js does at runtime,
// but kit runs outside Next, so we load it here.
loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
} satisfies Config;
