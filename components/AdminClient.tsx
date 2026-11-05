"use client";
/**
 * components/AdminClient.tsx
 *
 * The researcher dashboard at /admin. It first asks the server for the data:
 * a 401 means "not logged in" and the login form is shown. Once logged in it
 * shows summary statistics, a participant filter, the table of who labeled
 * which tweet with which label, and a CSV download.
 *
 * The table is a real <table> on wide screens and turns into labelled cards on
 * phones (see globals.css), so it never forces sideways scrolling of the page.
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { LABEL_KEYS, labelName } from "@/lib/emotions";
import type { AdminRow, AdminStats } from "@/lib/types";

/** Loaded dashboard data. */
interface Data {
  rows: AdminRow[];
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
  const [filter, setFilter] = useState("all");

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

  const { rows, stats } = data;
  const participants = Array.from(new Set(rows.map((r) => r.participantId)));
  const shown = filter === "all" ? rows : rows.filter((r) => r.participantId === filter);
  const rate = stats.matchRate === null ? "n/a" : `${Math.round(stats.matchRate * 100)}%`;

  return (
    <>
      <h1>Collected data</h1>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat__value">{stats.participantsStarted}</div>
          <div className="stat__label">participants started</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.participantsCompleted}</div>
          <div className="stat__label">participants completed</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.labelsCollected}</div>
          <div className="stat__label">labels collected</div>
        </div>
        <div className="stat">
          <div className="stat__value">{rate}</div>
          <div className="stat__label">labels matching dataset</div>
        </div>
      </div>

      <h2 className="sr-only">Label counts</h2>
      <ul className="label-counts" aria-label="How often each label was chosen">
        {LABEL_KEYS.map((k) => (
          <li key={k}>
            {labelName(k)}: <strong>{stats.labelCounts[k]}</strong>
          </li>
        ))}
      </ul>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="participant-filter">Filter by participant</label>
          <select
            id="participant-filter"
            className="input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All participants ({participants.length})</option>
            {participants.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
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
          <a className="btn btn--primary" href="/api/admin/data?format=csv" download>
            Download CSV
          </a>
          <button type="button" className="btn btn--secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="notice">No labels have been submitted yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Who labeled which tweet with which label</caption>
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">Nickname</th>
                <th scope="col">#</th>
                <th scope="col">Tweet</th>
                <th scope="col">Label</th>
                <th scope="col">Dataset label</th>
                <th scope="col">Match</th>
                <th scope="col">Confidence</th>
                <th scope="col">Rationale</th>
                <th scope="col">Time (s)</th>
                <th scope="col">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.participantId}-${r.tweetId}`}>
                  <td data-label="Participant" className="nowrap">
                    <strong>{r.participantId}</strong>
                    {!r.participantCompleted && <span className="muted"> (in progress)</span>}
                  </td>
                  <td data-label="Nickname">{r.nickname ?? "-"}</td>
                  <td data-label="#">{r.position}</td>
                  <td data-label="Tweet" className="wrap">
                    {r.tweetText}
                  </td>
                  <td data-label="Label">{labelName(r.label)}</td>
                  <td data-label="Dataset label">{labelName(r.groundTruth)}</td>
                  <td data-label="Match">{r.matchesGroundTruth ? "✓ Yes" : "No"}</td>
                  <td data-label="Confidence">{r.confidence}/5</td>
                  <td data-label="Rationale" className="wrap">
                    {r.rationale ?? "-"}
                  </td>
                  <td data-label="Time (s)">{(r.timeSpentMs / 1000).toFixed(1)}</td>
                  <td data-label="Submitted" className="nowrap">{formatTime(r.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
