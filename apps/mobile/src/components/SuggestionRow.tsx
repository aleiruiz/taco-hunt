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
      onPress: (item: SuggestionItem) => void;
    }
  | {
      variant: "skeleton";
    };

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

  const { item, onPress } = props;
  return (
    <Pressable onPress={() => onPress(item)} style={styles.row}>
      <Ionicons
        name={item.type === "colonia" ? "location" : "fast-food"}
        size={20}
        color={item.type === "colonia" ? colors.greenSoft : colors.tacoTile}
        style={styles.icon}
      />
      <View style={styles.content}>
        <Text style={styles.name}>{item.name}</Text>
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
  content: {
    flex: 1,
  },
  name: { fontSize: 14, fontWeight: "600", color: colors.ink, marginBottom: 2 },
  subtitle: { fontSize: 12, color: colors.muted },
  skeleton: {
    backgroundColor: colors.segmentTrack,
    borderRadius: radii.sm,
  },
  skeletonIcon: {
    width: 20,
    height: 20,
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
