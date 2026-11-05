/**
 * lib/admin-auth.ts
 *
 * Pure (framework-free) admin authentication primitives.
 *
 * The admin area is protected by one shared password (env `ADMIN_PASSWORD`).
 * A successful login is exchanged for a stateless session token:
 *
 *     <expiresAtMs>.<hex HMAC-SHA256 of expiresAtMs, keyed with ADMIN_SESSION_SECRET>
 *
 * stored in an HttpOnly cookie. Cookie handling lives in `admin-session.ts`.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** How long an admin session stays valid (8 hours). */
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Name of the admin session cookie. */
export const ADMIN_COOKIE = "admin_session";

/**
 * Returns the HMAC key. In production a missing secret is a configuration
 * error; in development a fixed fallback keeps `npm run dev` working.
 *
 * @returns The secret string.
 * @throws Error in production when ADMIN_SESSION_SECRET is not set.
 */
function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET is not set");
  }
  return "dev-only-insecure-secret";
}

/**
 * Whether an admin password has been configured at all.
 *
 * @returns True when `ADMIN_PASSWORD` is set and non-empty.
 */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/**
 * Compares a submitted password with `ADMIN_PASSWORD` in constant time
 * (both sides are hashed first so the lengths always match).
 *
 * @param input The password typed by the admin.
 * @returns True only when a password is configured and matches.
 */
export function verifyAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Computes the HMAC signature for an expiry timestamp.
 *
 * @param expiresAt Expiry as epoch milliseconds (already stringified).
 * @returns Hex signature.
 */
function sign(expiresAt: string): string {
  return createHmac("sha256", getSecret()).update(expiresAt).digest("hex");
}

/**
 * Creates a signed session token that expires after {@link ADMIN_SESSION_TTL_MS}.
 *
 * @param now Current time in epoch ms (injectable for tests).
 * @returns The token string.
 */
export function createAdminToken(now: number = Date.now()): string {
  const expiresAt = String(now + ADMIN_SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

/**
 * Checks a token's signature (constant time) and expiry.
 *
 * @param token The cookie value, possibly undefined or malformed.
 * @param now Current time in epoch ms (injectable for tests).
 * @returns True when the token is genuine and not expired.
 */
export function verifyAdminToken(token: string | undefined, now: number = Date.now()): boolean {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  const expected = Buffer.from(sign(expiresAt), "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return Number(expiresAt) > now;
}
