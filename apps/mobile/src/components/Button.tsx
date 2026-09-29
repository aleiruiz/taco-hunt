import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii } from "@/theme";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const indicatorColor: Record<Variant, string> = {
  primary: colors.paper,
  secondary: colors.ink,
  danger: colors.dangerText,
  ghost: colors.green,
};

type Props = Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  /** Layout-only overrides (margin, flex, etc.) applied on top of the variant's own look. */
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...rest
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={indicatorColor[variant]} />
      ) : (
        <Text style={[styles.text, styles[`${variant}Text`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  text: { fontWeight: "800", fontSize: 13 },
  primary: { backgroundColor: colors.red },
  primaryText: { color: colors.paper },
  secondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink },
  danger: { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerText },
  dangerText: { color: colors.dangerText },
  ghost: { backgroundColor: "transparent" },
  ghostText: { color: colors.green },
});
