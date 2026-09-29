import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii } from "@/theme";

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

export function Chip({ label, selected = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    height: 44,
    justifyContent: "center",
    borderRadius: radii.xl,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
  },
  text: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  selectedText: { color: colors.paper },
});
