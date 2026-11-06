/**
 * app/[condition]/page.tsx
 *
 * The two study links: /baseline (on your own) and /assisted (with the AI). Anything else is 404.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudyApp } from "@/components/study/StudyApp";
import { CONDITIONS, type Condition } from "@/lib/constants";

export const dynamicParams = false;

export function generateStaticParams() {
  return CONDITIONS.map((condition) => ({ condition }));
}

export async function generateMetadata(props: PageProps<"/[condition]">): Promise<Metadata> {
  const { condition } = await props.params;
  return { title: condition === "assisted" ? "Study with AI" : "Study" };
}

export default async function StudyPage(props: PageProps<"/[condition]">) {
  const { condition } = await props.params;
  if (!(CONDITIONS as readonly string[]).includes(condition)) notFound();
  return (
    <div className="container">
      <StudyApp condition={condition as Condition} />
    </div>
  );
}
