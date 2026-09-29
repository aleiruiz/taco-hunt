// Design tokens for the mobile app. Values match docs/build-spec.md §16.1
// (brand palette) plus the additional shades already in use across screens,
// consolidated here instead of copy-pasted per file.

export const colors = {
  ink: "#302723",
  muted: "#6C5D53",
  red: "#E95032",
  redStrong: "#C23A1E",
  green: "#276C4F",
  greenSoft: "#DCEBE2",
  gold: "#F4BE65",
  goldSoft: "#FCEBC8",
  paper: "#FFFAF1",
  cream: "#FBF3E6",
  line: "#E8DCCB",
  lineSoft: "#DFD0BA",
  tacoTile: "#F9DEAE",
  mapGround: "#E8E6D7",
  segmentTrack: "#EFE4D5",
  dangerText: "#A92E24",
  dangerBg: "#FBE2DC",
  pendingText: "#7A5310",
  placeholder: "#7D6E63",
  scrim: "rgba(48, 39, 35, 0.45)",
  white: "#FFFFFF",
  avatar: {
    pastor: "#F6D3C4",
    masa: "#FCEBC8",
    cilantro: "#DCEBE2",
    tortilla: "#F9DEAE",
    salsa: "#FBE2DC",
    comal: "#EFE4D5",
    aguacate: "#DCEBC7",
    horchata: "#F3E9D6",
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const sizes = {
  touch: 44,
  fab: 56,
  pin: 44,
  avatar24: 24,
  avatar40: 40,
  avatar72: 72,
  headerPill: 52,
  locateButton: 48,
} as const;

export const radii = {
  sm: 9,
  md: 13,
  lg: 15,
  xl: 18,
  sheet: 24,
  pill: 999,
} as const;

export const elevation = {
  float: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 4,
  },
  sheet: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

export const typography = {
  kicker: { fontSize: 11, fontWeight: "800" as const, letterSpacing: 1.5 },
  title: { fontSize: 32, fontWeight: "900" as const, letterSpacing: -1 },
  subtitle: { fontSize: 15, fontWeight: "400" as const },
  sectionTitle: { fontSize: 17, fontWeight: "800" as const },
  body: { fontSize: 14, fontWeight: "400" as const },
  label: { fontSize: 12, fontWeight: "700" as const },
  caption: { fontSize: 11, fontWeight: "700" as const },
  display: { fontSize: 28, fontWeight: "900" as const },
  button: { fontSize: 15, fontWeight: "800" as const },
  badge: { fontSize: 11, fontWeight: "800" as const },
};

export const motion = {
  fast: 150,
  base: 250,
} as const;
