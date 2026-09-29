import { View, StyleSheet } from "react-native";
import { colors, radii } from "@/theme";

type Props = {
  progress: number;
  color?: string;
};

export function ProgressBar({ progress, color = colors.green }: Props) {
  return (
    <View style={[styles.container, { backgroundColor: colors.segmentTrack }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 4,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
});
