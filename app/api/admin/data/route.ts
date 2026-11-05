/**
 * app/api/admin/data/route.ts
 *
 * GET /api/admin/data              -> { rows, stats } as JSON
 * GET /api/admin/data?format=csv   -> the same rows as a CSV download
 *
 * Admin only: requires the session cookie issued by /api/admin/login.
 */
import { errorResponse, fromError, json } from "@/lib/api";
import { isAdminAuthenticated } from "@/lib/admin-session";
import { adminRowsToCsv } from "@/lib/csv";
import { computeAdminStats } from "@/lib/stats";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Returns all collected labels plus summary statistics.
 *
 * @param request Incoming GET request (`?format=csv` selects CSV output).
 * @returns 200 JSON/CSV, or 401 without a valid admin session.
 */
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return errorResponse(401, "unauthorized", "Admin login required.");
  }
  try {
    const storage = await getStorage();
    const [rows, counts] = await Promise.all([
      storage.listAllLabelRows(),
      storage.getParticipantCounts(),
    ]);
    if (new URL(request.url).searchParams.get("format") === "csv") {
      return new Response(adminRowsToCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="emotion-labels.csv"',
          "Cache-Control": "no-store",
        },
      });
    }
    return json({ rows, stats: computeAdminStats(rows, counts) });
  } catch (err) {
    return fromError(err);
  }
}
