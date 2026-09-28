import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";

export const APP_BACKGROUND_COLOR = "#1A0A0D";

const logoSource = require("../assets/netmark-logo.png");

type Motion = "float" | "drift" | "pulse" | "spin";

function AnimatedLogo({
  size,
  left,
  top,
  right,
  bottom,
  opacity,
  motion,
  duration,
  reduceMotion,
  centered
}: {
  size: number;
  left?: number | `${number}%`;
  top?: number | `${number}%`;
  right?: number | `${number}%`;
  bottom?: number | `${number}%`;
  opacity: number;
  motion: Motion;
  duration: number;
  reduceMotion: boolean;
  centered?: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: motion === "spin" ? Easing.linear : Easing.inOut(Easing.ease),
        useNativeDriver: true
      })
    );
    loop.start();
    return () => loop.stop();
  }, [duration, motion, progress, reduceMotion]);

  const transform =
    motion === "float"
      ? [
          {
            translateX: progress.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 24, 0]
            })
          },
          {
            translateY: progress.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, -28, 0]
            })
          },
          {
            rotate: progress.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: ["0deg", "8deg", "0deg"]
            })
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 1.06, 1]
            })
          }
        ]
      : motion === "drift"
        ? [
            {
              translateX: progress.interpolate({
                inputRange: [0, 0.33, 0.66, 1],
                outputRange: [0, -30, 18, 0]
              })
            },
            {
              translateY: progress.interpolate({
                inputRange: [0, 0.33, 0.66, 1],
                outputRange: [0, 18, -22, 0]
              })
            },
            {
              rotate: progress.interpolate({
                inputRange: [0, 0.33, 0.66, 1],
                outputRange: ["0deg", "-6deg", "5deg", "0deg"]
              })
            }
          ]
        : motion === "pulse"
          ? [
              {
                scale: progress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [1, 1.14, 1]
                })
              },
              {
                rotate: progress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: ["0deg", "-10deg", "0deg"]
                })
              }
            ]
          : [
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "360deg"]
                })
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08]
                })
              }
            ];

  const animatedOpacity =
    motion === "pulse"
      ? progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.12, 0.2, 0.12]
        })
      : opacity;

  const positionStyle = centered
    ? {
        position: "absolute" as const,
        top: "50%" as const,
        left: "50%" as const,
        marginLeft: -size / 2,
        marginTop: -size / 2
      }
    : {
        position: "absolute" as const,
        left,
        top,
        right,
        bottom
      };

  return (
    <Animated.Image
      source={logoSource}
      resizeMode="contain"
      style={[
        {
          width: size,
          height: size,
          opacity: animatedOpacity,
          ...positionStyle
        },
        { transform }
      ]}
    />
  );
}

export function AppBackground() {
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const apply = (enabled: boolean) => setReduceMotion(enabled);
    AccessibilityInfo.isReduceMotionEnabled().then(apply);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      apply
    );
    return () => sub.remove();
  }, []);

  return (
    <View
      pointerEvents="none"
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AnimatedLogo
        size={Math.min(width * 0.42, 360)}
        top="8%"
        left="6%"
        opacity={0.14}
        motion="float"
        duration={18000}
        reduceMotion={reduceMotion}
      />
      <AnimatedLogo
        size={Math.min(width * 0.52, 460)}
        top="38%"
        right="4%"
        opacity={0.14}
        motion="drift"
        duration={24000}
        reduceMotion={reduceMotion}
      />
      <AnimatedLogo
        size={Math.min(width * 0.34, 300)}
        bottom="6%"
        left="28%"
        opacity={0.14}
        motion="pulse"
        duration={16000}
        reduceMotion={reduceMotion}
      />
      <AnimatedLogo
        size={Math.min(width * 0.6, 520)}
        opacity={0.08}
        motion="spin"
        duration={40000}
        reduceMotion={reduceMotion}
        centered
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: APP_BACKGROUND_COLOR,
    overflow: "hidden",
    zIndex: 0
  },
  screen: {
    flex: 1,
    backgroundColor: "transparent",
    position: "relative",
    overflow: "hidden"
  },
  foreground: {
    flex: 1,
    zIndex: 1
  }
});

export function AppScreen({
  children,
  style
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.screen, style]}>
      <AppBackground />
      <View style={styles.foreground}>{children}</View>
    </View>
  );
}
