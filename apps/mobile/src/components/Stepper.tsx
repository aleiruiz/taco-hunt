import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "@/theme";

type Props = {
  currentStep: number;
  totalSteps: number;
};

export function Stepper({ currentStep, totalSteps }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              i < currentStep && styles.barFilled,
            ]}
          />
        ))}
      </View>
      <Text style={styles.text}>
        PASO {currentStep} DE {totalSteps}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  bars: {
    flexDirection: "row",
    width: "80%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: spacing.sm,
    backgroundColor: colors.segmentTrack,
  },
  bar: {
    flex: 1,
    backgroundColor: colors.segmentTrack,
    marginHorizontal: 1,
  },
  barFilled: {
    backgroundColor: colors.green,
  },
  text: { ...typography.kicker, color: colors.muted, fontSize: 11 },
});
