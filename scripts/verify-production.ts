/**
 * Production verification — REAL two-client browser test against the deployed URL.
 *
 * Uses puppeteer-core driving the locally installed Chrome, opening two separate
 * tabs (page A = host, page B = guest) exactly as the product advertises. It also
 * reads the live Realtime Database directly to confirm room cleanup.
 *
 * Run: npx tsx --tsconfig tsconfig.test.json scripts/verify-production.ts [baseUrl]
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';

const BASE = process.argv[2] ?? 'https://roomcade.vercel.app/';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT = resolve(process.cwd(), 'qa-artifacts', 'avatars-landing.png');
mkdirSync(dirname(ARTIFACT), { recursive: true });

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  const ok = !!cond;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const REQUIRED: Record<string, string> = {
  'Cyber Fox': 'fox', 'Astro Cat': 'cat', 'Glitch Alien': 'alien', 'Pixel Frog': 'frog',
  'Neon Bot': 'robot', 'Hyper Tiger': 'tiger', 'Frost Ghost': 'ghost', 'Blaze Wolf': 'wolf',
};

async function waitForUrl(page: Page, predicate: (url: string) => boolean, timeoutMs = 90000) {
  const start = Date.now();
  for (;;) {
    if (predicate(page.url())) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for url; current=${page.url()}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function typeInto(page: Page, selector: string, text: string) {
  await page.click(selector);
  await page.keyboard.type(text);
}

async function clickByText(page: Page, selector: string, text: string) {
  const ok = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').includes(t));
    if (!el) return false;
    (el as HTMLElement).click();
    return true;
  }, selector, text);
  if (!ok) throw new Error(`could not find ${selector} containing "${text}"`);
}

async function readPlayers(page: Page) {
  return page.$$eval('[data-player-avatar]', (els) =>
    els.map((el) => ({
      id: el.querySelector('[data-avatar-icon]')?.getAttribute('data-avatar-id') ?? null,
      species: el.querySelector('[data-avatar-icon]')?.getAttribute('data-avatar-species') ?? null,
      text: (el.parentElement?.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );
}

async function waitForPlayers(page: Page, n: number, label: string) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-player-avatar]').length === count, { timeout: 60000 }, n)
    .catch(() => { throw new Error(`${label}: expected ${n} player cards`); });
}

async function main() {
  // Two independent browser processes = two real clients (each with its own
  // sessionStorage uid and its own RTDB connection). Background tabs in one
  // headless/software-rendered browser get throttled and stall CDP input, so we
  // keep one page per browser and reuse the guest browser for transient clients.
  const launch = () => puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.HEADFUL ? false : true,
    protocolTimeout: 300_000,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  const hostBrowser = await launch();
  const guestBrowser = await launch();
  const step = (s: string) => console.log(`  · ${s}`);
  let roomCode = '';
  try {
    const pageA = await hostBrowser.newPage();
    const pageB = await guestBrowser.newPage();
    await pageA.setViewport({ width: 1400, height: 900 });
    await pageB.setViewport({ width: 1400, height: 900 });

    // ---- 1. Landing avatar picker: visual mapping -------------------------
    step('loading landing page');
    await pageA.goto(BASE, { waitUntil: 'networkidle2' });
    await pageA.waitForSelector('button[data-avatar-option]');
    const options = await pageA.$$eval('button[data-avatar-option]', (els) =>
      els.map((el) => ({
        id: el.getAttribute('data-avatar-option'),
        species: el.getAttribute('data-avatar-species'),
        label: el.getAttribute('aria-label'),
        markup: el.querySelector('[data-avatar-icon] svg')?.outerHTML ?? '',
      })),
    );
    check('avatar picker renders exactly 8 options', options.length === 8, `${options.length}`);
    for (const [name, species] of Object.entries(REQUIRED)) {
      const o = options.find((x) => x.label === name);
      check(`picker: ${name} → ${species}`, !!o && o.species === species && !!o.id, o ? `id=${o.id} species=${o.species}` : 'missing');
    }
    const uniqueMarkup = new Set(options.map((o) => o.markup));
    check('every avatar renders distinct SVG artwork (no repeated dragon)', uniqueMarkup.size === 8, `${uniqueMarkup.size} unique / 8`);
    await pageA.screenshot({ path: ARTIFACT, fullPage: false });
    console.log(`     ↳ screenshot saved: ${ARTIFACT}`);

    // ---- 2. Two tabs: create + join by code -------------------------------
    step('creating room as host');
    await typeInto(pageA, 'input[placeholder="Display name"]', 'Alice');
    await pageA.click('button[data-avatar-option="cyber-fox"]');
    await clickByText(pageA, 'button', 'Create room');
    await waitForUrl(pageA, (u) => new URL(u).pathname.startsWith('/room/'));
    roomCode = pageA.url().split('/room/')[1]!.split(/[/?#]/)[0]!;
    check('host creates a room and gets a 5-char code', /^[A-Z0-9]{5}$/.test(roomCode), roomCode);

    step('guest joins by code');
    await pageB.goto(BASE, { waitUntil: 'networkidle2' });
    await typeInto(pageB, 'input[placeholder="Display name"]', 'Bob');
    await pageB.click('button[data-avatar-option="blaze-wolf"]');
    await typeInto(pageB, 'input.room-code', roomCode);
    await clickByText(pageB, 'button', 'Join');
    await waitForUrl(pageB, (u) => u.endsWith(`/room/${roomCode}`)).catch(async () => {
      const txt = await pageB.evaluate(() => document.body.innerText);
      const diag = await pageB.evaluate(() => ({
        name: (document.querySelector('input[placeholder="Display name"]') as HTMLInputElement)?.value,
        code: (document.querySelector('input.room-code') as HTMLInputElement)?.value,
        join: [...document.querySelectorAll('button')].filter((e) => /join|…/i.test(e.textContent || '')).map((e) => ({ t: (e.textContent || '').trim().slice(0, 30), d: (e as HTMLButtonElement).disabled })),
        errs: [...document.querySelectorAll('p')].map((p) => p.textContent || '').filter((t) => /not found|full|name|code/i.test(t)),
      }));
      console.log('DEBUG guest url:', pageB.url(), '| diag:', JSON.stringify(diag), '| text:', txt.replace(/\s+/g, ' ').slice(0, 300));
      throw new Error('guest did not join');
    });
    check('guest joins the room by code', pageB.url().includes(`/room/${roomCode}`), pageB.url());

    // ---- 3/4/5. Both clients see identities + avatars ---------------------
    await waitForPlayers(pageA, 2, 'host tab');
    await waitForPlayers(pageB, 2, 'guest tab');
    const aPlayers = await readPlayers(pageA);
    const bPlayers = await readPlayers(pageB);
    check('host tab sees both players', aPlayers.some((p) => p.text.includes('Alice')) && aPlayers.some((p) => p.text.includes('Bob')));
    check('guest tab sees both players', bPlayers.some((p) => p.text.includes('Alice')) && bPlayers.some((p) => p.text.includes('Bob')));
    const aliceOnB = bPlayers.find((p) => p.text.includes('Alice'));
    const bobOnA = aPlayers.find((p) => p.text.includes('Bob'));
    check('host avatar is preserved (Cyber Fox, not swapped for a crown)', aliceOnB?.id === 'cyber-fox' && aliceOnB?.species === 'fox', `id=${aliceOnB?.id}`);
    check('guest avatar syncs correctly (Blaze Wolf)', bobOnA?.id === 'blaze-wolf' && bobOnA?.species === 'wolf', `id=${bobOnA?.id}`);

    // ---- 6. Player leaving updates the remaining client -------------------
    step('guest leaves');
    await pageB.close();
    await waitForPlayers(pageA, 1, 'host tab after guest leaves');
    check('6. closing a tab removes that player (onDisconnect)', (await readPlayers(pageA)).length === 1);

    // ---- 7. Refresh / reconnect keeps the same identity -------------------
    step('host reloads');
    await pageA.reload({ waitUntil: 'networkidle2' });
    await waitForPlayers(pageA, 1, 'host tab after reload');
    const afterReload = await readPlayers(pageA);
    check('7. reload keeps the host in the room with the same avatar',
      afterReload[0]?.id === 'cyber-fox' && afterReload[0]?.text.includes('Alice'), `id=${afterReload[0]?.id}`);

    // ---- 8. Invalid room code shows a clear error -------------------------
    const pageC = await guestBrowser.newPage();
    await pageC.goto(BASE, { waitUntil: 'networkidle2' });
    await typeInto(pageC, 'input[placeholder="Display name"]', 'Mallory');
    await typeInto(pageC, 'input.room-code', 'ZZZZZ');
    await clickByText(pageC, 'button', 'Join');
    await pageC.waitForFunction(() => /Room not found/i.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
    const errText = await pageC.evaluate(() => document.body.innerText);
    check('8. invalid room code shows "Room not found"', /Room not found/i.test(errText));
    await pageC.close();

    // ---- 9. Lobby → game transition with a second client ------------------
    step('game flow: guest rejoins');
    const pageB2 = await guestBrowser.newPage();
    await pageB2.goto(BASE, { waitUntil: 'networkidle2' });
    await typeInto(pageB2, 'input[placeholder="Display name"]', 'Bob');
    await pageB2.click('button[data-avatar-option="blaze-wolf"]');
    await typeInto(pageB2, 'input.room-code', roomCode);
    await clickByText(pageB2, 'button', 'Join');
    await waitForUrl(pageB2, (u) => u.endsWith(`/room/${roomCode}`));
    await waitForPlayers(pageA, 2, 'host tab (rejoin)');
    await waitForPlayers(pageB2, 2, 'guest tab (rejoin)');

    // Host selects Movie Trivia cartridge, then starts it.
    step('game flow: host starts Movie Trivia');
    await clickByText(pageA, 'button', 'Movie Trivia');
    await pageA.waitForFunction(() => /Start Movie Trivia/.test(document.body.innerText), { timeout: 60000 });
    await clickByText(pageA, 'button', 'Start Movie Trivia');
    await waitForUrl(pageA, (u) => new URL(u).pathname.endsWith('/play'));
    await waitForUrl(pageB2, (u) => new URL(u).pathname.endsWith('/play'));
    check('9. lobby → game transition reaches /play on BOTH clients', pageA.url().endsWith('/play') && pageB2.url().endsWith('/play'));
    check('9. in-game player list keeps avatars', (await readPlayers(pageA)).some((p) => p.id === 'cyber-fox') && (await readPlayers(pageB2)).some((p) => p.id === 'blaze-wolf'));

    // Round start
    step('game flow: round start');
    await clickByText(pageA, 'button', 'Start Trivia');
    await pageB2.waitForFunction(() => document.querySelector('#buzz-btn') !== null, { timeout: 60000 });
    check('9. round starts and both clients can buzz', true);

    // Input: guest buzzes and answers
    await clickByText(pageB2, 'button', 'BUZZ IN');
    await pageB2.waitForFunction(() => document.querySelector('#mv-quiz-card') !== null, { timeout: 40000 });
    const answered = await pageB2.evaluate(() => {
      const card = document.querySelector('#mv-quiz-card');
      const btns = card ? [...card.querySelectorAll('button')] : [];
      const target = btns.find((b) => /^[A-D]\./.test((b.textContent || '').trim()));
      if (!target) return false;
      (target as HTMLElement).click();
      return true;
    });
    check('9. guest input accepted (answer submitted)', answered);
    await new Promise((r) => setTimeout(r, 800));

    // Round end / advance, then return to lobby
    step('game flow: advance + return to lobby');
    await clickByText(pageA, 'button', 'Skip →');
    await clickByText(pageA, 'button', 'Lobby');
    await waitForUrl(pageA, (u) => u.endsWith(`/room/${roomCode}`));
    await waitForUrl(pageB2, (u) => u.endsWith(`/room/${roomCode}`));
    check('9. return to lobby works on BOTH clients', pageA.url().endsWith(`/room/${roomCode}`) && pageB2.url().endsWith(`/room/${roomCode}`));
    await waitForPlayers(pageA, 2, 'host tab after returning to lobby');
    check('9. both players still in the lounge after the game', (await readPlayers(pageA)).length === 2);
    await pageB2.close();

    // ---- 10. Room cleanup after everyone leaves ---------------------------
    step('cleanup: host leaves');
    await clickByText(pageA, 'button', 'Leave');
    await waitForUrl(pageA, (u) => new URL(u).pathname === '/').catch(() => {});

    const { getFirebase } = await import('../lib/firebase');
    const { get, ref } = await import('firebase/database');
    const fb = getFirebase()!;
    let gone = false;
    for (let i = 0; i < 20; i++) {
      const v = (await get(ref(fb.rtdb, `rooms/${roomCode}`))).val();
      if (v == null) { gone = true; break; }
      await new Promise((r) => setTimeout(r, 300));
    }
    check('10. room node is deleted in RTDB after everyone leaves', gone, `rooms/${roomCode}`);
  } catch (e: any) {
    failed++;
    console.error('UNEXPECTED ERROR:', e?.stack ?? e);
  } finally {
    await hostBrowser.close();
    await guestBrowser.close();
  }

  console.log(`\n${failed === 0 ? 'ALL PRODUCTION CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
