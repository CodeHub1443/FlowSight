import { Home, Minus, Plus, RotateCcw, RotateCw, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useSceneCamera } from '@/scene/camera/cameraController';

/** One +/- step of the distance to the orbit target, and one rotate step. */
const ZOOM_STEP = 0.8;
const ROTATE_STEP = Math.PI / 8;

function Control({
  testId,
  icon: Icon,
  label,
  onClick,
  className,
}: {
  testId: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'soft-transition text-ink-600 hover:bg-row-hover hover:text-ink-900 focus-visible:ring-ring/50 grid size-9 place-items-center rounded-full active:scale-95 focus-visible:ring-[3px] focus-visible:outline-none',
        className,
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/**
 * Map controls (docs/06 D10): a white vertical pill just left of the inspector column. Mounted with the scene, so it is
 * absent without WebGL. It only moves the camera, through the same controller the tray and search use.
 */
export function MapControls() {
  const { t } = useTranslation('live');
  const camera = useSceneCamera();
  return (
    <div
      role="group"
      aria-label={t('map.label')}
      data-testid="map-controls"
      className="card-surface absolute end-[396px] top-[16px] flex flex-col items-center gap-0.5 rounded-full p-1"
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
    </div>
  );
}
