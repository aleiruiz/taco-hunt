import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "@/theme";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  label: string;
  selected?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  dashed?: boolean;
  onPress: () => void;
};

export function Chip({ label, selected = false, icon, dashed = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, dashed && styles.dashed, selected && styles.selected]}
    >
      <View style={styles.content}>
        {icon && (
          <Ionicons
            name={icon}
            size={14}
            color={selected ? colors.paper : colors.ink}
            style={{ marginRight: 6 }}
          />
        )}
        <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
        {selected && (
          <Ionicons name="checkmark" size={14} color={colors.paper} style={{ marginLeft: 6 }} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    height: 36,
    justifyContent: "center",
    borderRadius: radii.xl,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
  },
  dashed: {
    borderStyle: "dashed",
    backgroundColor: colors.cream,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  text: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  selectedText: { color: colors.paper },
});
