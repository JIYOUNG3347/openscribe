import { useEffect, useState } from 'react';
import { Plus, Search, Calendar, Clock, Users, CheckCircle, Loader2, FileText, Trash2 } from 'lucide-react';
import type { MeetingRecord } from '../App';
import { deleteMeeting, listMeetings } from '../api/meetings';
import { Button, IconButton, StatusBadge, cx } from './ds';
import { formatDuration, formatDate } from '../lib/format';

interface DashboardProps {
  meetings: MeetingRecord[];
  onCreateNew: () => void;
  onViewMeeting: (id: string) => void;
  onSettings: () => void;
  onRefresh?: () => void;
}

type Status = MeetingRecord['status'];

// 상태 필터 칩 — 디자인 §2.4 상태색 토큰
const STATUS_OPTIONS: { value: Status; label: string; sel: string; dot: string }[] = [
  { value: 'queued', label: '대기중', sel: 'bg-subtle text-ink-faint border-line-strong', dot: 'bg-ink-faint' },
  { value: 'processing', label: '처리중', sel: 'bg-accent-subtle text-accent border-accent-border', dot: 'bg-accent' },
  { value: 'completed', label: '완료', sel: 'bg-success-subtle text-success border-success', dot: 'bg-success' },
  { value: 'failed', label: '실패', sel: 'bg-danger-subtle text-danger border-danger', dot: 'bg-danger' },
];

export function Dashboard({ meetings, onCreateNew, onViewMeeting, onRefresh }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<Status[]>([]);
  const [filterEngine, setFilterEngine] = useState<string>('all');
  const [results, setResults] = useState<MeetingRecord[] | null>(null);
  const [searching, setSearching] = useState(false);

  const hasFilter = searchQuery.trim() !== '' || statusFilters.length > 0;

  // 검색/상태 필터는 백엔드에서 (debounce). 필터가 없으면 prop(meetings) 사용.
  useEffect(() => {
    if (!hasFilter) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await listMeetings({ q: searchQuery, status: statusFilters });
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, statusFilters, hasFilter]);

  const toggleStatus = (s: Status) =>
    setStatusFilters((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilters([]);
    setFilterEngine('all');
  };

  const getEngineLabel = (engine: string) =>
    ({ whisper: 'Whisper', clova: 'CLOVA', riva: 'Riva' } as Record<string, string>)[engine] || engine;

  const getEngineBadge = (engine: string) =>
    ({
      whisper: 'bg-accent-subtle text-accent',
      clova: 'bg-success-subtle text-success',
      riva: 'bg-info-subtle text-info',
    } as Record<string, string>)[engine] || 'bg-subtle text-ink-soft';

  // 표시 목록: 필터 있으면 백엔드 결과, 없으면 전체. 엔진 필터는 클라이언트에서.
  const base = hasFilter ? results ?? [] : meetings;
  const displayed = filterEngine === 'all' ? base : base.filter((m) => m.engine === filterEngine);
  const isFiltered = hasFilter || filterEngine !== 'all';

  const activeCount = meetings.filter((m) => m.status === 'processing' || m.status === 'queued').length;
  const hasProcessing = meetings.some((m) => m.status === 'processing');

  const stats = [
    { label: '전체 회의록', value: meetings.length, icon: Calendar, color: 'text-accent', bg: 'bg-accent-subtle' },
    {
      label: '대기/처리중',
      value: activeCount,
      icon: hasProcessing ? Loader2 : Clock,
      color: 'text-warning',
      bg: 'bg-warning-subtle',
      spin: hasProcessing,
    },
    {
      label: '완료',
      value: meetings.filter((m) => m.status === 'completed').length,
      icon: CheckCircle,
      color: 'text-success',
      bg: 'bg-success-subtle',
    },
  ];

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-7">
      {/* Context header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink mb-1">대시보드</h1>
          <p className="text-sm text-ink-soft">생성된 회의록을 관리하고 새로운 회의록을 만드세요</p>
        </div>
        <Button variant="primary" onClick={onCreateNew}>
          <Plus className="w-4 h-4" />
          새 회의록
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-surface border border-line rounded-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-ink-faint uppercase tracking-wider mb-1">{stat.label}</div>
                  <div className="text-2xl font-semibold text-ink font-mono tabular">{stat.value}</div>
                </div>
                <div className={cx('w-12 h-12 rounded-card flex items-center justify-center', stat.bg)}>
                  <Icon className={cx('w-6 h-6', stat.color, 'spin' in stat && stat.spin && 'animate-spin')} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-surface border border-line rounded-card p-4 mb-6 space-y-3">
        {/* search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
          <input
            type="text"
            placeholder="제목·전사 내용·회의록 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-9 rounded-control bg-surface border border-line-strong text-sm text-ink focus-ring focus:border-accent transition-colors"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint animate-spin" />
          )}
        </div>

        {/* status chips (multi-select) + engine + reset */}
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const on = statusFilters.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggleStatus(opt.value)}
                aria-pressed={on}
                className={cx(
                  'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] font-medium transition-colors focus-ring',
                  on ? opt.sel : 'bg-surface text-ink-soft border-line hover:bg-subtle'
                )}
              >
                <span className={cx('w-1.5 h-1.5 rounded-full', on ? opt.dot : 'bg-ink-faint')} />
                {opt.label}
              </button>
            );
          })}

          <select
            value={filterEngine}
            onChange={(e) => setFilterEngine(e.target.value)}
            className="ml-auto h-8 px-3 rounded-control bg-surface border border-line-strong text-[13px] text-ink focus-ring focus:border-accent transition-colors"
          >
            <option value="all">모든 엔진</option>
            <option value="whisper">Whisper</option>
            <option value="clova">CLOVA</option>
            <option value="riva">Riva</option>
          </select>

          {isFiltered && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              필터 초기화
            </Button>
          )}
        </div>
      </div>

      {/* Meeting List */}
      {searching && displayed.length === 0 ? (
        <div className="bg-surface border border-line rounded-card p-16 text-center">
          <Loader2 className="w-6 h-6 text-ink-faint animate-spin mx-auto mb-3" />
          <p className="text-[13px] text-ink-soft">검색 중...</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-surface border border-line rounded-card p-16 text-center">
          <div className="w-16 h-16 bg-subtle rounded-card flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-ink-faint" />
          </div>
          {isFiltered ? (
            <>
              <h3 className="text-[15px] font-semibold text-ink mb-2">검색 결과가 없습니다</h3>
              <p className="text-[13px] text-ink-soft mb-6">다른 검색어나 상태로 다시 시도해보세요</p>
              <Button variant="secondary" onClick={resetFilters} className="mx-auto">
                필터 초기화
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-[15px] font-semibold text-ink mb-2">회의록이 없습니다</h3>
              <p className="text-[13px] text-ink-soft mb-6">새로운 회의록을 만들어보세요</p>
              <Button variant="primary" onClick={onCreateNew} className="mx-auto">
                <Plus className="w-4 h-4" />
                새 회의록 만들기
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-card overflow-hidden">
          {displayed.map((meeting) => (
            <div
              key={meeting.id}
              onClick={() => onViewMeeting(meeting.id)}
              className="group flex items-center gap-4 px-5 min-h-[56px] py-3 border-b border-line last:border-b-0 cursor-pointer hover:bg-subtle transition-colors"
            >
              {/* 제목 + 날짜 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink truncate">{meeting.title}</div>
                <div className="text-[13px] text-ink-soft font-mono tabular mt-0.5">{formatDate(meeting.date)}</div>
              </div>

              {/* 길이/화자 chips */}
              <div className="hidden sm:flex items-center gap-3 text-[13px] text-ink-soft shrink-0">
                {meeting.duration > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-ink-faint" />
                    <span className="font-mono tabular">{formatDuration(meeting.duration)}</span>
                  </span>
                )}
                {meeting.speakerCount > 1 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-ink-faint" />
                    <span className="font-mono tabular">{meeting.speakerCount}명</span>
                  </span>
                )}
              </div>

              {/* engine chip */}
              <span
                className={cx(
                  'hidden md:inline-flex items-center px-2 py-0.5 rounded-control text-xs font-medium shrink-0',
                  getEngineBadge(meeting.engine)
                )}
              >
                {getEngineLabel(meeting.engine)}
              </span>

              {/* 상태 */}
              <div className="shrink-0 w-[120px] flex flex-col items-start">
                <StatusBadge status={meeting.status} />
                {meeting.status === 'processing' && meeting.progress !== undefined && meeting.progress > 0 && (
                  <div className="w-24 mt-1.5">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${meeting.progress}%` }} />
                    </div>
                    <div className="text-xs text-ink-faint font-mono tabular mt-1">{meeting.progress}%</div>
                  </div>
                )}
                {meeting.status === 'failed' && meeting.errorMessage && (
                  <div className="text-xs text-danger mt-1 max-w-48 truncate" title={meeting.errorMessage}>
                    {meeting.errorMessage}
                  </div>
                )}
              </div>

              {/* delete */}
              <IconButton
                size="sm"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm('이 회의록을 삭제하시겠습니까?')) {
                    try {
                      await deleteMeeting(meeting.id);
                      onRefresh?.();
                    } catch (err) {
                      console.error('Delete failed:', err);
                    }
                  }
                }}
                title="삭제"
                className="shrink-0 text-ink-faint hover:text-danger opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
