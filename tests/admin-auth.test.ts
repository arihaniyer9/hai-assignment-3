/**
 * tests/admin-auth.test.ts — admin password check and signed session tokens.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_TTL_MS,
  createAdminToken,
  isAdminConfigured,
  verifyAdminPassword,
  verifyAdminToken,
} from "../lib/admin-auth";

const saved = { pw: process.env.ADMIN_PASSWORD, secret: process.env.ADMIN_SESSION_SECRET };
beforeEach(() => {
  process.env.ADMIN_PASSWORD = "correct horse";
  process.env.ADMIN_SESSION_SECRET = "test-secret";
});
afterEach(() => {
  process.env.ADMIN_PASSWORD = saved.pw;
  process.env.ADMIN_SESSION_SECRET = saved.secret;
});

describe("verifyAdminPassword", () => {
  it("accepts only the configured password", () => {
    expect(verifyAdminPassword("correct horse")).toBe(true);
    expect(verifyAdminPassword("wrong")).toBe(false);
    expect(verifyAdminPassword("")).toBe(false);
  });
  it("rejects everything when no password is configured", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(isAdminConfigured()).toBe(false);
    expect(verifyAdminPassword("anything")).toBe(false);
  });
});

describe("admin session tokens", () => {
  it("accepts a fresh token", () => {
    expect(verifyAdminToken(createAdminToken())).toBe(true);
  });
  it("rejects an expired token", () => {
    const now = 1_000_000;
    const token = createAdminToken(now);
    expect(verifyAdminToken(token, now + ADMIN_SESSION_TTL_MS - 1)).toBe(true);
    expect(verifyAdminToken(token, now + ADMIN_SESSION_TTL_MS + 1)).toBe(false);
  });
  it("rejects tampered, foreign-secret and malformed tokens", () => {
    const token = createAdminToken();
    const [expiry, sig] = token.split(".");
    expect(verifyAdminToken(`${Number(expiry) + 9999}.${sig}`)).toBe(false);
    process.env.ADMIN_SESSION_SECRET = "different-secret";
    expect(verifyAdminToken(token)).toBe(false);
    expect(verifyAdminToken(undefined)).toBe(false);
    expect(verifyAdminToken("garbage")).toBe(false);
    expect(verifyAdminToken("123.zzzz")).toBe(false);
  });
});
