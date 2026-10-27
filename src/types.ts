import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { WithSpringConfig } from "react-native-reanimated";

export interface WheelItemObject {
  label: string;
  value?: any;
  [key: string]: any;
}

export type WheelItem = string | number | WheelItemObject;

export interface WheelRingConfig<T extends WheelItem = WheelItem> {
  id?: string;
  items: T[];
  initialIndex?: number;
  selectedIndex?: number;
  onChange?: (index: number, item: T) => void;
  color?: string;
  textColor?: string;
  fontSize?: number;
  itemWidth?: number;
  itemHeight?: number;
  formatLabel?: (item: T) => string;
}

export type CornerPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export interface SelectedWheelItem<T extends WheelItem = WheelItem> {
  ringIndex: number;
  itemIndex: number;
  item: T;
}

export interface RadialWheelPickerProps {
  /**
   * Array of ring configurations ordered from innermost data ring (index 0)
   * to outermost data ring (index N - 1).
   */
  rings: WheelRingConfig[];

  /**
   * Whether the radial wheel is currently expanded/visible.
   */
  isOpen: boolean;

  /**
   * Screen corner from which the concentric circles radiate.
   * @default 'bottom-right'
   */
  corner?: CornerPosition;

  /**
   * Callback fired when the picker requests to close (e.g. after confirmation).
   */
  onClose?: () => void;

  /**
   * Callback fired when the center confirm button is tapped.
   * Receives an array of selected items corresponding to each ring.
   */
  onConfirm?: (selection: SelectedWheelItem[]) => void;

  /**
   * Base sizing dimension for calculating radii.
   * Defaults to Dimensions.get("window").width / 4.1.
   */
  mainSize?: number;

  /**
   * Radius of the center circle button.
   * Defaults to mainSize * 1.1.
   */
  centerRadius?: number;

  /**
   * Background color of the center circle button.
   * Defaults to '#1d37e1'.
   */
  centerColor?: string;

  /**
   * Custom icon/element inside the center button.
   * Defaults to a white checkmark "✓".
   */
  centerIcon?: ReactNode;

  /**
   * Whether the center confirmation circle is rendered.
   * @default true
   */
  showCenterButton?: boolean;

  /**
   * Active selection angle in degrees.
   * Defaults to 225° for 'bottom-right' (points towards top-left screen diagonal).
   */
  selectionAngle?: number;

  /**
   * Custom spring physics configuration for rotations and entrance.
   */
  springConfig?: WithSpringConfig;

  /**
   * Container style for the touch interaction area.
   */
  style?: StyleProp<ViewStyle>;

  /**
   * Optional test ID for automation.
   */
  testID?: string;
}

export interface RadialWheelPickerRef {
  snapTo: (ringIndex: number, itemIndex: number) => void;
  getSelectedIndexes: () => number[];
}
