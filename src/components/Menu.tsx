// The menu: the contents page of the exercise book. A sheet with a grid of
// boxes, each with an ink drawing on a highlighter swipe. The page you're on is
// boxed in red pen.

import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MOTION } from '../lib/motion.ts';

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const Icons: Record<string, ReactNode> = {
  today: (
    <svg viewBox="0 0 32 32" {...ICON}>
      <path d="M8 4h12l5 5v19H8z" />
      <path d="M20 4v5h5" />
      <path d="M12 15h9M12 19h6" />
      <path d="M12 24l2.5 2.5L20 21" />
    </svg>
  ),
  versus: (
    <svg viewBox="0 0 32 32" {...ICON}>
      <circle cx="9" cy="11" r="3.5" />
      <path d="M3 24c0-4 3-7 6-7s6 3 6 7" />
      <circle cx="23" cy="11" r="3.5" />
      <path d="M17 24c0-4 3-7 6-7s6 3 6 7" />
      <path d="M14 6l4 4M18 6l-4 4" />
    </svg>
  ),
  archive: (
    <svg viewBox="0 0 32 32" {...ICON}>
      <path d="M11 4h14v18" />
      <path d="M8 7h14v18" />
      <path d="M5 10h14v18H5z" />
      <path d="M8 15h8M8 19h8M8 23h5" />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 32 32" {...ICON}>
      <path d="M7 4h18v24H7z" />
      <path d="M10 4v24" />
      <path d="M14 9h8v5h-8z" />
      <path d="M15 19v5M17.5 19v5M20 19v5M22.5 19v5M14 23.5l10-3.5" />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 32 32" {...ICON}>
      <path d="M16 3.5c7 0 12.5 5.5 12.5 12.5S23 28.5 16 28.5 3.5 23 3.5 16 9 3.5 16 3.5z" />
      <path d="M12 12.5c0-2.5 2-4 4-4s4 1.5 4 3.8c0 3.2-4 3.2-4 6.2" />
      <path d="M16 23v.5" strokeWidth="3" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 32 32" {...ICON}>
      <path d="M12 12H7v16h18V12h-5" />
      <path d="M16 20V3M10.5 8.5L16 3l5.5 5.5" />
    </svg>
  ),
};

interface Item {
  id: keyof typeof Icons;
  label: string;
  /** The highlighter behind the drawing. */
  ink: string;
  href?: string;
  onSelect?: () => void;
}

interface Props {
  page: string;
  navigate: (to: string) => void;
  onHelp: () => void;
  onClose: () => void;
}

export function Menu({ page, navigate, onHelp, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [shared, setShared] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !sheetRef.current) return;
      // Keep Tab inside the menu.
      const all = [...sheetRef.current.querySelectorAll<HTMLElement>('button, a[href]')];
      const first = all[0];
      const last = all.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const share = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: 'Oddle', text: 'Name a number nobody else will.', url });
      else {
        await navigator.clipboard.writeText(url);
        setShared('copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const sections: { title: string; items: Item[] }[] = [
    {
      title: 'Play',
      items: [
        { id: 'today', label: "Today's sheet", ink: 'var(--tier-fair)', href: '/' },
        { id: 'versus', label: 'Versus', ink: 'var(--tier-outlier)', href: '/versus' },
        { id: 'archive', label: 'Archive', ink: 'var(--tier-clever)', href: '/archive' },
      ],
    },
    {
      title: 'You',
      items: [
        { id: 'book', label: 'My book', ink: 'var(--tier-lone)', href: '/book' },
        {
          id: 'help',
          label: 'How to play',
          ink: 'var(--tier-rare)',
          onSelect: () => {
            onClose();
            onHelp();
          },
        },
        { id: 'share', label: shared === 'copied' ? 'Link copied' : 'Share Oddle', ink: 'var(--tier-obvious)', onSelect: () => void share() },
      ],
    },
  ];

  const current = (href?: string) =>
    href !== undefined && (href === '/' ? page === '/' : page === href || page.startsWith(`${href}/`));

  return (
    <div className="menu-backdrop" onClick={onClose}>
      <motion.div
        ref={sheetRef}
        className="menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: -12, rotate: -0.6 }}
        animate={{ opacity: 1, y: 0, rotate: -0.4 }}
        transition={{ duration: MOTION.panelMs / 1000, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="menu__head">
          <div>
            <p className="menu__kicker">oddle</p>
            <h2 id="menu-title" className="menu__title">
              Contents
            </h2>
          </div>
          <button ref={closeRef} type="button" className="menu__close" onClick={onClose} aria-label="Close menu">
            <svg viewBox="0 0 24 24" {...ICON} aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {sections.map((section) => (
          <section key={section.title} className="menu__section" aria-label={section.title}>
            <p className="menu__rule" aria-hidden="true">
              <span>{section.title}</span>
            </p>
            <ul className="menu__grid">
              {section.items.map((item) => {
                const inner = (
                  <>
                    <span className="menu__icon" style={{ ['--hl' as string]: item.ink }} aria-hidden="true">
                      {Icons[item.id]}
                    </span>
                    <span className="menu__label">{item.label}</span>
                  </>
                );
                const here = current(item.href);
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <a
                        className={`menu__tile ${here ? 'is-here' : ''}`}
                        href={item.href}
                        aria-current={here ? 'page' : undefined}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                          e.preventDefault();
                          go(item.href!);
                        }}
                      >
                        {inner}
                      </a>
                    ) : (
                      <button type="button" className="menu__tile" onClick={item.onSelect}>
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </motion.div>
    </div>
  );
}

/** The header button that opens the menu: three ruled lines. */
export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="header__menu" onClick={onClick} aria-label="Menu" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" {...ICON} aria-hidden="true">
        <path d="M5 7.5h14M5 12.2h14M5 16.8h10" />
      </svg>
    </button>
  );
}
