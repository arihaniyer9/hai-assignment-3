/**
 * app/api/participants/route.ts
 *
 * POST /api/participants
 * Body: { nickname?: string, consent: true }
 * Registers a participant, draws their 5 random tweets and returns them
 * (without ground truth) together with the new anonymous participant ID.
 */
import { fromError, json, readBody } from "@/lib/api";
import { startParticipant } from "@/lib/service";
import { createParticipantSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Handles participant registration.
 *
 * @param request Incoming POST request.
 * @returns 201 with `{ participantId, tweets }`, or an error response.
 */
export async function POST(request: Request) {
  const body = await readBody(request, createParticipantSchema);
  if (body.response) return body.response;
  try {
    return json(await startParticipant(body.data), 201);
  } catch (err) {
    return fromError(err);
  }
}
