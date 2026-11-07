import {
  Home,
  Keyboard,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  ScanEye,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSceneCamera } from '@/scene/camera/cameraController';
import { useUiStore } from '@/stores';

/** One +/- step of the distance to the orbit target, and one rotate step. */
const ZOOM_STEP = 0.8;
const ROTATE_STEP = Math.PI / 8;
const CONTROL_CLASS =
  'soft-transition text-ink-600 hover:bg-row-hover hover:text-ink-900 focus-visible:ring-ring/50 grid size-9 place-items-center rounded-full active:scale-95 focus-visible:ring-[3px] focus-visible:outline-none';

function Control({
  testId,
  icon: Icon,
  label,
  onClick,
  pressed,
  className,
}: {
  testId: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Toggle controls only: sets `aria-pressed` and a pressed look. Omitted for one-shot controls. */
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(CONTROL_CLASS, pressed && 'bg-row-hover text-ink-900', className)}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** The keyboard shortcuts of the scene, on hover or keyboard focus. Has its own provider, so it works outside the shell. */
function KeysHint() {
  const { t } = useTranslation('live');
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="map-keys"
            aria-label={t('map.keys.label')}
            className={CONTROL_CLASS}
          >
            <Keyboard className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          sideOffset={10}
          data-testid="map-keys-hint"
          className="text-[14px] leading-5 text-balance"
        >
          <p className="font-medium">{t('map.keys.label')}</p>
          <p>{t('map.keys.move')}</p>
          <p>{t('map.keys.fast')}</p>
          <p>{t('map.keys.zoom')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Map controls (docs/06 D10): a white vertical pill just left of the inspector column. Mounted with the scene, so it is
 * absent without WebGL. It only moves the camera, through the same controller the tray and search use.
 */
export function MapControls() {
  const { t } = useTranslation('live');
  const camera = useSceneCamera();
  const xray = useUiStore((s) => s.xray);
  const setXray = useUiStore((s) => s.setXray);
  return (
    <div
      role="group"
      aria-label={t('map.label')}
      data-testid="map-controls"
      className="card-surface absolute end-[396px] print:hidden top-[16px] flex flex-col items-center gap-0.5 rounded-full p-1"
    >
      <Control
        testId="map-zoom-in"
        icon={Plus}
        label={t('map.zoomIn')}
        onClick={() => camera.zoomBy(ZOOM_STEP)}
      />
      <Control
        testId="map-zoom-out"
        icon={Minus}
        label={t('map.zoomOut')}
        onClick={() => camera.zoomBy(1 / ZOOM_STEP)}
      />
      <span aria-hidden className="bg-hairline my-0.5 h-px w-5" />
      <Control
        testId="map-rotate-left"
        icon={RotateCcw}
        label={t('map.rotateLeft')}
        onClick={() => camera.orbitBy(-ROTATE_STEP)}
      />
      <Control
        testId="map-rotate-right"
        icon={RotateCw}
        label={t('map.rotateRight')}
        onClick={() => camera.orbitBy(ROTATE_STEP)}
      />
      <span aria-hidden className="bg-hairline my-0.5 h-px w-5" />
      <Control
        testId="map-home"
        icon={Home}
        label={t('map.home')}
        onClick={() => camera.flyTo('floorOverview')}
      />
      <span aria-hidden className="bg-hairline my-0.5 h-px w-5" />
      <Control
        testId="map-xray"
        icon={ScanEye}
        label={t('map.xray')}
        pressed={xray}
        onClick={() => setXray(!xray)}
      />
      <span aria-hidden className="bg-hairline my-0.5 h-px w-5" />
      <KeysHint />
    </div>
  );
}
