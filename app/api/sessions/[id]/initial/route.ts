/** PUT /api/sessions/[id]/initial   Body: { itemId, answer, confidence, timeMs }: the participant's own answer. */
import { fromError, json, readBody, readSessionId } from "@/lib/api";
import { saveInitial } from "@/lib/service";
import { answerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(request: Request, ctx: RouteContext<"/api/sessions/[id]/initial">) {
  const { id, response } = await readSessionId(ctx.params);
  if (response) return response;
  const body = await readBody(request, answerSchema);
  if (body.response) return body.response;
  try {
    await saveInitial(id, body.data);
    return json({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
