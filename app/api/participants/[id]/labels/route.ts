/**
 * app/api/participants/[id]/labels/route.ts
 *
 * PUT /api/participants/:id/labels
 * Body: { tweetId, label, confidence (1-5), rationale?, timeSpentMs }
 * Saves (creates or overwrites) the participant's label for one assigned tweet.
 * Idempotent, so the client can safely retry after a network failure.
 */
import { fromError, json, readBody, readParticipantId } from "@/lib/api";
import { saveLabel } from "@/lib/service";
import { labelSubmitSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Handles saving one label.
 *
 * @param request Incoming PUT request.
 * @param ctx Route context holding the `id` path parameter.
 * @returns 200 `{ ok: true }`, or 400/403/404/409.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/participants/[id]/labels">) {
  const parsed = await readParticipantId(ctx.params);
  if (parsed.response) return parsed.response;
  const body = await readBody(request, labelSubmitSchema);
  if (body.response) return body.response;
  try {
    await saveLabel(parsed.id, body.data);
    return json({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
