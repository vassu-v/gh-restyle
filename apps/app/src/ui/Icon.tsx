import {
  Activity, ArrowDown, ArrowUp, ArrowUpRight, AtSign, Bell, BookMarked, BookPlus, Bug, Check, ChevronLeft, ChevronRight,
  CircleCheck, CircleDot, CircleX, Clock, Code, Copy, Ellipsis, Eye, EyeOff, FileCode, Flag, Folder, GitCommitHorizontal,
  GitFork, GitMerge, GitPullRequest, Globe, House, Inbox, KeyRound, Link, ListChecks, Lock, LogOut, MessageCircle,
  MessageSquare, Package, Palette, Plus, Rocket, Search, Share, Sparkles, Star, Tag, Terminal, Undo2, User, Users, X, Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useTokens } from '@/design/DesignProvider';

export const ICONS = {
  activity: Activity, 'arrow-down': ArrowDown, 'arrow-up': ArrowUp, 'arrow-up-right': ArrowUpRight, 'at-sign': AtSign, bell: Bell,
  'book-marked': BookMarked, 'book-plus': BookPlus, bug: Bug, check: Check, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'circle-check': CircleCheck, 'circle-dot': CircleDot, 'circle-x': CircleX, clock: Clock, code: Code, copy: Copy, ellipsis: Ellipsis,
  eye: Eye, 'eye-off': EyeOff, 'file-code': FileCode, flag: Flag, folder: Folder, 'git-commit-horizontal': GitCommitHorizontal,
  'git-fork': GitFork, 'git-merge': GitMerge, 'git-pull-request': GitPullRequest, globe: Globe, house: House, inbox: Inbox,
  'key-round': KeyRound, link: Link, 'list-checks': ListChecks, lock: Lock, 'log-out': LogOut, 'message-circle': MessageCircle,
  'message-square': MessageSquare, package: Package, palette: Palette, plus: Plus, rocket: Rocket, search: Search, share: Share,
  sparkles: Sparkles, star: Star, tag: Tag, terminal: Terminal, 'undo-2': Undo2, user: User, users: Users, x: X, zap: Zap,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;

/** Icons offered in the tile editor. */
export const TILE_ICONS: IconName[] = ['eye', 'git-pull-request', 'circle-dot', 'bug', 'rocket', 'flag', 'sparkles', 'book-marked', 'search', 'at-sign', 'bell', 'tag', 'star', 'zap', 'package', 'terminal', 'code', 'globe', 'users', 'clock', 'list-checks'];

export function Icon({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  const t = useTokens();
  const C = ICONS[name as IconName] ?? Star;
  return <C size={size} color={color ?? t.c.fg} strokeWidth={1.75} />;
}
