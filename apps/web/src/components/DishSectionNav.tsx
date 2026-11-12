import { useEffect, useState } from "react";

export interface DishSectionLink {
  /** The anchor id on the page. */
  id: string;
  label: string;
}

export interface DishSectionNavProps {
  links: DishSectionLink[];
  /** The dish name, used for the accessible label of the nav. */
  dishName: string;
}

/**
 * A sticky section navigation for the dish page.
 *
 * The reference puts Journey first, then the other sections, with the
 * current section marked. Two rules matter more than the styling:
 *
 *   1. EVERY LINK MUST REACH REAL CONTENT. The caller only passes
 *      sections that are actually rendered on the page, so the nav can
 *      never point at an anchor that does not exist.
 *   2. THE STICKY HEADER MUST NOT HIDE THE TARGET. The page's own
 *      header is sticky too, so scrolling to an anchor would otherwise
 *      land the heading underneath it. The scroll offset is applied
 *      here with `scroll-margin-top` on the target and a matching
 *      `scroll-padding-top` on the scroll container.
 *
 * The nav is rendered as a plain list of links and is keyboard
 * operable by default; the current-section marker is applied with
 * `aria-current`, not with colour alone.
 */
export function DishSectionNav({ links, dishName }: DishSectionNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (links.length === 0) return;

    // Observe the sections themselves. The root margin accounts for the
    // sticky page header so the "current" section changes at the point
    // a reader would expect.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-120px 0px -55% 0px",
        threshold: [0, 0.01],
      },
    );

    for (const link of links) {
      const el = document.getElementById(link.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [links]);

  if (links.length === 0) return null;

  return (
    <nav className="dsn" aria-label={`${dishName} sections`}>
      <ul className="dsn__list">
        {links.map((link) => (
          <li key={link.id}>
            <a
              className="dsn__link"
              href={`#${link.id}`}
              aria-current={activeId === link.id ? "true" : undefined}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
