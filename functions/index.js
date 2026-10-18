/**
 * Room TTL cleanup.
 *
 * Clients may not list the whole `rooms` tree (by design — a room code is the
 * only capability), so a client cannot discover orphaned rooms. This scheduled
 * function uses Admin credentials (which bypass rules) to delete:
 *   - rooms whose player list is empty (last player vanished without a clean leave), and
 *   - rooms with no heartbeat for ROOM_TTL_MS (closed laptop, crashed tab, abandoned night).
 *
 * Deploy with: firebase deploy --only functions
 * Requires the Blaze plan (scheduled functions). Adjust ROOM_TTL_MS to taste.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

exports.sweepRooms = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'Etc/UTC', retryCount: 1 },
  async () => {
    const db = admin.database();
    const snap = await db.ref('rooms').get();
    const now = Date.now();
    const dead = [];

    snap.forEach((room) => {
      const meta = room.child('meta').val() || {};
      const players = meta.players && typeof meta.players === 'object' ? meta.players : {};
      const playerCount = Object.keys(players).length;
      const updatedAt = Number(meta.updatedAt) || 0;
      if (playerCount === 0 || !updatedAt || now - updatedAt > ROOM_TTL_MS) {
        dead.push(room.key);
      }
    });

    if (dead.length === 0) return;
    const updates = {};
    for (const key of dead) updates[key] = null;
    await db.ref('rooms').update(updates);
    console.log(`sweepRooms: removed ${dead.length} room(s)`);
  },
);
