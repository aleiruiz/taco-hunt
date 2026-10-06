import { Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { colors, sizes, elevation } from "@/theme";
import { Icon, type IconName } from "./Icon";

type Props = Omit<PressableProps, "children"> & {
  icon: IconName;
  label: string;
  color?: string;
  /** Button diameter in px. Defaults to the 44 px touch target. */
  size?: number;
  /** Adds a paper background and float shadow, for icon buttons floating over the map. */
  elevated?: boolean;
  badge?: number;
};

export function IconButton({
  icon,
  label,
  color = colors.ink,
  size = sizes.touch,
  elevated = false,
  badge,
  ...rest
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        elevated && [styles.elevated, elevation.float],
        pressed && styles.pressed,
      ]}
      {...rest}
    >
      <Icon name={icon} size={size >= 48 ? 22 : 20} color={color} />
      {typeof badge === "number" && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  elevated: {
    backgroundColor: colors.paper,
  },
  pressed: { opacity: 0.7 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.redStrong,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.paper,
  },
  badgeText: { color: colors.paper, fontSize: 10, fontWeight: "800" },
});
