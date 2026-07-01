/** 초 → mm:ss (타임스탬프/재생시간; tabular 모노로 표시) */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 초 → "N분" (대시보드 길이 요약) */
export function formatDuration(seconds: number): string {
  const mins = Math.floor((seconds || 0) / 60);
  if (mins < 1) return `${Math.floor(seconds || 0)}초`;
  return `${mins}분`;
}

/** ISO/날짜 문자열 → 한국어 날짜 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
