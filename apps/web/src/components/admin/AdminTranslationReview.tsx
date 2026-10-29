/**
 * ADR-003 layer 4 — the translation review queue.
 *
 * A reviewer sees the machine translations beside their English
 * source, and can:
 *
 *   - ACCEPT a proposed correction (which makes it the reviewed text)
 *   - REJECT a proposed correction (which leaves the text alone)
 *   - MARK a translation as reviewed (which confirms it as it stands)
 *
 * The review queue is the machine translations no human has confirmed.
 * The stale queue is the translations whose English source has
 * changed — those are re-translated automatically, but a human should
 * look at them too, because a source edit can change the meaning.
 *
 * The corrections go through the moderation path: a contributor
 * proposes, a moderator decides, and the DATABASE enforces it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export interface ReviewQueueRow {
  translationId: string;
  locale: string;
  text: string;
  status: string;
  isStale: boolean;
  translator: string | null;
  sourceText: string;
  field: string;
  position: number;
  dishSlug: string;
}

export interface StaleQueueRow {
  translationId: string;
  locale: string;
  text: string;
  status: string;
  sourceText: string;
  sourceHash: string;
  currentHash: string;
  dishSlug: string;
}

export interface ProposalRow {
  translationId: string;
  locale: string;
  currentText: string;
  proposedText: string | null;
  proposedBy: string | null;
  proposedAt: string | null;
  proposalStatus: string | null;
  sourceText: string;
  dishSlug: string;
}

export interface TranslationSummary {
  byLocale: Array<{
    locale: string;
    status: string;
    isStale: boolean;
    n: number;
  }>;
  pendingProposals: number;
}

type Tab = "review" | "stale" | "proposals";

const LOCALE_NAMES: Record<string, string> = {
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  pt: "Português",
  id: "Bahasa Indonesia",
  zh: "简体中文",
  ja: "日本語",
  ar: "العربية",
  hi: "हिन्दी",
};

function localeName(locale: string): string {
  return LOCALE_NAMES[locale] ?? locale.toUpperCase();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      // The body was not JSON — the status text is what we have.
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export function AdminTranslationReview() {
  const [tab, setTab] = useState<Tab>("review");
  const [locale, setLocale] = useState<string>("");
  const [reviewRows, setReviewRows] = useState<ReviewQueueRow[]>([]);
  const [staleRows, setStaleRows] = useState<StaleQueueRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [summary, setSummary] = useState<TranslationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
      const [review, stale, props, sum] = await Promise.all([
        api<{ queue: ReviewQueueRow[] }>(
          `/api/admin/translations/review-queue${query}`,
        ),
        api<{ queue: StaleQueueRow[] }>("/api/admin/translations/stale-queue"),
        api<{ proposals: ProposalRow[] }>("/api/admin/translations/proposals"),
        api<TranslationSummary>("/api/admin/translations/summary"),
      ]);
      setReviewRows(review.queue ?? []);
      setStaleRows(stale.queue ?? []);
      setProposals(props.proposals ?? []);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (id: string, action: string, body?: unknown) => {
      setBusyId(id);
      setNote(null);
      try {
        await api(`/api/admin/translations/${id}/${action}`, {
          method: "POST",
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const locales = useMemo(() => {
    const set = new Set<string>();
    for (const row of summary?.byLocale ?? []) set.add(row.locale);
    for (const row of reviewRows) set.add(row.locale);
    return [...set].sort();
  }, [summary, reviewRows]);

  const pending = summary?.pendingProposals ?? 0;

  return (
    <div className="a-tr">
      {error && (
        <p className="a-tr__error" role="alert">
          {error}
        </p>
      )}

      {summary && (
        <p className="a-tr__summary">
          {summary.byLocale.reduce((sum, row) => sum + row.n, 0)} translations
          across {locales.length} locales · {pending} pending{" "}
          {pending === 1 ? "proposal" : "proposals"}
        </p>
      )}

      <div className="a-tr__bar">
        <div className="a-tr__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "review"}
            className={`a-tr__tab${tab === "review" ? " is-active" : ""}`}
            onClick={() => setTab("review")}
          >
            Review queue
            {reviewRows.length > 0 && (
              <span className="a-tr__count">{reviewRows.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "stale"}
            className={`a-tr__tab${tab === "stale" ? " is-active" : ""}`}
            onClick={() => setTab("stale")}
          >
            Stale queue
            {staleRows.length > 0 && (
              <span className="a-tr__count">{staleRows.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "proposals"}
            className={`a-tr__tab${tab === "proposals" ? " is-active" : ""}`}
            onClick={() => setTab("proposals")}
          >
            Proposals
            {pending > 0 && <span className="a-tr__count">{pending}</span>}
          </button>
        </div>

        <label className="a-tr__locale">
          <span className="a-visually-hidden">Locale</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="">All locales</option>
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeName(l)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="a-tr__empty">Loading…</p>}

      {!loading && tab === "review" && (
        <div className="a-tr__list">
          {reviewRows.length === 0 && (
            <p className="a-tr__empty">
              Nothing to review. Every translation has been confirmed.
            </p>
          )}
          {reviewRows.map((row) => (
            <article className="a-tr__row" key={row.translationId}>
              <header className="a-tr__head">
                <span className="a-tr__locale-tag">
                  {localeName(row.locale)}
                </span>
                <a
                  className="a-tr__dish"
                  href={`/dishes/${row.dishSlug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.dishSlug}
                </a>
                <span className="a-tr__where">
                  {row.field} · {row.position}
                </span>
                <span className="a-tr__badge">machine-translated</span>
                <button
                  type="button"
                  className="a-btn a-btn--accent"
                  disabled={busyId === row.translationId}
                  onClick={() => void act(row.translationId, "review")}
                >
                  Mark reviewed
                </button>
              </header>
              <div className="a-tr__pair">
                <div className="a-tr__side">
                  <h4 className="a-tr__label">English source</h4>
                  <p className="a-tr__source">{row.sourceText}</p>
                </div>
                <div className="a-tr__side">
                  <h4 className="a-tr__label">Translation</h4>
                  <p className="a-tr__text">{row.text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && tab === "stale" && (
        <div className="a-tr__list">
          {staleRows.length === 0 && (
            <p className="a-tr__empty">
              Nothing is stale. Every translation matches its source.
            </p>
          )}
          {staleRows.map((row) => (
            <article className="a-tr__row" key={row.translationId}>
              <header className="a-tr__head">
                <span className="a-tr__locale-tag">
                  {localeName(row.locale)}
                </span>
                <a
                  className="a-tr__dish"
                  href={`/dishes/${row.dishSlug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.dishSlug}
                </a>
                <span className="a-tr__badge a-tr__badge--stale">
                  source changed
                </span>
                <button
                  type="button"
                  className="a-btn a-btn--accent"
                  disabled={busyId === row.translationId}
                  onClick={() => void act(row.translationId, "review")}
                >
                  Mark reviewed
                </button>
              </header>
              <div className="a-tr__pair">
                <div className="a-tr__side">
                  <h4 className="a-tr__label">English source (current)</h4>
                  <p className="a-tr__source">{row.sourceText}</p>
                </div>
                <div className="a-tr__side">
                  <h4 className="a-tr__label">Translation (may be outdated)</h4>
                  <p className="a-tr__text">{row.text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && tab === "proposals" && (
        <div className="a-tr__list">
          {proposals.length === 0 && (
            <p className="a-tr__empty">No corrections have been proposed.</p>
          )}
          {proposals.map((row) => (
            <article className="a-tr__row" key={row.translationId}>
              <header className="a-tr__head">
                <span className="a-tr__locale-tag">
                  {localeName(row.locale)}
                </span>
                <span className="a-tr__dish">{row.dishSlug}</span>
                <span className="a-tr__where">
                  proposed by {row.proposedBy ?? "unknown"}
                </span>
                {row.proposalStatus === "pending" ? (
                  <>
                    <button
                      type="button"
                      className="a-btn a-btn--accent"
                      disabled={busyId === row.translationId}
                      onClick={() =>
                        void act(row.translationId, "resolve", {
                          decision: "accepted",
                        })
                      }
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="a-btn"
                      disabled={busyId === row.translationId}
                      onClick={() =>
                        void act(row.translationId, "resolve", {
                          decision: "rejected",
                        })
                      }
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <span className="a-tr__badge a-tr__badge--resolved">
                    {row.proposalStatus}
                  </span>
                )}
              </header>
              <div className="a-tr__pair">
                <div className="a-tr__side">
                  <h4 className="a-tr__label">English source</h4>
                  <p className="a-tr__source">{row.sourceText}</p>
                </div>
                <div className="a-tr__side">
                  <h4 className="a-tr__label">Current translation</h4>
                  <p className="a-tr__text">{row.currentText}</p>
                  {row.proposedText && (
                    <>
                      <h4 className="a-tr__label">Proposed correction</h4>
                      <p className="a-tr__text a-tr__text--proposed">
                        {row.proposedText}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminTranslationReview;
