/**
 * POST /api/sessions   Body: { condition, code, consent: true }
 * Starts a session for this participant code and condition, or resumes the open one.
 */
import { fromError, json, readBody } from "@/lib/api";
import { startSession } from "@/lib/service";
import { startSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readBody(request, startSchema);
  if (body.response) return body.response;
  try {
    return json(await startSession(body.data), 201);
  } catch (err) {
    return fromError(err);
  }
}
