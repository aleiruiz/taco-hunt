# apps/mobile: agent notes

Expo + React Native app (expo-router, file-based routes in `app/`). UI copy is in Spanish (Mexico); keep the tone casual and street-level, never childish. Also read the root `AGENTS.md`.

## Design system

- `src/theme.ts` is the single source of truth for colors, spacing, radii, and typography. Never declare a local `colors`/`spacing` const in a screen or component, and never hardcode a hex color, even one already used elsewhere; import from `@/theme`. If a screen needs a shade the theme doesn't have, add it to `theme.ts` as a named token in the same PR (it's a shared file, so get the orchestrator's OK first).
- Use the shared components in `src/components/` (`Button`, `Card`, `Chip`) for anything that matches their pattern: a tappable action, a bordered content container, or a filter/selector pill. Don't hand-roll a new `Pressable`+`StyleSheet` pair that duplicates one of these.
- If a UI genuinely needs a treatment the shared components don't support (for example, `admin.tsx`'s moderation actions, left out of `Button` in T29 because approve/reject colors mean something different from primary/danger), either extend the shared component's API or explain in the PR why it stayed local.
- A task that touches screens must leave the design system more consistent, not less. New screens start from `theme.ts` and the shared components.
- Icons: Ionicons from `@expo/vector-icons` (decided in T30). No emoji as UI icons.
- New tokens and components planned for P2.7 (`redStrong`, `greenSoft`, `goldSoft`, `pendingText`, `placeholder`, `scrim`, avatar fills, `Button` `accent` variant, `IconButton`, `EmptyState`, `StatusBadge`, `Avatar`, and others) are specified in `docs/design-owner-feedback.md` §9. Use those names and values.

## UI first, fixtures until the API exists

Phase A tasks build the whole UI before any API work. When a screen needs data that no existing endpoint returns, add a typed fixture adapter in `src/data/` (same function signature the real call will have) and list the fields/states under **Data needs** in the PR. Phase B tasks replace the adapter body with the real call; screens shouldn't change.

## Design specs

- Map-first home, pins, preview card, clustering: `docs/design-map-first.md`.
- Sign-up flow, minimized header, add-a-taquería, empty states and incentives, search autocomplete, stand gallery, profile and avatars: `docs/design-owner-feedback.md` (public canvas https://claude.ai/artifact/9AVKB3JQW7j3UGijkxiUEv).

## Accessibility

- Touch targets at least 44×44; use `hitSlop` when the visual is smaller.
- Every icon-only `Pressable` needs `accessibilityRole` and an `accessibilityLabel` in Spanish.
- Status is never shown by color alone (icon + text).
- Announce toasts and confirmations with `AccessibilityInfo.announceForAccessibility`.
- Text contrast must meet AA; `colors.red` with paper text does not (use `redStrong` or `green`).

## Dependencies and checks

- This app has its **own npm lockfile** (`package-lock.json`) besides the root `pnpm-lock.yaml`. CI installs it with `npm ci --ignore-scripts --legacy-peer-deps`. Adding a dependency means updating both lockfiles (`pnpm install` at the root and `npm install --legacy-peer-deps` here); forgetting the npm one fails CI's Lint job (lesson from T30). Dependency changes are shared-file changes: get the orchestrator's OK first.
- Prefer no new dependency when React Native covers it (for example, bottom sheets with `Animated.View`).
- Typecheck: `npm --prefix apps/mobile run typecheck` (also part of the root `pnpm typecheck`).
- Run the app with `pnpm dev:mobile` from the repo root. Supabase settings come from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the API base URL comes from `EXPO_PUBLIC_API_URL`. Never put a service role key or database password in an `EXPO_PUBLIC_*` variable.

## Hot files

`app/index.tsx` (home/map), `app/spot/[id].tsx` (stand page), `src/theme.ts`, and `src/components/` are touched by several tasks. Check with the orchestrator that no other open task is editing them before you start.
