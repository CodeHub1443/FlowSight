import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WebGLRenderer } from 'three';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema, type SiteConfig } from '@/domain';
import { SCENE_PRESETS, SceneRoot, useSceneCamera, type QualityTier, type SceneTheme } from '..';

declare global {
  interface Window {
    __sceneGl?: WebGLRenderer;
  }
}

const base: SiteConfig = SiteConfigSchema.parse(siteConfigJson);

/** `?site=east3`: three bays on the east face, to exercise the generic builder. */
function variant(name: string | null): SiteConfig {
  const dock = base.dockFaces[0];
  if (name !== 'east3' || !dock) return base;
  return {
    ...base,
    dockFaces: [{ ...dock, face: 'E', bayOrder: 'N_TO_S', bays: dock.bays.slice(0, 3) }],
  };
}

const QUALITIES: readonly (QualityTier | 'auto')[] = ['auto', 'high', 'med', 'low'];

function param<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = new URLSearchParams(window.location.search).get(name);
  return allowed.find((a) => a === v) ?? fallback;
}

/** Dev-only full-screen preview of <SceneRoot/> with a preset switcher. Not mounted by the app. */
export function ScenePreview() {
  const { t, i18n } = useTranslation('scene');
  const camera = useSceneCamera();
  const config = useMemo(
    () => variant(new URLSearchParams(window.location.search).get('site')),
    [],
  );
  const [theme, setTheme] = useState<SceneTheme>(
    param<SceneTheme>('theme', ['light', 'dark'], 'light'),
  );
  const [quality, setQuality] = useState<QualityTier | 'auto'>(param('quality', QUALITIES, 'auto'));
  const [selected, setSelected] = useState<string | null>(null);
  const bays = config.dockFaces.flatMap((f) => f.bays);
  const lang = i18n.language === 'bn' ? 'bn' : 'en';

  const btn =
    'rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-sm text-[var(--card-foreground)] hover:bg-[var(--accent)]';

  return (
    <div className={theme === 'dark' ? 'dark' : ''} style={{ position: 'fixed', inset: 0 }}>
      <SceneRoot
        siteConfig={config}
        theme={theme}
        quality={quality === 'auto' ? undefined : quality}
        selectedBayId={selected}
        onSelect={(s) => setSelected(s.bayId)}
        doorOpen={(id) => id !== 'B06'}
        onReady={(gl) => {
          window.__sceneGl = gl;
        }}
      />
      <div
        data-testid="scene-controls"
        data-selected={selected ?? ''}
        className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-xl bg-[var(--card)]/90 p-2 shadow"
      >
        <span className="px-1 text-sm font-semibold text-[var(--foreground)]">
          {t('dev.title')}
        </span>
        {SCENE_PRESETS.map((p) => (
          <button key={p} className={btn} onClick={() => camera.flyTo(p)} data-preset={p}>
            {t(`preset.${p}`)}
          </button>
        ))}
        <select
          className={btn}
          aria-label={t('dev.bay')}
          value=""
          onChange={(e) => e.target.value && camera.flyTo(e.target.value)}
        >
          <option value="">{t('dev.bay')}</option>
          {bays.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label[lang]}
            </option>
          ))}
        </select>
        <button className={btn} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {t(theme === 'dark' ? 'dev.light' : 'dev.dark')}
        </button>
        <select
          className={btn}
          aria-label={t('dev.quality')}
          value={quality}
          onChange={(e) => setQuality(QUALITIES.find((q) => q === e.target.value) ?? 'auto')}
        >
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {t(`dev.q.${q}`)}
            </option>
          ))}
        </select>
        <button
          className={btn}
          onClick={() => void i18n.changeLanguage(lang === 'bn' ? 'en' : 'bn')}
        >
          {lang === 'bn' ? 'EN' : 'বাং'}
        </button>
      </div>
    </div>
  );
}
