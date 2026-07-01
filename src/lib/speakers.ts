// 화자(Speaker) 6색 팔레트 — 디자인 토큰 --spk-1..6 와 1:1.
// 7명 이상이면 1번부터 순환.

export const SPEAKER_COUNT = 6;

/** 화자 라벨에서 0-기반 인덱스를 뽑는다 (SPEAKER_00, 화자1, 0 등 모두 처리). */
export function getSpeakerIndex(speaker: string): number {
  const num = parseInt(speaker.replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(num) ? 0 : num;
}

/** 화자 라벨 → CSS 변수 (예: 'var(--spk-2)'). 칩/바/도트에 공통 사용. */
export function getSpeakerColorVar(speaker: string): string {
  const idx = getSpeakerIndex(speaker) % SPEAKER_COUNT;
  return `var(--spk-${idx + 1})`;
}

/** 화자 라벨 표시용: SPEAKER_00 / 화자0 → "화자 A". 사용자 지정 이름은 그대로. */
export function formatSpeakerName(speaker: string, overrides?: Record<string, string>): string {
  if (overrides && overrides[speaker]) return overrides[speaker];
  const match = speaker.match(/^(?:SPEAKER[_\s]?)?(\d+)$/i) || speaker.match(/^화자\s*(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return `화자 ${String.fromCharCode(65 + (num % 26))}`;
  }
  return speaker;
}
