/**
 * app/api/admin/logout/route.ts
 *
 * POST /api/admin/logout — expires the admin session cookie.
 */
import { json } from "@/lib/api";
import { clearAdminCookie } from "@/lib/admin-session";

export const runtime = "nodejs";

/**
 * Handles admin logout.
 *
 * @returns 200 with the cookie cleared.
 */
export async function POST() {
  return clearAdminCookie(json({ ok: true }));
}
