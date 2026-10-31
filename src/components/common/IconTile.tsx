import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_TEXT, TONE_TINT, type Tone } from './tone';

const SIZE = {
  md: { tile: 'size-[48px] rounded-tile', icon: 'size-[22px]' },
  sm: { tile: 'size-[32px] rounded-[10px]', icon: 'size-[18px]' },
} as const;

/**
 * Icon tile (docs/06 U1): 48 px, 12 px radius, solid blue gradient with a white glyph and a 1 px top highlight. A
 * status tone (a truck or alert inspector) stays tinted, so the tile reads as that status at a glance.
 */
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
        tone === 'info' ? 'tile-solid' : [TONE_TINT[tone], TONE_TEXT[tone]],
        className,
      )}
    >
      <Icon className={SIZE[size].icon} strokeWidth={1.75} />
    </span>
  );
}
