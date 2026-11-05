import { Platform } from 'react-native';

/**
 * Ref callback for a panel that just opened (a comment box, the review sheet). On web it scrolls the panel to
 * the middle of the screen: opened near the bottom, its buttons sat under the floating action bar, and the review
 * sheet opened above the part of the page you were looking at. Native leaves scrolling to the keyboard handling.
 * Module-level, so React calls it once per mount, not on every render.
 */
export function reveal(node: object | null) {
  if (Platform.OS !== 'web' || !node) return;
  const el = node as unknown as { scrollIntoView?: (o: { block: 'center'; behavior: 'smooth' }) => void };
  requestAnimationFrame(() => el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
}
