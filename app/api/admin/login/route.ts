/**
 * app/api/admin/login/route.ts
 *
 * POST /api/admin/login   Body: { password }
 * Exchanges the shared admin password for an HttpOnly session cookie.
 */
import { errorResponse, json, readBody } from "@/lib/api";
import { isAdminConfigured, verifyAdminPassword } from "@/lib/admin-auth";
import { setAdminCookie } from "@/lib/admin-session";
import { adminLoginSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Delay before answering a wrong password, so guessing is slow. */
const FAILED_LOGIN_DELAY_MS = 1000;

/**
 * Handles admin login.
 *
 * @param request Incoming POST request.
 * @returns 200 with the cookie set, 401 for a wrong password, 503 when the
 *   server has no ADMIN_PASSWORD configured.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return errorResponse(503, "admin_not_configured", "Admin access is not configured on this server.");
  }
  const body = await readBody(request, adminLoginSchema);
  if (body.response) return body.response;
  if (!verifyAdminPassword(body.data.password)) {
    // Slow down password guessing: every failed attempt costs a second.
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return errorResponse(401, "unauthorized", "Incorrect password.");
  }
  return setAdminCookie(json({ ok: true }));
}
