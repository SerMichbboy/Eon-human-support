import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { alpha, fontFamily, useColors } from '@/shared/theme';

interface Props {
  onDone: () => void;
}

export function SplashScreen({ onDone }: Props) {
  const colors = useColors();
  const symbolOpacity = useRef(new Animated.Value(0)).current;
  const symbolScale = useRef(new Animated.Value(0.7)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // Symbol appears
      Animated.parallel([
        Animated.timing(symbolOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(symbolScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]),
      // Text appears
      Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      // Tagline appears
      Animated.timing(taglineOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      // Hold
      Animated.delay(1200),
      // Fade out
      Animated.timing(containerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onDone());
  }, []);

  const accentDim = alpha(colors.accent, 0.25);

  return (
    <Animated.View style={[styles.root, { backgroundColor: colors.bg, opacity: containerOpacity }]}>
      <View style={styles.content}>
        {/* Symbol */}
        <Animated.View style={[
          styles.symbolWrap,
          { opacity: symbolOpacity, transform: [{ scale: symbolScale }] },
        ]}>
          <View style={[styles.ring, { borderColor: colors.accent }]}>
            <View style={[styles.innerDot, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
          </View>
          <View style={[styles.arcLeft, { borderColor: accentDim }]} />
          <View style={[styles.arcRight, { borderColor: accentDim }]} />
        </Animated.View>

        {/* Wordmark */}
        <Animated.Text style={[styles.wordmark, { color: colors.textPrimary, opacity: textOpacity }]}>
          EON
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, { color: alpha(colors.textPrimary, 0.35), opacity: taglineOpacity }]}>
          всегда рядом
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  symbolWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  arcLeft: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    left: 2,
    top: 24,
  },
  arcRight: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    right: 2,
    top: 24,
  },
  wordmark: {
    fontSize: 36,
    fontFamily: fontFamily.bold,
    letterSpacing: 10,
  },
  tagline: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    letterSpacing: 3,
    textTransform: 'lowercase',
  },
});
