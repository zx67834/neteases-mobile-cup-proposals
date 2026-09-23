'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';

interface TeacherSlideControlsProps {
  readonly scenes: readonly { id: string; title?: string }[];
  readonly currentIndex: number;
  readonly onSelect: (sceneId: string) => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly isPresenting: boolean;
  readonly controlsVisible: boolean;
  readonly onTogglePresentation: () => void;
}

/**
 * Teacher-facing deck navigation for the real-classroom playback surface.
 *
 * The upstream playback toolbar is intentionally hidden in classroom mode,
 * so paging needs a small, persistent control that does not compete with the
 * lecture-notes panel. The page menu stays inside the fullscreen subtree
 * instead of using a portal, which keeps it usable during presentation mode.
 */
export function TeacherSlideControls({
  scenes,
  currentIndex,
  onSelect,
  onPrevious,
  onNext,
  isPresenting,
  controlsVisible,
  onTogglePresentation,
}: TeacherSlideControlsProps) {
  const { t } = useI18n();
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentButtonRef = useRef<HTMLButtonElement>(null);

  const pageCount = scenes.length;
  const canPrevious = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < pageCount - 1;

  useEffect(() => {
    if (!pageMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPageMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [pageMenuOpen]);

  useEffect(() => {
    if (!pageMenuOpen) return;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-page-index="${currentIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [currentIndex, pageMenuOpen]);

  if (pageCount === 0 || currentIndex < 0) return null;

  return (
    <div
      ref={rootRef}
      data-testid="teacher-slide-controls"
      className={cn(
        'absolute left-1/2 z-40 -translate-x-1/2 transition-all duration-200',
        isPresenting ? 'bottom-36' : 'bottom-3',
        isPresenting && !controlsVisible && 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      {pageMenuOpen && (
        <div
          role="menu"
          aria-label={t('stage.currentScene')}
          className="absolute bottom-[calc(100%+10px)] left-1/2 max-h-72 w-72 -translate-x-1/2 overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white/95 p-2 shadow-2xl shadow-zinc-950/15 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:shadow-black/40"
        >
          <div className="px-2 pb-2 pt-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">
            选择 PPT 页面
          </div>
          {scenes.map((scene, index) => {
            const active = index === currentIndex;
            return (
              <button
                key={scene.id}
                type="button"
                role="menuitem"
                data-page-index={index}
                onClick={() => {
                  setPageMenuOpen(false);
                  onSelect(scene.id);
                  currentButtonRef.current?.focus();
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                  active
                    ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums',
                    active
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 truncate text-sm font-medium">
                  {scene.title || `第 ${index + 1} 页`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1 rounded-2xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-xl shadow-zinc-950/10 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:shadow-black/35">
        <ControlButton
          label={`${t('edit.nav.prevPage')}（←）`}
          disabled={!canPrevious}
          onClick={onPrevious}
        >
          <ChevronLeft className="size-5" />
        </ControlButton>

        <button
          ref={currentButtonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={pageMenuOpen}
          onClick={() => setPageMenuOpen((open) => !open)}
          className="flex h-9 min-w-24 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold tabular-nums text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
          title="点击跳转页面"
        >
          <span className="text-violet-600 dark:text-violet-400">{currentIndex + 1}</span>
          <span className="font-normal text-zinc-400">/</span>
          <span>{pageCount}</span>
        </button>

        <ControlButton
          label={`${t('edit.nav.nextPage')}（→）`}
          disabled={!canNext}
          onClick={onNext}
        >
          <ChevronRight className="size-5" />
        </ControlButton>

        <div className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

        <ControlButton
          label={isPresenting ? t('stage.exitFullscreen') : t('stage.fullscreen')}
          onClick={onTogglePresentation}
        >
          {isPresenting ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-xl text-zinc-600 transition-all hover:bg-zinc-100 hover:text-zinc-950 active:scale-95 disabled:pointer-events-none disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
      {...props}
    >
      {children}
    </button>
  );
}
