/** Shared helpers for the service tests. */
import { expect } from "vitest";
import { ServiceError } from "../lib/service";

/** Runs `fn` and returns the ServiceError it throws (fails the test if it does not throw one). */
export async function failure(fn: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ServiceError);
    return err as ServiceError;
  }
  throw new Error("expected a ServiceError");
}
