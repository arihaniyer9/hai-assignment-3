/**
 * GET /api/results?code=otter-42
 * Every headline of both parts with the participant's answer, the correct answer and the AI's
 * answer. Refused (403) until the code has finished both parts.
 */
import { errorResponse, fromError, json } from "@/lib/api";
import { getResults } from "@/lib/service";
import { codeSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const parsed = codeSchema.safeParse(new URL(request.url).searchParams.get("code") ?? "");
  if (!parsed.success) return errorResponse(400, "invalid_input", "Please enter a valid code.");
  try {
    return json(await getResults(parsed.data));
  } catch (err) {
    return fromError(err);
  }
}
