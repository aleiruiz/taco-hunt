import { View, type ViewProps } from "react-native";
import { colors, radii } from "@/theme";

export function Card({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.paper,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.xl,
          padding: 13,
        },
        style,
      ]}
      {...rest}
    />
  );
}
