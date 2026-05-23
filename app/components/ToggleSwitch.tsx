import { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet } from 'react-native'
import { Colors } from '../../constants/colors'

type Props = {
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
}

const TRACK_W = 50
const TRACK_H = 28
const THUMB = 22
const TRAVEL = TRACK_W - THUMB - 6

export default function ToggleSwitch({ value, onValueChange, disabled = false }: Props) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      tension: 60,
      friction: 8,
    }).start()
  }, [value])

  const trackBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.border, Colors.accent],
  })

  const thumbX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [3, TRAVEL + 3],
  })

  const thumbScale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.88, 1],
  })

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      style={{ opacity: disabled ? 0.4 : 1 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackBg }]}>
        <Animated.View
          style={[
            styles.thumb,
            { transform: [{ translateX: thumbX }, { scale: thumbScale }] },
          ]}
        />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
})
