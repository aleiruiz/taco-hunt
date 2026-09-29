import { View, Image, StyleSheet } from "react-native";
import { colors, sizes } from "@/theme";

type Size = 24 | 32 | 40 | 72;
type Preset =
  "pastor" | "masa" | "cilantro" | "tortilla" | "salsa" | "comal" | "aguacate" | "horchata";

const AVATAR_PRESETS: Record<Preset, any> = {
  pastor: require("@/assets/avatars/pastor.svg"),
  masa: require("@/assets/avatars/masa.svg"),
  cilantro: require("@/assets/avatars/cilantro.svg"),
  tortilla: require("@/assets/avatars/tortilla.svg"),
  salsa: require("@/assets/avatars/salsa.svg"),
  comal: require("@/assets/avatars/comal.svg"),
  aguacate: require("@/assets/avatars/aguacate.svg"),
  horchata: require("@/assets/avatars/horchata.svg"),
};

type Props = {
  size?: Size;
  preset?: Preset;
  photoUrl?: string;
  accessibilityLabel?: string;
};

export function Avatar({ size = 40, preset = "pastor", photoUrl, accessibilityLabel }: Props) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.avatar[preset],
        },
      ]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
      ) : (
        <Image source={AVATAR_PRESETS[preset]} style={{ width: size, height: size }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
});
