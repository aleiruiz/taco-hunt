import { Animated, View, Pressable, StyleSheet, type LayoutChangeEvent } from "react-native";
import { colors, radii, spacing, motion, elevation } from "@/theme";
import { useEffect, useRef, useState } from "react";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
};

export function BottomSheet({ visible, onClose, children, snapPoints = [0.5] }: Props) {
  const slideAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [contentHeight, setContentHeight] = useState(300);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: motion.base,
          useNativeDriver: false,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: motion.base,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: motion.base,
          useNativeDriver: false,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: motion.base,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  if (!visible) return null;

  const handleContentLayout = (event: LayoutChangeEvent) => {
    setContentHeight(event.nativeEvent.layout.height);
  };

  return (
    <>
      <Animated.View
        style={[
          styles.scrim,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, contentHeight + 100],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.handle} onLayout={handleContentLayout} />
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineSoft,
    alignSelf: "center",
    marginVertical: spacing.sm,
  },
  content: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    ...elevation.sheet,
  },
});
