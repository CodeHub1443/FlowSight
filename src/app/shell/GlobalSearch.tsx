import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Caption } from '@/components/common';
import {
  bayConveyor,
  bayLabel,
  canSeeCaptainNames,
  focusObject,
  searchEntities,
  useFmt,
  type SearchGroup,
  type SearchHit,
} from '@/features/live';
import { cn } from '@/lib/utils';
import { useBays, useOpenAlerts, useSessionStore } from '@/stores';

const GROUP_ORDER: readonly SearchGroup[] = ['bays', 'trucks', 'captains', 'events'];

/**
 * Global search over live store data: bays, trucks (plate bn/en), captains (names only when permitted), events.
 * Choosing a result selects it and flies the camera to it. `/` focuses the field.
 */
export function GlobalSearch() {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const navigate = useNavigate();
  const bays = useBays();
  const events = useOpenAlerts();
  const role = useSessionStore((s) => s.role);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const hits = useMemo(
    () =>
      searchEntities(query, {
        bays,
        events,
        lang: fmt.lang,
        showCaptainNames: canSeeCaptainNames(role),
        bayLabel,
        bayConveyor,
      }),
    [query, bays, events, fmt.lang, role],
  );
  const flat = GROUP_ORDER.flatMap((g) => hits.filter((h) => h.group === g));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (hit: SearchHit) => {
    focusObject(hit.selection);
    void navigate('/live');
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const showPanel = open && query.trim() !== '';
  const activeHit = flat[Math.min(active, flat.length - 1)];

  return (
    <div className="relative min-w-0 flex-1 basis-0" style={{ maxWidth: '26rem' }}>
      <Search
        className="text-ink-400 pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && activeHit ? `${listId}-${activeHit.key}` : undefined}
        aria-label={t('search.label')}
        placeholder={t('search.placeholder')}
        value={query}
        data-testid="global-search"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && activeHit) {
            e.preventDefault();
            choose(activeHit);
          } else if (e.key === 'Escape') {
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
        className="soft-transition bg-card border-card-border text-ink-900 placeholder:text-ink-400 focus-visible:bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-10 w-full rounded-full border ps-10 pe-10 text-[13px] outline-none focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd
        className="text-ink-400 border-card-border bg-card pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-[6px] border px-1.5 text-[11px] leading-4 md:block"
        aria-hidden
      >
        /
      </kbd>
      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('search.results')}
          data-testid="search-results"
          className="bg-popover text-popover-foreground border-card-border shadow-card animate-in fade-in-0 slide-in-from-top-1 absolute start-0 top-full z-50 mt-2 max-h-[60vh] w-[28rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[14px] border p-1.5 duration-150"
        >
          {flat.length === 0 && (
            <p className="text-muted-foreground px-2 py-4 text-center" data-testid="search-empty">
              {t('search.empty')}
            </p>
          )}
          {GROUP_ORDER.map((group) => {
            const items = hits.filter((h) => h.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} role="group" aria-label={t(`search.groups.${group}`)}>
                <div className="px-2 pt-1.5 pb-0.5">
                  <Caption className="text-ink-400">{t(`search.groups.${group}`)}</Caption>
                </div>
                {items.map((hit) => (
                  <div
                    key={hit.key}
                    id={`${listId}-${hit.key}`}
                    role="option"
                    aria-selected={hit === activeHit}
                    data-testid={`search-hit-${hit.key}`}
                    // mouseDown (not click) so the input does not blur and close the panel first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(hit);
                    }}
                    onMouseEnter={() => setActive(flat.indexOf(hit))}
                    className={cn(
                      'soft-transition cursor-pointer rounded-[10px] px-2.5 py-1.5',
                      hit === activeHit && 'bg-row-hover',
                    )}
                  >
                    <span className="text-ink-900 block truncate font-medium">{hit.title}</span>
                    {hit.subtitle && (
                      <span className="text-ink-400 block truncate text-[12px]">
                        {hit.subtitle}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
