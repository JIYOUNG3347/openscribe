import React, { useRef } from 'react';
import { Play, Pause, X } from 'lucide-react';
import { useAudioPlayer } from '../audio/AudioPlayerContext';
import { formatClock } from '../lib/format';
import { IconButton, cx } from './ds';

/**
 * 시그니처: 하단 sticky 파형 스크러버.
 * 미재생 막대는 --border-strong, 재생 완료 구간은 --accent.
 * 클릭/드래그로 seek. 오디오가 로드되지 않으면 렌더 안 함.
 */
export function PlayerBar() {
  const player = useAudioPlayer();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  if (!player.src) return null;

  const { peaks, duration, currentTime, isPlaying, title, playbackRate } = player;
  const progress = duration > 0 ? currentTime / duration : 0;

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    player.seekFraction(frac);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingRef.current) seekFromEvent(e.clientX);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  // 막대가 없으면(디코딩 실패/진행 중) 균일한 가는 막대로 폴백.
  const bars = peaks.length > 0 ? peaks : Array.from({ length: 120 }, () => 0.25);

  return (
    <div className="flex-shrink-0 z-30 bg-surface border-t border-line shadow-player">
      <div className="max-w-[1100px] mx-auto px-4 lg:px-6 h-[68px] flex items-center gap-4">
        {/* 재생/일시정지 */}
        <button
          onClick={player.toggle}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent-hover transition-colors focus-ring"
          title={isPlaying ? '일시정지' : '재생'}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>

        {/* 파형 스크러버 */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {title && (
            <div className="text-[12px] text-ink-faint truncate leading-none">{title}</div>
          )}
          <div
            ref={trackRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative h-9 flex items-center gap-[2px] cursor-pointer select-none"
          >
            {bars.map((amp, i) => {
              const played = i / bars.length <= progress;
              const h = Math.max(3, Math.round(amp * 34));
              return (
                <div
                  key={i}
                  className={cx('wave-bar flex-1', played && 'played')}
                  style={{ height: `${h}px`, minWidth: '1px' }}
                />
              );
            })}
          </div>
        </div>

        {/* 시간 (mono tabular) */}
        <div className="flex-shrink-0 font-mono text-[13px] text-ink-soft tabular">
          {formatClock(currentTime)} <span className="text-ink-faint">/ {formatClock(duration)}</span>
        </div>

        {/* 배속 */}
        <button
          onClick={player.cyclePlaybackRate}
          className="flex-shrink-0 px-2 h-7 rounded-control text-[13px] font-medium text-ink-soft hover:bg-subtle transition-colors focus-ring tabular"
          title="재생 속도"
        >
          {playbackRate}×
        </button>

        {/* 닫기 */}
        <IconButton size="sm" onClick={player.unload} title="플레이어 닫기">
          <X className="w-4 h-4" />
        </IconButton>
      </div>
    </div>
  );
}
