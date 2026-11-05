/**
 * app/reflection/page.tsx
 *
 * The /reflection route (bonus): renders `content/reflection.md`, so the essay
 * can be edited as plain Markdown without touching any React code.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { renderMarkdown } from "@/lib/mini-markdown";

export const metadata: Metadata = { title: "Reflection" };

/**
 * Reads the Markdown file at build/render time and renders it.
 *
 * @returns The reflection page.
 */
export default function ReflectionPage() {
  const source = readFileSync(path.join(process.cwd(), "content", "reflection.md"), "utf8");
  return <div className="container container--narrow prose">{renderMarkdown(source)}</div>;
}
