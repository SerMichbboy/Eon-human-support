import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
  pattern: 'dots' | 'lines' | 'cross' | 'none';
  color?: string;
}

export function PatternOverlay({ pattern, color = '#ffffff' }: Props) {
  const elements = useMemo(() => {
    if (pattern === 'none') return [];

    if (pattern === 'dots') {
      const items = [];
      const gap = 30;
      for (let row = 0; row < 28; row++) {
        for (let col = 0; col < 16; col++) {
          const offset = col % 2 === 0 ? 0 : gap / 2;
          items.push({ key: `${row}-${col}`, top: row * gap + offset, left: col * gap });
        }
      }
      return items.map(({ key, top, left }) => (
        <View key={key} style={[styles.dot, { top, left, backgroundColor: color }]} />
      ));
    }

    if (pattern === 'lines') {
      return Array.from({ length: 20 }, (_, i) => (
        <View
          key={i}
          style={[styles.line, { top: i * 42, backgroundColor: color }]}
        />
      ));
    }

    if (pattern === 'cross') {
      const items = [];
      const gap = 36;
      for (let row = 0; row < 22; row++) {
        for (let col = 0; col < 13; col++) {
          items.push({ key: `${row}-${col}`, top: row * gap, left: col * gap });
        }
      }
      return items.map(({ key, top, left }) => (
        <View key={key} style={{ position: 'absolute', top, left }}>
          <View style={[styles.crossH, { backgroundColor: color }]} />
          <View style={[styles.crossV, { backgroundColor: color }]} />
        </View>
      ));
    }

    return [];
  }, [pattern, color]);

  if (pattern === 'none' || elements.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {elements}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    opacity: 0.07,
  },
  dot: {
    position: 'absolute',
    width: 2.5,
    height: 2.5,
    borderRadius: 2,
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    transform: [{ rotate: '-20deg' }, { scaleX: 1.5 }],
  },
  crossH: {
    position: 'absolute',
    width: 7,
    height: 1,
    top: 3,
    left: -1,
  },
  crossV: {
    position: 'absolute',
    width: 1,
    height: 7,
    top: -1,
    left: 3,
  },
});
