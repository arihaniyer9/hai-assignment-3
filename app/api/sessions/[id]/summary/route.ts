/** GET /api/sessions/[id]/summary: the score of a completed session. */
import { fromError, json, readSessionId } from "@/lib/api";
import { getSummary } from "@/lib/service";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/summary">) {
  const { id, response } = await readSessionId(ctx.params);
  if (response) return response;
  try {
    return json(await getSummary(id));
  } catch (err) {
    return fromError(err);
  }
}
