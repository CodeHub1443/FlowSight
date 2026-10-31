import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Icon3d } from './icons3d';
import { TONE_TEXT, TONE_TINT, type Tone } from './tone';

const SIZE = {
  md: { tile: 'size-[48px] rounded-tile', glyph: 'size-[22px]', object: 'size-[38px]' },
  sm: { tile: 'size-[32px] rounded-[10px]', glyph: 'size-[18px]', object: 'size-[27px]' },
} as const;

export type TileIcon = LucideIcon | Icon3d;

const is3d = (icon: TileIcon): icon is Icon3d => 'is3d' in icon;

/**
 * Icon tile (docs/06 section 7.4): 48 px, 12 px radius, a pale rounded tile holding a dimensional 3D object, or a lucide
 * glyph for a concept without one. A status tone tints the tile and the object, so it reads as that status at a glance.
 */
export function IconTile({
  icon,
  tone = 'info',
  size = 'md',
  className,
}: {
  icon: TileIcon;
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
        tone === 'info' ? 'tile-pale' : TONE_TINT[tone],
        className,
      )}
    >
      {is3d(icon) ? (
        <TileObject icon={icon} tone={tone} className={SIZE[size].object} />
      ) : (
        <TileGlyph icon={icon} tone={tone} className={SIZE[size].glyph} />
      )}
    </span>
  );
}

function TileObject({
  icon: Icon,
  tone,
  className,
}: {
  icon: Icon3d;
  tone: Tone;
  className: string;
}) {
  return <Icon tone={tone} className={className} />;
}

function TileGlyph({
  icon: Icon,
  tone,
  className,
}: {
  icon: LucideIcon;
  tone: Tone;
  className: string;
}) {
  return <Icon className={cn(className, TONE_TEXT[tone])} strokeWidth={1.75} />;
}
