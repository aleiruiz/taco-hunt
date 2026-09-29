import { View, Text, StyleSheet } from "react-native";
import { colors, radii, spacing, typography } from "@/theme";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  earned?: boolean;
  progress?: string;
};

export function BadgeMedal({ icon, label, earned = false, progress }: Props) {
  return (
    <View style={[styles.container, !earned && styles.locked]}>
      <Ionicons
        name={icon as any}
        size={40}
        color={earned ? colors.gold : colors.muted}
        style={!earned && styles.lockedIcon}
      />
      <Text style={[styles.label, !earned && styles.lockedLabel]}>{label}</Text>
      {progress && !earned && <Text style={styles.progress}>{progress}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    width: 80,
    height: 100,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  locked: {
    borderStyle: "dashed",
    borderColor: colors.muted,
  },
  lockedIcon: {
    opacity: 0.5,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginTop: spacing.sm,
    color: colors.ink,
  },
  lockedLabel: { color: colors.muted },
  progress: { fontSize: 10, color: colors.muted, marginTop: spacing.xs },
});
