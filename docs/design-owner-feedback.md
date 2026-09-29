# Design for the owner's first hands-on test (P2.7)

Design review of the seven UX items from the owner's 2026-09-29 Expo Go test. The owner reviewed it the
same day and the decisions below are applied. The visual source is a public design canvas
(anyone with the link can open it): <https://claude.ai/artifact/9AVKB3JQW7j3UGijkxiUEv>. It has one artboard
per screen and state; open it for the visuals. This file is the durable spec in case the link is unavailable.
Where the canvas and this file disagree, this file wins.

It builds on, and does not redo, the map-first home in `docs/design-map-first.md` (T25–T27). Every value
comes from `apps/mobile/src/theme.ts`; new tokens are listed in §9 and must be added there, never inlined.

## Owner decisions that shape the design

- "Comments" are the review body. The profile has three tabs: Favoritos · Reseñas · Fotos.
- The profile photo applies immediately and then goes through an automated review. On rejection, the app avatar
  comes back and the user is told why (T40).
- Search and the map have no geographic cap: the Monterrey metro area and its surroundings. Proximity only ranks results.
- The map loads pins for the visible region as the user moves, never the whole dataset (T33/T34).
- Stand photos are pre-moderated: only the uploader sees a pending photo (T37).

## Priority (highest impact first)

1. Sign-up confirmation and signed-in landing (§1).
2. Minimized search header (§2).
3. Add-a-taquería entry point and flow (§3).
4. Near-empty states and incentives (§4).
5. Search autocomplete states (§5).
6. Stand photo gallery and upload (§6).
7. Profile and avatars (§7).

## 1. Sign-up → confirmation → signed-in landing (T32)

- **Form:** errors sit inline under the field: 2 px `redStrong` border, alert icon, `dangerText` message with a
  link ("Ya hay una cuenta con este correo. Inicia sesión o recupera tu contraseña"). While submitting, fields are
  locked and the button shows a spinner and "Creando tu cuenta…".
- **Success screen** (shown once, right after sign-up, no manual step): the assigned app avatar at 112 px with
  small brand-colored sparkles, kicker "CUENTA CREADA", title "¡Listo, {nombre}! Ya eres parte de la cacería.",
  and a line naming the avatar ("Te tocó El Trompo…"). A "Tus primeros pasos" card (1 of 4) has a progress bar
  and the steps: crear cuenta ✓, califica tu primer taco (Primera mordida badge), guarda un favorito, propón una
  taquería. Buttons: primary "Empezar a explorar" and secondary "Personalizar mi perfil".
- **Landing** (`router.replace` to the map): the header's account button becomes the user's avatar with a green
  ring. A green toast ("Sesión iniciada. ¡Bienvenido, {nombre}!") is announced to screen readers and auto-hides.
  A bottom "Tu primer reto" card explains that sparkle pins have no reviews yet, with "Ahora no" and "Ver el más
  cercano" (accent).
- **If email confirmation is enabled:** a "Revisa tu correo" screen with a masked email, "Abrir mi app de correo",
  a resend button with a countdown (disabled until it runs out), and "Usar otro correo".

## 2. Minimized search header (home, map mode)

- **Collapsed (default):** one 52 px pill floating at the top: search icon + "Busca un puesto o colonia"
  (tapping it opens §5), a divider, and a filter button with a `redStrong` count badge when filters are active.
  Next to it is a 52 px profile button (avatar, or a person icon when signed out). Below it sit a 36 px summary
  chip ("Monterrey · Pastor ▾", with `hitSlop` to 44 px, opens the panel) and a dark "N puestos" pill. The header
  goes from ~35% of the screen today to ~14%.
- **Bottom controls:** "Lista" pill on the left, locate button (48 px) on the right above the add button, and
  the extended add button (§3) at the bottom right. When a preview card is open, the add button shrinks to a round
  "+" above the card.
- **Expanded (filter button):** a panel drops from the top (paper, `radii.sheet` bottom corners, scrim over the
  map). It has the search field and a close chevron. The Zona section has chips "Cerca de mí" (green outline) and
  the municipalities; these are camera shortcuts per T34, not filters. The Tipo de taco section has chips; the
  selected chip shows a check, not just a color change. A "Ver como" Mapa | Lista segment follows. The footer has
  "Limpiar" (ghost) and "Ver N puestos" (primary).
- **Pins without reviews** carry a small gold sparkle badge (the "be the first" signal).
- The "Mi cuenta" text link and the old always-open header card go away. The dev-only Expo gear is not part of
  the design.

## 3. Add a taquería (entry point + flow; existing API: `spot-proposals`, T21 Places)

- **Entry points:**
  - the extended floating button "+ Agregar taquería" (`accent`, 56 px) on the map, always visible;
  - the empty-zone card (§4);
  - "no results" in search (§5), which prefills the name;
  - the "¿Falta un puesto?" row at the end of suggestions;
  - "Mis propuestas" in the profile.

  Today's "¿No encuentras tu taquería? Propónla" link exists only in list mode; it is replaced by these.

- **A 3-step flow** with a stepper bar and "PASO n DE 3":
  1. **¿Cuál taquería es?** A search field with Google autocomplete (attribution "Resultados de Google").
     Above the results, a gold "¿ES ESTE? YA ESTÁ EN TACO HUNT" card shows any existing Taco Hunt stand that
     matches, with a "Ver" button, to prevent duplicates. At the bottom, a dashed "No aparece: escribirla a mano"
     card leads to manual entry.
  2. **¿Dónde se pone?** A map with a fixed center pin, "Arrastra el mapa para ajustar", and an "Estoy aquí"
     button. The chosen place is shown as "Pin tomado de Google · puedes corregirlo". Fields: Colonia o municipio
     (prefilled) and Referencia (optional). There are no raw lat/long fields.
  3. **Detalles que ayudan (optional):** taco-type chips (multi-select, plus a dashed "+ Otro", which ties into
     T44), opening-time chips (Mañana/Tarde/Noche), an optional stand photo tile ("también pasa por revisión"),
     and a submit button "Enviar para revisión" (accent). On failure an inline `role=alert` banner reads "No se
     pudo enviar… lo que llenaste sigue aquí" and the button becomes "Reintentar envío".
- **In review:** a green check and the title "{nombre} está en revisión". The text says a moderator reviews it and,
  meanwhile, only the author sees it on the map with a dashed pin. A timeline shows Enviada ✓ · En revisión (AHORA
  badge) · Publicada ("te avisamos y ganas la insignia Cazador"). Buttons: "Volver al mapa", "Mis propuestas",
  "Proponer otra".

## 4. Near-empty states and incentives

Rule: incentives use only real data. That means the user's own counts, or facts from the database ("sin
reseñas", "el más cercano"). Never invent social proof, and show no rankings or other people's counts until
there is real activity.

- **Zone with no stands:** a bottom card with the kicker "ZONA POR DESCUBRIR", "{zona} todavía no tiene puestos",
  and the Pionero badge for whoever proposes the first stand. Buttons: "Proponer la primera taquería" (accent)
  and "Ver puestos en otras zonas". A last row reads "El más cercano: {puesto} · {colonia}".
- **Stand with no reviews or photos:** the hero is an empty gallery with "Subir la primera foto". Below it, a
  gold card: "Nadie lo ha calificado todavía… te da la insignia Pionero", with "Calificar el primer taco"
  (accent). Taco rows read "Sin calificaciones todavía" with a secondary "Calificar" button that has a star icon;
  this replaces today's "—Calificar" (stray dash, 3.4:1 contrast). Add "¿Venden otro taco? Agrégalo" (T44).
  Show "colonia · municipio" and a "Cómo llegar" button instead of raw coordinates, and drop the "Fecha de
  verificación no confirmada" text. Favorite and report move to header icon buttons (report goes under "más").
- **Retos e insignias** (reached from the profile): a dark "Próximo reto" card with a progress bar and a CTA.
  The grid has Recién llegado (earned on sign-up), Primera mordida (1st review), Pionero (first review of a
  stand), Explorador (reviews in 3 colonias), Cazador (proposal published), and Fotógrafo (3 approved photos).
  Locked badges use a dashed outline, a muted icon, and "0 de N".
- **Needs:** an endpoint for the user's own progress (e.g. `GET /v1/me/progress`). **No task exists yet.**

## 5. Search autocomplete (T35)

- Focusing the search opens a full-screen search view: back button, a focused pill field with a clear button,
  and the line "Lo más cercano primero · sin límite de zona".
- **Suggestions:** a "COLONIAS" section (pin icon on `greenSoft`, name with the typed part in bold, "Monterrey ·
  2 puestos" / "sin puestos aún") and a "PUESTOS" section (taco tile, name, "colonia · best taco · reseñas"). Rows
  are at least 60 px tall. It is an ARIA combobox/listbox. At the end, a dashed "¿Falta un puesto? Propónlo" row.
- **Loading:** a spinner inside the field, a "Buscando…" status line, 3 skeleton rows (`segmentTrack`), and
  recent searches as chips below.
- **No results:** "No encontramos «q»", a gold card "¿Existe y no está? Súmala al mapa" with "Proponer «q»"
  (accent, the name prefilled), and a hint row that names the active taco filter with a "Quitar filtro" button.
- **Error:** an offline icon on `dangerBg`, "No pudimos buscar… lo que escribiste sigue aquí", "Reintentar", and
  recent searches still usable offline.

## 6. Stand photo gallery and upload (T39, with T37's API)

- **Stand page:** a 290 px hero photo with floating icon buttons (back, favorite, more) and a "1 / N · Ver todas"
  pill. Then name, colonia, rating summary, and a "Fotos" strip whose first tile is a dashed "Agregar" tile
  (`redStrong`), followed by 96 px thumbnails.
- **Upload:** a preview, a "¿Qué muestra?" chip (Tacos / El puesto / Menú y precios), a rules card (focus on the
  food or the stand; no recognizable faces or license plates; only your own photos, which is the authorship
  confirmation), a progress bar with a percentage, and a busy button. The footer reads "Un moderador la revisa
  antes de que la vean los demás."
- **Pending (uploader only):** a success toast "Foto enviada…". In the strip, the user's own tile has a dashed
  `pendingText` border, a `goldSoft` veil, a clock icon, an "EN REVISIÓN" badge, and "Solo tú la ves". A "Mis
  fotos" list shows one status badge per photo: EN REVISIÓN (gold), NO APROBADA (danger, with the reason and
  "Subir otra"), PUBLICADA (green). Each badge has an icon and text.

## 7. Profile and avatars (T40, T41)

- **Profile:** back and settings (the gear opens today's Ajustes). The header has a 72 px avatar, the name,
  "Cazando tacos desde {mes año}", and "Editar". A 3-stat grid shows reseñas, favoritos, and fotos. A dark badge
  row reads "3 insignias · siguiente: …" and leads to Retos. Tabs: Favoritos · Reseñas · Fotos. Review cards show
  taco · stand, date, stars (read as "4 de 5 estrellas"), and the comment text; a review without text offers
  "Agregar uno". A "Mis propuestas" row has a pending badge.
- **New profile (empty):** the avatar has a camera badge for changing it. An "Arma tu perfil" checklist (1 of 3)
  follows. The empty tab shows an icon, "Aún no guardas favoritos", and an "Explorar el mapa" button.
- **Photo or avatar sheet:** a large preview, "Tomar foto" / "Elegir de galería", then "O ELIGE UNO DE LA
  TAQUIZA": a 4×2 radio grid of avatars with a green ring and check on the selected one. The note reads "Tu foto
  se usa al instante junto a tus reseñas. Pasa por una revisión automática; si no cumple las reglas, vuelve tu
  avatar y te avisamos." Button: "Guardar".
- **"La Taquiza" avatars:** El Trompo, La Tortilla, La Cebollita, El Limón, El Chile, El Molcajete, El
  Aguacate, La Horchata.
  - Style: a soft circle background, the figure in brand colors, a 2 px ink outline, and the same simple face on
    every one (two dots and a smile). No age or gender. They read at 24 px.
  - Assets: bundled SVGs, so they work offline.
  - Default: `avatar_preset = AVATARS[hash(user_id) % 8]`, stored at profile creation (T40). It stays stable
    across devices and when avatars are added. It is announced on the success screen and can be changed anytime.
  - Sizes: 24 / 32 / 40 / 72. Next to a review: a 40 px avatar, the name, the date, and the text.
  - A user's own photo replaces the avatar everywhere, subject to T40's automated review.

## 8. Accessibility (all screens)

- Touch targets are at least 44×44 (the add button is 56). Pins keep a 44 px hit area; 36 px chips use
  `hitSlop` to reach 44. Leave 8 px between targets.
- Contrast is AA:
  - Paper text on `red` is 3.6:1 and fails. Paper text on `redStrong` is 5.2:1 and on `green` is 6.0:1.
  - `muted` on `cream` is 5.7:1. `pendingText` on `goldSoft` is 5.8:1.
  - The hardcoded `#9C8D80` placeholder is 3.2:1 and must become `placeholder` (4.7:1).
- Labels, for example:
  - pin: "Tacos Demo 02, Obispado, sin reseñas";
  - cluster: "Grupo de 4 puestos, toca para acercar";
  - filter button: "Filtros y vista, 1 filtro activo" plus its expanded state;
  - avatar: "Mi perfil, {nombre}";
  - stars: read as one value.
- Status never relies on color alone: every badge has an icon and text.
- Toasts and confirmations use `AccessibilityInfo.announceForAccessibility`.
- Form errors appear next to the field, and focus moves to the first invalid field.
- The list view is the accessible alternative to the map.
- No fixed heights on text cards; test at 200% text size.
- Respect "Reduce Motion".
- Hide "Abrir panel de moderación" from users who are not admins.

## 9. Design system changes (`theme.ts` and `src/components/`)

New tokens:

- Colors:
  - `redStrong #C23A1E`: the accent button and red used as text;
  - `greenSoft #DCEBE2`: success / published background;
  - `goldSoft #FCEBC8`: pending, challenges, "be the first";
  - `pendingText #7A5310`;
  - `placeholder #7D6E63`;
  - `scrim` (ink at 45%);
  - avatar fills: `avatar.pastor #F6D3C4` is new; the others alias existing tokens (masa=`goldSoft`,
    cilantro=`greenSoft`, tortilla=`tacoTile`, salsa=`dangerBg`, comal=`segmentTrack`).
- `sizes`: touch 44, fab 56, pin 44, avatar 24/40/72. `radii.sheet` 24.
- `elevation.float` (0 4 14, ink 14%) and `elevation.sheet` (0 −2 18, ink 16%).
- `typography.display` 28/900, `button` 15/800, `badge` 11/800.
- `motion`: fast 150 ms and base 250 ms, off under Reduce Motion.

Extended components:

- `Button`: `primary` becomes **green** (the current red fails contrast). A new `accent` variant in `redStrong`
  is used for every contribute action: add, rate, upload. Add `icon` (Ionicons) and `size` (md 48 / lg 52) props;
  the label is 15 px.
- `Chip`: an `icon` prop, a check when selected, and a `dashed` variant.
- `Card`: `tone` = default | highlight (`goldSoft`) | dashed.

New components: `IconButton` (label required), `SearchBar`, `SuggestionRow` (+ skeleton), `EmptyState`
(always has an action), `StatusBadge` (pending / approved / rejected), `Avatar`, `Toast`, `Stepper`,
`ProgressBar`, `PhotoTile`, `BadgeMedal`, and `BottomSheet` (`Animated.View`, no new dependency).

## Task mapping

| Section                                            | Task(s)                                        |
| -------------------------------------------------- | ---------------------------------------------- |
| §1 Sign-up, confirmation, landing                  | T32                                            |
| §2 Minimized header, bottom controls, sparkle pins | **no task yet** (touches `index.tsx` with T34) |
| §3 Add-a-taquería entry point and flow             | **no task yet** (`propose.tsx`)                |
| §4 Empty states, incentives, retos                 | **no task yet** (needs a progress endpoint)    |
| §5 Search autocomplete                             | T35                                            |
| §6 Gallery and upload                              | T39 (UI), T37 (API), T36 (picker)              |
| §7 Profile and avatars                             | T41 (UI), T40 (API)                            |
| §8–§9 Accessibility, tokens, components            | whichever task first needs each piece          |
