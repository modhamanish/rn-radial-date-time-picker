import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { CurvedWheelItem } from "./CurvedWheelItem";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Geometric sizing based on screen width - matching original design
const MAIN_SIZE = SCREEN_WIDTH / 4.1;

const R1 = MAIN_SIZE * 1.1; // Innermost checkmark circle
const R2 = MAIN_SIZE * 2.15; // 1st ring (Year)
const R3 = MAIN_SIZE * 3.15; // 2nd ring (Month)
const R4 = MAIN_SIZE * 4.25; // 3rd ring (Day)

// Midpoint radii for text on each ring
const RADIUS_RING4 = (R3 + R4) / 2; // Outer ring (Day)
const RADIUS_RING3 = (R2 + R3) / 2; // Middle ring (Month)
const RADIUS_RING2 = (R1 + R2) / 2; // Inner ring (Year)

const SPRING_CONFIG = {
  damping: 19,
  stiffness: 170,
  mass: 0.75,
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

/**
 * Calculates the displayed year for slot k on a 12-slot circular buffer.
 * Offscreen slots seamlessly update so that scrolling forward is always
 * incremental (+1) and backward is always decremental (-1) with no hard looping.
 */
function getSlotYear(k: number, centerRawIdx: number, baseYear: number): string {
  let diff = ((k - centerRawIdx) % 12 + 12) % 12;
  if (diff > 6) diff -= 12;
  return String(baseYear + centerRawIdx + diff);
}

function clampDate(d: Date, min?: Date, max?: Date): Date {
  const time = d.getTime();
  if (min && time < min.getTime()) return new Date(min.getTime());
  if (max && time > max.getTime()) return new Date(max.getTime());
  return d;
}

/**
 * Calculates the displayed minute for slot k on a 12-slot circular buffer.
 * Offscreen slots update continuously like Year so spinning is clean, spacious,
 * and increments/decrements 0..59 with generous 30° arc spacing.
 */
function getSlotMinute(
  k: number,
  centerRawIdx: number,
  validMinuteInterval: number,
  totalMinSlots: number
): string {
  let diff = ((k - centerRawIdx) % 12 + 12) % 12;
  if (diff > 6) diff -= 12;
  const rawSlot = centerRawIdx + diff;
  const normalizedSlot = ((rawSlot % totalMinSlots) + totalMinSlots) % totalMinSlots;
  const minVal = normalizedSlot * validMinuteInterval;
  return String(minVal).padStart(2, "0");
}

export type RadialPickerMode = "date" | "time";

// Time picker constants
const STEP_HOUR = 30; // 360 / 12 = 30 deg
const STEP_MINUTE = 30; // 360 / 12 = 30 deg (12-slot circular buffer like Year)
const STEP_AMPM = 40; // 40 deg separation between AM and PM (non-looping)

const HOURS_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const AMPM_LIST = ["", "AM", "PM", ""];

export interface RadialDatePickerProps {
  /** Picker mode: "date" or "time". Defaults to "date" */
  mode?: RadialPickerMode;
  /** Currently selected Date (defaults to real current date `new Date()`) */
  value?: Date | null;
  /** Whether the radial picker wheel is open/visible (defaults to false) */
  isOpen?: boolean;
  /** Callback fired when wheel requests to close (e.g. after confirming or backdrop tap) */
  onClose?: () => void;
  /** Callback fired whenever date/time changes */
  onChange?: (date: Date) => void;
  /** Callback fired when center checkmark is tapped */
  onConfirm?: (date: Date) => void;
  /** Minimum selectable date (applies to date mode) */
  minDate?: Date;
  /** Maximum selectable date (applies to date mode) */
  maxDate?: Date;
  /**
   * Whether to show the weekday name (e.g. "Tue 27") on the Day ring.
   * @default false
   */
  showWeekday?: boolean;
  /**
   * Minute gap/interval for time picker (e.g. 1, 5, 10, 15).
   * Default is 1 (shows continuous 0, 1, 2, 3... 59 minutes).
   * If set to 5 or 10, picker steps by that gap (e.g. 00, 05, 10...).
   * @default 1
   */
  minuteGap?: number;
  /**
   * Alias for minuteGap.
   * @default 1
   */
  minuteInterval?: number;
  /**
   * Background color of the full-screen modal backdrop overlay.
   * Default has no color (transparent).
   * @default "transparent"
   */
  backdropColor?: string;
  /** Optional container style */
  style?: StyleProp<ViewStyle>;
}

export const RadialDatePicker = memo(function RadialDatePicker({
  mode = "date",
  value,
  isOpen = false,
  onClose,
  onChange,
  onConfirm,
  minDate,
  maxDate,
  showWeekday = false,
  minuteGap,
  minuteInterval,
  backdropColor = "transparent",
  style,
}: RadialDatePickerProps) {
  // Initial date on mount, clamped to min/max
  const initialDate = useMemo(() => {
    const raw = value ?? new Date();
    return clampDate(raw, minDate, maxDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable base year (current year on mount, e.g. 2026)
  const [baseYear] = useState(() => initialDate.getFullYear());

  // Dynamic 12 Months list
  const LIST_3 = useMemo(() => MONTH_NAMES, []);

  // Initial indices matching real current date
  const INITIAL_RAW_YEAR = initialDate.getFullYear() - baseYear;
  const INITIAL_IDX_3 = initialDate.getMonth(); // 0..11
  const INITIAL_IDX_4 = Math.max(0, initialDate.getDate() - 1); // 0-based

  const [centerYearRawIdx, setCenterYearRawIdx] = useState(INITIAL_RAW_YEAR);
  const centerYearRawIdxRef = useRef(centerYearRawIdx);
  centerYearRawIdxRef.current = centerYearRawIdx;

  const [idx3, setIdx3] = useState(INITIAL_IDX_3);
  const [idx4, setIdx4] = useState(INITIAL_IDX_4);

  // Dynamic minutes step and buffer according to minuteGap/minuteInterval (default 1 for 0, 1, 2, 3... 59)
  const rawGap = minuteGap ?? minuteInterval ?? 1;
  const validMinuteInterval = Math.max(1, Math.min(30, rawGap));
  const totalMinSlots = Math.floor(60 / validMinuteInterval);

  // Time states (mode="time")
  const initialHours24 = initialDate.getHours();
  const initialIsPM = initialHours24 >= 12;
  const initialHour12 = initialHours24 % 12 === 0 ? 12 : initialHours24 % 12;
  const initialMinute = initialDate.getMinutes();
  const initialMinuteSlot =
    Math.round(initialMinute / validMinuteInterval) % totalMinSlots;
  const initialMinuteVal = initialMinuteSlot * validMinuteInterval;

  const [centerMinuteRawIdx, setCenterMinuteRawIdx] = useState(initialMinuteSlot);
  const centerMinuteRawIdxRef = useRef(centerMinuteRawIdx);
  centerMinuteRawIdxRef.current = centerMinuteRawIdx;
  const lastMoveMinuteSlotRef = useRef(centerMinuteRawIdx);

  const [selectedHour, setSelectedHour] = useState(initialHour12);
  const [selectedMinute, setSelectedMinute] = useState(initialMinuteVal);
  const [selectedAmPm, setSelectedAmPm] = useState<"AM" | "PM">(
    initialIsPM ? "PM" : "AM"
  );

  const selectedHourRef = useRef(selectedHour);
  selectedHourRef.current = selectedHour;
  const selectedMinuteRef = useRef(selectedMinute);
  selectedMinuteRef.current = selectedMinute;
  const selectedAmPmRef = useRef(selectedAmPm);
  selectedAmPmRef.current = selectedAmPm;

  // 12 dynamic slots with continuous minute calculation (like Year ring)
  const ringMinuteItems = useMemo(() => {
    return Array.from({ length: 12 }, (_, k) => {
      const minText = getSlotMinute(
        k,
        centerMinuteRawIdx,
        validMinuteInterval,
        totalMinSlots
      );
      return {
        text: minText,
        baseAngle: 225 + k * STEP_MINUTE,
      };
    });
  }, [centerMinuteRawIdx, validMinuteInterval, totalMinSlots]);

  // Selected year is continuously incremental/decremental: baseYear + centerYearRawIdx
  const selectedYear = baseYear + centerYearRawIdx;

  // Min and Max boundary calculations
  const minYear = minDate ? minDate.getFullYear() : -Infinity;
  const maxYear = maxDate ? maxDate.getFullYear() : Infinity;

  const getMinMonth = useCallback(
    (yr: number): number => {
      if (minDate && yr === minDate.getFullYear()) {
        return minDate.getMonth();
      }
      return 0;
    },
    [minDate]
  );

  const getMaxMonth = useCallback(
    (yr: number): number => {
      if (maxDate && yr === maxDate.getFullYear()) {
        return maxDate.getMonth();
      }
      return 11;
    },
    [maxDate]
  );

  const getMinDay = useCallback(
    (yr: number, m: number): number => {
      if (minDate && yr === minDate.getFullYear() && m === minDate.getMonth()) {
        return minDate.getDate();
      }
      return 1;
    },
    [minDate]
  );

  const getMaxDay = useCallback(
    (yr: number, m: number): number => {
      const daysInM = getDaysInMonth(yr, m);
      if (maxDate && yr === maxDate.getFullYear() && m === maxDate.getMonth()) {
        return Math.min(daysInM, maxDate.getDate());
      }
      return daysInM;
    },
    [maxDate]
  );

  // Dynamic Days based on selected Year & Month (28, 29, 30, or 31)
  const daysCount = useMemo(
    () => getDaysInMonth(selectedYear, idx3),
    [selectedYear, idx3]
  );

  const LIST_4 = useMemo(
    () => Array.from({ length: daysCount }, (_, i) => String(i + 1)),
    [daysCount]
  );

  // Fixed 31 slots for the Day ring so step angle NEVER changes, keeping valid days rock solid!
  const STEP_YEAR = 30; // 360 / 12
  const STEP_3 = 30; // 360 / 12
  const STEP_4 = 360 / 31; // ~11.6129°

  // Precomputed items for Year ring: 12 dynamic slots with continuous year calculation
  const ringYearItems = useMemo(() => {
    return Array.from({ length: 12 }, (_, k) => {
      const yrText = getSlotYear(k, centerYearRawIdx, baseYear);
      const yrNum = Number(yrText);
      const disabled = yrNum < minYear || yrNum > maxYear;
      return {
        text: yrText,
        disabled,
        baseAngle: 225 + k * STEP_YEAR,
      };
    });
  }, [centerYearRawIdx, baseYear, STEP_YEAR, minYear, maxYear]);

  const minMonth = getMinMonth(selectedYear);
  const maxMonth = getMaxMonth(selectedYear);

  const RING3_ITEMS = useMemo(
    () =>
      LIST_3.map((item, index) => ({
        text: item,
        disabled: index < minMonth || index > maxMonth,
        baseAngle: 225 + index * STEP_3,
      })),
    [LIST_3, STEP_3, minMonth, maxMonth]
  );

  const minDay = getMinDay(selectedYear, idx3);
  const maxDay = getMaxDay(selectedYear, idx3);

  // Precomputed items for Day ring: slots beyond daysCount have text = "" and are completely hidden
  const RING4_ITEMS = useMemo(() => {
    return Array.from({ length: 31 }, (_, index) => {
      const dayNum = index + 1;
      const isValid = dayNum <= daysCount;
      if (!isValid) {
        return {
          text: "",
          subText: undefined,
          disabled: true,
          baseAngle: 225 + index * STEP_4,
        };
      }
      let subText: string | undefined = undefined;
      if (showWeekday) {
        const weekdayIdx = new Date(selectedYear, idx3, dayNum).getDay();
        subText = WEEKDAY_NAMES[weekdayIdx];
      }
      const disabled = dayNum < minDay || dayNum > maxDay;
      return {
        text: String(dayNum),
        subText,
        disabled,
        baseAngle: 225 + index * STEP_4,
      };
    });
  }, [daysCount, selectedYear, idx3, showWeekday, STEP_4, minDay, maxDay]);

  // Rotation SharedValues (Date Mode)
  const angleYear = useSharedValue(-INITIAL_RAW_YEAR * STEP_YEAR);
  const angle3 = useSharedValue(-INITIAL_IDX_3 * STEP_3);
  const angle4 = useSharedValue(-INITIAL_IDX_4 * STEP_4);

  // Rotation SharedValues (Time Mode)
  const angleMinute = useSharedValue(-initialMinuteSlot * STEP_MINUTE);
  const angleHour = useSharedValue(-(initialHour12 - 1) * STEP_HOUR);
  const angleAmPm = useSharedValue(initialIsPM ? -STEP_AMPM : 0);

  // Entrance & Exit SharedValues
  const scale4 = useSharedValue(isOpen ? 1 : 0);
  const scale3 = useSharedValue(isOpen ? 1 : 0);
  const scaleYear = useSharedValue(isOpen ? 1 : 0);
  const scale1 = useSharedValue(isOpen ? 1 : 0);

  const opacity4 = useSharedValue(isOpen ? 1 : 0);
  const opacity3 = useSharedValue(isOpen ? 1 : 0);
  const opacityYear = useSharedValue(isOpen ? 1 : 0);
  const opacity1 = useSharedValue(isOpen ? 1 : 0);

  // ONLY animate Day ring if day needs clamping (e.g. Day 31 -> 30 or 28, or min/max bounds).
  useEffect(() => {
    const curMinD = getMinDay(selectedYear, idx3);
    const curMaxD = getMaxDay(selectedYear, idx3);
    const minDIdx = curMinD - 1;
    const maxDIdx = curMaxD - 1;

    if (idx4 > maxDIdx) {
      setIdx4(maxDIdx);
      angle4.value = withSpring(-maxDIdx * STEP_4, SPRING_CONFIG);
    } else if (idx4 < minDIdx) {
      setIdx4(minDIdx);
      angle4.value = withSpring(-minDIdx * STEP_4, SPRING_CONFIG);
    }
  }, [selectedYear, idx3, idx4, STEP_4, angle4, getMinDay, getMaxDay]);

  // Sync with external value prop ONLY if parent passes a genuinely new timestamp
  const prevPropValueTimeRef = useRef<number | null>(
    value ? value.getTime() : null
  );

  useEffect(() => {
    if (!value) return;
    const propTime = value.getTime();
    if (prevPropValueTimeRef.current === propTime) return;
    prevPropValueTimeRef.current = propTime;

    if (mode === "time") {
      const h24 = value.getHours();
      const isPm = h24 >= 12;
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const m = value.getMinutes();
      const mSlot = Math.round(m / validMinuteInterval) % totalMinSlots;
      const roundedM = mSlot * validMinuteInterval;

      setSelectedHour(h12);
      setSelectedMinute(roundedM);
      selectedMinuteRef.current = roundedM;
      centerMinuteRawIdxRef.current = mSlot;
      lastMoveMinuteSlotRef.current = mSlot;
      setCenterMinuteRawIdx(mSlot);
      setSelectedAmPm(isPm ? "PM" : "AM");

      angleHour.value = withSpring(-(h12 - 1) * STEP_HOUR, SPRING_CONFIG);
      angleMinute.value = withSpring(-mSlot * STEP_MINUTE, SPRING_CONFIG);
      angleAmPm.value = withSpring(isPm ? -STEP_AMPM : 0, SPRING_CONFIG);
    } else {
      const clamped = clampDate(value, minDate, maxDate);
      const y = clamped.getFullYear();
      const m = clamped.getMonth();
      const d = clamped.getDate();

      const rawY = y - baseYear;
      centerYearRawIdxRef.current = rawY;
      setCenterYearRawIdx(rawY);
      angleYear.value = withSpring(-rawY * STEP_YEAR, SPRING_CONFIG);

      setIdx3(m);
      angle3.value = withSpring(-m * STEP_3, SPRING_CONFIG);

      const dIdx = d - 1;
      setIdx4(dIdx);
      angle4.value = withSpring(-dIdx * STEP_4, SPRING_CONFIG);
    }
  }, [
    value,
    mode,
    minDate,
    maxDate,
    baseYear,
    STEP_YEAR,
    STEP_3,
    STEP_4,
    angleYear,
    angle3,
    angle4,
    angleHour,
    angleMinute,
    angleAmPm,
  ]);

  // Reset wheel positions & selection states to external value (or current date/time if null/undefined)
  const resetToValueOrCurrent = useCallback(() => {
    const rawTarget = value ?? new Date();
    const targetDate = clampDate(rawTarget, minDate, maxDate);

    if (mode === "time") {
      const h24 = targetDate.getHours();
      const isPm = h24 >= 12;
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const m = targetDate.getMinutes();
      const mSlot = Math.round(m / validMinuteInterval) % totalMinSlots;
      const roundedM = mSlot * validMinuteInterval;

      setSelectedHour(h12);
      selectedHourRef.current = h12;

      setSelectedMinute(roundedM);
      selectedMinuteRef.current = roundedM;
      centerMinuteRawIdxRef.current = mSlot;
      lastMoveMinuteSlotRef.current = mSlot;
      setCenterMinuteRawIdx(mSlot);

      const ampm = isPm ? "PM" : "AM";
      setSelectedAmPm(ampm);
      selectedAmPmRef.current = ampm;

      angleHour.value = -(h12 - 1) * STEP_HOUR;
      angleMinute.value = -mSlot * STEP_MINUTE;
      angleAmPm.value = isPm ? -STEP_AMPM : 0;
    } else {
      const y = targetDate.getFullYear();
      const m = targetDate.getMonth();
      const d = targetDate.getDate();

      const rawY = y - baseYear;
      centerYearRawIdxRef.current = rawY;
      lastMoveYearSlotRef.current = rawY;
      setCenterYearRawIdx(rawY);
      angleYear.value = -rawY * STEP_YEAR;

      setIdx3(m);
      angle3.value = -m * STEP_3;

      const dIdx = d - 1;
      setIdx4(dIdx);
      angle4.value = -dIdx * STEP_4;
    }

    prevPropValueTimeRef.current = value ? value.getTime() : null;
  }, [
    value,
    mode,
    minDate,
    maxDate,
    validMinuteInterval,
    totalMinSlots,
    baseYear,
    STEP_MINUTE,
    STEP_YEAR,
    STEP_3,
    STEP_4,
    angleHour,
    angleMinute,
    angleAmPm,
    angleYear,
    angle3,
    angle4,
  ]);

  // Reset wheels to target value whenever mode switches while open
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      if (isOpen) {
        resetToValueOrCurrent();
      }
    }
  }, [mode, isOpen, resetToValueOrCurrent]);

  // Modal visibility and backdrop fade
  const [modalVisible, setModalVisible] = useState(isOpen);
  const backdropOpacity = useSharedValue(isOpen ? 1 : 0);

  // Transition refs to prevent rapid click freeze/hang race conditions
  const isClosingRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingTimeouts = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    isClosingRef.current = false;
  }, []);

  // Cleanup pending timeouts on unmount
  useEffect(() => {
    return () => {
      cancelPendingTimeouts();
    };
  }, [cancelPendingTimeouts]);

  // Entrance & Exit Animations
  const openWheel = useCallback(() => {
    cancelPendingTimeouts();
    resetToValueOrCurrent();
    setModalVisible(true);
    backdropOpacity.value = withTiming(1, { duration: 240 });

    scale4.value = withDelay(40, withSpring(1, SPRING_CONFIG));
    scale3.value = withDelay(120, withSpring(1, SPRING_CONFIG));
    scaleYear.value = withDelay(200, withSpring(1, SPRING_CONFIG));
    scale1.value = withDelay(280, withSpring(1, SPRING_CONFIG));

    opacity4.value = withDelay(40, withTiming(1, { duration: 220 }));
    opacity3.value = withDelay(120, withTiming(1, { duration: 220 }));
    opacityYear.value = withDelay(200, withTiming(1, { duration: 220 }));
    opacity1.value = withDelay(280, withTiming(1, { duration: 220 }));
  }, [
    cancelPendingTimeouts,
    resetToValueOrCurrent,
    backdropOpacity,
    scale1,
    scaleYear,
    scale3,
    scale4,
    opacity1,
    opacityYear,
    opacity3,
    opacity4,
  ]);

  const closeWheel = useCallback(
    (onClosed?: () => void) => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      cancelPendingTimeouts();
      isClosingRef.current = true;

      const timingConfig = { duration: 180, easing: Easing.in(Easing.quad) };

      backdropOpacity.value = withTiming(0, { duration: 180 });

      scale4.value = withDelay(0, withTiming(0, timingConfig));
      opacity4.value = withDelay(0, withTiming(0, timingConfig));

      scale3.value = withDelay(40, withTiming(0, timingConfig));
      opacity3.value = withDelay(40, withTiming(0, timingConfig));

      scaleYear.value = withDelay(80, withTiming(0, timingConfig));
      opacityYear.value = withDelay(80, withTiming(0, timingConfig));

      scale1.value = withDelay(120, withTiming(0, timingConfig));
      opacity1.value = withDelay(120, withTiming(0, timingConfig));

      closeTimeoutRef.current = setTimeout(() => {
        isClosingRef.current = false;
        closeTimeoutRef.current = null;
        setModalVisible(false);
        onClosed?.();
      }, 240);
    },
    [
      cancelPendingTimeouts,
      backdropOpacity,
      scale1,
      scaleYear,
      scale3,
      scale4,
      opacity1,
      opacityYear,
      opacity3,
      opacity4,
    ]
  );

  const handleBackdropPress = useCallback(() => {
    if (isClosingRef.current) return;
    closeWheel(onClose);
  }, [closeWheel, onClose]);

  // React to controlled isOpen changes from parent
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpenRef.current === isOpen) return;
    prevIsOpenRef.current = isOpen;
    if (isOpen) {
      openWheel();
    } else {
      if (modalVisible && !isClosingRef.current) {
        closeWheel();
      }
    }
  }, [isOpen, modalVisible, openWheel, closeWheel]);

  // Snapping logic
  const snapRing = useCallback(
    (
      sharedAngle: SharedValue<number>,
      step: number,
      total: number | null,
      onSnapped: (idx: number) => void
    ) => {
      const rawIndex = Math.round(-sharedAngle.value / step);
      const targetAngle = -rawIndex * step;

      sharedAngle.value = withSpring(targetAngle, {
        damping: 17,
        stiffness: 160,
        mass: 0.8,
      });

      if (total !== null) {
        const normalizedIndex = ((rawIndex % total) + total) % total;
        onSnapped(normalizedIndex);
      } else {
        // Continuous integer index (used for Year)
        onSnapped(rawIndex);
      }
    },
    []
  );

  const notifyChange = useCallback(
    (dIdx: number, mIdx: number, yr: number) => {
      const safeYr = Math.max(minYear, Math.min(yr, maxYear));
      const minM = getMinMonth(safeYr);
      const maxM = getMaxMonth(safeYr);
      const safeM = Math.max(minM, Math.min(mIdx, maxM));
      const minD = getMinDay(safeYr, safeM);
      const maxD = getMaxDay(safeYr, safeM);
      const safeD = Math.max(minD, Math.min(dIdx + 1, maxD));

      const date = new Date(safeYr, safeM, safeD);
      onChange?.(date);
    },
    [onChange, minYear, maxYear, getMinMonth, getMaxMonth, getMinDay, getMaxDay]
  );

  const notifyTimeChange = useCallback(
    (h12: number, min: number, ampm: "AM" | "PM") => {
      let h24 = h12 % 12;
      if (ampm === "PM") h24 += 12;
      const base = value ?? new Date();
      const nextDate = new Date(base);
      nextDate.setHours(h24, min, 0, 0);
      onChange?.(nextDate);
    },
    [value, onChange]
  );

  const handleConfirm = useCallback(() => {
    if (isClosingRef.current) return;

    scale1.value = withSequence(
      withTiming(1.3, { duration: 130 }),
      withSpring(1, { damping: 9, stiffness: 200 })
    );

    let confirmedDate: Date;
    if (mode === "time") {
      let h24 = selectedHourRef.current % 12;
      if (selectedAmPmRef.current === "PM") h24 += 12;
      const base = value ?? new Date();
      confirmedDate = new Date(base);
      confirmedDate.setHours(h24, selectedMinuteRef.current, 0, 0);
    } else {
      const curYr = baseYear + centerYearRawIdxRef.current;
      const safeYr = Math.max(minYear, Math.min(curYr, maxYear));
      const minM = getMinMonth(safeYr);
      const maxM = getMaxMonth(safeYr);
      const safeM = Math.max(minM, Math.min(idx3, maxM));
      const minD = getMinDay(safeYr, safeM);
      const maxD = getMaxDay(safeYr, safeM);
      const safeD = Math.max(minD, Math.min(idx4 + 1, maxD));
      confirmedDate = new Date(safeYr, safeM, safeD);
    }

    onConfirm?.(confirmedDate);

    cancelPendingTimeouts();
    confirmTimeoutRef.current = setTimeout(() => {
      confirmTimeoutRef.current = null;
      closeWheel(onClose);
    }, 220);
  }, [
    cancelPendingTimeouts,
    mode,
    value,
    scale1,
    baseYear,
    idx3,
    idx4,
    minYear,
    maxYear,
    getMinMonth,
    getMaxMonth,
    getMinDay,
    getMaxDay,
    onConfirm,
    onClose,
    closeWheel,
  ]);

  // Measure container layout for exact bottom-right corner coordinates
  const containerSizeRef = useRef({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      containerSizeRef.current = { width, height };
    }
  }, []);

  // Tracking refs for pan gesture
  const activeRingRef = useRef<number | null>(null);
  const lastAngleRef = useRef<number>(0);
  const hasMovedRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastMoveYearSlotRef = useRef<number>(centerYearRawIdx);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,

        onPanResponderGrant: (evt) => {
          const { pageX, pageY } = evt.nativeEvent;
          const cornerX = containerSizeRef.current.width;
          const cornerY = containerSizeRef.current.height;
          const dist = Math.sqrt((pageX - cornerX) ** 2 + (pageY - cornerY) ** 2);

          let ring: number | null = null;
          if (dist < R1) {
            ring = 1; // Checkmark
          } else if (dist < R2) {
            ring = 2; // Inner Ring (Year)
          } else if (dist < R3) {
            ring = 3; // Middle Ring (Month)
          } else if (dist < R4 * 1.15) {
            ring = 4; // Outer Ring (Day)
          } else {
            ring = 0; // Backdrop area outside the wheel
          }

          activeRingRef.current = ring;
          hasMovedRef.current = false;
          touchStartPosRef.current = { x: pageX, y: pageY };

          const touchAngle = (Math.atan2(pageY - cornerY, pageX - cornerX) * 180) / Math.PI;
          lastAngleRef.current = touchAngle;
        },

        onPanResponderMove: (evt) => {
          const ring = activeRingRef.current;
          if (!ring || ring === 0 || ring === 1) return;

          const { pageX, pageY } = evt.nativeEvent;
          const cornerX = containerSizeRef.current.width;
          const cornerY = containerSizeRef.current.height;
          const dx = pageX - touchStartPosRef.current.x;
          const dy = pageY - touchStartPosRef.current.y;
          const distMoved = Math.hypot(dx, dy);

          const touchAngle = (Math.atan2(pageY - cornerY, pageX - cornerX) * 180) / Math.PI;

          // Deadzone threshold (10px): ignore micro-jitters during tap so wheel stays completely still
          if (!hasMovedRef.current) {
            if (distMoved > 10) {
              hasMovedRef.current = true;
              lastAngleRef.current = touchAngle;
            } else {
              return;
            }
          }

          let delta = touchAngle - lastAngleRef.current;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;

          lastAngleRef.current = touchAngle;

          if (mode === "time") {
            if (ring === 4) {
              // Outer Ring: Hours
              angleHour.value = angleHour.value + delta;
            } else if (ring === 3) {
              // Middle Ring: Minutes (dynamic 12-slot circular buffer like Year)
              angleMinute.value = angleMinute.value + delta;

              const curSlot = Math.round(-angleMinute.value / STEP_MINUTE);
              if (curSlot !== lastMoveMinuteSlotRef.current) {
                lastMoveMinuteSlotRef.current = curSlot;
                centerMinuteRawIdxRef.current = curSlot;
                setCenterMinuteRawIdx(curSlot);
              }
            } else if (ring === 2) {
              // Inner Ring: AM / PM (NON-LOOPING: clamped strictly between AM and PM)
              const nextAngle = angleAmPm.value + delta;
              const minAngle = -STEP_AMPM - 10;
              const maxAngle = 10;
              if (nextAngle < minAngle) {
                angleAmPm.value = minAngle;
              } else if (nextAngle > maxAngle) {
                angleAmPm.value = maxAngle;
              } else {
                angleAmPm.value = nextAngle;
              }
            }
          } else {
            if (ring === 4) {
              angle4.value = angle4.value + delta;
            } else if (ring === 3) {
              angle3.value = angle3.value + delta;
            } else if (ring === 2) {
              angleYear.value = angleYear.value + delta;

              const curSlot = Math.round(-angleYear.value / STEP_YEAR);
              if (curSlot !== lastMoveYearSlotRef.current) {
                lastMoveYearSlotRef.current = curSlot;
                centerYearRawIdxRef.current = curSlot;
                setCenterYearRawIdx(curSlot);
              }
            }
          }
        },

        onPanResponderRelease: () => {
          const ring = activeRingRef.current;
          activeRingRef.current = null;

          if (ring === 0) {
            if (!hasMovedRef.current) {
              handleBackdropPress();
            }
            return;
          }

          if (ring === 1) {
            handleConfirm();
            return;
          }

          if (mode === "time") {
            if (ring === 4) {
              // Outer ring: HOURS (1..12)
              let targetSlot: number;
              if (!hasMovedRef.current) {
                const startX = touchStartPosRef.current.x;
                const startY = touchStartPosRef.current.y;
                const cornerX = containerSizeRef.current.width;
                const cornerY = containerSizeRef.current.height;
                let tapAngle = (Math.atan2(startY - cornerY, startX - cornerX) * 180) / Math.PI;
                if (tapAngle < 0) tapAngle += 360;
                let diff = tapAngle - 225;
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;
                const slotsAway = Math.round(diff / STEP_HOUR);
                if (slotsAway === 0) return;
                const curSlot = Math.round(-angleHour.value / STEP_HOUR);
                targetSlot = curSlot + slotsAway;
              } else {
                targetSlot = Math.round(-angleHour.value / STEP_HOUR);
              }
              const targetIdx = ((targetSlot % 12) + 12) % 12;
              const targetHour = targetIdx + 1;
              angleHour.value = withSpring(-targetSlot * STEP_HOUR, SPRING_CONFIG);
              setSelectedHour(targetHour);
              notifyTimeChange(targetHour, selectedMinuteRef.current, selectedAmPmRef.current);
            } else if (ring === 3) {
              // Middle ring: MINUTES
              let targetSlot: number;
              if (!hasMovedRef.current) {
                const startX = touchStartPosRef.current.x;
                const startY = touchStartPosRef.current.y;
                const cornerX = containerSizeRef.current.width;
                const cornerY = containerSizeRef.current.height;
                let tapAngle = (Math.atan2(startY - cornerY, startX - cornerX) * 180) / Math.PI;
                if (tapAngle < 0) tapAngle += 360;
                let diff = tapAngle - 225;
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;
                const slotsAway = Math.round(diff / STEP_MINUTE);
                if (slotsAway === 0) return;
                const curSlot = Math.round(-angleMinute.value / STEP_MINUTE);
                targetSlot = curSlot + slotsAway;
              } else {
                targetSlot = Math.round(-angleMinute.value / STEP_MINUTE);
              }
              angleMinute.value = withSpring(-targetSlot * STEP_MINUTE, SPRING_CONFIG);
              centerMinuteRawIdxRef.current = targetSlot;
              lastMoveMinuteSlotRef.current = targetSlot;
              setCenterMinuteRawIdx(targetSlot);

              const targetIdx = ((targetSlot % totalMinSlots) + totalMinSlots) % totalMinSlots;
              const targetMinute = targetIdx * validMinuteInterval;
              setSelectedMinute(targetMinute);
              selectedMinuteRef.current = targetMinute;
              notifyTimeChange(selectedHourRef.current, targetMinute, selectedAmPmRef.current);
            } else if (ring === 2) {
              // Inner ring: AM / PM (NON-LOOPING: strictly slot 0="AM" or slot 1="PM")
              let targetSlot: number;
              if (!hasMovedRef.current) {
                const startX = touchStartPosRef.current.x;
                const startY = touchStartPosRef.current.y;
                const cornerX = containerSizeRef.current.width;
                const cornerY = containerSizeRef.current.height;
                let tapAngle = (Math.atan2(startY - cornerY, startX - cornerX) * 180) / Math.PI;
                if (tapAngle < 0) tapAngle += 360;
                let diff = tapAngle - 225;
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;
                if (Math.abs(diff) < 10) return;
                targetSlot = diff > 0 ? 1 : 0;
              } else {
                targetSlot = Math.round(-angleAmPm.value / STEP_AMPM);
              }
              // Strictly clamp to 0 (AM) or 1 (PM)
              targetSlot = Math.max(0, Math.min(1, targetSlot));
              const targetAmPm = targetSlot === 1 ? "PM" : "AM";
              angleAmPm.value = withSpring(-targetSlot * STEP_AMPM, SPRING_CONFIG);
              setSelectedAmPm(targetAmPm);
              selectedAmPmRef.current = targetAmPm;
              notifyTimeChange(selectedHourRef.current, selectedMinuteRef.current, targetAmPm);
            }
            return;
          }

          // Tap without drag -> smoothly animate tapped side item directly to selection ray
          if (!hasMovedRef.current && ring) {
            const startX = touchStartPosRef.current.x;
            const startY = touchStartPosRef.current.y;
            const cornerX = containerSizeRef.current.width;
            const cornerY = containerSizeRef.current.height;
            let tapAngle = (Math.atan2(startY - cornerY, startX - cornerX) * 180) / Math.PI;
            if (tapAngle < 0) tapAngle += 360;

            let diff = tapAngle - 225;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            if (ring === 4) {
              // Day Ring
              const slotsAway = Math.round(diff / STEP_4);
              if (slotsAway === 0) return;

              const currentRawSlot = Math.round(-angle4.value / STEP_4);
              const targetRawSlot = currentRawSlot + slotsAway;
              const targetSlot31 = ((targetRawSlot % 31) + 31) % 31;

              const curMinD = getMinDay(selectedYear, idx3);
              const curMaxD = getMaxDay(selectedYear, idx3);
              const minDayIdx = curMinD - 1;
              const maxDayIdx = curMaxD - 1;

              let targetIdx: number;
              let targetAngle: number;

              if (targetSlot31 < daysCount) {
                targetIdx = Math.max(minDayIdx, Math.min(targetSlot31, maxDayIdx));
                const diffFromSlot = targetIdx - targetSlot31;
                targetAngle = -(targetRawSlot + diffFromSlot) * STEP_4;
              } else {
                // Tapped on the gap between last day and Day 1 in a <31 day month
                if (slotsAway > 0) {
                  // Forward from last day -> go to Day 1 / minDay
                  targetIdx = minDayIdx;
                  const diffToDay1 = (31 - targetSlot31) % 31;
                  const stepForward = targetRawSlot + (diffToDay1 || 1) + minDayIdx;
                  targetAngle = -stepForward * STEP_4;
                } else {
                  // Backward from Day 1 -> go to last valid day
                  targetIdx = maxDayIdx;
                  const diffToLastDay = targetSlot31 - maxDayIdx;
                  const stepBackward = targetRawSlot - (diffToLastDay > 0 ? diffToLastDay : 1);
                  targetAngle = -stepBackward * STEP_4;
                }
              }

              angle4.value = withSpring(targetAngle, SPRING_CONFIG);
              setIdx4(targetIdx);
              notifyChange(targetIdx, idx3, selectedYear);
            } else if (ring === 3) {
              // Month Ring
              const slotsAway = Math.round(diff / STEP_3);
              if (slotsAway === 0) return;
              const currentRawIndex = Math.round(-angle3.value / STEP_3);
              const targetRawIndex = currentRawIndex + slotsAway;
              const targetMonth = ((targetRawIndex % 12) + 12) % 12;

              const curMinM = getMinMonth(selectedYear);
              const curMaxM = getMaxMonth(selectedYear);
              const clampedMonth = Math.max(curMinM, Math.min(targetMonth, curMaxM));
              const diffMonth = clampedMonth - targetMonth;
              const targetAngle = -(targetRawIndex + diffMonth) * STEP_3;

              angle3.value = withSpring(targetAngle, SPRING_CONFIG);
              setIdx3(clampedMonth);

              const newMinD = getMinDay(selectedYear, clampedMonth);
              const newMaxD = getMaxDay(selectedYear, clampedMonth);
              const currentD = idx4 + 1;
              const clampedD = Math.max(newMinD, Math.min(currentD, newMaxD));
              const clampedDIdx = clampedD - 1;
              if (clampedDIdx !== idx4) {
                setIdx4(clampedDIdx);
                angle4.value = withSpring(-clampedDIdx * STEP_4, SPRING_CONFIG);
              }
              notifyChange(clampedDIdx, clampedMonth, selectedYear);
            } else if (ring === 2) {
              // Year Ring
              const slotsAway = Math.round(diff / STEP_YEAR);
              if (slotsAway === 0) return;
              const currentYearRawIdx = Math.round(-angleYear.value / STEP_YEAR);
              const targetYearRawIdx = currentYearRawIdx + slotsAway;
              const targetYr = baseYear + targetYearRawIdx;
              const clampedYr = Math.max(minYear, Math.min(targetYr, maxYear));
              const clampedRawIdx = clampedYr - baseYear;

              const targetAngle = -clampedRawIdx * STEP_YEAR;
              angleYear.value = withSpring(targetAngle, SPRING_CONFIG);
              centerYearRawIdxRef.current = clampedRawIdx;
              lastMoveYearSlotRef.current = clampedRawIdx;
              setCenterYearRawIdx(clampedRawIdx);

              const newMinM = getMinMonth(clampedYr);
              const newMaxM = getMaxMonth(clampedYr);
              const clampedM = Math.max(newMinM, Math.min(idx3, newMaxM));
              if (clampedM !== idx3) {
                setIdx3(clampedM);
                angle3.value = withSpring(-clampedM * STEP_3, SPRING_CONFIG);
              }

              const newMinD = getMinDay(clampedYr, clampedM);
              const newMaxD = getMaxDay(clampedYr, clampedM);
              const currentD = idx4 + 1;
              const clampedD = Math.max(newMinD, Math.min(currentD, newMaxD));
              const clampedDIdx = clampedD - 1;
              if (clampedDIdx !== idx4) {
                setIdx4(clampedDIdx);
                angle4.value = withSpring(-clampedDIdx * STEP_4, SPRING_CONFIG);
              }
              notifyChange(clampedDIdx, clampedM, clampedYr);
            }
            return;
          }

          // Drag release -> snap closest item
          if (ring === 4) {
            snapRing(angle4, STEP_4, 31, (newIdx) => {
              const curMinD = getMinDay(selectedYear, idx3);
              const curMaxD = getMaxDay(selectedYear, idx3);
              const minDayIdx = curMinD - 1;
              const maxDayIdx = curMaxD - 1;

              let validIdx: number;
              if (newIdx < daysCount) {
                validIdx = Math.max(minDayIdx, Math.min(newIdx, maxDayIdx));
                if (validIdx !== newIdx) {
                  const diffSlots = validIdx - newIdx;
                  const currentRaw = Math.round(-angle4.value / STEP_4);
                  angle4.value = withSpring(-(currentRaw + diffSlots) * STEP_4, SPRING_CONFIG);
                }
              } else {
                // Snapped onto an empty slot in short month
                const currentRaw = Math.round(-angle4.value / STEP_4);
                const toLastDayDist = newIdx - maxDayIdx;
                const toDay1Dist = 31 - newIdx + minDayIdx;
                if (toDay1Dist <= toLastDayDist) {
                  validIdx = minDayIdx;
                  const targetRaw = currentRaw + toDay1Dist;
                  angle4.value = withSpring(-targetRaw * STEP_4, SPRING_CONFIG);
                } else {
                  validIdx = maxDayIdx;
                  const targetRaw = currentRaw - toLastDayDist;
                  angle4.value = withSpring(-targetRaw * STEP_4, SPRING_CONFIG);
                }
              }
              setIdx4(validIdx);
              notifyChange(validIdx, idx3, selectedYear);
            });
          } else if (ring === 3) {
            snapRing(angle3, STEP_3, LIST_3.length, (newIdx) => {
              const curMinM = getMinMonth(selectedYear);
              const curMaxM = getMaxMonth(selectedYear);
              const clampedMonth = Math.max(curMinM, Math.min(newIdx, curMaxM));

              if (clampedMonth !== newIdx) {
                const diffSlots = clampedMonth - newIdx;
                const currentRaw = Math.round(-angle3.value / STEP_3);
                angle3.value = withSpring(-(currentRaw + diffSlots) * STEP_3, SPRING_CONFIG);
              }
              setIdx3(clampedMonth);

              const newMinD = getMinDay(selectedYear, clampedMonth);
              const newMaxD = getMaxDay(selectedYear, clampedMonth);
              const currentD = idx4 + 1;
              const clampedD = Math.max(newMinD, Math.min(currentD, newMaxD));
              const clampedDIdx = clampedD - 1;
              if (clampedDIdx !== idx4) {
                setIdx4(clampedDIdx);
                angle4.value = withSpring(-clampedDIdx * STEP_4, SPRING_CONFIG);
              }
              notifyChange(clampedDIdx, clampedMonth, selectedYear);
            });
          } else if (ring === 2) {
            snapRing(angleYear, STEP_YEAR, null, (newRawIdx) => {
              const targetYr = baseYear + newRawIdx;
              const clampedYr = Math.max(minYear, Math.min(targetYr, maxYear));
              const clampedRawIdx = clampedYr - baseYear;

              if (clampedRawIdx !== newRawIdx) {
                angleYear.value = withSpring(-clampedRawIdx * STEP_YEAR, SPRING_CONFIG);
              }
              centerYearRawIdxRef.current = clampedRawIdx;
              setCenterYearRawIdx(clampedRawIdx);

              const newMinM = getMinMonth(clampedYr);
              const newMaxM = getMaxMonth(clampedYr);
              const clampedM = Math.max(newMinM, Math.min(idx3, newMaxM));
              if (clampedM !== idx3) {
                setIdx3(clampedM);
                angle3.value = withSpring(-clampedM * STEP_3, SPRING_CONFIG);
              }

              const newMinD = getMinDay(clampedYr, clampedM);
              const newMaxD = getMaxDay(clampedYr, clampedM);
              const currentD = idx4 + 1;
              const clampedD = Math.max(newMinD, Math.min(currentD, newMaxD));
              const clampedDIdx = clampedD - 1;
              if (clampedDIdx !== idx4) {
                setIdx4(clampedDIdx);
                angle4.value = withSpring(-clampedDIdx * STEP_4, SPRING_CONFIG);
              }
              notifyChange(clampedDIdx, clampedM, clampedYr);
            });
          }
        },
      }),
    [
      mode,
      angleYear,
      angle3,
      angle4,
      angleMinute,
      angleHour,
      angleAmPm,
      handleConfirm,
      handleBackdropPress,
      snapRing,
      STEP_4,
      STEP_3,
      STEP_YEAR,
      daysCount,
      idx4,
      idx3,
      selectedYear,
      baseYear,
      minYear,
      maxYear,
      getMinMonth,
      getMaxMonth,
      getMinDay,
      getMaxDay,
      notifyChange,
      notifyTimeChange,
      STEP_MINUTE,
      totalMinSlots,
      validMinuteInterval,
    ]
  );

  // Animated styles for rotating circle layers
  const animatedCircle4 = useAnimatedStyle(() => {
    // Outer ring: Day in date mode, Hour in time mode
    const rot = mode === "time" ? angleHour.value : angle4.value;
    return {
      transform: [{ scale: scale4.value }, { rotate: `${rot}deg` }],
      opacity: opacity4.value,
    };
  });

  const animatedCircle3 = useAnimatedStyle(() => {
    // Middle ring: Month in date mode, Minute in time mode
    const rot = mode === "time" ? angleMinute.value : angle3.value;
    return {
      transform: [{ scale: scale3.value }, { rotate: `${rot}deg` }],
      opacity: opacity3.value,
    };
  });

  const animatedCircle2 = useAnimatedStyle(() => {
    // Inner ring: Year in date mode, AM/PM in time mode
    const rot = mode === "time" ? angleAmPm.value : angleYear.value;
    return {
      transform: [{ scale: scaleYear.value }, { rotate: `${rot}deg` }],
      opacity: opacityYear.value,
    };
  });

  const animatedCircle1 = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    opacity: opacity1.value,
  }));

  // Base circular styles
  const circle4BaseStyle = useMemo(
    () => [
      styles.circleBase,
      {
        height: R4 * 2,
        width: R4 * 2,
        backgroundColor: "#6377fc",
        borderRadius: R4,
        bottom: -R4,
        right: -R4,
      },
    ],
    []
  );

  const circle3BaseStyle = useMemo(
    () => [
      styles.circleBase,
      {
        height: R3 * 2,
        width: R3 * 2,
        backgroundColor: "#4d64fb",
        borderRadius: R3,
        bottom: -R3,
        right: -R3,
      },
    ],
    []
  );

  const circle2BaseStyle = useMemo(
    () => [
      styles.circleBase,
      {
        height: R2 * 2,
        width: R2 * 2,
        backgroundColor: "#3650fb",
        borderRadius: R2,
        bottom: -R2,
        right: -R2,
      },
    ],
    []
  );

  const circle1BaseStyle = useMemo(
    () => [
      styles.circleBase,
      {
        height: R1 * 2,
        width: R1 * 2,
        backgroundColor: "#1d37e1",
        borderRadius: R1,
        bottom: -R1,
        right: -R1,
      },
    ],
    []
  );

  const animatedBackdrop = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleBackdropPress}
    >
      <View style={[styles.modalRoot, style]}>
        {/* Backdrop overlay */}
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { backgroundColor: backdropColor }, animatedBackdrop]}
        />

        {/* Wheel Interaction Container anchored to bottom-right corner */}
        <View
          style={styles.wheelContainer}
          onLayout={onContainerLayout}
          {...panResponder.panHandlers}
        >
          {/* Outermost Ring (Circle 4: #6377fc) - Dynamic DAYS or HOURS */}
          <Animated.View style={[circle4BaseStyle, animatedCircle4]} pointerEvents="none">
            {mode === "time"
              ? HOURS_LIST.map((hNum, idx) => (
                  <CurvedWheelItem
                    key={`hour-${idx}`}
                    text={String(hNum)}
                    baseAngle={225 + idx * STEP_HOUR}
                    stepAngle={STEP_HOUR}
                    radius={RADIUS_RING4}
                    centerR={R4}
                    rotation={angleHour}
                    selectionAngle={225}
                    fontSize={22}
                    itemWidth={54}
                    itemHeight={38}
                  />
                ))
              : RING4_ITEMS.map((item, idx) => (
                  <CurvedWheelItem
                    key={`day-slot-${idx}`}
                    text={item.text}
                    subText={item.subText}
                    disabled={item.disabled}
                    baseAngle={item.baseAngle}
                    stepAngle={STEP_4}
                    radius={RADIUS_RING4}
                    centerR={R4}
                    rotation={angle4}
                    selectionAngle={225}
                    fontSize={showWeekday ? 19 : 21}
                    subFontSize={showWeekday ? 11 : undefined}
                    itemWidth={62}
                    itemHeight={showWeekday ? 46 : 38}
                  />
                ))}
          </Animated.View>

          {/* Middle Ring (Circle 3: #4d64fb) - Dynamic MONTHS or MINUTES */}
          <Animated.View style={[circle3BaseStyle, animatedCircle3]} pointerEvents="none">
            {mode === "time"
              ? ringMinuteItems.map((item, idx) => (
                  <CurvedWheelItem
                    key={`minute-slot-${idx}`}
                    text={item.text}
                    baseAngle={item.baseAngle}
                    stepAngle={STEP_MINUTE}
                    radius={RADIUS_RING3}
                    centerR={R3}
                    rotation={angleMinute}
                    selectionAngle={225}
                    fontSize={18}
                    itemWidth={54}
                    itemHeight={36}
                  />
                ))
              : RING3_ITEMS.map((item) => (
                  <CurvedWheelItem
                    key={`month-${item.text}`}
                    text={item.text}
                    disabled={item.disabled}
                    baseAngle={item.baseAngle}
                    stepAngle={STEP_3}
                    radius={RADIUS_RING3}
                    centerR={R3}
                    rotation={angle3}
                    selectionAngle={225}
                    fontSize={18}
                    itemWidth={64}
                    itemHeight={36}
                  />
                ))}
          </Animated.View>

          {/* Inner Ring (Circle 2: #3650fb) - Dynamic CONTINUOUS YEARS or AM/PM */}
          <Animated.View style={[circle2BaseStyle, animatedCircle2]} pointerEvents="none">
            {mode === "time"
              ? AMPM_LIST.map((ampm, idx) => {
                  if (!ampm) return null;
                  const slot = ampm === "PM" ? 1 : 0;
                  return (
                    <CurvedWheelItem
                      key={`ampm-${idx}`}
                      text={ampm}
                      baseAngle={225 + slot * STEP_AMPM}
                      stepAngle={STEP_AMPM}
                      radius={RADIUS_RING2}
                      centerR={R2}
                      rotation={angleAmPm}
                      selectionAngle={225}
                      fontSize={20}
                      itemWidth={48}
                      itemHeight={36}
                    />
                  );
                })
              : ringYearItems.map((item, idx) => (
                  <CurvedWheelItem
                    key={`year-slot-${idx}`}
                    text={item.text}
                    disabled={item.disabled}
                    baseAngle={item.baseAngle}
                    stepAngle={STEP_YEAR}
                    radius={RADIUS_RING2}
                    centerR={R2}
                    rotation={angleYear}
                    selectionAngle={225}
                    fontSize={16}
                    itemWidth={76}
                    itemHeight={36}
                  />
                ))}
          </Animated.View>

          {/* Center Checkmark Circle (Circle 1: #1d37e1) */}
          <Animated.View style={[circle1BaseStyle, animatedCircle1]} pointerEvents="none">
            <View style={styles.checkmarkWrapper}>
              <Text style={styles.checkmark}>✓</Text>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
});

export const RadialTimePicker = memo(function RadialTimePicker(
  props: Omit<RadialDatePickerProps, "mode">
) {
  return <RadialDatePicker {...props} mode="time" />;
});

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    position: "relative",
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
  },
  wheelContainer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  circleBase: {
    position: "absolute",
    overflow: "hidden",
  },
  checkmarkWrapper: {
    height: R1,
    width: R1,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "900",
  },
});
