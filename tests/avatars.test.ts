import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATARS,
  AVATAR_COLORS,
  AVATAR_IDS,
  AVATAR_NAMES,
  AVATAR_BY_ID,
  DEFAULT_AVATAR,
  DEFAULT_AVATAR_ID,
  avatarColorFor,
  avatarIdFor,
  deserializeAvatar,
  isKnownAvatar,
  normalizeAvatarRef,
  resolveAvatar,
  serializeAvatar,
} from '../lib/avatars';
import { AVATAR_ICONS } from '../components/AvatarIcons';

// The exact mapping the product brief requires. This is the acceptance test.
const REQUIRED_MAPPING: Array<[string, string]> = [
  ['Cyber Fox', 'fox'],
  ['Astro Cat', 'cat'],
  ['Glitch Alien', 'alien'],
  ['Pixel Frog', 'frog'],
  ['Neon Bot', 'robot'],
  ['Hyper Tiger', 'tiger'],
  ['Frost Ghost', 'ghost'],
  ['Blaze Wolf', 'wolf'],
];

test('registry has exactly the 8 required avatars, in order', () => {
  assert.equal(AVATARS.length, 8);
  assert.deepEqual(
    AVATARS.map((a) => a.name),
    REQUIRED_MAPPING.map(([name]) => name),
  );
});

test('every avatar maps to the correct species', () => {
  for (const [name, species] of REQUIRED_MAPPING) {
    const avatar = AVATARS.find((a) => a.name === name);
    assert.ok(avatar, `missing avatar ${name}`);
    assert.equal(avatar.species, species, `${name} → ${species}`);
  }
});

test('ids, names, colors and species are all unique', () => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  assert.ok(unique(AVATARS.map((a) => a.id)), 'ids must be unique');
  assert.ok(unique(AVATARS.map((a) => a.name)), 'names must be unique');
  assert.ok(unique(AVATARS.map((a) => a.color)), 'colors must be unique');
  assert.ok(unique(AVATARS.map((a) => a.species)), 'species must be unique');
});

test('ids and colors are stable, non-empty and URL/RTDB-key safe', () => {
  for (const a of AVATARS) {
    assert.match(a.id, /^[a-z0-9-]+$/, `id ${a.id} must be a stable slug`);
    assert.match(a.color, /^#[0-9A-Fa-f]{6}$/, `color ${a.color} must be hex`);
  }
});

test('one icon implementation exists per avatar species (no shared artwork)', () => {
  const iconKeys = Object.keys(AVATAR_ICONS).sort();
  const species = AVATARS.map((a) => a.species).sort();
  assert.deepEqual(iconKeys, species);

  // Guard against the original bug: distinct avatars rendering the same artwork.
  const rendered = AVATARS.map((a) => JSON.stringify(AVATAR_ICONS[a.species]));
  assert.equal(new Set(rendered).size, AVATARS.length, 'each species must render distinct SVG markup');
});

test('registry-derived collections stay in lockstep', () => {
  assert.deepEqual([...AVATAR_IDS], AVATARS.map((a) => a.id));
  assert.deepEqual([...AVATAR_COLORS], AVATARS.map((a) => a.color));
  for (const a of AVATARS) {
    assert.equal(AVATAR_NAMES[a.color], a.name);
    assert.equal(AVATAR_BY_ID[a.id], a);
  }
});

test('serialization is deterministic and round-trips by id and by color', () => {
  for (const a of AVATARS) {
    // id in → stable id out
    assert.equal(serializeAvatar(a.id), a.id);
    // legacy color in → stable id out
    assert.equal(serializeAvatar(a.color), a.id);
    // lowercase color still resolves
    assert.equal(serializeAvatar(a.color.toLowerCase()), a.id);
    // round-trip
    assert.equal(deserializeAvatar(serializeAvatar(a.color)).color, a.color);
    assert.equal(avatarIdFor(a.color), a.id);
    assert.equal(avatarColorFor(a.id), a.color);
    assert.equal(normalizeAvatarRef(a.id), a.color);
  }
});

test('unknown / missing / corrupt identities fall back deterministically', () => {
  for (const bad of [undefined, null, '', 'nope', '#123456', 'dragon', '🐉']) {
    assert.equal(resolveAvatar(bad).id, DEFAULT_AVATAR_ID);
    assert.equal(serializeAvatar(bad), DEFAULT_AVATAR_ID);
    assert.equal(deserializeAvatar(bad as string).id, DEFAULT_AVATAR_ID);
    assert.equal(isKnownAvatar(bad), false);
  }
  assert.equal(DEFAULT_AVATAR.name, 'Cyber Fox');
});

test('all 8 canonical colors resolve to their own avatar', () => {
  for (const a of AVATARS) {
    const resolved = resolveAvatar(a.color);
    assert.equal(resolved.id, a.id);
    assert.equal(resolved.species, a.species);
    assert.equal(resolved.name, a.name);
  }
});
