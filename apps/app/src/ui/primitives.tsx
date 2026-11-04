import type { Tokens } from '@gitling/design';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/design/DesignProvider';
import { Icon } from './Icon';

type Color = keyof Tokens['c'];

/* ---------- type ---------- */
type Variant = 'h1' | 'h2' | 'title' | 'body' | 'bodyStrong' | 'sub' | 'mono' | 'monoS' | 'label';
export function T({ v = 'body', c = 'fg', style, children, lines }: { v?: Variant; c?: Color; style?: StyleProp<TextStyle>; children: ReactNode; lines?: number }) {
  const t = useTokens(); const s = t.scale;
  const base: Record<Variant, TextStyle> = {
    h1: { fontFamily: t.font.ui.semibold, fontSize: s(30), lineHeight: s(34), letterSpacing: -0.7 },
    h2: { fontFamily: t.font.ui.semibold, fontSize: s(23), lineHeight: s(28), letterSpacing: -0.4 },
    title: { fontFamily: t.font.ui.medium, fontSize: s(15.5), lineHeight: s(20) },
    body: { fontFamily: t.font.ui.regular, fontSize: s(15), lineHeight: s(21.5) },
    bodyStrong: { fontFamily: t.font.ui.semibold, fontSize: s(15), lineHeight: s(20) },
    sub: { fontFamily: t.font.ui.regular, fontSize: s(14), lineHeight: s(19.5) },
    mono: { fontFamily: t.font.mono.medium, fontSize: s(12.5), lineHeight: s(17) },
    monoS: { fontFamily: t.font.mono.regular, fontSize: s(11.5), lineHeight: s(16) },
    label: { fontFamily: t.font.mono.medium, fontSize: s(12), lineHeight: s(16), letterSpacing: 0.2 },
  };
  return <Text numberOfLines={lines} style={[base[v], { color: t.c[c] as string }, style]}>{children}</Text>;
}

/** Instrument numbers: dot-matrix, mono or sans, as chosen in Studio. */
export function Num({ value, size = 40, c = 'fg' }: { value: string | number; size?: number; c?: Color }) {
  const t = useTokens();
  const dot = t.numbers === 'dot';
  return (
    <Text style={{ fontFamily: t.font.num, fontSize: size, lineHeight: size * (dot ? 0.95 : 1.05), letterSpacing: dot ? -1 : -size * 0.03, color: t.c[c] as string, fontVariant: ['tabular-nums'] }}>
      {value}
    </Text>
  );
}

/* ---------- surfaces ---------- */
export function Panel({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  const t = useTokens();
  return <View style={[{ backgroundColor: t.c.el, borderColor: tint ? tint + '59' : t.c.line, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: t.r.xl, overflow: 'hidden' }, style]}>{children}</View>;
}

export function SectionLabel({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 18, paddingTop: 22, paddingBottom: 8 }}>
      <T v="label" c="mut">{title}</T>
      {action ? <Pressable onPress={onAction} hitSlop={10}><T v="bodyStrong" c="acc" style={{ fontSize: 13.5 }}>{action}</T></Pressable> : null}
    </View>
  );
}

/** Tick-bar meter (CI runs, diff stats). */
export function Ticks({ values, height = 16 }: { values: ('ok' | 'bad' | 'none')[]; height?: number }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', gap: 3, height }}>
      {values.map((v, i) => <View key={i} style={{ flex: 1, borderRadius: 2, backgroundColor: v === 'ok' ? t.c.ok : v === 'bad' ? t.c.bad : t.c.line2, opacity: v === 'ok' ? 0.85 : 1 }} />)}
    </View>
  );
}

/* ---------- people ---------- */
const hue = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
export function Avatar({ login, size = 36, badge, badgeColor }: { login: string; size?: number; badge?: string; badgeColor?: string }) {
  const t = useTokens();
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue(login)}, 38%, 40%)`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontFamily: t.font.ui.semibold, fontSize: size * 0.4 }}>{login[0]?.toUpperCase()}</Text>
      </View>
      {badge ? (
        <View style={{ position: 'absolute', right: -4, bottom: -4, width: 19, height: 19, borderRadius: 10, backgroundColor: t.c.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={badge} size={13} color={badgeColor ?? t.c.fg} />
        </View>
      ) : null}
    </View>
  );
}

/* ---------- controls ---------- */
export function Chips<V extends string>({ options, value, onChange, scroll = true }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; scroll?: boolean }) {
  const t = useTokens();
  const body = options.map((o) => {
    const on = o.value === value;
    return (
      <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, backgroundColor: on ? t.c.el2 : 'transparent' }}>
        <T v="bodyStrong" c={on ? 'fg' : 'mut'} style={{ fontSize: t.scale(14), fontFamily: t.font.ui.medium }}>{o.label}</T>
      </Pressable>
    );
  });
  if (!scroll) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{body}</View>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 14 }}>{body}</ScrollView>;
}

/** Segmented control. */
export function Seg<V extends string>({ options, value, onChange, small }: { options: { value: V; label: string; n?: number }[]; value: V; onChange: (v: V) => void; small?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', padding: 3, backgroundColor: t.c.el2, borderRadius: small ? 10 : 12 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: small ? undefined : 1, paddingHorizontal: small ? 10 : 8, paddingVertical: small ? 5 : 8, borderRadius: small ? 8 : 9, alignItems: 'center', backgroundColor: on ? (t.mode === 'dark' ? '#33343A' : t.c.el) : 'transparent', flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
            <T v="bodyStrong" c={on ? 'fg' : 'mut'} style={{ fontSize: t.scale(small ? 13 : 14), fontFamily: t.font.ui.medium }}>{o.label}</T>
            {o.n != null ? <T v="monoS" c="dim">{o.n}</T> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ label, icon, onPress, kind = 'primary', disabled, style }: { label?: string; icon?: string; onPress?: () => void; kind?: 'primary' | 'quiet' | 'danger'; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTokens();
  const bg = kind === 'primary' ? t.c.fg : t.c.el2;
  const fg = kind === 'primary' ? t.c.onFg : kind === 'danger' ? t.c.bad : t.c.fg;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [{ height: 50, minWidth: 50, paddingHorizontal: label ? 20 : 0, borderRadius: 25, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: disabled ? 0.4 : pressed ? 0.8 : 1, borderWidth: kind === 'primary' ? 0 : 1, borderColor: t.c.glassBorder }, style]}>
      {icon ? <Icon name={icon} size={19} color={fg} /> : null}
      {label ? <Text style={{ color: fg, fontFamily: t.font.ui.semibold, fontSize: t.scale(16) }}>{label}</Text> : null}
    </Pressable>
  );
}

/* ---------- navigation ---------- */
/** Back chevron on the left, optional actions on the right. Falls back to Home when there's no history (deep link). */
export function BackHeader({ right, title }: { right?: ReactNode; title?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 14 }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} accessibilityLabel="Back"><Icon name="chevron-left" size={26} /></Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>{title ? <T v="mono" c="mut" lines={1}>{title}</T> : null}</View>
      {right}
    </View>
  );
}

/** A tappable list row: icon tile, title, subtitle, trailing text. */
export function Row({ icon, iconColor, title, sub, trail, onPress, mono }: { icon: string; iconColor?: string; title: string; sub?: string; trail?: string; onPress?: () => void; mono?: boolean }) {
  const t = useTokens();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: t.rowPad, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={iconColor ?? t.c.mut} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <T v={mono ? 'mono' : 'title'} lines={1} style={mono ? { fontSize: t.scale(14) } : undefined}>{title}</T>
        {sub ? <T v="monoS" c="mut" lines={1}>{sub}</T> : null}
      </View>
      {trail ? <T v="mono" c="mut">{trail}</T> : null}
    </Pressable>
  );
}

/* ---------- screen ---------- */
export function Screen({ children, header, scroll = true, bottomSpace = 110 }: { children: ReactNode; header?: ReactNode; scroll?: boolean; bottomSpace?: number }) {
  const t = useTokens(); const insets = useSafeAreaInsets();
  const content = <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top }}>
      {header ? <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>{header}</View> : null}
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: bottomSpace + insets.bottom }} keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6 }}>
      <T v="mono" c="mut">{title}</T>
      {body ? <T v="sub" c="mut" style={{ textAlign: 'center' }}>{body}</T> : null}
    </View>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <View style={{ margin: 14, padding: 14, gap: 8 }}>
      <T v="bodyStrong" c="bad">{"Couldn't load this"}</T>
      <T v="sub" c="mut">{msg}</T>
      {onRetry ? <Pressable onPress={onRetry}><T v="bodyStrong" c="acc">Try again</T></Pressable> : null}
    </View>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  const t = useTokens();
  return <View style={{ padding: 14, gap: 10 }}>{Array.from({ length: rows }, (_, i) => <View key={i} style={{ height: 52, borderRadius: 12, backgroundColor: t.c.el }} />)}</View>;
}

export const glass = (t: Tokens): ViewStyle => ({
  backgroundColor: t.c.glass, borderWidth: 1, borderColor: t.c.glassBorder,
  ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(20px) saturate(1.4)', WebkitBackdropFilter: 'blur(20px) saturate(1.4)' } as ViewStyle) : {}),
});
