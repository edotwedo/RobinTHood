import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, F } from '../theme';

// Controlled audio volume, in the same 0–1 range used by Expo Audio.
export function MusicVolumeControl({ value, onChange, label }) {
  const width = useRef(0);
  const volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.3;
  const percent = Math.round(volume * 100);
  const changeAt = (event) => {
    if (width.current <= 24) return;
    const next = (event.nativeEvent.locationX - 12) / (width.current - 24);
    onChange(Math.round(Math.max(0, Math.min(1, next)) * 100) / 100);
  };
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{percent}%</Text>
      </View>
      <View
        style={styles.touchArea}
        onLayout={(event) => { width.current = event.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={changeAt}
        onResponderMove={changeAt}
        onResponderTerminationRequest={() => false}
        accessible
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === 'increment' || action === 'decrement') {
            onChange(Math.max(0, Math.min(1, Math.round((volume + (action === 'increment' ? 0.05 : -0.05)) * 100) / 100)));
          }
        }}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${percent}%` }]} />
          <View style={[styles.thumb, { left: `${percent}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { flex: 1, color: C.text, fontSize: 14, fontFamily: F.medium },
  value: { color: C.green, fontSize: 14, fontFamily: F.semibold, marginLeft: 12 },
  touchArea: { height: 48, justifyContent: 'center', paddingHorizontal: 12 },
  track: { height: 6, backgroundColor: C.border, borderRadius: 3 },
  fill: { height: 6, backgroundColor: C.green, borderRadius: 3 },
  thumb: { position: 'absolute', top: -9, marginLeft: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: C.green },
});
