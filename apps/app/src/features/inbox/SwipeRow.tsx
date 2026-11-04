import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { Icon } from '@/ui/Icon';
import { T } from '@/ui/primitives';

const native = Platform.OS !== 'web';

/** Swipe right: done. Swipe left: mark read. Past 35% of the width commits. */
export function SwipeRow({ children, onDone, onRead }: { children: ReactNode; onDone: () => void; onRead: () => void }) {
  const t = useTokens();
  const [x] = useState(() => new Animated.Value(0));
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const width = useRef(360);
  const passed = useRef(false);
  const handlers = useRef({ onDone, onRead });
  useEffect(() => { handlers.current = { onDone, onRead }; }, [onDone, onRead]);

  // The refs below are read only inside gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      x.setValue(g.dx);
      setDir(g.dx > 0 ? 1 : g.dx < 0 ? -1 : 0);
      const pass = Math.abs(g.dx) > width.current * 0.35;
      if (pass !== passed.current) { passed.current = pass; if (pass && native) Haptics.selectionAsync(); }
    },
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > width.current * 0.35) {
        const right = g.dx > 0;
        Animated.timing(x, { toValue: right ? width.current : -width.current, duration: 160, useNativeDriver: native }).start(() => {
          (right ? handlers.current.onDone : handlers.current.onRead)();
          x.setValue(0); setDir(0); passed.current = false;
        });
      } else {
        Animated.spring(x, { toValue: 0, useNativeDriver: native, bounciness: 4 }).start(() => setDir(0));
      }
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: native }).start(() => setDir(0)),
  }), [x]);

  return (
    <View onLayout={(e) => { width.current = e.nativeEvent.layout.width; }} style={{ marginHorizontal: 10, borderRadius: 16, overflow: 'hidden' }}>
      {dir !== 0 ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: dir > 0 ? (t.mode === 'dark' ? '#1F3B2D' : '#DDF3E7') : t.c.el2, flexDirection: 'row', alignItems: 'center', justifyContent: dir > 0 ? 'flex-start' : 'flex-end', paddingHorizontal: 18, gap: 8 }}>
          <Icon name={dir > 0 ? 'check' : 'eye'} size={18} color={dir > 0 ? t.c.ok : t.c.fg} />
          <T v="bodyStrong" c={dir > 0 ? 'ok' : 'fg'}>{dir > 0 ? 'Done' : 'Read'}</T>
        </View>
      ) : null}
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }], backgroundColor: t.c.bg, borderRadius: 16 }}>
        {children}
      </Animated.View>
    </View>
  );
}
