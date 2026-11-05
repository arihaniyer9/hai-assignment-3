/**
 * app/api/participants/[id]/route.ts
 *
 * GET /api/participants/:id
 * Returns the participant's resumable state: their 5 tweets, any labels saved
 * so far, and whether they have already submitted. Contains NO ground truth.
 */
import { fromError, json, readParticipantId } from "@/lib/api";
import { getParticipantState } from "@/lib/service";

export const runtime = "nodejs";

/**
 * Handles session resume lookups.
 *
 * @param _request Incoming GET request (unused).
 * @param ctx Route context holding the `id` path parameter.
 * @returns 200 with the participant state, or 404.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/participants/[id]">) {
  const parsed = await readParticipantId(ctx.params);
  if (parsed.response) return parsed.response;
  try {
    return json(await getParticipantState(parsed.id));
  } catch (err) {
    return fromError(err);
  }
}
