/**
 * app/not-found.tsx
 *
 * Friendly 404 page.
 */
import Link from "next/link";

/**
 * Renders the "page not found" screen.
 *
 * @returns The 404 content.
 */
export default function NotFound() {
  return (
    <div className="container">
      <h1>Page not found</h1>
      <p>We could not find that page.</p>
      <Link href="/" className="btn btn--primary">
        Go to the start
      </Link>
    </div>
  );
}
