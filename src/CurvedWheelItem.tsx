import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

export interface CurvedWheelItemProps {
  text: string;
  subText?: string;
  disabled?: boolean;
  baseAngle: number;
  stepAngle: number;
  radius: number;
  centerR: number;
  rotation: SharedValue<number>;
  selectionAngle: number;
  fontSize: number;
  subFontSize?: number;
  textColor?: string;
  itemWidth: number;
  itemHeight: number;
}

export const CurvedWheelItem = memo(function CurvedWheelItem({
  text,
  subText,
  disabled = false,
  baseAngle,
  stepAngle,
  radius,
  centerR,
  rotation,
  selectionAngle,
  fontSize,
  subFontSize,
  textColor = "#ffffff",
  itemWidth,
  itemHeight,
}: CurvedWheelItemProps) {
  if (!text) return null;

  // Precompute static layout coordinates
  const rad = (baseAngle * Math.PI) / 180;
  const x = centerR + radius * Math.cos(rad);
  const y = centerR + radius * Math.sin(rad);
  const textRot = baseAngle + 90;

  const itemStyle = useMemo(
    () => [
      styles.itemContainer,
      {
        width: itemWidth,
        height: itemHeight,
        left: x - itemWidth / 2,
        top: y - itemHeight / 2,
        transform: [{ rotate: `${textRot}deg` }],
      },
    ],
    [x, y, textRot, itemWidth, itemHeight]
  );

  const calculatedSubFontSize = subFontSize ?? Math.max(9, Math.round(fontSize * 0.55));
  const effectiveTextColor = disabled ? "rgba(255, 255, 255, 0.35)" : textColor;

  const animatedStyle = useAnimatedStyle(() => {
    let diff = (baseAngle + rotation.value - selectionAngle) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    const absDiff = Math.abs(diff);
    const isDayRing = stepAngle >= 10 && stepAngle <= 15; // Day ring has stepAngle ~ 11.61°
    const isDense = stepAngle <= 8;

    // Scale curve: selected day is distinctly larger and prominent, neighbors gently scale down
    const scale = isDayRing
      ? interpolate(
          absDiff,
          [0, 12, 24, 36, 48],
          [1.46, 0.98, 0.85, 0.75, 0.65],
          Extrapolation.CLAMP
        )
      : isDense
      ? interpolate(
          absDiff / stepAngle,
          [0, 0.7, 1.4, 2.2],
          [1.22, 0.76, 0.62, 0.5],
          Extrapolation.CLAMP
        )
      : interpolate(
          absDiff,
          [0, 15, 30, 48],
          [1.35, 1.10, 0.92, 0.75],
          Extrapolation.CLAMP
        );

    // Opacity fade: days on left and right remain properly visible along the entire quarter arc
    const opacity = isDayRing
      ? interpolate(
          absDiff,
          [0, 12, 24, 36, 46, 52],
          [1.0, 0.85, 0.68, 0.50, 0.30, 0],
          Extrapolation.CLAMP
        )
      : isDense
      ? interpolate(
          absDiff / stepAngle,
          [0, 0.65, 1.3, 2.2],
          [1.0, 0.35, 0.12, 0],
          Extrapolation.CLAMP
        )
      : interpolate(
          absDiff,
          [0, 15, 30, 45, 52],
          [1.0, 0.80, 0.52, 0.20, 0],
          Extrapolation.CLAMP
        );

    const effectiveOpacity = disabled ? opacity * 0.35 : opacity;

    return {
      opacity: effectiveOpacity,
      transform: [{ scale }],
    };
  });

  return (
    <View style={itemStyle}>
      {subText ? (
        <Animated.View style={[styles.contentWrapper, animatedStyle]}>
          {/* First line: Day number */}
          <Text style={[styles.itemText, { fontSize, color: effectiveTextColor }]}>
            {text}
          </Text>
          {/* Second line: Weekday name (smaller font) */}
          <Text
            style={[
              styles.subText,
              { fontSize: calculatedSubFontSize, color: effectiveTextColor },
            ]}
          >
            {subText}
          </Text>
        </Animated.View>
      ) : (
        <Animated.Text
          style={[styles.itemText, { fontSize, color: effectiveTextColor }, animatedStyle]}
        >
          {text}
        </Animated.Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  itemContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  contentWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  itemText: {
    fontWeight: "900",
    textAlign: "center",
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
  subText: {
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
    opacity: 0.9,
    marginTop: 1,
    letterSpacing: 0.2,
  },
});
