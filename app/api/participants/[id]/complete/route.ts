/**
 * app/api/participants/[id]/complete/route.ts
 *
 * POST /api/participants/:id/complete
 * Final submit. Requires all 5 tweets to be labeled, locks the session, and
 * returns the debrief (the first time ground truth is revealed).
 */
import { fromError, json, readParticipantId } from "@/lib/api";
import { completeParticipant } from "@/lib/service";

export const runtime = "nodejs";

/**
 * Handles final submission.
 *
 * @param _request Incoming POST request (unused).
 * @param ctx Route context holding the `id` path parameter.
 * @returns 200 `{ items }`, or 400 when tweets are unlabeled / 404.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/participants/[id]/complete">) {
  const parsed = await readParticipantId(ctx.params);
  if (parsed.response) return parsed.response;
  try {
    return json({ items: await completeParticipant(parsed.id) });
  } catch (err) {
    return fromError(err);
  }
}
