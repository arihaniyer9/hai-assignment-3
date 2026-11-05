"use client";
/**
 * app/error.tsx
 *
 * Route-level error boundary: shows a calm message and a retry instead of a
 * blank screen when a page throws while rendering.
 */
import Link from "next/link";

/**
 * Renders the error screen.
 *
 * @param props.reset Function that retries rendering the failed segment.
 * @returns The error content.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <h1>Something went wrong</h1>
      <p>Sorry, this page failed to load. Your saved answers are safe.</p>
      <p>
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>{" "}
        <Link href="/">Back to start</Link>
      </p>
    </div>
  );
}
