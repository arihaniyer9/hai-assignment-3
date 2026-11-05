/**
 * app/page.tsx
 *
 * Home page: plain-language instructions, what data is recorded, a content
 * notice, the emotion guide, and the consent/start panel. Everything except
 * <StartPanel/> is static server-rendered content.
 */
import { EmotionGuide } from "@/components/EmotionGuide";
import { StartPanel } from "@/components/StartPanel";
import { TWEETS_PER_PARTICIPANT } from "@/lib/constants";

/**
 * Renders the instructions + consent page.
 *
 * @returns The page content.
 */
export default function HomePage() {
  return (
    <div className="container">
      <div className="home-grid">
        <div className="home-grid__main">
          <h1>Label the emotion in {TWEETS_PER_PARTICIPANT} tweets</h1>
          <p className="lede">
            A short study (about 3 minutes). You will read a few tweets and tell us which emotion
            you think each one expresses.
          </p>

          <section className="card" aria-labelledby="how">
            <h2 id="how">What you will do</h2>
            <ol>
              <li>
                You will see <strong>{TWEETS_PER_PARTICIPANT} tweets</strong>, one at a time. They
                are picked at random, so other participants will see different ones.
              </li>
              <li>
                For each tweet, choose the <strong>one emotion the writer is expressing</strong>:
                anger, fear, joy, love, sadness or surprise. If none fits, or you cannot tell,
                choose “None of these / Unsure”.
              </li>
              <li>Say how sure you are (1 to 5). Optionally add a few words about why.</li>
              <li>
                Submit at the end. You can go back and change earlier answers before submitting.
              </li>
            </ol>
            <p className="muted">
              There are no right or wrong answers. We are interested in <em>your</em> reading of
              each tweet. The tweets are short and lowercase, with no punctuation, exactly as they
              appear in the dataset.
            </p>
          </section>

          <section className="card" aria-labelledby="guide">
            <h2 id="guide">Emotion guide</h2>
            <p className="muted small">You can open this guide again at any time while labeling.</p>
            <EmotionGuide />
          </section>

          <section className="card" aria-labelledby="data">
            <h2 id="data">What we record, and your rights</h2>
            <ul>
              <li>
                An anonymous participant ID (like <code>P-7F3K9Q</code>) and, only if you type one,
                a nickname.
              </li>
              <li>
                Your label, confidence rating and optional comment for each tweet, and how long you
                spent on it.
              </li>
              <li>
                The app does <strong>not</strong> ask for or store your name, email or any account
                information. (Like any website, the hosting provider may keep standard server logs.)
              </li>
              <li>
                Taking part is voluntary. You can stop at any time by simply closing the page.
              </li>
            </ul>
            <div className="notice notice--warn" role="note">
              <strong>Content notice:</strong> the tweets are unfiltered public text. Some may
              contain strong language or describe distressing feelings. If a tweet bothers you, you
              can stop at any time.
            </div>
          </section>
        </div>
        {/* On wide screens the consent/start panel stays visible beside the instructions. */}
        <aside className="home-grid__aside" aria-label="Start the task">
          <StartPanel />
        </aside>
      </div>
    </div>
  );
}
