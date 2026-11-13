import { expect, test, type Page } from '@playwright/test';
import { PROMPTS, validAnswers } from '../../src/prompts.ts';

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
      await expect(reveal.getByRole('img', { name: new RegExp(`Your answer ${answer.toLocaleString('en-GB')}`) })).toBeVisible();
    }
    await page.getByRole('button', { name: q === 7 ? 'See marks' : 'Next question' }).click();
  }

  // Results
  await expect(page.getByRole('heading', { name: "Today's worksheet, marked" })).toBeVisible();
  await expect(page.locator('.results__score')).toHaveText(String(expectedTotal));
  await expect(page.getByText('provisional', { exact: true })).toBeVisible();
  await expect(page.locator('.result')).toHaveCount(7);
  await expect(page.locator('.result').nth(3)).toContainText('out of time');
  // Every question shows a strip of its crowd; the timed-out one has no red dot.
  await expect(page.locator('.result__strip')).toHaveCount(7);
  await expect(page.locator('.result__strip figure[data-mine="yes"]')).toHaveCount(6);
  await expect(page.locator('.countdown')).toContainText(/Next worksheet in \d\d:\d\d:\d\d/);

  const share = await page.getByLabel('Share text').innerText();
  expect(share).toMatch(new RegExp(`^Outlier \\d\\d/\\d\\d/\\d\\d — ${expectedTotal}/700\\n[·○◐●★✦✗]{7}\\n`));
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

test('practice mode plays the same but saves nothing', async ({ page }) => {
  await page.goto('/practice');
  await expect(page.getByText('PRACTICE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  for (let q = 1; q <= 7; q++) {
    const valid = await answersOnScreen(page);
    await page.keyboard.type(String(valid[Math.floor(valid.length / 2)]));
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: q === 7 ? 'See marks' : 'Next question' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Practice paper, marked' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Another paper' })).toBeVisible();
  await page.goto('/book');
  await expect(page.getByText('Nothing marked yet.')).toBeVisible();
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
