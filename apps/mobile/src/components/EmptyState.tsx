import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";

type Props = {
  icon: IconName;
  title: string;
  subtitle?: string;
  actionLabel: string;
  onAction: () => void;
};

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      <Icon name={icon} size={56} color={colors.muted} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <Button label={actionLabel} variant="primary" onPress={onAction} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.ink,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: spacing.lg },
  button: { minWidth: 200 },
});
