import type { DayRow } from './backend/types.ts';

/** The teacher's remark at the top of a marked paper. Dry, short, never unkind. */
export function teacherComment(rows: DayRow[], total: number): string {
  const count = (tier: DayRow['tier']) => rows.filter((r) => r.tier === tier).length;
  const firstQ = (tier: DayRow['tier']) => rows.find((r) => r.tier === tier)?.position;

  let opening: string;
  if (total >= 600) opening = 'Exceptional.';
  else if (total >= 450) opening = 'Very good.';
  else if (total >= 300) opening = 'Solid.';
  else if (total >= 150) opening = 'Fair effort.';
  else opening = 'Must try harder.';

  let remark: string;
  const lone = firstQ('lone');
  const bold = firstQ('outlier');
  if (count('none') >= 3) remark = 'Mind the clock.';
  else if (lone !== undefined) remark = `Q${lone} was inspired.`;
  else if (bold !== undefined) remark = `Q${bold} was bold.`;
  else if (count('clever') >= 2) remark = 'Too clever by half.';
  else if (count('obvious') >= 4) remark = 'Playing it safe.';
  else remark = 'Take more risks.';

  return `${opening} ${remark}`;
}
