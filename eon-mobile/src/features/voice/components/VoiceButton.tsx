import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { useColors, radius } from '@/shared/theme';
import { RecorderState } from '../hooks/useAudioRecorder';

interface Props {
  state: RecorderState;
  onPressIn: () => void;
  onPressOut: () => void;
  onLock: () => void;
}

const LOCK_THRESHOLD = -55;

export function VoiceButton({ state, onPressIn, onPressOut, onLock }: Props) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(1)).current;
  const slideY = useRef(new Animated.Value(0)).current;
  const lockedRef = useRef(false);

  const onPressInRef = useRef(onPressIn);
  const onPressOutRef = useRef(onPressOut);
  const onLockRef = useRef(onLock);
  useEffect(() => { onPressInRef.current = onPressIn; }, [onPressIn]);
  useEffect(() => { onPressOutRef.current = onPressOut; }, [onPressOut]);
  useEffect(() => { onLockRef.current = onLock; }, [onLock]);

  useEffect(() => {
    if (state === 'recording' || state === 'locked') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
    }
  }, [state]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        lockedRef.current = false;
        onPressInRef.current();
      },
      onPanResponderMove: (_, gesture) => {
        if (!lockedRef.current) {
          slideY.setValue(Math.min(0, gesture.dy));
          if (gesture.dy < LOCK_THRESHOLD) {
            lockedRef.current = true;
            Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
            onLockRef.current();
          }
        }
      },
      onPanResponderRelease: () => {
        if (!lockedRef.current) {
          Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
          onPressOutRef.current();
        }
      },
      onPanResponderTerminate: () => {
        if (!lockedRef.current) {
          Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
          onPressOutRef.current();
        }
      },
    })
  ).current;

  const isActive = state === 'recording' || state === 'locked';
  const isLocked = state === 'locked';

  const btnBg = isLocked ? colors.accent : isActive ? colors.accentMuted : colors.bgInput;
  const btnBorder = isActive ? colors.accent : colors.border;

  return (
    <Animated.View style={{ transform: [{ scale: pulse }, { translateY: slideY }] }}>
      {state === 'recording' && (
        <View style={[styles.lockHint, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="arrow-up-outline" size={13} color={colors.textMuted} />
        </View>
      )}
      <View
        style={[styles.btn, { backgroundColor: btnBg, borderColor: btnBorder }]}
        {...panResponder.panHandlers}
      >
        {isLocked ? (
          <Ionicons name="lock-closed-outline" size={22} color={colors.onAccent} />
        ) : isActive ? (
          <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
        ) : (
          <Ionicons name="mic-outline" size={22} color={colors.textSecondary} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: { width: 12, height: 12, borderRadius: 6 },
  lockHint: {
    position: 'absolute',
    top: -28,
    alignSelf: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
});
