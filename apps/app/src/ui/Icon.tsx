// Deep imports: Metro doesn't tree-shake, and the package index ships ~1,600 icons.
import Activity from 'lucide-react-native/icons/activity';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import AtSign from 'lucide-react-native/icons/at-sign';
import Bell from 'lucide-react-native/icons/bell';
import BookMarked from 'lucide-react-native/icons/book-bookmark';
import BookPlus from 'lucide-react-native/icons/book-plus';
import Bug from 'lucide-react-native/icons/bug';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import CircleX from 'lucide-react-native/icons/circle-x';
import Clock from 'lucide-react-native/icons/clock';
import Code from 'lucide-react-native/icons/code';
import Copy from 'lucide-react-native/icons/copy';
import Download from 'lucide-react-native/icons/download';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import File from 'lucide-react-native/icons/file';
import FileCode from 'lucide-react-native/icons/file-code';
import FileText from 'lucide-react-native/icons/file-text';
import Flag from 'lucide-react-native/icons/flag';
import Folder from 'lucide-react-native/icons/folder';
import GitCommitHorizontal from 'lucide-react-native/icons/git-commit-horizontal';
import GitFork from 'lucide-react-native/icons/git-fork';
import GitMerge from 'lucide-react-native/icons/git-merge';
import GitPullRequest from 'lucide-react-native/icons/git-pull-request';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import GitBranch from 'lucide-react-native/icons/git-branch';
import Globe from 'lucide-react-native/icons/globe';
import GripVertical from 'lucide-react-native/icons/grip-vertical';
import House from 'lucide-react-native/icons/house';
import Inbox from 'lucide-react-native/icons/inbox';
import KeyRound from 'lucide-react-native/icons/key-round';
import Link from 'lucide-react-native/icons/link';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Package from 'lucide-react-native/icons/package';
import Palette from 'lucide-react-native/icons/palette';
import Plus from 'lucide-react-native/icons/plus';
import Rocket from 'lucide-react-native/icons/rocket';
import Search from 'lucide-react-native/icons/search';
import Share from 'lucide-react-native/icons/share';
import Smartphone from 'lucide-react-native/icons/smartphone';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Star from 'lucide-react-native/icons/star';
import Tag from 'lucide-react-native/icons/tag';
import Terminal from 'lucide-react-native/icons/terminal';
import Undo2 from 'lucide-react-native/icons/undo-2';
import User from 'lucide-react-native/icons/user';
import Users from 'lucide-react-native/icons/users';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';
import type { LucideIcon } from 'lucide-react-native';
import { useTokens } from '@/design/DesignProvider';

export const ICONS = {
  activity: Activity, 'arrow-down': ArrowDown, 'arrow-up': ArrowUp, 'arrow-up-right': ArrowUpRight, 'at-sign': AtSign, bell: Bell,
  'book-marked': BookMarked, 'book-plus': BookPlus, bug: Bug, check: Check, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'circle-check': CircleCheck, 'circle-dot': CircleDot, 'circle-x': CircleX, clock: Clock, code: Code, copy: Copy, download: Download, ellipsis: Ellipsis, file: File, 'file-text': FileText,
  eye: Eye, 'eye-off': EyeOff, 'file-code': FileCode, flag: Flag, folder: Folder, 'git-commit-horizontal': GitCommitHorizontal,
  'git-fork': GitFork, 'git-merge': GitMerge, 'git-pull-request': GitPullRequest, globe: Globe, 'chevron-down': ChevronDown, 'chevron-up': ChevronUp, 'git-branch': GitBranch, 'grip-vertical': GripVertical, house: House, inbox: Inbox,
  'key-round': KeyRound, link: Link, 'list-checks': ListChecks, lock: Lock, 'log-out': LogOut, 'message-circle': MessageCircle,
  'message-square': MessageSquare, package: Package, palette: Palette, plus: Plus, rocket: Rocket, search: Search, share: Share, smartphone: Smartphone,
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
