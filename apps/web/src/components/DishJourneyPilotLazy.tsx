import { type ReactElement, useEffect, useState } from "react";
import type { DishIngredient } from "../types/dish";

/**
 * The pilot components are loaded with a DYNAMIC import, so a build with
 * the pilot off does not put their code in the chunk every dish page
 * loads.
 *
 * The dynamic import is RESOLVED BEFORE RENDERING rather than during
 * it. `React.lazy()` + `Suspense` was used first, and it caused a
 * hydration mismatch (React error #419): Astro renders the island on
 * the SERVER, where `lazy()` resolves immediately, but on the CLIENT
 * the first render suspends and the fallback is rendered instead. The
 * server's HTML and the client's first render then differ.
 *
 * This hook keeps the two in step: the component renders NOTHING until
 * the module has loaded, on the server and on the client alike. The
 * pilot's extra sections therefore appear a moment after hydration,
 * identically on both sides.
 */
function usePilotModule<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
): T | null {
  const [mod, setMod] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loader().then((m) => {
      if (cancelled) return;
      // The pilot's stylesheet is a RUNTIME link, so a build with the
      // pilot off never carries it. It is added the moment the pilot
      // module loads — which is the moment the pilot is in use.
      const withStyles = m as unknown as { ensurePilotStyles?: () => void };
      withStyles.ensurePilotStyles?.();
      setMod(m);
    });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  return mod;
}

export function PilotSectionNav(props: {
  dishName: string;
  links: Array<{ id: string; label: string }>;
}): ReactElement | null {
  const mod = usePilotModule(() => import("./DishJourneyPilot"));
  if (!mod) return null;
  const Component = mod.DishSectionNav;
  return <Component {...props} />;
}

export function PilotIngredientOverview(props: {
  dishName: string;
  ingredients: DishIngredient[];
  explorerId?: string;
}): ReactElement | null {
  const mod = usePilotModule(() => import("./DishJourneyPilot"));
  if (!mod) return null;
  const Component = mod.DishIngredientOverview;
  return <Component {...props} />;
}
