import { expect, test, type Page } from '@playwright/test';
import { PROMPTS, validAnswers } from '../../src/prompts.ts';
import { formatAnswer } from '../../src/lib/format.ts';

const byText = new Map(PROMPTS.map((p) => [p.text, p]));

/** Read the prompt on screen and return its valid answers. */
async function answersOnScreen(page: Page): Promise<number[]> {
  const heading = page.locator('#prompt-text');
  await expect(heading).toBeVisible();
  const text = (await heading.innerText()).replace(/^Question \d:\s*/, '').trim();
  const prompt = byText.get(text);
  if (!prompt) throw new Error(`Prompt not in the bank: "${text}"`);
  return validAnswers(prompt);
}

test('a full game: retries, a time-out, results, share text, resume and history', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.clock.install();
  await page.goto('/');

  // Start screen
  await expect(page.getByRole('heading', { name: /Today's worksheet/ })).toBeVisible();
  await expect(page.getByText('Any right answer counts. Rare right answers count more. 25 seconds each.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Mark scheme' })).toContainText('Lone Wolf');
  // Yesterday's crowd teaser: piles of dots and a right answer nobody gave.
  const clipping = page.getByRole('complementary', { name: "Yesterday's crowd" });
  await expect(clipping).toContainText(/said/);
  expect(Number(await clipping.locator('figure.crowd').getAttribute('data-balls'))).toBeGreaterThanOrEqual(20);
  await page.getByRole('button', { name: 'Start' }).click();

  const input = page.getByLabel('Your answer, a whole number');
  let expectedTotal = 0;

  for (let q = 1; q <= 7; q++) {
    const valid = await answersOnScreen(page);
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(input).toBeFocused();

    if (q === 1) {
      // Invalid answers are not locked in: not a number, then a wrong number.
      await page.keyboard.type('abc');
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue('');
      await expect(page.locator('.answer__note .hand')).toBeVisible();
      await expect(page.locator('.reveal')).toHaveCount(0);

      const wrong = [4, 6, 8, 9, 10, 12].find((n) => !valid.includes(n))!;
      await page.keyboard.type(String(wrong));
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue('');
      await expect(page.locator('[aria-live]')).toContainText('Not valid, try again');
      // Still on the same question, timer still going.
      await expect(page.getByRole('timer')).toBeVisible();
      // The note fades after 1.2s.
      await page.clock.runFor(1500);
      await expect(page.locator('.answer__note .hand')).toHaveCount(0);
    }

    if (q === 4) {
      // Let this one run out.
      await page.clock.runFor(26_000);
      await expect(page.locator('.reveal')).toContainText('out of time');
    } else {
      // Commas and spaces are stripped.
      const answer = valid[valid.length - 1]!;
      await page.keyboard.type(q === 2 ? ` ${answer.toLocaleString('en-GB')} ` : String(answer));
      await page.keyboard.press('Enter');
      await page.clock.runFor(800);
      const reveal = page.locator('.reveal');
      await expect(reveal).toBeVisible();
      // The mark must be on screen without scrolling, or players never see it.
      await expect(reveal.locator('.reveal__mark')).toBeInViewport({ ratio: 1 });
      const points = Number(await reveal.locator('.reveal__score').getAttribute('data-points'));
      expect([10, 15, 30, 60, 85, 100]).toContain(points);
      expectedTotal += points;
      await expect(page.locator('[aria-live]')).toContainText(`${points} points`);
      await expect(reveal).toContainText('simulated answers');
      // Where you landed: the crowd's dots, and the player's own red one.
      const rack = reveal.locator('figure.crowd');
      await expect(rack).toHaveAttribute('data-mine', 'yes');
      expect(Number(await rack.getAttribute('data-balls'))).toBeGreaterThanOrEqual(20);
      await expect(reveal.getByRole('img', { name: new RegExp(`Your answer ${formatAnswer(answer)}`) })).toBeVisible();
    }
    await page.getByRole('button', { name: q === 7 ? 'See marks' : 'Next question' }).click();
  }

  // Results
  await expect(page.getByRole('heading', { name: "Today's worksheet, marked" })).toBeVisible();
  await expect(page.locator('.results__score')).toHaveText(String(expectedTotal));
  await expect(page.getByText('provisional', { exact: true })).toBeVisible();
  await expect(page.locator('.result')).toHaveCount(7);
  await expect(page.locator('.result').nth(3)).toContainText('out of time');
  // No mini racks under each answer any more: each offers the full crowd instead.
  await expect(page.getByText('see the crowd')).toHaveCount(7);
  await expect(page.locator('.countdown')).toContainText(/Next worksheet in \d\d:\d\d:\d\d/);

  // The share text is folded away until asked for.
  await expect(page.getByLabel('Share text')).toBeHidden();
  await page.getByText('What gets copied').click();
  const share = await page.getByLabel('Share text').innerText();
  expect(share).toMatch(new RegExp(`^Oddle \\d\\d/\\d\\d/\\d\\d: ${expectedTotal}/700\\n[·○◐●★✦✗]{7}\\n`));
  expect(share.split('\n')[1]![3]).toBe('✗');

  // Top answers for a question
  await page.locator('.result__head').first().click();
  await expect(page.locator('.result__panel .crowd__caption')).toContainText(/Each ball is \d+(\.\d)?% of answers/);
  await expect(page.locator('.bars tbody tr').first()).toBeVisible();
  expect(await page.locator('.bars tbody tr').count()).toBeGreaterThanOrEqual(2);

  // One attempt a day: a reload goes straight back to the results.
  await page.reload();
  await expect(page.locator('.results__score')).toHaveText(String(expectedTotal));
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);

  // Streak and history
  await page.getByRole('link', { name: /My book/ }).first().click();
  await expect(page.getByRole('heading', { name: 'My book' })).toBeVisible();
  await expect(page.locator('.book__stats')).toContainText('1 day');
  await expect(page.locator('.book__cell.is-played')).toHaveCount(1);
  await expect(page.locator('.book__detail')).toContainText(`${expectedTotal} / 700`);
});

test("the archive: play a past day against its crowd, off the streak", async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  // Through the menu.
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Contents' });
  await expect(menu.getByRole('link', { name: /Today's sheet/i })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('link', { name: /Archive/i }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'The archive' })).toBeVisible();
  await expect(page.locator('.archive__row').first()).toContainText('Do it');
  await page.locator('.archive__go').first().click();

  await expect(page.getByRole('heading', { name: /Worksheet from/ })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  const input = page.getByLabel('Your answer, a whole number');
  let expectedTotal = 0;
  for (let q = 1; q <= 7; q++) {
    const valid = await answersOnScreen(page);
    if (q === 3) {
      await page.clock.runFor(26_000);
      await expect(page.locator('.reveal')).toContainText('out of time');
    } else {
      await expect(input).toBeFocused();
      await page.keyboard.type(String(valid[Math.floor(valid.length / 2)]!));
      await page.keyboard.press('Enter');
      await page.clock.runFor(800);
      const reveal = page.locator('.reveal');
      await expect(reveal).toBeVisible();
      const points = Number(await reveal.locator('.reveal__score').getAttribute('data-points'));
      expect([10, 15, 30, 60, 85, 100]).toContain(points);
      expectedTotal += points;
      await expect(reveal.locator('figure.crowd')).toHaveAttribute('data-mine', 'yes');
    }
    await page.getByRole('button', { name: q === 7 ? 'See marks' : 'Next question' }).click();
  }

  await expect(page.getByRole('heading', { name: /Worksheet from .*, marked/ })).toBeVisible();
  await expect(page.locator('.results__score')).toHaveText(String(expectedTotal));
  await expect(page.getByText('What gets copied')).toHaveCount(0);

  // Back in the archive, the day shows its score; the streak is untouched.
  await page.getByRole('link', { name: 'Back to the archive' }).click();
  await expect(page.locator('.archive__row').first()).toContainText(String(expectedTotal));
  await page.goto('/book');
  await expect(page.locator('.book__stats')).toContainText('0 days');
});

test('leaving mid-game resumes at the next question; the abandoned one scores 0', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  const valid = await answersOnScreen(page);
  await page.keyboard.type(String(valid[0]));
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Next question' }).click();
  await answersOnScreen(page); // question 2 is on screen, unanswered
  await page.reload();
  await expect(page.getByText('Picking up at question 3 of 7.')).toBeVisible();
  await page.getByRole('button', { name: 'Carry on' }).click();
  await expect(page.locator('.margin-note')).toHaveText('Q3.');
  await expect(page.getByLabel('Question 2: No answer, 0 points')).toBeVisible();
});

/** Move the fake clock on in half-second steps until something appears. */
async function stepUntil(page: Page, selector: string, maxMs = 40_000) {
  for (let t = 0; t <= maxMs; t += 500) {
    if (await page.locator(selector).first().isVisible()) return;
    await page.clock.runFor(500);
  }
  throw new Error(`${selector} never appeared`);
}

test('versus: a whole match against ghosts, then the register', async ({ page }) => {
  await page.clock.install();
  await page.goto('/versus');
  await expect(page.getByRole('heading', { name: /Versus/ })).toBeVisible();
  // No server in the test: ghosts only, and it says so.
  await expect(page.getByText(/has no server/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Practice' })).toHaveCount(0);

  await page.getByLabel('Name on your paper').fill('Tester');
  await page.getByText('1 v 2', { exact: true }).click();
  await page.getByRole('button', { name: 'Play 2 ghosts' }).click();

  // The countdown, with everyone in the register.
  await expect(page.getByText('Question 1 of 5')).toBeVisible();
  await expect(page.locator('table.register tbody tr')).toHaveCount(3);
  await expect(page.locator('table.register').getByText('ghost')).toHaveCount(2);

  for (let round = 1; round <= 5; round++) {
    await stepUntil(page, 'form.answer');
    await expect(page.locator('.margin-note')).toHaveText(`Q${round}.`);
    const heading = page.locator('#prompt-text');
    const text = (await heading.innerText()).replace(/^Question \d of 5:\s*/, '').trim();
    const prompt = byText.get(text);
    if (!prompt) throw new Error(`Prompt not in the bank: "${text}"`);
    const valid = validAnswers(prompt);
    if (round === 1) {
      // A wrong number isn't locked in.
      const wrong = Array.from({ length: 50 }, (_, i) => i + 1).find((n) => !valid.includes(n))!;
      await page.keyboard.type(String(wrong));
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('Your answer, a whole number')).toHaveValue('');
    }
    if (round === 3) {
      // Let this one run out: the round can't close before the 25 seconds are up.
    } else {
      await page.keyboard.type(String(valid[valid.length - 1]));
      await page.keyboard.press('Enter');
    }
    await stepUntil(page, 'ol.answers');
    const answers = page.locator('ol.answers');
    await expect(answers.locator('li')).toHaveCount(3);
    const me = answers.locator('.answers__row--me');
    await expect(me).toContainText('Tester');
    if (round === 3) await expect(me.locator('.answers__value')).toHaveText('no answer');
    else await expect(me.locator('.answers__value')).toHaveText(formatAnswer(valid[valid.length - 1]!));
  }
  await stepUntil(page, '#final-title');

  await expect(page.getByRole('heading', { name: /Top of the class|You came/ })).toBeVisible();
  const rows = page.locator('table.register--final tbody tr');
  await expect(rows).toHaveCount(3);
  const totals = await rows.locator('.register__total').allInnerTexts();
  const sorted = totals.map(Number);
  expect([...sorted].sort((a, b) => b - a)).toEqual(sorted);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByLabel('Name on your paper')).toHaveValue('Tester');
});

test('practice mode has gone', async ({ page }) => {
  await page.goto('/practice');
  await expect(page.getByText('Wrong classroom.')).toBeVisible();
});

test('the on-screen number pad works on a small phone, and the mark fits on screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'pad only shows on small or touch screens');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  const valid = await answersOnScreen(page);
  const pad = page.getByRole('group', { name: 'Number pad' });
  await expect(pad).toBeVisible();
  await pad.getByRole('button', { name: '9', exact: true }).click();
  await pad.getByRole('button', { name: 'Delete' }).click();
  for (const digit of String(valid[0])) await pad.getByRole('button', { name: digit, exact: true }).click();
  await pad.getByRole('button', { name: 'Hand in' }).click();
  await expect(page.locator('.reveal')).toBeVisible();
  await expect(page.locator('.reveal__mark')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.reveal figure.crowd')).toBeInViewport({ ratio: 0.5 });
});
