import { View, Image, Pressable, StyleSheet } from "react-native";
import { colors, radii, spacing } from "@/theme";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  photoUrl?: string;
  dashed?: boolean;
  onPress?: () => void;
  size?: number;
};

export function PhotoTile({ photoUrl, dashed = false, onPress, size = 96 }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
        },
        dashed && styles.dashed,
      ]}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.empty}>
          <Ionicons name="add" size={32} color={colors.redStrong} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  dashed: {
    borderStyle: "dashed",
    borderColor: colors.redStrong,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cream,
  },
});
