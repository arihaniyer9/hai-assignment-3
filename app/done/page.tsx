/**
 * app/done/page.tsx
 *
 * The /done route: thank-you and debrief after submission.
 */
import type { Metadata } from "next";
import { Debrief } from "@/components/Debrief";

export const metadata: Metadata = { title: "Thank you" };

/**
 * Renders the debrief page.
 *
 * @returns The page content.
 */
export default function DonePage() {
  return (
    <div className="container">
      <Debrief />
    </div>
  );
}
