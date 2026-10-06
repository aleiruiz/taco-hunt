import { View, Text, StyleSheet } from "react-native";
import { colors, typography } from "@/theme";
import { Icon, type IconName } from "./Icon";

type Status = "pending" | "approved" | "rejected";

const statusConfig: Record<
  Status,
  { icon: IconName; label: string; color: string; bgColor: string; textColor: string }
> = {
  pending: {
    icon: "time",
    label: "EN REVISIÓN",
    color: "#7A5310",
    bgColor: colors.goldSoft,
    textColor: "#7A5310",
  },
  approved: {
    icon: "checkmark-circle",
    label: "PUBLICADA",
    color: colors.green,
    bgColor: colors.greenSoft,
    textColor: colors.green,
  },
  rejected: {
    icon: "close-circle",
    label: "NO APROBADA",
    color: colors.dangerText,
    bgColor: colors.dangerBg,
    textColor: colors.dangerText,
  },
};

type Props = {
  status: Status;
  reason?: string;
};

export function StatusBadge({ status, reason }: Props) {
  const config = statusConfig[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
      <Icon name={config.icon} size={14} color={config.color} style={{ marginRight: 4 }} />
      <Text style={[styles.text, { color: config.textColor }]}>{config.label}</Text>
      {reason && <Text style={[styles.reason, { color: config.textColor }]}> · {reason}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  text: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  reason: { fontSize: 11, fontWeight: "400" },
});
