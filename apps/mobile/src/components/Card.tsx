import { View, type ViewProps } from "react-native";
import { colors, radii } from "@/theme";

type Tone = "default" | "highlight" | "dashed";

interface Props extends Omit<ViewProps, "style"> {
  tone?: Tone;
  style?: any;
}

export function Card({ tone = "default", style, ...rest }: Props) {
  const toneStyles: Record<Tone, any> = {
    default: {
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.line,
    },
    highlight: {
      backgroundColor: colors.goldSoft,
      borderWidth: 1,
      borderColor: colors.line,
    },
    dashed: {
      backgroundColor: colors.cream,
      borderWidth: 1,
      borderColor: colors.line,
      borderStyle: "dashed",
    },
  };

  return (
    <View
      style={[
        {
          borderRadius: radii.xl,
          padding: 13,
        },
        toneStyles[tone],
        style,
      ]}
      {...rest}
    />
  );
}
