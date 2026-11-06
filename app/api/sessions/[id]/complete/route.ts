/** POST /api/sessions/[id]/complete   Body: { comment? }: finishes the session, returns the score. */
import { fromError, json, readBody, readSessionId } from "@/lib/api";
import { completeSession } from "@/lib/service";
import { completeSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/complete">) {
  const { id, response } = await readSessionId(ctx.params);
  if (response) return response;
  const body = await readBody(request, completeSchema);
  if (body.response) return body.response;
  try {
    return json(await completeSession(id, body.data.comment));
  } catch (err) {
    return fromError(err);
  }
}
