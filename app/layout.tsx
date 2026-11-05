/**
 * app/layout.tsx
 *
 * Root layout shared by every page: document shell, skip link, header with
 * navigation, main landmark, and a footer carrying the dataset citation.
 * Styles live in globals.css; the system font stack is used (no web fonts to
 * download, better privacy and speed).
 */
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Emotion Labeling Task",
    template: "%s | Emotion Labeling Task",
  },
  description:
    "A short research task: label the emotion expressed in 5 tweets from the Emotion dataset.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Wraps every page with the site chrome.
 *
 * @param props.children The current page.
 * @returns The HTML document.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning on <html>: the inline script below sets data-theme before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies a saved Light/Dark choice before first paint (no flash of the wrong theme). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject attributes into <body>
          before React loads, which would otherwise log a harmless hydration mismatch in development. */}
      <body suppressHydrationWarning>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <div className="container site-header__inner">
            <Link href="/" className="brand">
              Emotion Labeling Task
            </Link>
            <div className="site-header__right">
              <nav aria-label="Site" className="site-nav">
                <Link href="/">Task</Link>
                <Link href="/reflection">Reflection</Link>
              </nav>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>
              Tweets are from the Emotion dataset (Saravia et al., 2018,{" "}
              <a href="https://huggingface.co/datasets/dair-ai/emotion">dair-ai/emotion</a>). Course
              project for Human-AI Interaction.
            </p>
            <p>
              <Link href="/reflection">Reflection</Link> ·{" "}
              <Link href="/admin">Researcher login</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
