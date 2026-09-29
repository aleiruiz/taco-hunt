import { View, Image, StyleSheet } from "react-native";
import { colors, sizes } from "@/theme";
import PastorAvatar from "@/assets/avatars/pastor.svg";
import MasaAvatar from "@/assets/avatars/masa.svg";
import CilantroAvatar from "@/assets/avatars/cilantro.svg";
import TortillaAvatar from "@/assets/avatars/tortilla.svg";
import SalsaAvatar from "@/assets/avatars/salsa.svg";
import ComalAvatar from "@/assets/avatars/comal.svg";
import AguacateAvatar from "@/assets/avatars/aguacate.svg";
import HorchataAvatar from "@/assets/avatars/horchata.svg";

type Size = 24 | 32 | 40 | 72;
type Preset =
  "pastor" | "masa" | "cilantro" | "tortilla" | "salsa" | "comal" | "aguacate" | "horchata";

const AVATAR_PRESETS: Record<Preset, typeof PastorAvatar> = {
  pastor: PastorAvatar,
  masa: MasaAvatar,
  cilantro: CilantroAvatar,
  tortilla: TortillaAvatar,
  salsa: SalsaAvatar,
  comal: ComalAvatar,
  aguacate: AguacateAvatar,
  horchata: HorchataAvatar,
};

type Props = {
  size?: Size;
  preset?: Preset;
  photoUrl?: string;
  accessibilityLabel?: string;
};

export function Avatar({ size = 40, preset = "pastor", photoUrl, accessibilityLabel }: Props) {
  const PresetAvatar = AVATAR_PRESETS[preset];
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
        <PresetAvatar width={size} height={size} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
});
