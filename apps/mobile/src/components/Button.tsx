import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii, typography, motion } from "@/theme";
import { Ionicons } from "@expo/vector-icons";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "accent";
type Size = "md" | "lg";

const indicatorColor: Record<Variant, string> = {
  primary: colors.paper,
  secondary: colors.ink,
  danger: colors.dangerText,
  ghost: colors.green,
  accent: colors.paper,
};

type Props = Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  /** Layout-only overrides (margin, flex, etc.) applied on top of the variant's own look. */
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled,
  style,
  ...rest
}: Props) {
  const iconSize = size === "lg" ? 20 : 16;
  const variantColors: Record<Variant, string> = {
    primary: colors.green,
    secondary: colors.ink,
    danger: colors.dangerText,
    ghost: colors.green,
    accent: colors.redStrong,
  };
  const textColors: Record<Variant, string> = {
    primary: colors.paper,
    secondary: colors.ink,
    danger: colors.dangerText,
    ghost: colors.green,
    accent: colors.paper,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        size === "lg" && styles.lg,
        { backgroundColor: variant === "ghost" ? "transparent" : variantColors[variant] },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.line },
        variant === "danger" && { borderWidth: 1, borderColor: colors.dangerText, backgroundColor: colors.dangerBg },
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={indicatorColor[variant]} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={iconSize} color={textColors[variant]} style={{ marginRight: 8 }} />}
          <Text style={[styles.text, size === "lg" && styles.lgText, { color: textColors[variant] }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
  },
  lg: {
    minHeight: 52,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  text: { ...typography.button, fontSize: 15 },
  lgText: { fontSize: 15 },
});
