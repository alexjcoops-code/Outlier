// Two real browsers play a private room through the stand-in server
// (tests/e2e/fakeSupabase.ts), which runs the real SQL. Real time: about a minute.
import { expect, test, type Page } from '@playwright/test';
import { PROMPTS, validAnswers } from '../../src/prompts.ts';

const byText = new Map(PROMPTS.map((p) => [p.text, p]));

async function questionOnScreen(page: Page, round: number): Promise<number[]> {
  await expect(page.locator('form.answer')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.margin-note')).toHaveText(`Q${round}.`);
  const text = (await page.locator('#prompt-text').innerText()).replace(/^Question \d of 5:\s*/, '').trim();
  const prompt = byText.get(text);
  if (!prompt) throw new Error(`Prompt not in the bank: "${text}"`);
  return validAnswers(prompt);
}

async function handIn(page: Page, value: number) {
  await page.getByLabel('Your answer, a whole number').fill(String(value));
  await page.keyboard.press('Enter');
}

test('two players in a private room: invite link, live rounds, split points, same register', async ({ browser }) => {
  test.setTimeout(180_000);
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();

  await host.goto('/versus');
  await expect(host.getByText(/has no server/)).toHaveCount(0);
  await host.getByLabel('Name on your paper').fill('Hosty');
  await host.getByText('1 v 1', { exact: true }).click();
  await host.getByRole('button', { name: 'Make a room for friends' }).click();
  await expect(host.getByRole('heading', { name: /Your room/ })).toBeVisible();
  await expect(host.getByText('Waiting for someone to join…')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Start now' })).toBeDisabled();
  const code = (await host.locator('.versus__bigcode').innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  // The guest follows the invite link.
  await guest.goto(`/versus?code=${code}`);
  await expect(guest.getByText("You've been invited!")).toBeVisible();
  await guest.getByLabel('Name on your paper').fill('Guesty');
  await guest.getByRole('button', { name: 'Join room' }).click();

  // A full room starts by itself, for both.
  for (const p of [host, guest]) await expect(p.getByText('Question 1 of 5')).toBeVisible({ timeout: 10_000 });

  for (let round = 1; round <= 5; round++) {
    const valid = await questionOnScreen(host, round);
    expect(await questionOnScreen(guest, round)).toEqual(valid);
    const top = valid[valid.length - 1]!;
    // Round 1: the same answer, so the points are split. After that, different answers.
    await handIn(host, top);
    await expect(guest.locator('table.register .register__q svg')).toHaveCount(1); // guest sees the host's tick
    await handIn(guest, round === 1 ? top : valid[0]!);

    for (const p of [host, guest]) {
      const rows = p.locator('ol.answers li');
      await expect(rows).toHaveCount(2, { timeout: 10_000 });
      await expect(rows.filter({ has: p.locator('.answers__name', { hasText: 'Hosty' }) }).locator('.answers__value')).toHaveText(top.toLocaleString('en-GB'));
      if (round === 1) await expect(p.getByText('÷ 2 =').first()).toBeVisible();
    }
  }

  for (const p of [host, guest]) await expect(p.locator('#final-title')).toBeVisible({ timeout: 20_000 });
  const register = async (p: Page) => (await p.locator('table.register--final tbody').innerText()).replace(/\(you\)/g, '').replace(/\s+/g, ' ');
  expect(await register(host)).toEqual(await register(guest));
});
