/**
 * app/api/participants/[id]/results/route.ts
 *
 * GET /api/participants/:id/results
 * Returns the debrief (participant's labels vs. the dataset's ground truth).
 * Refused with 403 until the participant has submitted.
 */
import { fromError, json, readParticipantId } from "@/lib/api";
import { getResults } from "@/lib/service";

export const runtime = "nodejs";

/**
 * Handles debrief lookups.
 *
 * @param _request Incoming GET request (unused).
 * @param ctx Route context holding the `id` path parameter.
 * @returns 200 `{ items }`, 403 before submission, or 404.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/participants/[id]/results">) {
  const parsed = await readParticipantId(ctx.params);
  if (parsed.response) return parsed.response;
  try {
    return json({ items: await getResults(parsed.id) });
  } catch (err) {
    return fromError(err);
  }
}
