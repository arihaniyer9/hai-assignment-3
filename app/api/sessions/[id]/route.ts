/** GET /api/sessions/[id]: the session's resumable state (no ground truth). */
import { fromError, json, readSessionId } from "@/lib/api";
import { getSessionState } from "@/lib/service";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id, response } = await readSessionId(ctx.params);
  if (response) return response;
  try {
    return json(await getSessionState(id));
  } catch (err) {
    return fromError(err);
  }
}
