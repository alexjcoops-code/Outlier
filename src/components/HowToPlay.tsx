import { useEffect, useRef } from 'react';

/** How to play, on a sticky note. */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Two focusable things in the note; keep Tab inside it.
      if (e.key === 'Tab') {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="sticky-backdrop" onClick={onClose}>
      <div
        className="sticky"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="sticky__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="how-title">How to play</h2>
        <ol>
          <li>Seven questions a day. Each has lots of right answers.</li>
          <li>You get 40 seconds to type a whole number. Wrong ones bounce back; keep trying.</li>
          <li>The fewer people who gave your answer, the more it scores. Up to 100 a question.</li>
          <li>Or play Versus: five questions live against 1 to 7 others. Say the same number as someone and you split the points.</li>
        </ol>
        <div className="sticky__example">
          <p>
            <span className="mono">Name a prime under 1,000</span>
          </p>
          <p>
            <span className="mono">2</span> is right, and so is half the class: <span className="hl tier-obvious">Obvious</span>, 10.
          </p>
          <p>
            <span className="mono">683</span> is right and hardly anyone says it: <span className="hl tier-outlier">Outlier</span>, 85.
          </p>
          <p>
            <span className="mono">37</span> feels clever. Everyone thinks of that: 15.
          </p>
        </div>
      </div>
    </div>
  );
}
