import { formatAnswer } from '../lib/format.ts';
import { useEffect, useState } from 'react';
import type { Backend, Distribution } from '../lib/backend/types.ts';
import { hashString } from '../lib/rng.ts';
import { formatShare } from '../lib/scoring.ts';
import { addDays } from '../lib/ukDate.ts';
import { getPrompt, validAnswers, type Prompt } from '../prompts.ts';
import { CrowdPlot } from './CrowdPlot.tsx';

interface Loaded {
  prompt: Prompt;
  dist: Distribution;
  mine: number | null;
  lone: boolean;
}

/** A right answer nobody gave, from the middle of the list: proof the empty paper exists. */
function emptySpot(prompt: Prompt, dist: Distribution): number | null {
  const given = new Set(dist.values.map((v) => v.value));
  const free = validAnswers(prompt).filter((n) => !given.has(n));
  return free.length ? free[Math.floor(free.length * 0.6)]! : null;
}

/**
 * A clipping from yesterday's paper on the start screen: one question, the
 * crowd's piles, and a right answer nobody gave. Shows the idea before you play.
 * Hidden if yesterday can't be fetched (a brand-new game, or offline).
 */
export function YesterdayCrowd({ backend, today }: { backend: Backend; today: string }) {
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    const yesterday = addDays(today, -1);
    void (async () => {
      try {
        const results = await backend.getResults(yesterday);
        // The same question for everyone, varying day to day.
        const row = results.rows[hashString(yesterday) % results.rows.length];
        if (!row) return;
        const dist = await backend.getDistribution(yesterday, row.position);
        if (!cancelled && dist.values.length > 0) setData({ prompt: getPrompt(row.promptId), dist, mine: row.value, lone: row.tier === 'lone' });
      } catch {
        /* nothing to show */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, today]);

  if (!data) return null;
  const top = data.dist.values[0]!;
  const empty = emptySpot(data.prompt, data.dist);
  const rarest = data.dist.values[data.dist.values.length - 1]!;

  return (
    <aside className="clipping" aria-labelledby="clipping-title">
      <p id="clipping-title" className="clipping__title">
        Yesterday's crowd
      </p>
      <p className="clipping__prompt">{data.prompt.text}</p>
      <CrowdPlot prompt={data.prompt} values={data.dist.values} mine={data.mine} lone={data.lone} animate />
      <p className="clipping__note">
        <span className="mono">{formatShare(top.share)}</span> said <span className="mono">{formatAnswer(top.value)}</span>.{' '}
        {empty !== null ? (
          <>
            Nobody said <span className="mono">{formatAnswer(empty)}</span>.
          </>
        ) : (
          <>
            Only <span className="mono">{formatShare(rarest.share)}</span> said{' '}
            <span className="mono">{formatAnswer(rarest.value)}</span>.
          </>
        )}
      </p>
      <p className="hand clipping__scribble">find the empty paper</p>
    </aside>
  );
}
