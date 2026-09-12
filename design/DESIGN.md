# Roomcade DESIGN.md — Boutique Arcade at Night

Sourced via styles.refero.design (no MCP in this environment — pulled manually):
- **Slush** (inflatable sticker universe) — https://styles.refero.design/style/8b6b547f-a357-4f1b-9842-4579c62dd42b
  → pill buttons (1600px), sticker accents w/ hand-cut outlines, marquee strip,
  crushed display type, softness as default, no box-shadow elevation.
- **Rainbow** (rainbow candy, darker-leaning per Slush's own similar-brands note) — https://styles.refero.design/style/1680693c-aed8-47e8-917a-04eb89497b09
  → rounded letterforms everywhere (our Nunito 900 display w/ -0.03em tracking),
  tangerine `#ff8a00` + hot pink `#ff54bb` chromatic CTA duo, 40–50px pill radii,
  32px card radii, depth from inset highlights (not drop shadows), sparkle accents.

Motion reference via motionsites.ai gallery: **"Golden Portal"** (portal/warp reveal) —
our `PortalTransition` implements it as three staged acts (charge → burst → settle)
plus celebratory count-up/confetti reveals. Anime.js owns the 2D layer;
react-three-fiber owns the 3D canvas. Never mixed.

## Tokens (adapted to dark arcade — both sources are light-mode)
- Base: `--void #0D0D24`, `--indigo #171736`, deep `#101028`
- CTAs (Rainbow duo, warmed): tangerine `#FF8A00` → ember `#FF6B35` gradient into hot pink `#FF54BB`/`#FF3D81`
- Text: warm cream `#FFF6E9`; muted `#B8B8D4`
- Success `#34D399`, danger `#FB4D6D`, gold `#FFC53D`
- Type: display Nunito 900 / Baloo 2 800, tracking -0.02..-0.03em; body Nunito 500/600;
  room codes Space Grotesk, tabular numbers
- Radius: pills 999px (all CTAs), cards 28–32px, chips 16–20px
- Elevation: inset white highlight `inset 0 1px 0 rgba(255,255,255,.18)`; outer neon
  glow ONLY on primary CTAs (documented deviation — arcade-at-night signature).
- Texture: subtle SVG grain overlay, pointer-events-none.

## Rules (anti-slop, taste dials: VARIANCE 8 / MOTION 7 / DENSITY 4)
- No gray dashboard chrome, no webcam-tile grids, no Discord-clone sidebar.
- Lobby is a 3D lounge with floating cartridges, not a menu.
- One portal transition everywhere — never per-game effects.
- Marquee strip on landing (Slush signature); sticker chips rotated/overlapping (never grid-aligned).
- Staggered entry on cards; press states `scale(.98)`; visible focus rings.
- Branded 404 + favicon + OG meta (skill strategic-omissions check).
