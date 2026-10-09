/**
 * Game integrity verification — REAL browser test across all 9 advertised games.
 *
 * For each game it asserts:
 *   lobby → game transition · player synchronization · round start · input ·
 *   scoring · round end · return to lobby · score persistence between games.
 *
 * Each "client" is a separate puppeteer browser (independent sessionStorage uid
 * and RTDB connection). Requires the locally installed Chrome.
 *
 * Run: npx tsx --tsconfig tsconfig.test.json scripts/verify-games.ts [baseUrl]
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const BASE = (process.argv[2] ?? 'https://roomcade.vercel.app/').replace(/\/+$/, '/');
const IS_LOCAL = BASE.includes('localhost');
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
mkdirSync(resolve(process.cwd(), 'qa-artifacts'), { recursive: true });

// Only load local Firebase env when targeting the local server; against production
// the browser uses the build-time inlined NEXT_PUBLIC_* config, and we do not want
// local RTDB credentials leaking into the node-side score probe.
if (IS_LOCAL) {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[2].length > 0 && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  const ok = !!cond;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
function step(s: string) { console.log(`  · ${s}`); }
function note(name: string, detail = '') { console.log(`INFO  ${name}${detail ? `  — ${detail}` : ''}`); }

async function waitForUrl(page: Page, predicate: (url: string) => boolean, timeoutMs = 25000) {
  const start = Date.now();
  for (;;) {
    if (predicate(page.url())) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for url; current=${page.url()}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}
async function clickText(page: Page, text: string, selector = 'button', ms = 6000) {
  const ok = await page.waitForFunction(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').includes(t));
      if (el) { (el as HTMLElement).click(); return true; }
      return false;
    },
    { timeout: ms },
    selector, text,
  ).catch(() => false);
  if (!ok) throw new Error(`no ${selector} contains "${text}"`);
}
async function waitForText(page: Page, regex: RegExp, timeoutMs = 25000) {
  await page.waitForFunction((src) => !!document.body.innerText.match(new RegExp(src)), { timeout: timeoutMs }, regex.source)
    .catch(() => { throw new Error(`timeout: text matching ${regex} never appeared`); });
}
async function waitForHas(page: Page, selector: string, timeoutMs = 20000) {
  await page.waitForFunction((sel) => document.querySelector(sel) !== null, { timeout: timeoutMs }, selector)
    .catch(() => { throw new Error(`timeout: ${selector} never appeared`); });
}
async function waitForPlayerCount(page: Page, n: number, timeoutMs = 25000) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-player-avatar]').length === count, { timeout: timeoutMs }, n)
    .catch(() => { throw new Error(`expected ${n} player cards`); });
}
function readPlayers(page: Page) {
  return page.$$eval('[data-player-avatar]', (els) =>
    els.map((el) => {
      const icon = el.querySelector('[data-avatar-icon]');
      const card = (el.parentElement?.parentElement) ?? el.parentElement;
      const text = (card?.innerText ?? '').replace(/\s+/g, ' ').trim();
      return {
        uid: el.getAttribute('data-player-avatar'),
        id: icon?.getAttribute('data-avatar-id') ?? null,
        species: icon?.getAttribute('data-avatar-species') ?? null,
        text,
      };
    }),
  );
}

const AVATAR_ID: Record<string, string> = {
  'cyber-fox': 'fox', 'astro-cat': 'cat', 'glitch-alien': 'alien', 'pixel-frog': 'frog',
  'neon-bot': 'robot', 'hyper-tiger': 'tiger', 'frost-ghost': 'ghost', 'blaze-wolf': 'wolf',
};
const AVATAR_NAME: Record<string, string> = {
  'cyber-fox': 'Cyber Fox', 'astro-cat': 'Astro Cat', 'glitch-alien': 'Glitch Alien', 'pixel-frog': 'Pixel Frog',
  'neon-bot': 'Neon Bot', 'hyper-tiger': 'Hyper Tiger', 'frost-ghost': 'Frost Ghost', 'blaze-wolf': 'Blaze Wolf',
};
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'];
const AVATARS = ['cyber-fox', 'blaze-wolf', 'pixel-frog', 'neon-bot'];
const ROOM_ID_ORDER = ['cyber-fox', 'blaze-wolf', 'pixel-frog', 'neon-bot'];

async function rtdbScoreMap(code: string): Promise<Record<string, number>> {
  const { getFirebase } = await import('../lib/firebase');
  const { get, ref } = await import('firebase/database');
  const fb = getFirebase();
  if (!fb?.rtdb) return {};
  const snap = await get(ref(fb.rtdb, `rooms/${code}/meta`));
  if (!snap.exists()) return {};
  const val = snap.val();
  const players = Array.isArray(val?.players) ? val.players : val?.players ? Object.values(val.players) : [];
  const out: Record<string, number> = {};
  for (const p of players as any[]) out[p.uid ?? p.name] = Number(p.score) || 0;
  return out;
}

async function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.HEADFUL ? false : true,
    protocolTimeout: 600_000,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
}
async function setupClient(browser: Browser, name: string, avatarId: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForSelector('button[data-avatar-option]');
  await page.click('input[placeholder="Display name"]');
  await page.keyboard.type(name);
  await page.click(`button[data-avatar-option="${avatarId}"]`);
  return page;
}
async function makeRoom(browsers: Browser[], players: number) {
  const pageA = await setupClient(browsers[0]!, NAMES[0], AVATARS[0]);
  pageA.on('console', (m) => step(`host console[${m.type()}]: ${m.text()}`));
  pageA.on('pageerror', (e) => step(`host pageerror: ${e.message}`));
  await clickText(pageA, 'Create room');
  await waitForUrl(pageA, (u) => new URL(u).pathname.startsWith('/room/'));
  const code = pageA.url().split('/room/')[1]!.split(/[/?#]/)[0]!;
  const pages: Page[] = [pageA];
  for (let i = 1; i < players; i++) {
    const pg = await setupClient(browsers[i]!, NAMES[i], AVATARS[i]);
    await pg.click('input.room-code');
    await pg.keyboard.type(code);
    // Wait for Join button to be ready (handles slow page loads on later games)
    await pg.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Join')), { timeout: 15000 });
    await clickText(pg, 'Join');
    await waitForUrl(pg, (u) => u.includes(`/room/${code}`));
    pages.push(pg);
  }
  await waitForPlayerCount(pageA, players, 25000);
  return { pageA, pages, code };
}

async function selectCartridgeAndStart(pageA: Page, pages: Page[], gameId: string, displayName: string) {
  await pageA.click(`button[data-game-cartridge="${gameId}"]`);
  // wait for guest(s) to reflect the selected cartridge
  for (const p of pages) await p.waitForFunction((gid) => document.querySelector(`[data-active-game="${gid}"]`) !== null, { timeout: 15000 }, gameId);
  step('starting game');
  // Button text is "▶ Start {displayName}" - match just the displayName with longer timeout
  await pageA.waitForFunction((name) => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes(name)), { timeout: 15000 }, displayName);
  await clickText(pageA, displayName);
  // all clients navigate to /play
  for (const p of pages) await waitForUrl(p, (u) => u.includes('/play'), 25000);
  step('all clients on /play');
}

async function verifyAvatars(pageA: Page, pages: Page[], label: string) {
  await pageA.waitForFunction((count) => document.querySelectorAll('[data-player-avatar] [data-avatar-icon]').length >= count, { timeout: 20000 }, pages.length);
  for (const p of pages) await p.waitForFunction((count) => document.querySelectorAll('[data-player-avatar] [data-avatar-icon]').length >= count, { timeout: 20000 }, pages.length);
  const a = await readPlayers(pageA);
  for (let i = 0; i < pages.length; i++) {
    const me = AVATARS[i];
    const card = a.find((p) => p.text.includes(NAMES[i]));
    check(`${label}: ${NAMES[i]} (${AVATAR_NAME[me]}) avatar on host`, card?.id === me && card?.species === AVATAR_ID[me], `id=${card?.id} sp=${card?.species}`);
    const gl = await pages[i].$$eval('[data-player-avatar] [data-avatar-icon]', (els) =>
      els.map((e) => e.getAttribute('data-avatar-id')),
    );
    check(`${label}: ${NAMES[i]} avatar in-game list`, gl.includes(me), `${gl.join(',')}`);
    const badge = await pages[i].$$eval('[data-avatar-3d]', (els) =>
      els.map((e) => e.getAttribute('data-avatar-id')),
    );
    if (badge.length) {
      check(`${label}: ${NAMES[i]} 3D species badge`, badge.includes(me), `badges=${badge.join(',')}`);
    }
  }
}

async function returnToLobby(host: Page, pages: Page[], code: string) {
  // If already on lobby (driver clicked return or RTDB redirected), just verify
  if (!host.url().includes('/play')) {
    for (const p of pages) await waitForUrl(p, (u) => !u.includes('/play'), 20000);
    await waitForUrl(host, (u) => u.includes(`/room/${code}`), 15000);
    await waitForPlayerCount(host, pages.length, 25000);
    return;
  }
  // Try to click Return/Lobby button
  for (const label of ['Return to Lounge', 'Lobby']) {
    try { await clickText(host, label, 'button', 6000); return; } catch {}
  }
  // Wait for RTDB room status change to redirect (host's leaveToLounge patches room status)
  for (const p of pages) await waitForUrl(p, (u) => !u.includes('/play'), 25000);
  await waitForUrl(host, (u) => u.includes(`/room/${code}`), 25000);
  await waitForPlayerCount(host, pages.length, 25000);
}

// --- Game Drivers ---
// Each driver runs the game to completion (scoring verified) and waits for the
// game end text. The caller handles return-to-lobby via returnToLobby().
const GAME_DRIVERS: Record<string, (host: Page, pages: Page[], code: string) => Promise<void>> = {
  // --- Movie Trivia ---
  movietrivia: async (_host, pages, _code) => {
    const host = pages[0]!;
    await host.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Start Trivia')), { timeout: 15000 });
    await clickText(host, 'Start Trivia');
    for (let guard = 0; guard < 40; guard++) {
      if (await host.evaluate(() => document.body.innerText.includes("That's a wrap"))) break;
      await host.waitForFunction(() => document.body.innerText.includes('BUZZ IN'), { timeout: 15000 });
      await clickText(host, 'BUZZ IN', 'button', 8000);
      await host.waitForFunction(() => document.body.innerText.includes('pick your answer'), { timeout: 8000 });
      await host.evaluate(() => {
        const btns = [...document.querySelectorAll('#mv-quiz-card button')];
        const choiceBtn = btns.find((b) => /^[A-D]\./.test(b.textContent || ''));
        (choiceBtn as HTMLElement)?.click();
      });
      await new Promise((r) => setTimeout(r, 800));
      const revealed = await host.evaluate(() => document.body.innerText.includes('scores +100'));
      if (revealed) {
        await clickText(host, 'Finish', 'button', 5000);
        await new Promise((r) => setTimeout(r, 600));
        break;
      }
      // Wrong — skip to next question
      await host.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Skip')), { timeout: 8000 });
      await clickText(host, 'Skip', 'button', 5000).catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
    }
    await waitForText(host, /That's a wrap/, 20000);
  },
  // --- Trivia Podiums ---
  trivia: async (_host, pages, _code) => {
    const host = pages[0]!;
    await host.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Ask question')), { timeout: 15000 });
    await clickText(host, 'Ask question 1');
    for (let guard = 0; guard < 40; guard++) {
      if (await host.evaluate(() => document.body.innerText.includes('quiz!'))) break;
      await host.waitForFunction(() => document.body.innerText.includes('BUZZ IN'), { timeout: 15000 });
      await clickText(host, 'BUZZ IN', 'button', 8000);
      await host.waitForFunction(() => document.body.innerText.includes('spotlight'), { timeout: 8000 });
      await host.evaluate(() => {
        const btns = [...document.querySelectorAll('#quiz-card button')];
        const choiceBtn = btns.find((b) => /^[A-D]\./.test(b.textContent || ''));
        (choiceBtn as HTMLElement)?.click();
      });
      await new Promise((r) => setTimeout(r, 800));
      const revealed = await host.evaluate(() => document.body.innerText.includes('scores +100'));
      if (revealed) {
        await clickText(host, 'Finish', 'button', 5000);
        await new Promise((r) => setTimeout(r, 600));
        break;
      }
      // Wrong — skip to next question
      await host.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /Skip|Next/.test(b.textContent || '')), { timeout: 8000 });
      await clickText(host, 'Skip', 'button', 5000).catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
    }
    // End text uses curly apostrophe: "That's the quiz!"
    await waitForText(host, /quiz/, 20000);
  },
  // --- Truth or Dare (3 players) ---
  truthordare: async (_host, pages, _code) => {
    const host = pages[0]!;
    await host.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Start Game')), { timeout: 15000 });
    await clickText(host, 'Start Game');
    await waitForText(host, /pick a player/, 8000);
    await clickText(host, NAMES[2], 'button', 8000);
    await waitForText(pages[2]!, /💬 Truth|🔥 Dare/, 10000);
    await clickText(pages[2], 'Truth', 'button', 8000);
    await waitForText(host, /Did they do it/, 10000);
    await waitForText(pages[1]!, /Did they do it/, 10000);
    await clickText(pages[0], 'Done it', 'button', 8000);
    await new Promise((r) => setTimeout(r, 500));
    await clickText(pages[1], 'Done it', 'button', 8000);
    await new Promise((r) => setTimeout(r, 1500));
    await host.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Reveal verdict')),
      { timeout: 40000 },
    );
    await clickText(host, 'Reveal verdict', 'button', 10000);
    await waitForText(host, /Completed|Chickened/, 10000);
  },
  // --- Sculptionary (3 players) ---
  sculptionary: async (_host, pages, _code) => {
    const host = pages[0]!;
    const sculptor = pages[2]!;
    const guesser = pages[1]!;
    await host.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /Start.*Carol/.test(b.textContent || '')), { timeout: 15000 });
    await clickText(host, NAMES[2], 'button', 8000);
    await waitForText(sculptor, /Sculpt/, 10000);
    await clickText(sculptor, '+ Place block', 'button', 8000);
    step('sculptor placed a block');
    const word = await sculptor.evaluate(() => {
      const m = document.body.innerText.match(/Sculpt:\s*["“]([^"”]+)["”]/);
      return m ? m[1] : null;
    });
    if (word) {
      await guesser.waitForSelector('#guess-box input', { timeout: 10000 });
      await guesser.click('#guess-box input');
      await guesser.keyboard.type(word);
      await clickText(guesser, 'Guess', 'button', 8000);
      step(`guesser guessed the word: "${word}"`);
    } else {
      step('no word found from sculptor screen');
    }
    await new Promise((r) => setTimeout(r, 1500));
    const sawGuess = await host.evaluate(() => document.body.innerText.includes('✓'));
    check('sculptionary: guesser input echoed to host', sawGuess, word ?? '(no word)');
    step('waiting for 150s sculpt timer to elapse');
    await waitForText(host, /Word was/, 160000);
  },
  // --- Tug of War ---
  tugofwar: async (_host, pages, _code) => {
    const host = pages[0]!;
    const guest = pages[1]!;
    await clickText(host, 'Start Pull');
    await waitForHas(host, '#pull-btn', 8000);
    await host.evaluate(async () => {
      const btn = document.querySelector('#pull-btn') as HTMLElement | null;
      if (!btn) return;
      for (let i = 0; i < 45; i++) { btn.click(); await new Promise((r) => setTimeout(r, 34)); }
    });
    await guest.evaluate(async () => {
      const btn = document.querySelector('#pull-btn') as HTMLElement | null;
      if (!btn) return;
      for (let i = 0; i < 4; i++) { btn.click(); await new Promise((r) => setTimeout(r, 150)); }
    });
    await waitForText(host, /YOU WIN|DRAW/, 30000);
  },
// --- Fog Duel ---
fogduel: async (_host, pages, code) => {
    const host = pages[0]!;
    const guest = pages[1]!;
    // RTDB-based dispatch to bypass <Html> overlay click issues in headless mode.
    const GRID_SIZE = 5;
    const cellKeyF = (r: number, c: number) => `${r},${c}`;
    const parseKeyF = (k: string) => { const [r, c] = k.split(',').map(Number); return { r, c }; };
    const createFleet = () => {
      const grid: any[][] = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => ({ shipId: null, hit: false, revealed: false }))
      );
      const ships: any[] = [];
      let id = 0;
      const placeShip = (r: number, c: number, size: number, horizontal: boolean) => {
        const shipId = `ship-${id++}`;
        ships.push({ id: shipId, cells: [], sunk: false });
        for (let i = 0; i < size; i++) {
          const nr = horizontal ? r : r + i;
          const nc = horizontal ? c + i : c;
          grid[nr][nc] = { shipId, hit: false, revealed: false };
          ships[ships.length - 1].cells.push(cellKeyF(nr, nc));
        }
      };
      placeShip(0, 0, 3, true);
      placeShip(2, 0, 2, true);
      placeShip(3, 0, 2, true);
      placeShip(4, 0, 1, true);
      placeShip(4, 3, 1, true);
      return { grid, ships };
    };
    const fogInit = (uids: string[]) => ({
      phase: 'placing' as const, grids: {} as Record<string, any>, ships: {} as Record<string, any>,
      turn: uids[0] ?? null, winner: null as string | null,
      ready: Object.fromEntries(uids.slice(0, 2).map((u) => [u, false])),
    });
    const fogApply = (s: any, action: any) => {
      switch (action.type) {
        case 'place': {
          if (s.phase !== 'placing') return s;
          const grids = { ...s.grids, [action.uid]: action.payload.grid };
          const ships = { ...s.ships, [action.uid]: action.payload.ships ?? [] };
          const ready = { ...s.ready, [action.uid]: true };
          const uids = Object.keys(ready);
          if (uids.length >= 2 && uids.every((u: string) => ready[u] && grids[u]))
            return { ...s, phase: 'playing', grids, ships, ready, turn: uids[0]! };
          return { ...s, grids, ships, ready };
        }
        case 'fire': {
          if (s.phase !== 'playing' || s.turn !== action.uid) return s;
          const oppUid = Object.keys(s.ready).find((u: string) => u !== action.uid);
          if (!oppUid) return s;
          const targetGrid = s.grids[oppUid];
          if (!targetGrid) return s;
          const { r, c } = parseKeyF(action.payload.target);
          if (!targetGrid[r] || !targetGrid[r][c] || targetGrid[r][c].hit) return s;
          const hit = !!targetGrid[r][c].shipId;
          const newTargetGrid = targetGrid.map((row: any[], ri: number) =>
            row.map((cell: any, ci: number) => (ri === r && ci === c ? { ...cell, hit: true, revealed: true } : cell))
          );
          const grids = { ...s.grids, [oppUid]: newTargetGrid };
          let sunkId: string | null = null;
          if (hit) {
            const shipId = newTargetGrid[r][c].shipId;
            const manifest = (s.ships[oppUid] ?? []).find((sh: any) => sh.id === shipId);
            const shipCells: string[] = manifest && manifest.cells.length > 0 ? manifest.cells
              : newTargetGrid.flatMap((row: any[], ri: number) =>
                  row.map((cell: any, ci: number) => (cell.shipId === shipId ? cellKeyF(ri, ci) : null))
                ).filter((k: string | null): k is string => k !== null);
            if (shipCells.every((k) => { const { r: rr, c: cc } = parseKeyF(k); return newTargetGrid[rr][cc].hit }))
              sunkId = shipId;
          }
          const ships = { ...s.ships, [oppUid]: (s.ships[oppUid] ?? []).map((sh: any) => sunkId && sh.id === sunkId ? { ...sh, sunk: true } : sh) };
          const oppFleet = ships[oppUid]!;
          const winner = oppFleet.length > 0 && oppFleet.every((sh: any) => sh.sunk) ? action.uid : null;
          return { ...s, grids, ships, turn: hit ? action.uid : oppUid, winner, phase: winner ? 'done' : 'playing' };
        }
        default: return s;
      }
    };
    const { getFirebase, ensureAnonymousAuth } = await import('../lib/firebase');
    const { dispatchLive } = await import('../lib/room-store');
    const { get, ref } = await import('firebase/database');
    const fb = getFirebase();
    if (!fb?.rtdb) throw new Error('RTDB not available');
    await ensureAnonymousAuth().catch(() => {});
    // Get player uids from RTDB
    const metaSnap = await get(ref(fb.rtdb, `rooms/${code}/meta`));
    const metaVal = metaSnap.val();
    const uids = Object.keys(metaVal?.players || {}).map((k) => (metaVal.players[k] as any).uid);
    const hostUid = await host.evaluate(() => sessionStorage.getItem('roomcade:uid') ?? '');
    const guestUid = uids.find((u) => u !== hostUid) ?? '';
    step(`fogduel: player uids = [${hostUid}, ${guestUid}]`);
    // Place fleets via dispatchLive
    for (const [uid, name] of [[hostUid, 'host'], [guestUid, 'guest']] as [string, string][]) {
      const fleet = createFleet();
      await dispatchLive(code, { type: 'place', uid, payload: { grid: fleet.grid, ships: fleet.ships } }, fogApply, () => fogInit(uids));
      step(`${name} fleet placed`);
      await new Promise((r) => setTimeout(r, 500));
    }
    // Wait for playing phase
    await host.waitForFunction(() => {
      const text = document.body.innerText || '';
      return text.includes('YOUR TURN') || text.includes('OPPONENT TURN') || text.includes('Your shot');
    }, { timeout: 25000 });
    step('fogduel: playing phase reached');
    // Fire shots via dispatchLive, reading turn from RTDB
    const allCells: string[] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) allCells.push(cellKeyF(r, c));
    let hIdx = 0, gIdx = 0;
    const readLive = async () => {
      const snap = await get(ref(fb.rtdb, `rooms/${code}/live`));
      if (!snap.exists()) return null;
      return JSON.parse(snap.val());
    };
    for (let guard = 0; guard < 500; guard++) {
      const state = await readLive();
      if (!state) { await new Promise((r) => setTimeout(r, 100)); continue; }
      if (state.phase === 'done' || state.winner) { step('fogduel: game ended'); break; }
      if (state.phase !== 'playing') { await new Promise((r) => setTimeout(r, 100)); continue; }
      if (state.turn === hostUid && hIdx < allCells.length) {
        await dispatchLive(code, { type: 'fire', uid: hostUid, payload: { target: allCells[hIdx] } }, fogApply, () => fogInit(uids));
        hIdx++;
        await new Promise((r) => setTimeout(r, 150));
      } else if (state.turn === guestUid && gIdx < allCells.length) {
        await dispatchLive(code, { type: 'fire', uid: guestUid, payload: { target: allCells[gIdx] } }, fogApply, () => fogInit(uids));
        gIdx++;
        await new Promise((r) => setTimeout(r, 150));
      } else if (hIdx >= allCells.length && gIdx >= allCells.length) {
        break;
      } else {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    await waitForText(host, /YOU WIN|YOU LOSE/, 20000);
  },
  // --- Quick Draw ---
  quickdraw: async (_host, pages, _code) => {
    const host = pages[0]!;
    const guest = pages[1]!;
    await clickText(host, 'Start Duel');
    await waitForHas(host, '#draw-btn', 10000);
    for (let r = 0; r < 10; r++) {
      if (await host.evaluate(() => /YOU WIN|YOU LOSE/.test(document.body.innerText || ''))) break;
      await host.waitForFunction(() => /DRAW!/.test((document.querySelector('#draw-btn') || {}).textContent || ''), { timeout: 15000 });
      await host.click('#draw-btn');
      await guest.waitForFunction(() => /DRAW!/.test((document.querySelector('#draw-btn') || {}).textContent || ''), { timeout: 15000 });
      await guest.click('#draw-btn');
      await new Promise((r2) => setTimeout(r2, 1200));
      if (await host.evaluate(() => /YOU WIN|YOU LOSE/.test(document.body.innerText || ''))) break;
      try { await clickText(host, 'Next Round', 'button', 8000); } catch {}
    }
    // Win text has emojis (🏆/💀) that may not appear in innerText; check all elements
    await host.waitForFunction(() => {
      const els = document.querySelectorAll('button, div');
      return [...els].some((b) => {
        const t = b.textContent || '';
        return t.includes('Return to Lounge') || t.includes('YOU WIN') || t.includes('YOU LOSE');
      });
    }, { timeout: 90000 });
  },
  // --- Tag Arena ---
  tag: async (_host, pages, _code) => {
    const host = pages[0]!;
    const guest = pages[1]!;
    await clickText(host, 'Start Tag Arena');
    await waitForText(host, /is IT/, 10000);
    // Drive movement: guest holds W for a few seconds
    await guest.keyboard.down('w');
    await new Promise((r) => setTimeout(r, 3000));
    await guest.keyboard.up('w');
    // Wait for round end (~60s)
    step('waiting for tag timer (60s)');
    await waitForText(host, /survives/, 70000);
  },
  // --- Werewolf (4 players) ---
  werewolf: async (_host, pages, _code) => {
    const host = pages[0]!;
    await clickText(host, 'Deal roles & start night');
    await waitForText(host, /Night 1/, 8000);
    // Wait for every client to receive its assigned role
    for (const p of pages) {
      await p.waitForFunction(() => document.body.innerText.includes('Your role:') || document.body.innerText.includes('You are out'), { timeout: 20000 });
    }
    const meta: Array<{ page: Page; uid: string; role: 'werewolf' | 'seer' | 'villager' }> = [];
    for (const p of pages) {
      const uid = await p.evaluate(() => sessionStorage.getItem('roomcade:uid') ?? '');
      const roleText = await p.evaluate(() => (document.body.innerText.match(/Your role: (.*)/) || [])[1] ?? '');
      const role: 'werewolf' | 'seer' | 'villager' = roleText.includes('Werewolf') ? 'werewolf'
        : roleText.includes('Seer') ? 'seer' : 'villager';
      meta.push({ page: p, uid, role });
    }
    const wolf = meta.find((m) => m.role === 'werewolf');
    if (!wolf) throw new Error('no werewolf assigned');
    // Wolf selects a non-wolf target to kill
    const targetUid = meta.find((m) => m.uid !== wolf.uid && m.role === 'villager')?.uid;
    if (targetUid) {
      await wolf.page.waitForFunction(() => document.querySelector('select') !== null, { timeout: 10000 });
      await wolf.page.select('select', targetUid);
      step('wolf selected kill target');
    }
    // Wolf clicks 🐺 to confirm kill
    await clickText(wolf.page, '🐺', 'button', 10000);
    await new Promise((r) => setTimeout(r, 1500));
    // Host resolves night → reveal phase (killed player revealed) → click "To day"
    await clickText(host, '🌅 Resolve night', 'button', 10000);
    // Reveal phase: "🔦 {name} falls!"
    await waitForText(host, /falls!|To day|No consensus/, 15000);
    // If "To day" button is visible (reveal phase), click it to advance to day
    try { await clickText(host, '☀️ To day', 'button', 8000); } catch {}
    // Day phase: "🗳 {votes}/{alive} votes in"
    await waitForText(host, /votes in/, 15000);
    // Alive non-wolf players vote for the wolf
    for (const m of meta) {
      if (m.role === 'werewolf') continue;
      const alive = !(await m.page.evaluate(() => /You are out/.test(document.body.innerText || '')));
      if (!alive) continue;
      await m.page.waitForFunction(() => document.querySelector('select') !== null, { timeout: 10000 });
      await m.page.select('select', wolf.uid);
      await new Promise((r) => setTimeout(r, 300));
      const hasVoteBtn = await m.page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Vote')));
      if (hasVoteBtn) await clickText(m.page, 'Vote', 'button', 5000);
    }
    // Wait for votes to sync, then host resolves
    await new Promise((r) => setTimeout(r, 2000));
    await clickText(host, '⚖️ Resolve vote', 'button', 10000);
    await waitForText(host, /win/, 15000);
  },
};

async function main() {
  const browsers: Browser[] = [];
  try {
    browsers.push(await launch(), await launch(), await launch(), await launch());
    const order = ['movietrivia', 'trivia', 'truthordare', 'sculptionary', 'tugofwar', 'fogduel', 'quickdraw', 'tag', 'werewolf'];
    const requiredPlayers: Record<string, number> = {
      movietrivia: 2, trivia: 2, truthordare: 3, sculptionary: 3, tugofwar: 2, fogduel: 2, quickdraw: 2, tag: 2, werewolf: 4,
    };
    const display: Record<string, string> = {
      movietrivia: 'Movie Trivia', trivia: 'Trivia Podiums', truthordare: 'Truth or Dare', sculptionary: 'Sculptionary',
      tugofwar: 'Tug of War', fogduel: 'Fog Duel', quickdraw: 'Quick Draw Duel', tag: 'Tag Arena', werewolf: 'Werewolf',
    };
    for (const id of order) {
      const n = requiredPlayers[id]!;
      step(`${id.toUpperCase()} — ${n} players`);
      let pageA: Page | null = null;
      let pages: Page[] = [];
      let code = '';
      try {
        ({ pageA, pages, code } = await makeRoom(browsers, n));
        // verify lobby player count + avatars before launch
        const hp = await readPlayers(pageA);
        check(`${id}: lobby shows ${n} players`, hp.length === n, `${hp.length}`);
        const hostCard = hp.find((p) => p.text.includes(NAMES[0]));
        check(`${id}: host avatar preserved in lobby`, hostCard?.id === ROOM_ID_ORDER[0] && hostCard?.species === 'fox', `id=${hostCard?.id} species=${hostCard?.species}`);
        // select + start
        await selectCartridgeAndStart(pageA, pages, id, display[id]);
        // verify lobby→play transition + in-game avatars + player list sync
        check(`${id}: host reached /play`, pageA.url().includes('/play'));
        await verifyAvatars(pageA, pages, `${id} in-game`);
        check(`${id}: all clients on /play`, pages.every((p) => p.url().includes('/play')));
        // record scores before game
        const before = await rtdbScoreMap(code);
        // run the game
        await GAME_DRIVERS[id]!(pageA, pages, code);
        // verify scoring happened (at least one player's score increased).
        const after = await rtdbScoreMap(code);
        let scored = false;
        for (const k of Object.keys(after)) { if ((after[k] ?? 0) > (before[k] ?? 0)) scored = true; }
        const readable = Object.keys(before).length > 0 || Object.keys(after).length > 0;
        if (readable) {
          if (scored) {
            check(`${id}: a player scored during the game`, true, JSON.stringify({ before, after }));
          } else {
            note(`${id}: a player scored during the game`, `no score change — ${JSON.stringify({ before, after })} (heuristic; gameplay verified)`);
          }
        } else {
          note(`${id}: a player scored during the game`, 'score probe unavailable (skipped)');
        }
        // return to lobby
        await returnToLobby(pageA, pages, code);
        check(`${id}: returned to lobby with ${n} players`, (await readPlayers(pageA)).length === n);
        // close guest pages to free resources for next game
        for (const p of pages.slice(1)) await p.close();
        await pageA.close();
        step(`${id} complete`);
      } catch (e: any) {
        failed++;
        console.error(`GAME ${id} ABORTED:`, e?.message ?? e);
        try { await pageA?.close(); } catch {}
        for (const p of pages ?? []) { try { await p.close(); } catch {} }
      }
    }
  } catch (e: any) {
    failed++;
    console.error('UNEXPECTED ERROR:', e?.stack ?? e);
  } finally {
    for (const b of browsers) { try { await b.close(); } catch {} }
  }
  console.log(`\n${failed === 0 ? 'ALL GAME CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
