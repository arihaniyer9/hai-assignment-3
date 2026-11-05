/**
 * lib/admin-session.ts
 *
 * Glue between the pure admin-auth primitives and Next.js cookies. Used only
 * by route handlers.
 */
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createAdminToken,
  verifyAdminToken,
} from "./admin-auth";

/**
 * Reads the request's admin cookie and validates it.
 *
 * @returns True when the current request carries a valid admin session.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

/**
 * Attaches a fresh admin session cookie (HttpOnly, SameSite=Lax, Secure in
 * production) to a response.
 *
 * @param response The response to modify.
 * @returns The same response, for chaining.
 */
export function setAdminCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(ADMIN_COOKIE, createAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
  return response;
}

/**
 * Expires the admin session cookie on a response (logout).
 *
 * @param response The response to modify.
 * @returns The same response, for chaining.
 */
export function clearAdminCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
