/**
 * GET /api/admin/data                    -> { sessions, trials, stats } as JSON
 * GET /api/admin/data?format=trials      -> trials.csv   (one row per trial)
 * GET /api/admin/data?format=sessions    -> sessions.csv (one row per session)
 *
 * Admin only: requires the session cookie issued by /api/admin/login.
 */
import { errorResponse, fromError, json } from "@/lib/api";
import { isAdminAuthenticated } from "@/lib/admin-session";
import { adminStats, sessionsCsv, trialsCsv } from "@/lib/export";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return errorResponse(401, "unauthorized", "Admin login required.");
  try {
    const storage = await getStorage();
    const [sessions, trials] = await Promise.all([storage.listAllSessions(), storage.listAllTrials()]);
    const format = new URL(request.url).searchParams.get("format");
    if (format === "trials" || format === "sessions") {
      const body = format === "trials" ? trialsCsv(sessions, trials) : sessionsCsv(sessions, trials);
      return new Response(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${format}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return json({ sessions, trials, stats: adminStats(sessions, trials) });
  } catch (err) {
    return fromError(err);
  }
}
