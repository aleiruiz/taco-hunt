# Map-first discovery redesign (T25–T27)

Owner-approved design direction from a 2026-09-29 UX/product review (not part of the original
build-spec — see `docs/plan-delegacion.md` P2.6). This document is the durable record of what
T25–T27 are supposed to build; the review itself produced a one-off mockup artifact that is not
reachable from a worker session, so the decisions are written out here instead.

## Problem

Today `apps/mobile/app/index.tsx` defaults to a list view. The map is a secondary tab, rendered as
a 245px embedded box below a scrolling header, using default OS pins and default callouts. For a
taco-discovery app, the map should be the primary surface — the thing a user looks at first — not
an afterthought one tap away.

## Target design

**T25 — Map-first home layout**
- The map is the default view (`mode` starts as `"mapa"`, not `"lista"`), rendered full-bleed
  under the safe area, not inside a small bounded box.
- Search bar and filter chips (area, taco type) float as a compact overlay anchored to the top of
  the map, instead of a scrolling header that pushes the map down. They keep their current
  behavior (search-on-submit, chip-select re-triggers `load()`), just repositioned.
- The list view becomes the secondary mode, reachable via the same list/map toggle, now
  defaulting off.
- No API changes needed — same `GET /v1/spots` bounding-box query as today.

**T26 — Custom pins + tap-to-preview card (depends on T25)**
- Replace the default `react-native-maps` `<Marker>` pin with a small custom marker (a round
  taco-colored dot/icon via `Marker`'s `children` prop). Start with a simple `View`+emoji marker;
  a proper icon asset can follow later (see T30's icon-set swap).
- Tapping a marker opens a bottom sheet/anchored card docked to the bottom of the map (not the OS
  callout), showing: stand name, neighborhood, best taco + score, and one recent review snippet.
- Card data comes from the existing `GET /v1/spots/:id` endpoint (already returns `tacos` and up
  to 5 `reviews`) — fetch on marker tap, debounce/cache so re-tapping the same marker doesn't
  re-fetch.
- Card is tappable through to the existing `/spot/[id]` screen — no new route.
- Prefer no new dependency for the bottom sheet if a simple `Animated.View` slide-up covers it;
  only reach for a bottom-sheet library if the interaction genuinely needs it (this is a root
  `package.json`/lockfile change and needs an `docs/orchestration-log.md` decision per CLAUDE.md
  before adding it).

**T27 — Marker clustering (depends on T26)**
- Add clustering once T26 lands, so dense areas collapse into a count badge instead of overlapping
  pins. This matters once real stand data (30–50 Monterrey stands, per build-spec.md §10) is
  loaded — don't wait for user complaints to add it.
- Also a root `package.json` change; log the library choice in `docs/orchestration-log.md`.

## Explicitly out of scope for T25–T27

- A branded map JSON style (custom road/terrain colors matching the cream/terracotta palette) —
  real polish, but lower leverage than pins/cards/clustering. Candidate for a later task if wanted.
- Onboarding, motion/illustration — the 2026-09-29 review's recommendation was to invest in the
  map and icons first, not in polish that doesn't affect first impression as much.

## Visual language

Use the existing brand tokens in `apps/mobile/src/theme.ts` (from T29) — no new colors. Marker
accents can draw from `colors.red`, `colors.gold`, `colors.green` to differentiate stand state or
taco type at a glance; the preview card should use the existing `Card` component's paper/border
look, not a new one-off style.
