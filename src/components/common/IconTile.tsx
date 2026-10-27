import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_TEXT, TONE_TINT, type Tone } from './tone';

const SIZE = {
  md: { tile: 'size-[44px] rounded-tile', icon: 'size-[20px]' },
  sm: { tile: 'size-[32px] rounded-[10px]', icon: 'size-[18px]' },
} as const;

/** Tinted icon tile (docs/06 §3): 44 px, 12 px radius, `--brand-50` background and `--brand-500` icon by default. */
export function IconTile({
  icon: Icon,
  tone = 'info',
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center',
        SIZE[size].tile,
        TONE_TINT[tone],
        TONE_TEXT[tone],
        className,
      )}
    >
      <Icon className={SIZE[size].icon} strokeWidth={1.75} />
    </span>
  );
}
