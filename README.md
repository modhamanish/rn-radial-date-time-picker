# @modhamanish/rn-radial-date-time-picker

[![npm version](https://img.shields.io/npm/v/@modhamanish/rn-radial-date-time-picker.svg)](https://www.npmjs.com/package/@modhamanish/rn-radial-date-time-picker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![React Native](https://img.shields.io/badge/React%20Native-%3E%3D0.60.0-blue.svg)](https://reactnative.dev/)

A modern, fluid, high-performance **Radial Wheel Date & Time Picker** component for React Native powered by `react-native-reanimated`.

Features a corner-anchored concentric wheel design with smooth spring animations, dynamic circular slot buffering, full date & time modes, minute gap control, and customizable modal overlay.

---

## 📱 Features

- 🎡 **Concentric Radial Wheel Layout**: Anchored elegantly to the bottom-right corner.
- 📅 **Date Picker Mode**: Continuous years, months, and days with dynamic month lengths & leap year support.
- ⏰ **Time Picker Mode**: Hours (1..12), Minutes (00..59 with custom intervals), and non-looping AM/PM toggle.
- ⚡ **High Performance**: 60 FPS gestures and physics-based spring animations using Reanimated shared values.
- 🎯 **Non-Blocking Architecture**: Robust re-entrancy protection prevents rapid-click UI locks and presentation deadlocks.
- 🔄 **Auto-Reset on Dismiss**: Seamlessly restores to the confirmed value if closed without tapping confirm.
- ⏱️ **Flexible Minute Intervals**: Supports fine-grained selection (`minuteGap={1}`) or grouped intervals (`minuteGap={5}`, `minuteGap={10}`).
- 🎨 **Customizable Backdrop**: Easily configure backdrop overlay color or keep it transparent.

---

## 📦 Installation

```bash
# Using npm
npm install @modhamanish/rn-radial-date-time-picker react-native-reanimated

# Using yarn
yarn add @modhamanish/rn-radial-date-time-picker react-native-reanimated

# Using bun
bun add @modhamanish/rn-radial-date-time-picker react-native-reanimated
```

> **Note:** Ensure `react-native-reanimated` is configured in your project (add `react-native-reanimated/plugin` to `babel.config.js` if required by your React Native version).

---

## 🚀 Quick Start

### 1. Date Picker Example

<table>
  <tr>
    <td width="62%" valign="top">

```tsx
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import RadialDateTimePicker from "@modhamanish/rn-radial-date-time-picker";

export default function App() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setIsOpen(true)} style={styles.button}>
        <Text style={styles.buttonText}>
          📅 {selectedDate.toLocaleDateString()}
        </Text>
      </Pressable>

      <RadialDateTimePicker
        mode="date"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        value={selectedDate}
        showWeekday
        backdropColor="#00000040"
        onConfirm={(date) => {
          setSelectedDate(date);
          console.log("Confirmed Date:", date);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  button: { padding: 14, backgroundColor: "#3b82f6", borderRadius: 10 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
```

  </td>
  <td width="38%" align="center" valign="middle">
    <img src="./demo/date-demo.gif" width="260" alt="Date Picker Demo" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
    <br />
    <sub><b>Date Picker Preview</b></sub>
  </td>
  </tr>
</table>

---

### 2. Time Picker Example

<table>
  <tr>
    <td width="62%" valign="top">

```tsx
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import RadialDateTimePicker from "@modhamanish/rn-radial-date-time-picker";

export default function App() {
  const [selectedTime, setSelectedTime] = useState<Date>(new Date());
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setIsOpen(true)} style={styles.button}>
        <Text style={styles.buttonText}>
          ⏰ {selectedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </Pressable>

      <RadialDateTimePicker
        mode="time"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        value={selectedTime}
        minuteGap={5} // Steps: 00, 05, 10, 15... 55
        backdropColor="#00000040"
        onConfirm={(time) => {
          setSelectedTime(time);
          console.log("Confirmed Time:", time);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  button: { padding: 14, backgroundColor: "#10b981", borderRadius: 10 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
```

  </td>
  <td width="38%" align="center" valign="middle">
    <img src="./demo/time-demo.gif" width="260" alt="Time Picker Demo" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
    <br />
    <sub><b>Time Picker Preview</b></sub>
  </td>
  </tr>
</table>

---

## 🛠️ Props Reference

### `RadialDateTimePickerProps`

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `mode` | `'date' \| 'time'` | `'date'` | Specifies whether to display the Date or Time radial picker. |
| `value` | `Date \| null` | `new Date()` | Currently selected date or time. Automatically resets to this value on open. |
| `isOpen` | `boolean` | `false` | Controls the visibility/expansion of the radial wheel picker. |
| `onClose` | `() => void` | `undefined` | Callback invoked when the picker requests to dismiss (backdrop tap or cancel). |
| `onConfirm` | `(date: Date) => void` | `undefined` | Callback invoked with the newly confirmed `Date` when the center checkmark is tapped. |
| `onChange` | `(date: Date) => void` | `undefined` | Live callback invoked whenever wheel rings are rotated during active interaction. |
| `minuteGap` | `number` | `1` | Interval between selectable minutes (e.g. `1` for all minutes, `5` or `10` for steps). |
| `minDate` | `Date` | `undefined` | Earliest selectable date boundary (applies in date mode). |
| `maxDate` | `Date` | `undefined` | Latest selectable date boundary (applies in date mode). |
| `showWeekday`| `boolean` | `false` | When true, renders weekday abbreviations (`Mon`, `Tue`) beneath day numbers. |
| `backdropColor` | `string` | `'transparent'` | Background overlay color of the full-screen modal backdrop. |
| `style` | `StyleProp<ViewStyle>` | `undefined` | Optional container view style overrides. |

---

## 🚢 Publishing & Releasing (Maintainers)

This library includes an automated interactive release utility:

```bash
npm run release
```

The script will:
1. Verify the project builds via TypeScript (`npm run build`).
2. Sync the version with npm registry.
3. Prompt for release type (`patch`, `minor`, `major`).
4. Commit, tag, push to git, and publish directly to npm.

---

## 📄 License

MIT © [Modha Manish](https://github.com/modhamanish)
