// Design tokens for the mobile app. Values match docs/build-spec.md §16.1
// (brand palette) plus the additional shades already in use across screens,
// consolidated here instead of copy-pasted per file.

export const colors = {
  ink: "#302723",
  muted: "#6C5D53",
  red: "#E95032",
  green: "#276C4F",
  gold: "#F4BE65",
  paper: "#FFFAF1",
  cream: "#FBF3E6",
  line: "#E8DCCB",
  lineSoft: "#DFD0BA",
  tacoTile: "#F9DEAE",
  mapGround: "#E8E6D7",
  segmentTrack: "#EFE4D5",
  dangerText: "#A92E24",
  dangerBg: "#FBE2DC",
  white: "#FFFFFF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radii = {
  sm: 9,
  md: 13,
  lg: 15,
  xl: 18,
  pill: 999,
} as const;

export const typography = {
  kicker: { fontSize: 11, fontWeight: "800" as const, letterSpacing: 1.5 },
  title: { fontSize: 32, fontWeight: "900" as const, letterSpacing: -1 },
  subtitle: { fontSize: 15, fontWeight: "400" as const },
  sectionTitle: { fontSize: 17, fontWeight: "800" as const },
  body: { fontSize: 14, fontWeight: "400" as const },
  label: { fontSize: 12, fontWeight: "700" as const },
  caption: { fontSize: 11, fontWeight: "700" as const },
};
