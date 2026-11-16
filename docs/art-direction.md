# Oddle: art direction

The rules every screen follows. If a change breaks one of these, change the change, not the rule (or argue for a new rule here first).

## Player fantasy and mood

You're the pupil who finds the answer nobody else in the class thought of, and the teacher notices. The mood is a quiet classroom with a bit of nerve: dry, a little cheeky, never loud until you've earned it.

## Medium

Marks on a school maths exercise book. Everything on screen is either the printed page (squared grid, margin, ruled lines), something written on it (ink, pencil, red pen, green pen, highlighter, rubber stamps), or a small paper object lying on it (sticky note, tape, a torn-out clipping). Flat, top-down, no lighting on marks.

## References

| Job | Reference | What we take from it |
|---|---|---|
| Composition | A UK maths exercise book: squared paper, printed margin, question numbers in the margin, "Name ___ Class ___" | The margin is the HUD column. Items are separated by ruled lines and numbering, not boxes. One question owns the page at a time. |
| Materials | A teacher's marking kit: red and green pens, highlighters, rubber stamps (Merit, Distinction), gold stars, hole-punch chads | Every reward is a mark somebody made. Ink sits flat on the paper; only paper objects (notes, tape, the sheet itself) lift off it with a soft shadow. |
| Motion | A Galton board (bean machine) | Weight and settle: the crowd pours, bounces and piles up, so the distribution is felt before it's read. One heavy drop beats glitter. |

## Palette roles

Tokens live in `src/styles/tokens.css`. Use the role, not the hex.

| Role | Token | Means |
|---|---|---|
| Page surface | `--surface-page`, `--line-grid` | The paper. Low contrast, never moves. |
| Desk | `--surface-desk` | Behind the sheet on wide screens. |
| Printed rule | `--line-margin` | The margin line. Printed pink, so it never competes with the teacher's red pen. |
| Ink | `--ink` | Questions, answers, controls, the crowd's axis. |
| Pencil | `--pencil` | Secondary information and the crowd's balls. |
| Teacher's red pen | `--mark` | The teacher's attention: your answer's mark, your ball in the rack, wrong-answer notes, and the timer's last five seconds. Nothing decorative is red. |
| Top reward | `--reward-top` | Green pen: the Lone Wolf stamp and the top award. |
| Tier highlighters | `--tier-*` | One highlighter per scoring tier. Always paired with the tier's name or symbol, never colour alone. |

## Shapes and assets

- Pen strokes are 1.5 to 3.4 px with round caps. Printed and stamped things get the rough-edge filter; handwriting doesn't.
- Marks are flat: no gradients, no highlights, no drop shadows. Paper objects (the sheet, sticky note, tape, clipping) may cast one soft shadow, lit from above.
- Scale follows the 24 px grid square. Tick boxes, progress boxes and the number pad sit on it.
- The crowd's balls are pencil-shaded discs. Your ball is a red-pen disc with a ring round it, so it reads in greyscale too.
- One family only: drawn marks (ticks, circles, dashes, stars, stamps). No emoji, no icon sets, no shaded sprites.

## The desk (wide screens)

From 1000 px wide the sheet lies on a desk with things round it; below that the sheet fills the screen as before.

- **1000 to 1239 px:** the sheet plus a column of sticky notes on its right.
- **1240 px and up:** stationery on the left as well: a 15 cm ruler, a pencil, a rubber and a protractor.
- **1600 px and up:** the sheet widens to 860 px and everything on the desk goes up a size.

The desk is a cartoon of pale laminate wood: flat streaks of lighter and darker wood, broken grain lines, and two patches of arched grain. It's one 1600 × 1000 tile drawn by `scripts/make-desk-wood.mjs` (`public/desk-wood.svg`); rerun the script to change it.

Everything on the desk is drawn as a cartoon: a 2 px ink outline, flat fills, one flat highlight, and a flat shadow cast down and to the right (no blur). The shadow is applied to each group, not each object, so the light comes from one place whatever angle a thing lies at. The sheet casts the same shadow.

The sticky notes carry real information: the rule in one line, your last few days and best score, and when the next sheet comes out. They have a darker glue strip, a curled corner, and tape or a paperclip. The stationery (ruler, pencil, rubber, protractor) is decoration only and hidden from screen readers. Nothing on the desk moves; the countdown changes once a minute.

## The menu

The header's menu button (three ruled lines in a box) opens the book's contents page: a sheet of squared paper with the printed margin, a "Contents" heading with a double rule, and sections ("Play", "You") headed by a dashed rule. Each item is an ink-outlined box with a drawn ink icon on a highlighter swipe and a short capitalised label. The page you're on is boxed in red pen. There is no footer: everything lives in the menu.

## Typography

| Role | Face | Used for |
|---|---|---|
| Print | Andika (400 and 700) | Everything printed: headings, questions, answers, the timer, scores, the register. A face made for children learning to read, with the school-book "a" and "g", so the sheet reads like a printed exercise book. Numerals are tabular so columns line up. |
| The teacher | Kalam | Only things the teacher writes: comments, wrong-answer notes, circled scores, "out of time" |

We moved off Fraunces, IBM Plex Mono and Caveat in November 2026: that trio is common in AI-made sites, and playtesters said it made the game look AI-made.

## Motion by event

Durations are in `src/lib/motion.ts` and as CSS variables in `tokens.css`.

| Event | Motion |
|---|---|
| Key press, hand in | Confirms within 120 ms. The input locks and a tick draws. Control is never held back for an animation. |
| Wrong answer | A 200 ms side-to-side shake and a red-pen note. The clock keeps running; you can type again immediately. |
| Time running out | The pencil line shrinks steadily and turns red pen for the last five seconds. No blinking. |
| Reveal | The crowd pours into the rack (about 2 s of physics); your ball drops last. The mark lands at 2.3 s. "Next question" works from the first frame. |
| Marking | Highlighter swipe 300 ms, circle 450 ms, ticks 180 ms apart. |
| Rewards | Scale with the tier, one signature move each: Fair counts up; Rare adds a second tick; Outlier gets red-pen emphasis strokes and two little stars dashed round the score (drawn, not thrown); Lone Wolf gets the NOBODY ELSE stamp, confetti cut from coloured paper in the highlighter colours (a burst from the mark, then a short shower down the page), a page shake and a longer buzz. Only a Lone Wolf gets confetti. Stamps land from 1.8× size, never sweeping across the page. A reward never covers the question, your answer or the rack. |
| Page changes | 180 to 300 ms. |
| Idle | Nothing moves while you think, except the loading scribble. |

## Exclusions

1. No lit or 3D objects, glass, glows or gradients. If it's not ink, pencil, highlighter or paper, it doesn't belong.
2. No dashboard cards or rounded panels. Information goes into the book's own structures: margin numbers, ruled lines, the register, the mark scheme.
3. No purple, no badges or emoji, and no flashing or pulsing to get attention.

## The memorable detail

The crowd rack: after each answer, the whole class's answers pour into tubes standing on the number line, and your red ball drops in last. Where it lands is your mark: on a tall pile you were obvious, alone in an empty tube you were the outlier.
