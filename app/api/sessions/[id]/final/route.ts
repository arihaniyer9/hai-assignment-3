/** PUT /api/sessions/[id]/final   Body: { itemId, answer, confidence, timeMs }: the answer after seeing the AI. */
import { fromError, json, readBody, readSessionId } from "@/lib/api";
import { saveFinal } from "@/lib/service";
import { answerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(request: Request, ctx: RouteContext<"/api/sessions/[id]/final">) {
  const { id, response } = await readSessionId(ctx.params);
  if (response) return response;
  const body = await readBody(request, answerSchema);
  if (body.response) return body.response;
  try {
    await saveFinal(id, body.data);
    return json({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
