import assert from 'node:assert/strict';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer-core';

const base = new URL(process.argv[2] ?? 'https://roomcade.vercel.app/');
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const timeout = 45_000;
const hostName = 'QA Host';
const guestName = 'QA Touch';

async function press(page: Page, text: string, touch = false) {
  const handle = await page.waitForFunction((label) => Array.from(document.querySelectorAll('button')).find(
    (button) => button.getClientRects().length && !button.disabled && button.textContent?.includes(label),
  ), { timeout, polling: 100 }, text);
  try {
    const button = handle.asElement() as ElementHandle<HTMLButtonElement> | null;
    assert.ok(button, `Missing button: ${text}`);
    await (touch ? button.tap() : button.click());
  } finally {
    await handle.dispose();
  }
}

async function pathIs(page: Page, path: string) {
  try {
    await page.waitForFunction((expected) => location.pathname === expected, { timeout, polling: 100 }, path);
  } catch (error) {
    const progress = await page.$$eval('[role="status"], [role="alert"]', (nodes) =>
      nodes.map((node) => node.textContent?.trim()).filter(Boolean));
    throw new Error(`Expected ${path}, reached ${new URL(page.url()).pathname}. ${progress.join(' ')}`, { cause: error });
  }
}

async function expectVisible(page: Page, selector: string) {
  await page.waitForFunction((target) => Boolean(document.querySelector(target)?.getClientRects().length),
    { timeout, polling: 100 }, selector);
}

async function expectRoster(page: Page) {
  await page.waitForFunction((names) => {
    const avatars = [...document.querySelectorAll('[data-player-avatar]')];
    return avatars.length === names.length && names.every((name) =>
      avatars.some((avatar) => avatar.parentElement?.parentElement?.textContent?.includes(name)));
  }, { timeout, polling: 100 }, [hostName, guestName]);
}

async function expectTotals(page: Page, scope: string, winner: string, loser: string) {
  await page.waitForFunction((selector, expected) => {
    const rows = [...document.querySelectorAll(selector)];
    return rows.length === expected.length && rows.every((row, index) => {
      const name = row.querySelector('[data-scoreboard-avatar]')?.nextElementSibling?.textContent?.trim();
      const points = row.lastElementChild?.firstElementChild?.textContent?.trim();
      return `${name}:${points}` === expected[index];
    });
  }, { timeout, polling: 100 }, scope, [`${winner}:400`, `${loser}:0`]);
}

async function run(join: 'link' | 'code') {
  const browsers: Browser[] = [];
  const pages: Page[] = [];
  const launch = async () => {
    const browser = await puppeteer.launch({
      executablePath,
      headless: !process.env.HEADFUL,
      args: [
        '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--disable-features=CalculateNativeWinOcclusion',
      ],
    });
    browsers.push(browser);
    const page = await browser.newPage();
    pages.push(page);
    return page;
  };

  let step = 'opening two isolated browsers';
  try {
    const host = await launch();
    const guest = await launch();
    await Promise.all([
      host.setViewport({ width: 1366, height: 900 }),
      guest.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }),
    ]);
    for (const page of [host, guest]) {
      page.setDefaultTimeout(timeout);
      page.on('pageerror', (error) => console.error(`[${join}] ${page.url()}: ${error.message}`));
    }

    step = 'creating a Quick Draw Duel room';
    await host.goto(base.href, { waitUntil: 'domcontentloaded' });
    await host.locator('input[placeholder="Display name"]').fill(hostName);
    await press(host, 'Quick Draw Duel');
    await press(host, 'Create room (Quick Draw Duel)');
    await host.waitForFunction(() => /^\/room\/[A-Z0-9]{5}$/.test(location.pathname), { timeout });
    const invite = new URL(host.url());
    const roomPath = invite.pathname;
    const code = roomPath.split('/').at(-1)!;

    step = `joining ${code} by ${join}`;
    await guest.goto(join === 'link' ? invite.href : base.href, { waitUntil: 'domcontentloaded' });
    if (join === 'link') {
      // A fresh invite opens under a generated guest name. Capture that name
      // from the public roster before asserting both clients see it.
      await guest.waitForFunction(() => document.querySelectorAll('[data-player-avatar]').length === 2, { timeout });
    } else {
      await guest.locator('input[placeholder="Display name"]').fill(guestName);
      await guest.tap('input.room-code');
      await guest.keyboard.type('00000');
      await press(guest, 'Join', true);
      await guest.waitForFunction(() =>
        document.querySelector('form [role="alert"]')?.textContent?.includes('Room not found'), { timeout });
      await guest.tap('input.room-code');
      await guest.keyboard.down('Control');
      await guest.keyboard.press('A');
      await guest.keyboard.up('Control');
      await guest.keyboard.type(code);
      step = 'checking that the join controls fit with a reduced mobile viewport';
      await guest.setViewport({ width: 390, height: 300, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      await guest.waitForFunction(() => {
        const controls = document.querySelector('[data-join-controls]')?.getBoundingClientRect();
        const viewport = window.visualViewport;
        return controls && viewport && controls.top >= viewport.offsetTop
          && controls.bottom <= viewport.offsetTop + viewport.height;
      }, { timeout: 5000 });
      step = `joining ${code} by ${join}`;
      await press(guest, 'Retry join', true);
      await guest.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    }
    await pathIs(guest, roomPath);
    if (join === 'code') {
      await Promise.all([expectRoster(host), expectRoster(guest)]);
    }
    const roster = (page: Page) => page.$$eval('[data-player-avatar]', (avatars) =>
      avatars.map((avatar) => avatar.getAttribute('data-player-avatar')).sort());
    await host.waitForFunction(() => document.querySelectorAll('[data-player-avatar]').length === 2, { timeout });
    assert.deepEqual(await roster(host), await roster(guest));
    const actualGuest = join === 'code' ? guestName : await guest.$eval(
      '[data-player-avatar]', (avatar) => {
        const card = [...avatar.ownerDocument.querySelectorAll('[data-player-avatar]')]
          .map((entry) => entry.parentElement?.parentElement)
          .find((entry) => entry?.textContent?.includes('(You)'));
        return card?.querySelector('.truncate')?.textContent?.replace('(You)', '').trim() ?? '';
      },
    );
    assert.ok(actualGuest);

    step = 'entering the same game on both clients';
    await press(host, 'Start Quick Draw Duel');
    await Promise.all([host, guest].map(async (page) => {
      await pathIs(page, `${roomPath}/play`);
      await expectVisible(page, '[data-game-scene="quickdraw"]');
    }));
    await press(host, 'Start Duel');

    const winningPage = join === 'link' ? host : guest;
    const losingPage = winningPage === host ? guest : host;
    const winner = winningPage === host ? hostName : actualGuest;
    const loser = winningPage === host ? actualGuest : hostName;
    step = 'scoring a false start';
    await press(losingPage, 'WAIT FOR IT', losingPage === guest);
    await Promise.all([host, guest].map((page) => page.waitForFunction(() =>
      Number(document.querySelector('#my-score')?.textContent) + Number(document.querySelector('#opp-score')?.textContent) === 1, { timeout })));

    for (let round = 2; round <= 5; round++) {
      step = `playing round ${round}`;
      await press(host, 'Next Round');
      await Promise.all([host, guest].map((page) => page.waitForFunction(() =>
        document.querySelector('#draw-btn')?.textContent?.includes('DRAW!'), { timeout })));
      await press(winningPage, 'DRAW!', winningPage === guest);
      await winningPage.waitForFunction(() => document.querySelector('#draw-btn')?.textContent?.includes('Draw recorded'), { timeout });
      await press(losingPage, 'DRAW!', losingPage === guest);
    }

    step = 'checking the final duel recap and night points';
    const recaps = await Promise.all([host, guest].map(async (page) => {
      const selector = 'section[aria-label="Duel recap"]';
      await expectVisible(page, selector);
      await expectTotals(page, '.score-row', winner, loser);
      return page.$$eval(`${selector} li`, (rows) => rows.map((row) => row.textContent?.trim()).sort());
    }));
    assert.deepEqual(recaps[0], [`${winner} · 5 rounds won`, `${loser} · 0 rounds won`].sort());
    assert.deepEqual(recaps[1], recaps[0]);

    step = 'returning to the lounge and opening the shared night recap';
    await press(host, 'Return to Lounge');
    await Promise.all([pathIs(host, roomPath), pathIs(guest, roomPath)]);
    await press(host, 'End night & recap');
    const recap = '[role="dialog"][aria-label="Night recap"]';
    await Promise.all([host, guest].map(async (page) => {
      await expectVisible(page, recap);
      await expectTotals(page, `${recap} .score-row`, winner, loser);
    }));

    step = 'switching cartridges and checking that points carry forward';
    await press(host, 'Back to lounge');
    await Promise.all([host, guest].map((page) => page.waitForFunction((selector) => !document.querySelector(selector),
      { timeout, polling: 100 }, recap)));
    await press(host, 'Movie Trivia');
    await Promise.all([host, guest].map(async (page) => {
      await expectVisible(page, '[data-active-game="movietrivia"]');
      await expectTotals(page, '.score-row', winner, loser);
    }));
    await press(guest, 'Leave', true);
    await pathIs(guest, '/');
    await press(host, 'Leave');
    await pathIs(host, '/');
    console.log(`PASS ${join}: ${code}, desktop + touch, 5–0 duel and matching 400–0 night totals across the cartridge switch`);
  } catch (error) {
    await Promise.allSettled(pages.map(async (page, index) => {
      const progress = await page.$$eval('[role="status"], [role="alert"]', (nodes) =>
        nodes.map((node) => node.textContent?.trim()).filter(Boolean));
      console.error(`[${join}] ${index === 0 ? 'desktop' : 'touch'} ${page.url()} ${progress.join(' ')}`);
    }));
    throw new Error(`${join}: ${step}`, { cause: error });
  } finally {
    await Promise.allSettled(browsers.map((browser) => browser.close()));
  }
}

async function main() {
  for (const join of ['link', 'code'] as const) {
    try {
      await run(join);
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
}

void main();
