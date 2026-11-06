"use client";
/**
 * components/AdminClient.tsx
 *
 * The researcher dashboard at /admin. It first asks the server for the data:
 * a 401 means "not logged in" and the login form is shown. Once logged in it
 * shows the session counts and accuracy per condition, the two CSV downloads
 * used by the analysis, and a table of sessions.
 *
 * The table is a real <table> on wide screens and turns into labelled cards on
 * phones (see globals.css), so it never forces sideways scrolling of the page.
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { CONDITIONS } from "@/lib/constants";
import type { AdminStats, SessionRecord, TrialRecord } from "@/lib/types";

/** Loaded dashboard data. */
interface Data {
  sessions: SessionRecord[];
  trials: TrialRecord[];
  stats: AdminStats;
}

/**
 * Formats an ISO timestamp for the table.
 *
 * @param iso ISO-8601 string.
 * @returns A short locale string.
 */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

/**
 * Loads the dashboard data without touching component state.
 *
 * @returns `{ data }` on success; otherwise `{ message }` (undefined for a plain
 *   "not logged in" 401) so the caller can show the login form.
 */
async function fetchDashboard(): Promise<{ data?: Data; message?: string }> {
  try {
    return { data: await api.adminData() };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return {};
    return { message: err instanceof Error ? err.message : "Could not load data." };
  }
}

/**
 * Renders the admin login form or dashboard.
 *
 * @returns The admin page content.
 */
export function AdminClient() {
  const [phase, setPhase] = useState<"loading" | "login" | "ready">("loading");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Applies a fetch outcome to component state: data -> dashboard, 401 -> login form.
   *
   * @param result Outcome of {@link fetchDashboard}.
   */
  const apply = useCallback((result: Awaited<ReturnType<typeof fetchDashboard>>) => {
    if (result.data) {
      setData(result.data);
      setPhase("ready");
    } else {
      if (result.message) setError(result.message);
      setPhase("login");
    }
  }, []);

  /** Re-fetches the dashboard data (Refresh button, and after login). */
  const load = useCallback(async () => apply(await fetchDashboard()), [apply]);

  // Initial load: a 401 shows the login form.
  useEffect(() => {
    let cancelled = false;
    fetchDashboard().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  /**
   * Submits the password and loads the dashboard on success.
   *
   * @param e The form submit event.
   */
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.adminLogin(password);
      setPassword("");
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    }
    setBusy(false);
  }

  /** Ends the admin session and returns to the login form. */
  async function logout() {
    await api.adminLogout().catch(() => undefined);
    setData(null);
    setPhase("login");
  }

  if (phase === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading">
        <div className="skeleton" style={{ height: 32, width: "40%", marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  if (phase === "login" || !data) {
    return (
      <section className="card" aria-labelledby="login-title" style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1 id="login-title" style={{ fontSize: "1.4rem" }}>
          Researcher login
        </h1>
        <p className="muted">Enter the admin password to view the collected data.</p>
        <form onSubmit={login}>
          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy || !password}>
            {busy ? "Checking…" : "Log in"}
          </button>
        </form>
      </section>
    );
  }

  const { sessions, trials, stats } = data;
  const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);
  const statusOf = (s: SessionRecord) =>
    s.terminatedAt ? "stopped at check" : s.completedAt ? "completed" : s.checkPassedAt ? "in progress" : "at check";
  const answered = (id: string) => trials.filter((t) => t.sessionId === id && t.initialAnswer !== null).length;

  return (
    <>
      <h1>Collected data</h1>
      <div className="stat-grid">
        {CONDITIONS.map((c) => (
          <div className="stat" key={c}>
            <div className="stat__value">
              {stats.sessions[c].completed} / {stats.sessions[c].started}
            </div>
            <div className="stat__label">
              {c} sessions completed / started ({stats.sessions[c].terminated} stopped); accuracy {pct(stats.accuracy[c])}
            </div>
          </div>
        ))}
        <div className="stat">
          <div className="stat__value">{stats.trialsAnswered}</div>
          <div className="stat__label">trials answered</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setError(null);
              void load();
            }}
          >
            Refresh
          </button>
          <a className="btn btn--primary" href="/api/admin/data?format=trials" download>
            Download trials.csv
          </a>
          <a className="btn btn--primary" href="/api/admin/data?format=sessions" download>
            Download sessions.csv
          </a>
          <button type="button" className="btn btn--secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="notice">No sessions yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Every session</caption>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Code</th>
                <th scope="col">Condition</th>
                <th scope="col">Status</th>
                <th scope="col">Check fails</th>
                <th scope="col">Answered</th>
                <th scope="col">Started</th>
                <th scope="col">Comment</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td data-label="Session" className="nowrap">
                    <strong>{s.id}</strong>
                  </td>
                  <td data-label="Code">{s.code}</td>
                  <td data-label="Condition">{s.condition}</td>
                  <td data-label="Status">{statusOf(s)}</td>
                  <td data-label="Check fails">{s.checkFailures}</td>
                  <td data-label="Answered">{answered(s.id)}</td>
                  <td data-label="Started" className="nowrap">
                    {formatTime(s.consentedAt)}
                  </td>
                  <td data-label="Comment" className="wrap">
                    {s.comment ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
