import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, spacing, radii } from "@/theme";
import { Ionicons } from "@expo/vector-icons";

export interface SuggestionItem {
  id: string;
  type: "colonia" | "puesto";
  name: string;
  subtitle?: string;
  icon?: string;
}

type Props =
  | {
      variant?: "default";
      item: SuggestionItem;
      /** Typed prefix to bold within `item.name`, matched case-insensitively. */
      query?: string;
      onPress: (item: SuggestionItem) => void;
    }
  | {
      variant: "skeleton";
    }
  | {
      variant: "dashed";
      label: string;
      icon?: keyof typeof Ionicons.glyphMap;
      onPress: () => void;
    };

const iconBg: Record<SuggestionItem["type"], string> = {
  colonia: colors.greenSoft,
  puesto: colors.tacoTile,
};

const iconColor: Record<SuggestionItem["type"], string> = {
  colonia: colors.green,
  puesto: colors.ink,
};

function HighlightedName({ name, query }: { name: string; query?: string }) {
  const trimmed = query?.trim();
  if (!trimmed) {
    return <Text style={styles.name}>{name}</Text>;
  }
  const index = name.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) {
    return <Text style={styles.name}>{name}</Text>;
  }
  const before = name.slice(0, index);
  const match = name.slice(index, index + trimmed.length);
  const after = name.slice(index + trimmed.length);
  return (
    <Text style={styles.name}>
      {before}
      <Text style={styles.nameMatch}>{match}</Text>
      {after}
    </Text>
  );
}

export function SuggestionRow(props: Props) {
  if (props.variant === "skeleton") {
    return (
      <View style={styles.row}>
        <View style={[styles.skeleton, styles.skeletonIcon]} />
        <View style={styles.content}>
          <View style={[styles.skeleton, styles.skeletonTitle]} />
          <View style={[styles.skeleton, styles.skeletonSubtitle]} />
        </View>
      </View>
    );
  }

  if (props.variant === "dashed") {
    const { label, icon = "add-circle-outline", onPress } = props;
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.row, styles.dashedRow]}
      >
        <Ionicons name={icon} size={20} color={colors.redStrong} style={styles.icon} />
        <Text style={styles.dashedLabel}>{label}</Text>
      </Pressable>
    );
  }

  const { item, onPress, query } = props;
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.subtitle ? `, ${item.subtitle}` : ""}`}
      style={styles.row}
    >
      <View style={[styles.iconCircle, { backgroundColor: iconBg[item.type] }]}>
        <Ionicons
          name={item.type === "colonia" ? "location" : "fast-food"}
          size={16}
          color={iconColor[item.type]}
        />
      </View>
      <View style={styles.content}>
        <HighlightedName name={item.name} query={query} />
        {item.subtitle && <Text style={styles.subtitle}>{item.subtitle}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  icon: {
    marginRight: spacing.md,
    width: 20,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  name: { fontSize: 14, fontWeight: "600", color: colors.ink, marginBottom: 2 },
  nameMatch: { fontWeight: "900" },
  subtitle: { fontSize: 12, color: colors.muted },
  dashedRow: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  dashedLabel: { fontSize: 14, fontWeight: "700", color: colors.redStrong },
  skeleton: {
    backgroundColor: colors.segmentTrack,
    borderRadius: radii.sm,
  },
  skeletonIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.md,
  },
  skeletonTitle: {
    height: 14,
    width: "70%",
    marginBottom: spacing.sm,
  },
  skeletonSubtitle: {
    height: 12,
    width: "50%",
  },
});
