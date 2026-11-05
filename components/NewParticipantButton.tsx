"use client";
/**
 * components/NewParticipantButton.tsx
 *
 * "Start new participant (testing)" control. Clears this browser's stored
 * session so the task can be run again (e.g. by a tester or grader), without
 * touching any data already saved on the server.
 */
import { useRouter } from "next/navigation";
import { clearStoredParticipantId } from "@/lib/client-session";

/**
 * Renders a link-styled button that resets the browser session and goes home.
 *
 * @returns The button.
 */
export function NewParticipantButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn--link"
      onClick={() => {
        clearStoredParticipantId();
        router.push("/");
      }}
    >
      Start new participant (testing)
    </button>
  );
}
