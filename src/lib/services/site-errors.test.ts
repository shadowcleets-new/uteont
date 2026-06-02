import { describe, it, expect } from "vitest";
import { looksLikeKeyConflict } from "./site-errors";

describe("looksLikeKeyConflict", () => {
  it("returns true for an explicit unique-constraint violation", () => {
    expect(
      looksLikeKeyConflict('duplicate key value violates unique constraint "sites_key_unique_idx"'),
    ).toBe(true);
  });

  it("returns true for a generic duplicate-key message", () => {
    expect(looksLikeKeyConflict("ERROR: duplicate key value violates unique constraint")).toBe(true);
  });

  it("returns true when only the unique index name is present", () => {
    expect(looksLikeKeyConflict("constraint sites_key_unique_idx")).toBe(true);
  });

  // THE BUG: a transient connection failure that neon-http wraps as a generic
  // "Failed query: insert into ..." must NOT be read as a taken key, or a DB
  // outage gets mis-reported to the user as "Site key already in use".
  it("returns false for a connection failure wrapped by neon-http", () => {
    expect(
      looksLikeKeyConflict(
        'Failed query: insert into "sites" (...) — Error connecting to database: fetch failed',
      ),
    ).toBe(false);
  });

  it("returns false for a plain network error", () => {
    expect(looksLikeKeyConflict("fetch failed")).toBe(false);
  });

  it("returns false for an unrelated not-null violation", () => {
    expect(looksLikeKeyConflict('null value in column "name" violates not-null constraint')).toBe(false);
  });
});
