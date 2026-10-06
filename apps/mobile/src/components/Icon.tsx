import type { ReactNode } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// Stroke icons drawn like the owner-approved design canvas (24 px grid, round
// caps and joins). Names follow the Ionicons names the app used before so call
// sites keep their meaning.
const stroke = {
  "chevron-back": <Path d="M15 5l-7 7 7 7" />,
  "chevron-forward": <Path d="M9 5l7 7-7 7" />,
  "chevron-down": <Path d="M6 9l6 6 6-6" />,
  "chevron-up": <Path d="M6 15l6-6 6 6" />,
  checkmark: <Path d="M5 12.5l4.5 4.5L19 7" />,
  "checkmark-circle": (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M8 12.5l3 3 5-6" />
    </>
  ),
  "alert-circle": (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7.5v5.5M12 16.5h.01" />
    </>
  ),
  sparkles: <Path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z" />,
  star: <Path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  location: (
    <>
      <Path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
      <Circle cx="12" cy="10" r="2.2" />
    </>
  ),
  navigate: <Path d="M20 4L3.5 11l7 2.5 2.5 7z" />,
  "ellipse-outline": <Circle cx="12" cy="12" r="8" />,
  add: <Path d="M12 5v14M5 12h14" />,
  "add-circle-outline": (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 8v8M8 12h8" />
    </>
  ),
  time: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="M16 16l4.5 4.5" />
    </>
  ),
  ribbon: (
    <>
      <Circle cx="12" cy="9" r="5" />
      <Path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5" />
    </>
  ),
  person: (
    <>
      <Circle cx="12" cy="8.5" r="3.6" />
      <Path d="M5 20c1-4 4-6 7-6s6 2 7 6" />
    </>
  ),
  "mail-outline": (
    <>
      <Rect x="3" y="5" width="18" height="14" rx="2.5" />
      <Path d="M3.5 7.5l8.5 6 8.5-6" />
    </>
  ),
  "logo-google": <Path d="M19.5 8.5A8 8 0 1 0 20 12h-8" />,
  "log-out-outline": <Path d="M9 4H5v16h4M14 8l4 4-4 4M18 12H9" />,
  "cloud-offline-outline": (
    <>
      <Path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11 1.5A3.8 3.8 0 0 1 17.5 18H7z" />
      <Path d="M4 4l16 16" />
    </>
  ),
  list: <Path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />,
  heart: (
    <Path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
  ),
  map: <Path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20" />,
  options: (
    <>
      <Path d="M4 7h9M18 7h2M4 17h3M11 17h9" />
      <Circle cx="15.5" cy="7" r="2.3" />
      <Circle cx="8.5" cy="17" r="2.3" />
    </>
  ),
  refresh: <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  settings: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  "cloud-download-outline": (
    <>
      <Path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11 1.5A3.8 3.8 0 0 1 17.5 18" />
      <Path d="M12 11v8M9 16l3 3 3-3" />
    </>
  ),
  ellipsis: <Path d="M5 12h.01M12 12h.01M19 12h.01" />,
  taco: (
    <Path d="M3 16a9 9 0 0 1 18 0zM7 12.5c1-.8 2-.8 3 0M11 11c1-.8 2-.8 3 0M15 12.8c.8-.6 1.6-.6 2.4 0" />
  ),
  flag: <Path d="M6 21V4M6 5h11l-2 4 2 4H6" />,
  image: (
    <>
      <Rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <Circle cx="9" cy="10" r="1.6" />
      <Path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
    </>
  ),
  information: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  "log-in-outline": <Path d="M15 4h4v16h-4M10 8l4 4-4 4M14 12H5" />,
  open: <Path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />,
  "person-add": (
    <>
      <Circle cx="10" cy="8.5" r="3.6" />
      <Path d="M3.5 20c1-4 3.5-6 6.5-6 1.2 0 2.3.3 3.2.9M18 14v6M15 17h6" />
    </>
  ),
  shield: (
    <>
      <Path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" />
      <Path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  "close-circle": (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  camera: (
    <>
      <Path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
      <Circle cx="12" cy="13" r="3.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

// Ionicons spelled outline variants separately; they share one drawing here.
const aliases = {
  "person-outline": "person",
  "location-outline": "location",
  "heart-outline": "heart",
  "camera-outline": "camera",
  "star-outline": "star",
  "ellipsis-horizontal": "ellipsis",
  "fast-food": "taco",
  "flag-outline": "flag",
  "image-outline": "image",
  "information-circle-outline": "information",
  "open-outline": "open",
  "person-add-outline": "person-add",
  "ribbon-outline": "ribbon",
  "shield-checkmark-outline": "shield",
  "time-outline": "time",
  "options-outline": "options",
  "settings-outline": "settings",
} as const;

// Shapes that read as solid when they mean "active" (a saved favorite).
const filledByDefault: ReadonlySet<string> = new Set(["heart", "star"]);
// Outline variants stay hollow even when the base shape is solid.
const hollow: ReadonlySet<string> = new Set(["heart-outline", "star-outline"]);

export type IconName = keyof typeof stroke | keyof typeof aliases;

type Props = {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 20, color, strokeWidth = 2.2, style }: Props) {
  const base =
    name in aliases ? aliases[name as keyof typeof aliases] : (name as keyof typeof stroke);
  const filled = filledByDefault.has(base) && !hollow.has(name);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {stroke[base]}
    </Svg>
  );
}
