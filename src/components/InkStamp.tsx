import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  text: string;
  ink: string;
  /** Seconds before it slams down. */
  delay?: number;
  /** Size multiplier. */
  scale?: number;
  className?: string;
}

/** A rubber stamp slammed onto the page: it drops in big and fast, then sits slightly crooked with ink spatter. */
export function InkStamp({ text, ink, delay = 0, scale = 1, className = '' }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`ink-stamp ${className}`}
      style={{ color: ink, fontSize: `${17 * scale}px` }}
      initial={reduce ? false : { scale: 1.8, opacity: 0, rotate: -16 }}
      animate={{ scale: 1, opacity: 0.92, rotate: -9 }}
      transition={reduce ? { duration: 0 } : { delay, duration: 0.28, ease: [0.6, 0, 0.9, 0.5] }}
      aria-hidden="true"
    >
      <span className="ink-stamp__border">
        <span className="ink-stamp__text">{text}</span>
      </span>
      {/* spatter where the stamp hit */}
      <svg className="ink-stamp__spatter" viewBox="0 0 100 40" preserveAspectRatio="none">
        {[
          [4, 6, 1.6],
          [96, 10, 1.2],
          [92, 36, 2],
          [8, 34, 1.1],
          [50, 2, 0.9],
          [70, 39, 1.3],
          [-2, 20, 1.4],
          [101, 22, 1],
        ].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="currentColor" />
        ))}
      </svg>
    </motion.div>
  );
}
