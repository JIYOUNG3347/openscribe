import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, LayoutDashboard, Settings, Moon, Sun, FileText, CornerDownLeft } from 'lucide-react';
import type { MeetingRecord, Page } from '../App';
import { listMeetings } from '../api/meetings';
import { useTheme } from '../theme';
import { cx } from './ds';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  meetings: MeetingRecord[];
  onNavigate: (page: Page) => void;
  onOpenMeeting: (id: string) => void;
}

export function CommandPalette({
  open,
  onClose,
  meetings,
  onNavigate,
  onOpenMeeting,
}: CommandPaletteProps) {
  const { resolved, toggle } = useTheme();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [meetingResults, setMeetingResults] = useState<MeetingRecord[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 회의 검색: 대시보드와 동일한 백엔드 검색 재사용 (빈 쿼리는 최근 목록)
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const data = term ? await listMeetings({ q: term }) : meetings;
        if (!cancelled) setMeetingResults(data.slice(0, 6));
      } catch {
        if (!cancelled) setMeetingResults([]);
      }
    }, term ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, meetings]);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions: CommandItem[] = [
      { id: 'a-create', label: '새 회의 만들기', icon: Plus, run: () => run(() => onNavigate('create')) },
      { id: 'a-dash', label: '대시보드로 이동', icon: LayoutDashboard, run: () => run(() => onNavigate('dashboard')) },
      { id: 'a-settings', label: '설정 열기', icon: Settings, run: () => run(() => onNavigate('settings')) },
      {
        id: 'a-theme',
        label: resolved === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환',
        icon: resolved === 'dark' ? Sun : Moon,
        run: () => run(toggle),
      },
    ].filter((a) => !q || a.label.toLowerCase().includes(q));

    const matched = meetingResults.map<CommandItem>((m) => ({
      id: `m-${m.id}`,
      label: m.title,
      hint: m.date,
      icon: FileText,
      run: () => run(() => onOpenMeeting(m.id)),
    }));

    const out: { label: string; items: CommandItem[] }[] = [];
    if (actions.length) out.push({ label: '액션', items: actions });
    if (matched.length) out.push({ label: '회의', items: matched });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, meetingResults, resolved]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // keep selection in range
  useEffect(() => {
    if (selected >= flat.length) setSelected(0);
  }, [flat.length, selected]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => (flat.length ? (s + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flat[selected]?.run();
    }
  };

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[560px] bg-surface border border-line rounded-palette shadow-modal overflow-hidden">
        {/* Search */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search className="w-5 h-5 text-ink-faint flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="회의 검색 또는 명령 실행…"
            className="flex-1 bg-transparent outline-none text-base text-ink placeholder:text-ink-faint"
          />
          <kbd className="text-[11px] font-mono text-ink-faint bg-muted border border-line rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          {flat.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-faint">결과가 없습니다</div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="px-2 pb-1">
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const isSel = idx === selected;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setSelected(idx)}
                      onClick={item.run}
                      className={cx(
                        'w-full flex items-center gap-3 px-2 py-2 rounded-control text-left transition-colors',
                        isSel ? 'bg-subtle' : 'hover:bg-subtle'
                      )}
                    >
                      <Icon className="w-4 h-4 text-ink-soft flex-shrink-0" />
                      <span className="flex-1 text-sm text-ink truncate">{item.label}</span>
                      {item.hint && <span className="text-xs text-ink-faint tabular">{item.hint}</span>}
                      {isSel && <CornerDownLeft className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
