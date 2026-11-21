/**
 * GET /api/results?session=S-XXXXXX
 * Every headline of both parts with the participant's answer, the correct answer and the AI's
 * answer. Looked up by a session id (held only by the participant's browser), never by the code.
 * Refused (403) until that participant has finished both parts.
 */
import { errorResponse, fromError, json } from "@/lib/api";
import { getResults } from "@/lib/service";
import { sessionIdSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const parsed = sessionIdSchema.safeParse(new URL(request.url).searchParams.get("session") ?? "");
  if (!parsed.success) return errorResponse(404, "not_found", "Results not found.");
  try {
    return json(await getResults(parsed.data));
  } catch (err) {
    return fromError(err);
  }
}
