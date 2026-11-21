/** app/results/page.tsx: a participant's results for both parts (unlocked after both). */
import type { Metadata } from "next";
import { ResultsView } from "@/components/ResultsView";

export const metadata: Metadata = { title: "Your results", robots: { index: false, follow: false } };

export default async function ResultsPage(props: PageProps<"/results">) {
  const raw = (await props.searchParams).session;
  const session = typeof raw === "string" ? raw.trim() : "";
  return (
    <div className="container container--wide">
      <ResultsView initialSession={session} />
    </div>
  );
}
