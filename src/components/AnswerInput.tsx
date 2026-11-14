import { MOTION } from '../lib/motion.ts';
import { formatAnswer } from '../lib/format.ts';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { RedTick } from './Marks.tsx';

/** What the teacher scribbles next to a wrong answer. Never the same one twice running. */
const NOTES = [
  'try again',
  'nope',
  "doesn't fit",
  'not quite',
  'not one of those',
  'have another go',
  'no',
  'check that',
  'not that one',
  'think again',
];

interface Props {
  /** A handed-in answer: the input is frozen and ticked. */
  locked: number | null;
  /** Resolves false if the answer was rejected. */
  onSubmit: (raw: string) => Promise<boolean>;
}

function prefersPad(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 600;
}

export function AnswerInput({ locked, onSubmit }: Props) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState('');
  const [note, setNote] = useState<{ text: string; id: number; tilt: number } | null>(null);
  const [usePad, setUsePad] = useState(prefersPad);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastNote = useRef(-1);
  const noteTimer = useRef(0);
  const shake = useAnimationControls();

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const onResize = () => setUsePad(prefersPad());
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(noteTimer.current);
    };
  }, []);

  const reject = () => {
    let i = Math.floor(Math.random() * NOTES.length);
    if (i === lastNote.current) i = (i + 1) % NOTES.length;
    lastNote.current = i;
    setNote({ text: NOTES[i]!, id: Date.now(), tilt: -4 + Math.random() * 7 });
    clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 1200);
    setValue('');
    if (!reduce) void shake.start({ x: [0, -6, 6, -6, 6, 0], transition: { duration: MOTION.shakeMs / 1000 } });
    inputRef.current?.focus({ preventScroll: true });
  };

  const handIn = async (e?: FormEvent) => {
    e?.preventDefault();
    if (locked !== null || value.trim() === '') return;
    const ok = await onSubmit(value);
    if (!ok) reject();
  };

  const press = (key: string) => {
    if (locked !== null) return;
    if (key === 'back') setValue((v) => v.slice(0, -1));
    else setValue((v) => (v.length < 12 ? v + key : v));
    inputRef.current?.focus({ preventScroll: true });
  };

  const shown = locked !== null ? formatAnswer(locked) : value;

  return (
    <form className="answer" onSubmit={handIn} noValidate>
      <div className="answer__row">
        <motion.div className="answer__field" animate={shake}>
          <label htmlFor="answer" className="sr-only">
            Your answer, a whole number
          </label>
          <input
            ref={inputRef}
            id="answer"
            className={`answer__input ${locked !== null ? 'is-locked' : ''}`}
            type="text"
            inputMode={usePad ? 'none' : 'numeric'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={14}
            value={shown}
            readOnly={locked !== null}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby="answer-note"
          />
          {locked !== null && (
            <span className="answer__tick">
              <RedTick />
            </span>
          )}
        </motion.div>
        <span id="answer-note" className="answer__note" aria-hidden="true">
          <AnimatePresence>
            {note && (
              <motion.span
                key={note.id}
                className="hand"
                style={{ rotate: note.tilt }}
                initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.15 }}
              >
                {note.text}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      {!usePad && (
        <button type="submit" className="stamp stamp--small answer__submit" disabled={locked !== null}>
          Hand in
        </button>
      )}

      {usePad && (
        <div className="pad" role="group" aria-label="Number pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className="pad__key" onClick={() => press(d)} disabled={locked !== null}>
              {d}
            </button>
          ))}
          <button
            type="button"
            className="pad__key pad__key--back"
            onClick={() => press('back')}
            disabled={locked !== null}
            aria-label="Delete"
          >
            ⌫
          </button>
          <button type="button" className="pad__key" onClick={() => press('0')} disabled={locked !== null}>
            0
          </button>
          <button type="submit" className="pad__key pad__key--submit" disabled={locked !== null}>
            Hand in
          </button>
        </div>
      )}
    </form>
  );
}
