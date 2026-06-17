import { useEffect, useState } from 'react';
import { getClientSession } from '../lib/session';

export interface EditDishButtonProps {
  slug: string;
}

/**
 * Renders an "Edit" button on the dish detail page, but only when the
 * viewer is authenticated.
 *
 * Lives as a separate top-level island (client:load) because the parent
 * `DishDetail` is rendered as static HTML and has no hydration. Putting
 * the button in its own island keeps the static dish page fast while
 * still showing the edit affordance to logged-in editors.
 */
export function EditDishButton({ slug }: EditDishButtonProps) {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getClientSession().then((u) => {
      if (cancelled) return;
      setAuthed(u != null);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything during SSR or before auth check completes —
  // otherwise we get a "flash of empty space" for unauthenticated users.
  if (!checked) return null;
  if (!authed) return null;

  return (
    <a
      href={`/dishes/${slug}/edit`}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-700"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M2.695 14.763l-1.262 3.155a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.886L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
      </svg>
      Edit
    </a>
  );
}