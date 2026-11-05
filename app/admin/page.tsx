/**
 * app/admin/page.tsx
 *
 * The /admin route. Authentication happens through the API (cookie session),
 * so this page is a thin shell around <AdminClient/>. It is excluded from
 * search indexing.
 */
import type { Metadata } from "next";
import { AdminClient } from "@/components/AdminClient";

export const metadata: Metadata = { title: "Researcher data", robots: { index: false, follow: false } };

/**
 * Renders the admin page.
 *
 * @returns The page content.
 */
export default function AdminPage() {
  return (
    <div className="container container--wide">
      <AdminClient />
    </div>
  );
}
