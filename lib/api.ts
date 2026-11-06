/**
 * lib/api.ts
 *
 * Small helpers shared by all route handlers: JSON responses with no-store
 * caching, uniform error bodies, ServiceError -> HTTP status mapping, and
 * request-body / path-parameter validation.
 *
 * Error bodies always look like `{ "error": { "code": "...", "message": "..." } }`
 * and never leak internal details.
 */
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ServiceError, type ServiceErrorCode } from "./service";
import { sessionIdSchema } from "./validation";

/** HTTP status for each ServiceError category. */
const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid: 400,
  unavailable: 503,
};

/**
 * Builds a JSON response that must never be cached (all data is per-session).
 *
 * @param data JSON-serialisable body.
 * @param status HTTP status (default 200).
 * @returns The response.
 */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Builds a uniform JSON error response.
 *
 * @param status HTTP status.
 * @param code Short machine-readable code.
 * @param message Human-readable, safe-to-display message.
 * @returns The response.
 */
export function errorResponse(status: number, code: string, message: string): NextResponse {
  return json({ error: { code, message } }, status);
}

/**
 * Converts anything thrown by a handler into a response: expected
 * ServiceErrors keep their message, everything else becomes a generic 500
 * (details are logged server-side only).
 *
 * @param err The caught value.
 * @returns The response.
 */
export function fromError(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    return errorResponse(STATUS_BY_CODE[err.code], err.code, err.message);
  }
  console.error("Unhandled API error:", err);
  return errorResponse(500, "server_error", "Something went wrong. Please try again.");
}

/**
 * Parses and validates a JSON request body.
 *
 * @param request The incoming request.
 * @param schema zod schema describing the expected body.
 * @returns `{ data }` on success, or `{ response }` (a 400) to return immediately.
 */
export async function readBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T; response?: undefined } | { data?: undefined; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: errorResponse(400, "invalid_json", "Request body must be valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: errorResponse(400, "invalid_input", "Some of the submitted values are not valid.") };
  }
  return { data: parsed.data };
}

/**
 * Validates the `[id]` path segment as a session ID.
 *
 * @param params The route's params promise (`{ id }`).
 * @returns The ID, or a 404 response for malformed IDs (indistinguishable from unknown ones).
 */
export async function readSessionId(
  params: Promise<{ id: string }>,
): Promise<{ id: string; response?: undefined } | { id?: undefined; response: NextResponse }> {
  const parsed = sessionIdSchema.safeParse((await params).id);
  if (!parsed.success) return { response: errorResponse(404, "not_found", "Session not found.") };
  return { id: parsed.data };
}
