import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";
import fs from "fs";

// Load .env.local for tests
const envLocalPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
  Object.assign(process.env, envConfig);
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      exclude: ["**/*.test.ts", "**/node_modules/**", "**/.next/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
