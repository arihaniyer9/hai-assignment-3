/**
 * app/page.tsx
 *
 * Landing page. Participants normally arrive through one of the two study links posted in the class
 * spreadsheet; this page lists both so the order can be followed from one place.
 */
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container container--narrow">
      <h1>Satire or real? A headline study</h1>
      <p className="lede">
        Decide whether news headlines come from a satire website or a real news outlet. There are two short
        parts, about 5 minutes each. Please do both, in the order you were given, with the same code.
      </p>
      <div className="link-grid">
        <Link className="card link-card" href="/baseline">
          <h2>Part: on your own</h2>
          <p className="muted">You judge each headline by yourself.</p>
        </Link>
        <Link className="card link-card" href="/assisted">
          <h2>Part: with an AI assistant</h2>
          <p className="muted">You answer first, then see what an AI suggests, then give your final answer.</p>
        </Link>
      </div>
    </div>
  );
}
