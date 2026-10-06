import { Animated, View, Text, StyleSheet, Platform } from "react-native";
import { colors, spacing, radii, motion } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { useEffect, useRef } from "react";

type Variant = "success" | "error" | "info";

const variantConfig: Record<Variant, { icon: IconName; bgColor: string; textColor: string }> = {
  success: { icon: "checkmark-circle", bgColor: colors.greenSoft, textColor: colors.green },
  error: { icon: "alert-circle", bgColor: colors.dangerBg, textColor: colors.dangerText },
  info: { icon: "information-circle-outline", bgColor: colors.cream, textColor: colors.ink },
};

type Props = {
  message: string;
  variant?: Variant;
  duration?: number;
  onDismiss?: () => void;
};

export function Toast({ message, variant = "info", duration = 3000, onDismiss }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const config = variantConfig[variant];

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: motion.fast, useNativeDriver: true }),
      Animated.delay(duration),
      Animated.timing(fadeAnim, { toValue: 0, duration: motion.fast, useNativeDriver: true }),
    ]).start(() => onDismiss?.());
  }, [duration, onDismiss, fadeAnim]);

  return (
    <Animated.View style={[styles.toast, { backgroundColor: config.bgColor, opacity: fadeAnim }]}>
      <Icon name={config.icon} size={20} color={config.textColor} style={styles.icon} />
      <Text style={[styles.text, { color: config.textColor }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: colors.ink,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
});
