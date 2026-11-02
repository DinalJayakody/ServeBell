import { BellRing, CircleHelp, GlassWater, HandHelping, ReceiptText, ScrollText, Sparkles, Utensils, UtensilsCrossed, Wine, type LucideIcon } from 'lucide-react-native';

/** Icon names stored on service types (kebab-case Lucide names) → components. */
const ICONS: Record<string, LucideIcon> = {
  'bell-ring': BellRing,
  'glass-water': GlassWater,
  utensils: Utensils,
  'utensils-crossed': UtensilsCrossed,
  wine: Wine,
  'scroll-text': ScrollText,
  'receipt-text': ReceiptText,
  sparkles: Sparkles,
  'hand-helping': HandHelping,
};

const BY_KIND: Record<string, LucideIcon> = {
  WAITER: BellRing, WATER: GlassWater, UTENSIL: Utensils, BILL: ReceiptText, CLEANING: Sparkles, ASSISTANCE: HandHelping, CUSTOM: CircleHelp,
};

export function ServiceIcon({ icon, kind, size = 22, color }: { icon?: string | null; kind?: string; size?: number; color: string }) {
  const Icon = (icon && ICONS[icon]) || (kind && BY_KIND[kind]) || CircleHelp;
  return <Icon size={size} color={color} />;
}
