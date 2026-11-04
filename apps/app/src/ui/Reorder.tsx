import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Platform, View, type ViewStyle } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { Icon } from './Icon';

/**
 * A list you reorder by dragging the grip on the right. Works with touch and mouse (web, iOS, Android).
 * Rows have a fixed height so the drop position is a simple division. Screen readers get
 * "Move up" / "Move down" actions on every row instead of dragging.
 */
export function ReorderList<T>({ items, keyOf, label, rowHeight = 56, onMove, render }: {
  items: T[];
  keyOf: (item: T) => string;
  /** spoken name of a row, for the accessibility actions */
  label: (item: T) => string;
  rowHeight?: number;
  onMove: (from: number, to: number) => void;
  render: (item: T, index: number) => ReactNode;
}) {
  const t = useTokens();
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);
  const target = drag ? clamp(drag.index + Math.round(drag.dy / rowHeight), 0, items.length - 1) : -1;

  return (
    <View>
      {items.map((item, i) => {
        let shift = 0;
        if (drag && i !== drag.index) {
          if (drag.index < target && i > drag.index && i <= target) shift = -rowHeight;
          if (drag.index > target && i < drag.index && i >= target) shift = rowHeight;
        }
        const active = drag?.index === i;
        const style: ViewStyle = {
          height: rowHeight, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: t.c.line,
          backgroundColor: active ? t.c.el : t.c.bg, zIndex: active ? 10 : 0,
          transform: [{ translateY: active ? drag!.dy : shift }],
          ...(active ? { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 } : {}),
        };
        return (
          <View key={keyOf(item)} style={style}
            accessible accessibilityLabel={label(item)}
            accessibilityActions={[{ name: 'moveUp', label: 'Move up' }, { name: 'moveDown', label: 'Move down' }]}
            onAccessibilityAction={(e) => {
              const to = e.nativeEvent.actionName === 'moveUp' ? i - 1 : i + 1;
              if (to >= 0 && to < items.length) onMove(i, to);
            }}>
            <View style={{ flex: 1, minWidth: 0 }}>{render(item, i)}</View>
            <Grip index={i} onDrag={(dy) => setDrag({ index: i, dy })}
              onDrop={(dy) => { setDrag(null); const to = clamp(i + Math.round(dy / rowHeight), 0, items.length - 1); if (to !== i) onMove(i, to); }} />
          </View>
        );
      })}
    </View>
  );
}

function Grip({ index, onDrag, onDrop }: { index: number; onDrag: (dy: number) => void; onDrop: (dy: number) => void }) {
  const t = useTokens();
  // Keep the latest callbacks without recreating the responder mid-gesture.
  const cb = useRef({ onDrag, onDrop });
  useLayoutEffect(() => { cb.current = { onDrag, onDrop }; });
  // The responder only reads cb.current inside gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // don't let the ScrollView take over mid-drag
    onPanResponderGrant: () => cb.current.onDrag(0),
    onPanResponderMove: (_e, g) => cb.current.onDrag(g.dy),
    onPanResponderRelease: (_e, g) => cb.current.onDrop(g.dy),
    onPanResponderTerminate: (_e, g) => cb.current.onDrop(g.dy),
  }));
  return (
    <View {...responder.panHandlers} testID={`grip-${index}`} accessibilityElementsHidden importantForAccessibility="no"
      style={{ width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle) : {}) }}>
      <Icon name="grip-vertical" size={18} color={t.c.dim} />
    </View>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Moves one element of an array in place (for use inside a design update). */
export function moveItem<T>(arr: T[], from: number, to: number) {
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}
