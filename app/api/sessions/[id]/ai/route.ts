/**
 * POST /api/sessions/[id]/ai   Body: { itemId }
 * Synchronous AI: scores the headline with the A2 model now, logs the output with the trial and
 * returns it. Only after the participant's own answer is saved (assisted condition).
 */
import { fromError, json, readBody, readSessionId } from "@/lib/api";
import { showAi } from "@/lib/service";
import { aiSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/ai">) {
  const { id, response } = await readSessionId(ctx.params);
  if (response) return response;
  const body = await readBody(request, aiSchema);
  if (body.response) return body.response;
  try {
    return json({ ai: await showAi(id, body.data.itemId) });
  } catch (err) {
    return fromError(err);
  }
}
