/** POST /api/sessions/[id]/check   Body: { answer }: the instruction check. */
import { fromError, json, readBody, readSessionId } from "@/lib/api";
import { answerCheck } from "@/lib/service";
import { checkSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/check">) {
  const { id, response } = await readSessionId(ctx.params);
  if (response) return response;
  const body = await readBody(request, checkSchema);
  if (body.response) return body.response;
  try {
    return json(await answerCheck(id, body.data.answer));
  } catch (err) {
    return fromError(err);
  }
}
