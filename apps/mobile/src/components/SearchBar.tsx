import { View, TextInput, Pressable, StyleSheet, type TextInputProps } from "react-native";
import { colors, radii, spacing } from "@/theme";
import { Icon, type IconName } from "./Icon";

type Props = Omit<TextInputProps, "style"> & {
  onClear?: () => void;
  icon?: IconName;
};

export function SearchBar({ value, onClear, icon = "search", ...rest }: Props) {
  return (
    <View style={styles.container}>
      <Icon name={icon} size={20} color={colors.muted} style={styles.icon} />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.placeholder}
        value={value as string}
        {...rest}
      />
      {value && (
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
        >
          <Icon name="close-circle" size={20} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
  },
});
