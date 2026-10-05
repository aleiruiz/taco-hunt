# apps/mobile: agent notes

Expo + React Native app (expo-router, file-based routes in `app/`). UI copy is in Spanish (Mexico); keep the tone casual and street-level, never childish. Also read the root `AGENTS.md`.

## Design system

- `src/theme.ts` is the single source of truth for colors, spacing, radii, and typography. Never declare a local `colors`/`spacing` const in a screen or component, and never hardcode a hex color, even one already used elsewhere; import from `@/theme`. If a screen needs a shade the theme doesn't have, add it to `theme.ts` as a named token in the same PR (it's a shared file, so get the orchestrator's OK first).
- Use the shared components in `src/components/` (exported from `src/components/index.ts`: `Button`, `Card`, `Chip`, `IconButton`, `EmptyState`, `StatusBadge`, `Avatar`, `BottomSheet`, `SearchBar`, `Toast`, `AccountSidebar`, and others) for anything that matches their pattern: a tappable action, a bordered content container, or a filter/selector pill. Don't hand-roll a new `Pressable`+`StyleSheet` pair that duplicates one of these.
- If a UI genuinely needs a treatment the shared components don't support (for example, `admin.tsx`'s moderation actions, left out of `Button` in T29 because approve/reject colors mean something different from primary/danger), either extend the shared component's API or explain in the PR why it stayed local.
- A task that touches screens must leave the design system more consistent, not less. New screens start from `theme.ts` and the shared components.
- Icons: Ionicons from `@expo/vector-icons` (decided in T30). No emoji as UI icons.
- The P2.7 tokens and components (`redStrong`, `greenSoft`, `goldSoft`, `pendingText`, `placeholder`, `scrim`, avatar fills, `Button` `accent` variant, `IconButton`, `EmptyState`, `StatusBadge`, `Avatar`, and others) are implemented as specified in `docs/design-owner-feedback.md` §9. Use those names and values.

## UI first, fixtures until the API exists

Phase B swapped the P2.7 and P2.8 screens to real API calls, but some modules in `src/data/` still export fixture helpers; check a module before assuming its data is live. For future UI-first work: Phase A tasks build the whole UI before any API work. When a screen needs data that no existing endpoint returns, add a typed fixture adapter in `src/data/` (same function signature the real call will have) and list the fields/states under **Data needs** in the PR. Phase B tasks replace the adapter body with the real call; screens shouldn't change.

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
- The root pnpm workspace patches several native dependencies (`patches/`, declared in `pnpm-workspace.yaml`). CI's `npm ci` path does not apply them; if you bump one of those packages, update or remove its patch in the same PR.
- Run the app with `pnpm dev:mobile` from the repo root on a development build, not Expo Go (EAS profile `development` in `eas.json`, or `npx expo run:android`). The build uses the `plugins/withAndroidCxxShared` config plugin and reads `ANDROID_MAPS_API_KEY` / `IOS_MAPS_API_KEY` at build time (`app.config.js`). At runtime, Supabase settings come from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the API base URL from `EXPO_PUBLIC_API_URL`, and `EXPO_PUBLIC_MAPS_PROVIDER=google` selects the Google map provider. Expo reads `.env` from this folder, not the repo root. Never put a service role key or database password in an `EXPO_PUBLIC_*` variable.

## Hot files

`app/index.tsx` (home/map), `app/spot/[id].tsx` (stand page), `src/theme.ts`, and `src/components/` are touched by several tasks. Check with the orchestrator that no other open task is editing them before you start.
