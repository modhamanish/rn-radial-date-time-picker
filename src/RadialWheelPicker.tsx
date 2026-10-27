import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  makeMutable,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from "react-native-reanimated";
import { CurvedWheelItem } from "./CurvedWheelItem";
import type {
  CornerPosition,
  RadialWheelPickerProps,
  RadialWheelPickerRef,
  SelectedWheelItem,
  WheelItem,
  WheelRingConfig,
} from "./types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const DEFAULT_MAIN_SIZE = SCREEN_WIDTH / 4.1;

const DEFAULT_SPRING_CONFIG: WithSpringConfig = {
  damping: 17,
  stiffness: 150,
  mass: 0.8,
};

const DEFAULT_RING_COLORS = [
  "#3650fb",
  "#4d64fb",
  "#6377fc",
  "#7b8dfd",
  "#95a4fe",
];

function getDefaultSelectionAngle(corner: CornerPosition): number {
  switch (corner) {
    case "bottom-left":
      return 315;
    case "top-right":
      return 135;
    case "top-left":
      return 45;
    case "bottom-right":
    default:
      return 225;
  }
}

function getCornerPositionStyle(corner: CornerPosition, radius: number): ViewStyle {
  switch (corner) {
    case "bottom-left":
      return { bottom: -radius, left: -radius };
    case "top-right":
      return { top: -radius, right: -radius };
    case "top-left":
      return { top: -radius, left: -radius };
    case "bottom-right":
    default:
      return { bottom: -radius, right: -radius };
  }
}

function getCenterQuadrantStyle(corner: CornerPosition, radius: number): ViewStyle {
  switch (corner) {
    case "bottom-left":
      return { position: "absolute", top: 0, right: 0, width: radius, height: radius };
    case "top-right":
      return { position: "absolute", bottom: 0, left: 0, width: radius, height: radius };
    case "top-left":
      return { position: "absolute", bottom: 0, right: 0, width: radius, height: radius };
    case "bottom-right":
    default:
      return { position: "absolute", top: 0, left: 0, width: radius, height: radius };
  }
}

function getItemText<T extends WheelItem>(
  item: T,
  formatLabel?: (item: T) => string
): string {
  if (formatLabel) return formatLabel(item);
  if (typeof item === "object" && item !== null && "label" in item) {
    return String(item.label);
  }
  return String(item);
}

interface RingLayerProps {
  ring: WheelRingConfig;
  ringIndex: number;
  outerRadius: number;
  midpointRadius: number;
  angle: SharedValue<number>;
  scale: SharedValue<number>;
  opacity: SharedValue<number>;
  selectionAngle: number;
  corner: CornerPosition;
  color: string;
}

const RadialRingLayer = memo(function RadialRingLayer({
  ring,
  outerRadius,
  midpointRadius,
  angle,
  scale,
  opacity,
  selectionAngle,
  corner,
  color,
}: RingLayerProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${angle.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const baseStyle = useMemo(
    () => [
      styles.circleBase,
      {
        height: outerRadius * 2,
        width: outerRadius * 2,
        backgroundColor: color,
        borderRadius: outerRadius,
        ...getCornerPositionStyle(corner, outerRadius),
      },
    ],
    [outerRadius, color, corner]
  );

  const stepAngle = useMemo(
    () => 360 / Math.max(ring.items.length, 1),
    [ring.items.length]
  );

  const itemsData = useMemo(() => {
    return ring.items.map((item, index) => ({
      text: getItemText(item, ring.formatLabel),
      baseAngle: selectionAngle + index * stepAngle,
    }));
  }, [ring.items, ring.formatLabel, selectionAngle, stepAngle]);

  const fontSize = ring.fontSize ?? 18;
  const itemWidth = ring.itemWidth ?? 64;
  const itemHeight = ring.itemHeight ?? 36;
  const textColor = ring.textColor ?? "#ffffff";

  return (
    <Animated.View style={[baseStyle, animatedStyle]} pointerEvents="none">
      {itemsData.map((item, idx) => (
        <CurvedWheelItem
          key={`ring-item-${idx}-${item.text}`}
          text={item.text}
          baseAngle={item.baseAngle}
          stepAngle={stepAngle}
          radius={midpointRadius}
          centerR={outerRadius}
          rotation={angle}
          selectionAngle={selectionAngle}
          fontSize={fontSize}
          textColor={textColor}
          itemWidth={itemWidth}
          itemHeight={itemHeight}
        />
      ))}
    </Animated.View>
  );
});

export const RadialWheelPicker = forwardRef<RadialWheelPickerRef, RadialWheelPickerProps>(
  function RadialWheelPicker(
    {
      rings,
      isOpen,
      corner = "bottom-right",
      onClose,
      onConfirm,
      mainSize = DEFAULT_MAIN_SIZE,
      centerRadius,
      centerColor = "#1d37e1",
      centerIcon,
      showCenterButton = true,
      selectionAngle: customSelectionAngle,
      springConfig = DEFAULT_SPRING_CONFIG,
      style,
      testID,
    },
    ref
  ) {
    const selectionAngle = customSelectionAngle ?? getDefaultSelectionAngle(corner);
    const R0 = centerRadius ?? mainSize * 1.1;

    // Precompute radii for each ring layer
    const ringRadii = useMemo(() => {
      const radii: { outerRadius: number; midpointRadius: number; innerRadius: number }[] = [];
      let currentInner = R0;
      for (let i = 0; i < rings.length; i++) {
        // Natural concentric step ratios matching original design
        const spacingFactor = i === 0 ? 1.05 : i === 1 ? 1.0 : 1.1;
        const outer = currentInner + mainSize * spacingFactor;
        radii.push({
          innerRadius: currentInner,
          outerRadius: outer,
          midpointRadius: (currentInner + outer) / 2,
        });
        currentInner = outer;
      }
      return radii;
    }, [rings.length, R0, mainSize]);

    // Track layout dimensions of the container
    const [layout, setLayout] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
    const layoutRef = useRef(layout);
    layoutRef.current = layout;

    // Track selected index for each ring
    const initialIndices = useMemo(
      () =>
        rings.map((r) => {
          const idx = r.selectedIndex ?? r.initialIndex ?? 0;
          return Math.max(0, Math.min(idx, r.items.length - 1));
        }),
      [rings]
    );

    const [selectedIndices, setSelectedIndices] = useState<number[]>(initialIndices);
    const selectedIndicesRef = useRef(selectedIndices);
    selectedIndicesRef.current = selectedIndices;

    // Initialize shared values for all rings
    const anglesRef = useRef<SharedValue<number>[]>([]);
    const scalesRef = useRef<SharedValue<number>[]>([]);
    const opacitiesRef = useRef<SharedValue<number>[]>([]);

    if (anglesRef.current.length !== rings.length) {
      anglesRef.current = rings.map((ring, i) => {
        const step = 360 / Math.max(ring.items.length, 1);
        const initialIdx = initialIndices[i] ?? 0;
        return makeMutable(-initialIdx * step);
      });
      scalesRef.current = rings.map(() => makeMutable(0));
      opacitiesRef.current = rings.map(() => makeMutable(0));
    }

    // Sync with dynamic ring items length or external selectedIndex updates
    const ringsSignature = useMemo(
      () => rings.map((r) => `${r.items.length}:${r.selectedIndex ?? ""}`).join(","),
      [rings]
    );

    useEffect(() => {
      rings.forEach((ring, i) => {
        const angle = anglesRef.current[i];
        if (!angle || ring.items.length === 0) return;

        // Skip during active user interaction on this ring
        if (activeRingRef.current === i) return;

        const count = ring.items.length;
        const step = 360 / count;

        const targetIdx =
          ring.selectedIndex !== undefined
            ? Math.max(0, Math.min(ring.selectedIndex, count - 1))
            : Math.min(selectedIndicesRef.current[i] ?? 0, count - 1);

        if (selectedIndicesRef.current[i] !== targetIdx) {
          selectedIndicesRef.current[i] = targetIdx;
          setSelectedIndices((prev) => {
            const next = [...prev];
            next[i] = targetIdx;
            return next;
          });
        }

        angle.value = withSpring(-targetIdx * step, springConfig);
      });
    }, [ringsSignature, springConfig, rings]);

    // Shared values for innermost center confirm circle
    const centerScale = useSharedValue(0);
    const centerOpacity = useSharedValue(0);

    // Cancel animations on unmount
    useEffect(() => {
      const angles = anglesRef.current;
      const scales = scalesRef.current;
      const opacities = opacitiesRef.current;
      return () => {
        angles.forEach((m) => cancelAnimation(m));
        scales.forEach((m) => cancelAnimation(m));
        opacities.forEach((m) => cancelAnimation(m));
        cancelAnimation(centerScale);
        cancelAnimation(centerOpacity);
      };
    }, [centerScale, centerOpacity]);

    // Snapping logic for a specific ring
    const snapRing = useCallback(
      (ringIdx: number) => {
        const ring = rings[ringIdx];
        if (!ring || !ring.items.length) return;

        const count = ring.items.length;
        const step = 360 / count;
        const angle = anglesRef.current[ringIdx];
        if (!angle) return;

        const rawIndex = Math.round(-angle.value / step);
        const targetAngle = -rawIndex * step;

        angle.value = withSpring(targetAngle, springConfig);

        const normalizedIndex = ((rawIndex % count) + count) % count;
        if (selectedIndicesRef.current[ringIdx] !== normalizedIndex) {
          selectedIndicesRef.current[ringIdx] = normalizedIndex;
          setSelectedIndices((prev) => {
            const next = [...prev];
            next[ringIdx] = normalizedIndex;
            return next;
          });
          ring.onChange?.(normalizedIndex, ring.items[normalizedIndex]);
        }
      },
      [rings, springConfig]
    );

    // Expose programmatic controls via ref
    useImperativeHandle(
      ref,
      () => ({
        snapTo: (ringIndex: number, itemIndex: number) => {
          const ring = rings[ringIndex];
          if (!ring || !ring.items.length) return;
          const step = 360 / ring.items.length;
          const angle = anglesRef.current[ringIndex];
          if (angle) {
            angle.value = withSpring(-itemIndex * step, springConfig);
            selectedIndicesRef.current[ringIndex] = itemIndex;
            setSelectedIndices((prev) => {
              const next = [...prev];
              next[ringIndex] = itemIndex;
              return next;
            });
            ring.onChange?.(itemIndex, ring.items[itemIndex]);
          }
        },
        getSelectedIndexes: () => [...selectedIndicesRef.current],
      }),
      [rings, springConfig]
    );

    // Open & Close animations
    const openWheel = useCallback(() => {
      const N = rings.length;
      rings.forEach((_, i) => {
        // Stagger outermost ring down to innermost ring
        const ringDelay = 40 + (N - 1 - i) * 80;
        const scaleVal = scalesRef.current[i];
        const opacityVal = opacitiesRef.current[i];
        if (scaleVal) scaleVal.value = withDelay(ringDelay, withSpring(1, springConfig));
        if (opacityVal) opacityVal.value = withDelay(ringDelay, withTiming(1, { duration: 220 }));
      });

      const centerDelay = 40 + N * 80;
      centerScale.value = withDelay(centerDelay, withSpring(1, springConfig));
      centerOpacity.value = withDelay(centerDelay, withTiming(1, { duration: 220 }));
    }, [rings, springConfig, centerScale, centerOpacity]);

    const closeWheel = useCallback(() => {
      const timingConfig = { duration: 180, easing: Easing.in(Easing.quad) };
      const N = rings.length;

      rings.forEach((_, i) => {
        const ringDelay = (N - 1 - i) * 40;
        const scaleVal = scalesRef.current[i];
        const opacityVal = opacitiesRef.current[i];
        if (scaleVal) scaleVal.value = withDelay(ringDelay, withTiming(0, timingConfig));
        if (opacityVal) opacityVal.value = withDelay(ringDelay, withTiming(0, timingConfig));
      });

      const centerDelay = N * 40;
      centerScale.value = withDelay(centerDelay, withTiming(0, timingConfig));
      centerOpacity.value = withDelay(centerDelay, withTiming(0, timingConfig));
    }, [rings, centerScale, centerOpacity]);

    useEffect(() => {
      if (isOpen) {
        openWheel();
      } else {
        closeWheel();
      }
    }, [isOpen, openWheel, closeWheel]);

    const handleConfirm = useCallback(() => {
      centerScale.value = withSequence(
        withTiming(1.3, { duration: 130 }),
        withSpring(1, { damping: 9, stiffness: 200 })
      );

      if (onConfirm) {
        const selection: SelectedWheelItem[] = rings.map((ring, i) => {
          const idx = selectedIndicesRef.current[i] ?? 0;
          return {
            ringIndex: i,
            itemIndex: idx,
            item: ring.items[idx],
          };
        });
        onConfirm(selection);
      }

      setTimeout(() => {
        onClose?.();
      }, 250);
    }, [centerScale, onConfirm, rings, onClose]);

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setLayout((prev) =>
        prev.width !== width || prev.height !== height ? { width, height } : prev
      );
    }, []);

    // PanResponder tracking
    const activeRingRef = useRef<number | null>(null);
    const lastAngleRef = useRef<number>(0);
    const hasMovedRef = useRef<boolean>(false);

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: (_evt, gesture) =>
            Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,

          onPanResponderGrant: (evt) => {
            const { pageX, pageY } = evt.nativeEvent;
            const curWidth = layoutRef.current.width;
            const curHeight = layoutRef.current.height;

            let cornerX = curWidth;
            let cornerY = curHeight;
            if (corner === "bottom-left") {
              cornerX = 0;
              cornerY = curHeight;
            } else if (corner === "top-right") {
              cornerX = curWidth;
              cornerY = 0;
            } else if (corner === "top-left") {
              cornerX = 0;
              cornerY = 0;
            }

            const dist = Math.sqrt((pageX - cornerX) ** 2 + (pageY - cornerY) ** 2);

            let touchedRing: number | null = null;
            if (dist < R0 && showCenterButton) {
              touchedRing = -1; // Center button
            } else {
              const N = ringRadii.length;
              for (let i = 0; i < N; i++) {
                const maxRadius = i === N - 1 ? ringRadii[i].outerRadius * 1.15 : ringRadii[i].outerRadius;
                if (dist < maxRadius) {
                  touchedRing = i;
                  break;
                }
              }
            }

            activeRingRef.current = touchedRing;
            hasMovedRef.current = false;

            const touchAngle = (Math.atan2(pageY - cornerY, pageX - cornerX) * 180) / Math.PI;
            lastAngleRef.current = touchAngle;
          },

          onPanResponderMove: (evt) => {
            const ringIdx = activeRingRef.current;
            if (ringIdx === null || ringIdx === -1) return;

            const { pageX, pageY } = evt.nativeEvent;
            const curWidth = layoutRef.current.width;
            const curHeight = layoutRef.current.height;

            let cornerX = curWidth;
            let cornerY = curHeight;
            if (corner === "bottom-left") {
              cornerX = 0;
              cornerY = curHeight;
            } else if (corner === "top-right") {
              cornerX = curWidth;
              cornerY = 0;
            } else if (corner === "top-left") {
              cornerX = 0;
              cornerY = 0;
            }

            const touchAngle = (Math.atan2(pageY - cornerY, pageX - cornerX) * 180) / Math.PI;
            let delta = touchAngle - lastAngleRef.current;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;

            if (Math.abs(delta) > 0.15) {
              hasMovedRef.current = true;
            }

            lastAngleRef.current = touchAngle;

            const ringAngle = anglesRef.current[ringIdx];
            if (ringAngle) {
              ringAngle.value = ringAngle.value + delta;
            }
          },

          onPanResponderRelease: (evt) => {
            const ringIdx = activeRingRef.current;
            activeRingRef.current = null;

            if (ringIdx === -1) {
              handleConfirm();
              return;
            }

            if (ringIdx === null) return;

            const curWidth = layoutRef.current.width;
            const curHeight = layoutRef.current.height;
            let cornerX = curWidth;
            let cornerY = curHeight;
            if (corner === "bottom-left") {
              cornerX = 0;
              cornerY = curHeight;
            } else if (corner === "top-right") {
              cornerX = curWidth;
              cornerY = 0;
            } else if (corner === "top-left") {
              cornerX = 0;
              cornerY = 0;
            }

            // Tap without dragging -> rotate tapped item to selection ray
            if (!hasMovedRef.current) {
              const { pageX, pageY } = evt.nativeEvent;
              const tapAngle = (Math.atan2(pageY - cornerY, pageX - cornerX) * 180) / Math.PI;
              let diff = tapAngle - selectionAngle;
              if (diff > 180) diff -= 360;
              if (diff < -180) diff += 360;

              const ringAngle = anglesRef.current[ringIdx];
              if (ringAngle) {
                ringAngle.value = ringAngle.value + diff;
                snapRing(ringIdx);
              }
              return;
            }

            snapRing(ringIdx);
          },
        }),
      [corner, R0, showCenterButton, ringRadii, handleConfirm, selectionAngle, snapRing]
    );

    // Center circle animated style
    const animatedCenterStyle = useAnimatedStyle(() => ({
      transform: [{ scale: centerScale.value }],
      opacity: centerOpacity.value,
    }));

    const centerBaseStyle = useMemo(
      () => [
        styles.circleBase,
        {
          height: R0 * 2,
          width: R0 * 2,
          backgroundColor: centerColor,
          borderRadius: R0,
          ...getCornerPositionStyle(corner, R0),
        },
      ],
      [R0, centerColor, corner]
    );

    const centerQuadrantStyle = useMemo(
      () => [styles.centerWrapper, getCenterQuadrantStyle(corner, R0)],
      [corner, R0]
    );

    return (
      <View
        testID={testID}
        style={[styles.container, style]}
        pointerEvents={isOpen ? "auto" : "none"}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {/* Concentric Ring Layers (rendered outermost first so inner circles overlap neatly) */}
        {rings
          .map((ring, idx) => ({ ring, idx }))
          .reverse()
          .map(({ ring, idx }) => {
            const radii = ringRadii[idx];
            const angleVal = anglesRef.current[idx];
            const scaleVal = scalesRef.current[idx];
            const opacityVal = opacitiesRef.current[idx];
            if (!radii || !angleVal || !scaleVal || !opacityVal) return null;

            const ringColor =
              ring.color ?? DEFAULT_RING_COLORS[idx % DEFAULT_RING_COLORS.length];

            return (
              <RadialRingLayer
                key={ring.id ?? `ring-layer-${idx}`}
                ring={ring}
                ringIndex={idx}
                outerRadius={radii.outerRadius}
                midpointRadius={radii.midpointRadius}
                angle={angleVal}
                scale={scaleVal}
                opacity={opacityVal}
                selectionAngle={selectionAngle}
                corner={corner}
                color={ringColor}
              />
            );
          })}

        {/* Center Checkmark / Action Circle */}
        {showCenterButton && (
          <Animated.View style={[centerBaseStyle, animatedCenterStyle]} pointerEvents="none">
            <View style={centerQuadrantStyle}>
              {centerIcon ?? <Text style={styles.checkmark}>✓</Text>}
            </View>
          </Animated.View>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  circleBase: {
    position: "absolute",
    overflow: "hidden",
  },
  centerWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "900",
  },
});
