import { useEffect, useState } from "react";
import type { AdminDishDetail } from "../../lib/api";
import { getAdminDish, getAdminLookups } from "../../lib/api";
import { AdminDishEditor } from "./AdminDishEditor";

/**
 * AdminDishEditorLoader — loads the admin dish detail IN THE BROWSER,
 * then renders the editor.
 *
 * WHY THIS EXISTS
 * ---------------
 * The editor page (`/admin/dishes/[slug].astro`) used to fetch the dish
 * detail and the lookups at BUILD time, with a top-level `await`:
 *
 *     const [initialDishResult, lookupsResult] = await Promise.all([
 *       getAdminDish(slug, apiInit),
 *       getAdminLookups(apiInit),
 *     ]);
 *
 * and on failure it returned a bare Response:
 *
 *     if (loadError) {
 *       return new Response(`Failed to load dish editor: ${loadError}`, { status: 502 });
 *     }
 *
 * **That could never work.** This is a fully-static Astro build — there
 * is no SSR adapter — so `astro build` is the only place that code
 * ever runs, and a build has no admin session cookie. Every
 * `/api/admin/*` call from the build returns 401, so every admin
 * dish-editor page was written to disk as the 77-byte string
 *
 *     Failed to load dish editor: GET /api/admin/dishes/<slug> failed (401)
 *
 * nginx then served that file as a normal page with a **200**. The
 * measured state on the live production containers was **101 of 102**
 * admin dish-editor pages broken this way, in BOTH the geo and the
 * recipes images.
 *
 * The admin DASHBOARD does not have this bug, because it fetches
 * nothing at build time: `<AdminDashboard client:load />` takes no data
 * props and does its own `fetch(..., { credentials: "include" })` in a
 * `useEffect`. This component is that same pattern, applied to the
 * editor.
 *
 * WHY THE FETCH CANNOT STAY AT BUILD TIME
 * ----------------------------------------
 * The editor needs the admin view of the dish: its draft fields, its
 * related dishes, its edit history. The public `/api/dishes/:slug`
 * does not carry those, and the admin endpoint requires a session. The
 * session exists in the BROWSER (it is a cookie on the request), and
 * nowhere else. So the fetch belongs in the browser, and only in the
 * browser.
 *
 * WHAT THIS DOES NOT CHANGE
 * -------------------------
 * The page is still STATIC HTML. What it contains is the admin shell
 * and a loading state. The DATA arrives from `/api/admin/*` at
 * runtime, which requires an admin session and returns 401/403
 * otherwise — the same gate as before, just evaluated at the right
 * time.
 */

type Phase = "loading" | "ready" | "error";

interface Props {
  slug: string;
  apiBase?: string;
}

export function AdminDishEditorLoader({ slug, apiBase = "" }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [dish, setDish] = useState<AdminDishDetail | null>(null);
  const [lookups, setLookups] = useState<{
    categories: Array<{ id: string; name: string; slug: string; kind: string }>;
    preparationMethods: Array<{ id: string; name: string; slug: string }>;
    geoEntities: Array<{ id: string; name: string; country: string | null }>;
    ingredients: Array<{ id: string; canonicalName: string }>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setPhase("loading");
      setError("");

      try {
        const [dishResult, lookupsResult] = await Promise.all([
          getAdminDish(slug, { credentials: "include" }).then(
            (d) => ({ ok: true as const, data: d }),
            (err: unknown) => ({
              ok: false as const,
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
          getAdminLookups({ credentials: "include" }).then(
            (l) => ({ ok: true as const, data: l }),
            (err: unknown) => ({
              ok: false as const,
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
        ]);

        if (cancelled) return;

        if (!dishResult.ok) {
          setError(dishResult.error);
          setPhase("error");
          return;
        }
        if (!lookupsResult.ok) {
          setError(lookupsResult.error);
          setPhase("error");
          return;
        }

        setDish(dishResult.data);
        setLookups(lookupsResult.data);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (phase === "loading") {
    return (
      <div className="a-empty" role="status" aria-live="polite">
        <p>Loading the dish editor…</p>
      </div>
    );
  }

  if (phase === "error") {
    // A 401 here is the expected answer for a visitor who is not
    // signed in as an admin. Say so plainly rather than showing the
    // raw status.
    const unauthorized = /\b401\b/.test(error);
    return (
      <div className="a-empty a-empty--error">
        <h3>
          {unauthorized
            ? "You need an admin session to edit dishes"
            : "Couldn’t load the dish editor"}
        </h3>
        <p>
          {unauthorized ? "Sign in as an admin and reload this page." : error}
        </p>
      </div>
    );
  }

  if (!dish || !lookups) {
    return (
      <div className="a-empty a-empty--error">
        <h3>Couldn’t load the dish editor</h3>
        <p>No data was returned.</p>
      </div>
    );
  }

  return (
    <AdminDishEditor initialDish={dish} lookups={lookups} apiBase={apiBase} />
  );
}
