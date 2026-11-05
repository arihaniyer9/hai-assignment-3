/**
 * app/task/page.tsx
 *
 * The /task route. All logic lives in <TaskClient/> because the participant's
 * session is stored in the browser.
 */
import type { Metadata } from "next";
import { TaskClient } from "@/components/TaskClient";

export const metadata: Metadata = { title: "Label tweets" };

/**
 * Renders the labeling task page.
 *
 * @returns The page content.
 */
export default function TaskPage() {
  return <TaskClient />;
}
