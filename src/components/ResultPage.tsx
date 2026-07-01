import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Download, Copy, RefreshCw, Edit3, Eye, CheckCircle, Plus, Trash2, Save, X,
  Sparkles, GripVertical, Loader2, AlertCircle, FileText, Palette, MessageSquareText, FileCheck, Play,
} from 'lucide-react';
import type { MeetingRecord, Template, TranscriptionData, TemplateSection } from '../App';
import { MarkdownRenderer } from './MarkdownRenderer';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { generateNotes, exportMeeting, fetchLLMModels, meetingAudioUrl, updateSpeakerNames, updateMeeting } from '../api/meetings';
import { useAudioPlayer } from '../audio/AudioPlayerContext';
import { formatClock, formatDate } from '../lib/format';
import { formatSpeakerName, getSpeakerColorVar } from '../lib/speakers';
import { Button, IconButton, Segmented, SpeakerChip, cx } from './ds';

interface ResultPageProps {
  meeting: MeetingRecord;
  templates: Template[];
  onTemplatesChange: (templates: Template[]) => void;
  onBack: () => void;
  onSave: (meetingId: string, updates: Partial<MeetingRecord>) => void;
}

type ViewMode = 'side-by-side' | 'transcript-only' | 'notes-only';
type LLMModel = string;

// 사용자 지정 섹션 색 (사용자 데이터이므로 토큰화하지 않음)
const SECTION_COLORS = [
  { id: 'green', value: '#00754A' },
  { id: 'teal', value: '#2C7D72' },
  { id: 'amber', value: '#C2710C' },
  { id: 'rose', value: '#B34A73' },
  { id: 'plum', value: '#7A5E9C' },
  { id: 'gold', value: '#A87B2C' },
  { id: 'house', value: '#1E3932' },
  { id: 'slate', value: '#6B6256' },
];

interface DraggableSectionProps {
  section: TemplateSection;
  index: number;
  moveSection: (dragIndex: number, hoverIndex: number) => void;
  onUpdate: (updates: Partial<TemplateSection>) => void;
  onDelete: () => void;
}

const DraggableSection: React.FC<DraggableSectionProps> = ({ section, index, moveSection, onUpdate, onDelete }) => {
  const [showColors, setShowColors] = useState(false);

  const [{ isDragging }, drag, preview] = useDrag({
    type: 'section',
    item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: 'section',
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        moveSection(item.index, index);
        item.index = index;
      }
    },
  });

  return (
    <div
      ref={(node) => preview(drop(node))}
      className={cx('bg-surface border border-line rounded-control overflow-hidden', isDragging && 'opacity-50')}
      style={section.color ? { borderLeftWidth: '3px', borderLeftColor: section.color } : {}}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div ref={drag} className="cursor-move p-1 hover:bg-subtle rounded-control flex-shrink-0">
            <GripVertical className="w-4 h-4 text-ink-faint" />
          </div>
          <input
            type="text"
            value={section.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="섹션 이름"
            className="flex-1 px-2 py-1.5 border border-line rounded-control text-sm font-medium bg-surface text-ink focus-ring focus:border-accent"
          />
          <select
            value={section.heading_level || 2}
            onChange={(e) => onUpdate({ heading_level: Number(e.target.value) })}
            className="w-[64px] px-2 py-1.5 border border-line rounded-control text-xs bg-surface text-ink-soft focus-ring"
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
          </select>
          <IconButton size="sm" onClick={onDelete} title="삭제" className="hover:text-danger">
            <Trash2 className="w-3.5 h-3.5" />
          </IconButton>
        </div>
        <div className="flex items-center gap-2 pl-8">
          <select
            value={section.type}
            onChange={(e) => onUpdate({
              type: e.target.value as 'llm_generate' | 'raw_transcript',
              prompt: e.target.value === 'raw_transcript' ? null : (section.prompt || ''),
            })}
            className="flex-1 px-2 py-1.5 border border-line rounded-control text-xs bg-surface text-ink-soft focus-ring"
          >
            <option value="llm_generate">LLM 생성</option>
            <option value="raw_transcript">원본 텍스트</option>
          </select>
          <button
            onClick={() => setShowColors(!showColors)}
            className={cx('flex items-center gap-1 px-2 py-1.5 rounded-control text-xs transition-colors focus-ring',
              showColors ? 'bg-subtle text-ink' : 'hover:bg-subtle text-ink-faint')}
          >
            {section.color ? (
              <span className="w-3.5 h-3.5 rounded-full border border-line" style={{ backgroundColor: section.color }} />
            ) : (
              <Palette className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        {showColors && (
          <div className="flex items-center gap-1.5 pl-8 py-1">
            <button
              onClick={() => { onUpdate({ color: undefined }); setShowColors(false); }}
              className={cx('w-5 h-5 rounded-full border-2 flex items-center justify-center',
                !section.color ? 'border-ink-faint' : 'border-line hover:border-line-strong')}
              title="색상 없음"
            >
              <X className="w-2.5 h-2.5 text-ink-faint" />
            </button>
            {SECTION_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => { onUpdate({ color: c.value }); setShowColors(false); }}
                className={cx('w-5 h-5 rounded-full border-2 transition-transform',
                  section.color === c.value ? 'border-ink scale-110' : 'border-transparent hover:scale-110')}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        )}
        {section.type === 'llm_generate' && (
          <textarea
            value={section.prompt || ''}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            placeholder="프롬프트 입력..."
            className="w-full px-2 py-1.5 ml-8 border border-line rounded-control text-xs bg-surface text-ink-soft placeholder:text-ink-faint focus-ring resize-none"
            style={{ width: 'calc(100% - 2rem)' }}
            rows={2}
          />
        )}
      </div>
    </div>
  );
};

export function ResultPage({ meeting, templates, onTemplatesChange, onBack, onSave }: ResultPageProps) {
  const player = useAudioPlayer();
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [mobileTab, setMobileTab] = useState<'transcript' | 'notes'>('transcript');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState(meeting.notes || '');
  // 화자 이름은 segments 를 변형하지 않고 speakerNames 오버레이로 처리(원본 라벨=색 고정 유지)
  const [transcription] = useState<TranscriptionData>(
    meeting.transcription || { segments: [], options: { timestampEnabled: true, diarizationEnabled: true } }
  );
  // 화자 라벨(SPEAKER_00) → 표시 이름 매핑 (서버 저장). 색은 원본 라벨 인덱스로 고정.
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(meeting.speakerNames || {});
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [copied, setCopied] = useState(false);
  const [showRegen, setShowRegen] = useState(false);
  const [regenProvider, setRegenProvider] = useState<string>('OpenAI');
  const [prevNotes, setPrevNotes] = useState<string | null>(null); // 직전 1개 되돌리기용
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || '');
  const [selectedModel, setSelectedModel] = useState<LLMModel>('gemma-3-4b-it'); // 기본 LLM
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [llmModels, setLlmModels] = useState<{ id: LLMModel; name: string; provider: string; reasoning?: boolean }[]>([
    { id: 'gemma-3-4b-it', name: 'Gemma 3 4B', provider: 'Local' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const escRef = useRef(false); // Esc 로 빠져나온 blur 는 저장하지 않기 위함

  useEffect(() => {
    fetchLLMModels()
      .then((models) => {
        setLlmModels(models);
        // 기본은 로컬 LLM; 응답에 현재 선택 모델이 없을 때만 첫 번째로 대체
        setSelectedModel((prev) => (models.some((m) => m.id === prev) ? prev : models[0]?.id || prev));
      })
      .catch(() => {});
  }, []);

  // Load this meeting's audio into the persistent player.
  useEffect(() => {
    player.load(meetingAudioUrl(meeting.id), meeting.id, meeting.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  const segments = transcription.segments;

  // 현재 재생 중인 발화 줄 (오디오 currentTime과 동기화)
  const activeIdx = useMemo(() => {
    if (player.key !== meeting.id) return -1;
    if (!player.isPlaying && player.currentTime === 0) return -1;
    const t = player.currentTime + 0.2;
    let idx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= t) idx = i;
      else break;
    }
    return idx;
  }, [player.currentTime, player.isPlaying, player.key, meeting.id, segments]);

  // 재생 중이면 현재 줄로 자동 스크롤
  useEffect(() => {
    if (activeIdx < 0 || !player.isPlaying) return;
    rowRefs.current[activeIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx, player.isPlaying]);

  const jumpTo = (start: number) => {
    player.seek(start);
    player.play();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(notes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async (format: 'md' | 'pdf' | 'docx') => {
    try {
      let blob: Blob;
      if (format === 'md') {
        blob = new Blob([notes], { type: 'text/markdown' });
      } else {
        blob = await exportMeeting(meeting.id, format);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meeting.title}_회의록.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`다운로드 실패: ${e.message}`);
    }
  };

  // 표시 이름: 사용자 매핑 우선, 없으면 기본(화자 A) — 같은 화자는 모든 줄에 일괄 반영됨.
  const speakerLabel = (key: string) => formatSpeakerName(key, speakerNames);

  const startEditSpeaker = (key: string) => {
    setEditingSpeaker(key);
    setDraftName(speakerLabel(key));
  };
  const cancelEditSpeaker = () => {
    setEditingSpeaker(null);
    setDraftName('');
  };
  const commitSpeakerName = async (key: string) => {
    setEditingSpeaker(null);
    const name = draftName.trim();
    const prev = speakerNames;
    // 빈 값/기본값과 동일 → 매핑 제거(기본 라벨로 복귀), 그 외 → 매핑 설정
    const next: Record<string, string> = { ...prev };
    if (!name || name === formatSpeakerName(key)) delete next[key];
    else next[key] = name;
    if (JSON.stringify(next) === JSON.stringify(prev)) return; // 변화 없음 → no-op
    setSpeakerNames(next); // 낙관적 업데이트
    try {
      await updateSpeakerNames(meeting.id, next);
    } catch (e: any) {
      setSpeakerNames(prev); // 저장 실패 → 롤백
      alert(`화자 이름 저장 실패: ${e.message}`);
    }
  };

  const handleCreateTemplate = () => {
    const newTemplate: Template = { id: `template_${Date.now()}`, name: '새 템플릿', isDefault: false, sections: [] };
    onTemplatesChange([...templates, newTemplate]);
    setEditingTemplate(newTemplate);
  };

  const handleSaveTemplate = (template: Template) => {
    onTemplatesChange(templates.map((t) => (t.id === template.id ? template : t)));
    setEditingTemplate(null);
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (window.confirm('이 템플릿을 삭제하시겠습니까?')) {
      onTemplatesChange(templates.filter((t) => t.id !== templateId));
      if (selectedTemplateId === templateId) setSelectedTemplateId(templates[0]?.id || '');
      setEditingTemplate(null);
    }
  };

  const handleAddSection = (template: Template) => {
    setEditingTemplate({
      ...template,
      sections: [...template.sections, { key: `section_${Date.now()}`, label: '새 섹션', type: 'llm_generate', prompt: '' }],
    });
  };

  const handleUpdateSection = (template: Template, sectionKey: string, updates: Partial<TemplateSection>) => {
    setEditingTemplate({ ...template, sections: template.sections.map((s) => (s.key === sectionKey ? { ...s, ...updates } : s)) });
  };

  const handleDeleteSection = (template: Template, sectionKey: string) => {
    setEditingTemplate({ ...template, sections: template.sections.filter((s) => s.key !== sectionKey) });
  };

  const handleMoveSection = (template: Template, dragIndex: number, hoverIndex: number) => {
    const sections = [...template.sections];
    const [removed] = sections.splice(dragIndex, 1);
    sections.splice(hoverIndex, 0, removed);
    setEditingTemplate({ ...template, sections });
  };

  // 오디오 재업로드/재STT 없이 기존 transcription 으로 notes 만 (재)생성
  const handleGenerateNotes = async () => {
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
    if (!selectedTemplate) return;
    const previous = notes; // 실패 시 보존 + 성공 시 되돌리기용
    setIsGenerating(true);
    try {
      // 매핑된 표시 이름을 화자에 반영해 회의록/내보내기에도 사람 이름이 나오게 함
      const namedSegments = transcription.segments.map((s) => ({ ...s, speaker: speakerLabel(s.speaker) }));
      const result = await generateNotes({
        meeting_id: meeting.id,
        template_sections: selectedTemplate.sections,
        model_id: selectedModel,
        segments: namedSegments,
        meeting_title: meeting.title,
        meeting_date: meeting.date,
      });
      setNotes(result.notes); // 덮어쓰기 (transcription 은 불변)
      if (previous) setPrevNotes(previous); // 직전 버전 1개 되돌리기 가능
      setShowRegen(false);
      // 생성 즉시 영속화 → 대시보드로 나갔다 재접속해도 유지(재생성 전까지 보존)
      await onSave(meeting.id, { notes: result.notes, templateId: selectedTemplateId });
    } catch (e: any) {
      // 실패 → notes 미변경(기존 보존), 모달 유지
      alert(`회의록 생성 실패: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const openRegen = () => {
    if (!templates.find((t) => t.id === selectedTemplateId)) setSelectedTemplateId(templates[0]?.id || '');
    const cur = llmModels.find((m) => m.id === selectedModel);
    setRegenProvider(cur?.provider || llmModels[0]?.provider || 'OpenAI');
    setEditingTemplate(null);
    setShowRegen(true);
  };

  const onRegenProvider = (p: string) => {
    setRegenProvider(p);
    const first = llmModels.find((m) => m.provider === p);
    if (first) setSelectedModel(first.id);
  };

  const undoRegen = () => {
    if (prevNotes === null) return;
    const restored = prevNotes;
    setNotes(restored);
    setPrevNotes(null);
    // 되돌린 내용도 영속화(생성과 대칭)
    onSave(meeting.id, { notes: restored });
  };

  const handleSave = async () => {
    await onSave(meeting.id, { notes, transcription });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // 액션아이템 체크박스 토글 → notes 의 N번째 체크리스트 마커를 뒤집고 낙관적 저장
  const toggleActionItem = async (index: number) => {
    let count = -1;
    let changed = false;
    const updated = notes
      .split('\n')
      .map((line) => {
        const m = line.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s*.+)$/);
        if (!m) return line;
        count++;
        if (count !== index) return line;
        changed = true;
        return `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}`;
      })
      .join('\n');
    if (!changed) return;
    const prev = notes;
    setNotes(updated); // 낙관적 반영
    try {
      await updateMeeting(meeting.id, { notes: updated }); // 즉시 저장
    } catch (e: any) {
      setNotes(prev); // 실패 → 롤백
      alert(`저장 실패: ${e.message}`);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const providers = Array.from(new Set(llmModels.map((m) => m.provider)));
  const providerModels = llmModels.filter((m) => m.provider === regenProvider);

  const inputCls = 'w-full px-3 py-2 border border-line-strong rounded-control text-sm bg-surface text-ink focus-ring focus:border-accent';

  const renderTemplateEditor = () => (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">템플릿 이름</label>
          <input
            type="text"
            value={editingTemplate!.name}
            onChange={(e) => setEditingTemplate({ ...editingTemplate!, name: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-ink-soft">섹션 ({editingTemplate!.sections.length})</label>
            <button
              onClick={() => handleAddSection(editingTemplate!)}
              className="text-xs text-accent-ink hover:text-accent font-medium flex items-center gap-1 focus-ring rounded"
            >
              <Plus className="w-3 h-3" /> 추가
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {editingTemplate!.sections.map((section, index) => (
              <DraggableSection
                key={section.key}
                section={section}
                index={index}
                moveSection={(di, hi) => handleMoveSection(editingTemplate!, di, hi)}
                onUpdate={(u) => handleUpdateSection(editingTemplate!, section.key, u)}
                onDelete={() => handleDeleteSection(editingTemplate!, section.key)}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t border-line">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => setEditingTemplate(null)}>취소</Button>
          {!editingTemplate!.isDefault && (
            <Button variant="danger" size="sm" onClick={() => handleDeleteTemplate(editingTemplate!.id)}>삭제</Button>
          )}
          <Button variant="primary" size="sm" className="flex-1" onClick={() => handleSaveTemplate(editingTemplate!)}>
            <Save className="w-3 h-3" /> 저장
          </Button>
        </div>
      </div>
    </DndProvider>
  );

  const renderTranscript = () => (
    <div className="bg-surface border border-line rounded-card shadow-card flex flex-col overflow-hidden h-full">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-accent-subtle rounded-control flex items-center justify-center">
            <MessageSquareText className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-ink text-sm">발화록</h3>
            <span className="text-xs text-ink-faint">{segments.length}개 발화</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {segments.map((segment, idx) => {
          const prevSpeaker = idx > 0 ? segments[idx - 1].speaker : null;
          const showSpeaker = transcription.options.diarizationEnabled && segment.speaker !== prevSpeaker;
          const isActive = idx === activeIdx;
          const diar = transcription.options.diarizationEnabled;
          return (
            <div key={idx} ref={(el) => { rowRefs.current[idx] = el; }}>
              {showSpeaker && (
                <div className="mt-3 mb-1 px-2">
                  {editingSpeaker === segment.speaker ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur(); // → onBlur 에서 저장
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          escRef.current = true;
                          e.currentTarget.blur(); // → onBlur 에서 취소
                        }
                      }}
                      onBlur={() => {
                        if (escRef.current) {
                          escRef.current = false;
                          cancelEditSpeaker();
                        } else {
                          commitSpeakerName(segment.speaker);
                        }
                      }}
                      aria-label="화자 이름 편집 (Enter 저장 / Esc 취소)"
                      style={{
                        ['--spk' as string]: getSpeakerColorVar(segment.speaker),
                        color: 'var(--spk)',
                        borderColor: 'var(--spk)',
                      } as React.CSSProperties}
                      className="inline-flex h-6 w-36 rounded-full border bg-surface px-2.5 text-[13px] font-medium outline-none focus-ring"
                    />
                  ) : (
                    <SpeakerChip
                      speaker={segment.speaker}
                      label={speakerLabel(segment.speaker)}
                      onClick={() => startEditSpeaker(segment.speaker)}
                    />
                  )}
                </div>
              )}
              <div
                className={cx(
                  'group flex gap-2 px-2 py-1.5 rounded-r-md transition-colors',
                  isActive ? 'bg-accent-subtle' : 'hover:bg-subtle'
                )}
                style={{
                  borderLeft: '2px solid',
                  borderLeftColor: isActive
                    ? 'var(--accent)'
                    : diar
                    ? `color-mix(in srgb, ${getSpeakerColorVar(segment.speaker)} 35%, transparent)`
                    : 'transparent',
                }}
              >
                {transcription.options.timestampEnabled && (
                  <button
                    type="button"
                    onClick={() => jumpTo(segment.start)}
                    aria-label={`재생: ${formatClock(segment.start)}`}
                    className="flex-shrink-0 mt-0.5 inline-flex items-center gap-1 font-mono tabular text-[12px] text-accent-ink hover:underline focus-ring rounded cursor-pointer"
                    title="이 지점부터 재생"
                  >
                    <Play className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                    {formatClock(segment.start)}
                  </button>
                )}
                <span className="text-ink text-[15px] leading-[1.7] select-text">{segment.text}</span>
              </div>
            </div>
          );
        })}
        {segments.length === 0 && (
          <div className="text-center py-16 text-sm text-ink-faint">발화록이 없습니다</div>
        )}
      </div>
    </div>
  );

  const renderNotes = () => (
    <div className="bg-surface border border-line rounded-card shadow-card flex flex-col overflow-hidden h-full">
      {!notes ? (
        <div className="p-8 flex-1 min-h-0 overflow-y-auto">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-accent-subtle rounded-card flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-ink mb-1.5">AI 회의록 생성</h3>
            <p className="text-sm text-ink-soft">발화록을 기반으로 회의록을 자동 생성합니다</p>
          </div>

          {editingTemplate ? (
            <div className="p-4 bg-subtle rounded-card border border-line">{renderTemplateEditor()}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint mb-2">템플릿</label>
                  <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className={inputCls}>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.sections.length}개 섹션)</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint mb-2">LLM 모델</label>
                  <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value as LLMModel)} className={inputCls}>
                    {llmModels.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                  </select>
                </div>
              </div>

              {selectedTemplate && (
                <div className="mb-5 p-4 bg-subtle border border-line rounded-card">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-ink-soft">포함 섹션</span>
                    <button
                      onClick={() => setEditingTemplate(templates.find((t) => t.id === selectedTemplateId) || null)}
                      className="text-xs text-accent-ink hover:text-accent font-medium focus-ring rounded"
                    >
                      편집
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.sections.map((s) => (
                      <span key={s.key} className="inline-flex items-center px-2.5 py-1 bg-surface border border-line rounded-control text-xs font-medium text-ink-soft">
                        {s.color ? (
                          <span className="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0" style={{ backgroundColor: s.color }} />
                        ) : s.type === 'llm_generate' ? (
                          <Sparkles className="w-3 h-3 mr-1 text-accent" />
                        ) : (
                          <FileText className="w-3 h-3 mr-1 text-ink-faint" />
                        )}
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleCreateTemplate}>
                  <Plus className="w-4 h-4" /> 새 템플릿
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  onClick={handleGenerateNotes}
                  disabled={isGenerating || meeting.status === 'failed'}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isGenerating ? '회의록 생성 중...' : '회의록 생성하기'}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-success-subtle rounded-control flex items-center justify-center">
                <FileCheck className="w-4 h-4 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-ink text-sm">회의록</h3>
                <span className="text-xs text-success">생성 완료</span>
              </div>
            </div>
            <div className="flex gap-1 items-center">
              <IconButton onClick={openRegen} title="다시 생성">
                <RefreshCw className="w-4 h-4" />
              </IconButton>
              <IconButton active={isEditingNotes} onClick={() => setIsEditingNotes(!isEditingNotes)} title={isEditingNotes ? '미리보기' : '편집'}>
                {isEditingNotes ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              </IconButton>
            </div>
          </div>

          {/* 재생성 직후 되돌리기 (직전 1개) */}
          {prevNotes !== null && (
            <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-control bg-success-subtle border border-line flex-shrink-0">
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-[13px] text-ink-soft flex-1">회의록을 다시 생성했어요.</span>
              <button
                onClick={undoRegen}
                className="text-[13px] font-medium text-accent-ink hover:text-accent focus-ring rounded px-1"
              >
                되돌리기
              </button>
              <IconButton size="sm" onClick={() => setPrevNotes(null)} title="닫기">
                <X className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {isEditingNotes ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-full min-h-[400px] px-5 py-4 focus:outline-none font-mono text-sm resize-none bg-transparent text-ink"
              />
            ) : (
              <div className="px-5 py-4 prose max-w-none">
                <MarkdownRenderer content={notes} onToggleCheckbox={toggleActionItem} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Context header */}
      <div className="flex-shrink-0 bg-surface border-b border-line">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <IconButton onClick={onBack} title="뒤로"><ArrowLeft className="w-5 h-5" /></IconButton>
              <div className="border-l border-line pl-3 min-w-0">
                <h1 className="text-[15px] font-semibold text-ink leading-tight truncate">{meeting.title}</h1>
                <p className="text-xs text-ink-faint tabular">
                  {formatDate(meeting.date)} · {meeting.speakerCount}명 참석
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden lg:block">
                <Segmented<ViewMode>
                  size="sm"
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: 'side-by-side', label: '나란히' },
                    { value: 'transcript-only', label: '발화록' },
                    { value: 'notes-only', label: '회의록' },
                  ]}
                />
              </div>
              <div className="w-px h-6 bg-line mx-1 hidden lg:block" />

              <IconButton onClick={handleCopy} active={copied} title={copied ? '복사됨!' : '복사'}>
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </IconButton>

              <div className="relative group">
                <IconButton title="내보내기"><Download className="w-4 h-4" /></IconButton>
                <div className="absolute right-0 mt-1 w-44 bg-surface rounded-card shadow-modal border border-line opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 overflow-hidden py-1">
                  {[
                    { format: 'md' as const, label: 'Markdown (.md)' },
                    { format: 'pdf' as const, label: 'PDF (.pdf)' },
                    { format: 'docx' as const, label: 'Word (.docx)' },
                  ].map(({ format, label }) => (
                    <button key={format} onClick={() => handleDownload(format)} className="w-full text-left px-4 py-2 hover:bg-subtle text-sm text-ink-soft flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-ink-faint" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <Button variant="primary" onClick={handleSave} className={cx(saved && '!bg-success hover:!bg-success')}>
                {saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {saved ? '저장됨' : '저장'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Failed banner */}
      {meeting.status === 'failed' && (
        <div className="flex-shrink-0 max-w-[1100px] mx-auto px-4 sm:px-6 mt-4 w-full">
          <div className="p-4 bg-danger-subtle border border-danger rounded-card flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
            <div>
              <div className="font-medium text-danger">처리 실패</div>
              <div className="text-sm text-ink-soft">{meeting.errorMessage || '알 수 없는 오류가 발생했습니다'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Content — fills remaining height; panes scroll internally */}
      <div className="flex-1 min-h-0 w-full max-w-[1100px] mx-auto px-4 sm:px-6 py-5 flex flex-col">
        {/* Desktop (lg+): 2-pane or single per viewMode */}
        <div className="hidden lg:flex flex-1 min-h-0 gap-5">
          {(viewMode === 'side-by-side' || viewMode === 'transcript-only') && (
            <div className={cx('min-h-0', viewMode === 'side-by-side' ? 'flex-1' : 'mx-auto w-full max-w-[760px]')}>
              {renderTranscript()}
            </div>
          )}
          {(viewMode === 'side-by-side' || viewMode === 'notes-only') && (
            <div className={cx('min-h-0', viewMode === 'side-by-side' ? 'flex-1' : 'mx-auto w-full max-w-[760px]')}>
              {renderNotes()}
            </div>
          )}
        </div>

        {/* Tablet/mobile (<lg): tabs → single pane */}
        <div className="lg:hidden flex flex-col flex-1 min-h-0">
          <div className="flex-shrink-0 mb-3">
            <Segmented
              value={mobileTab}
              onChange={setMobileTab}
              options={[
                { value: 'transcript', label: '전사' },
                { value: 'notes', label: '회의록' },
              ]}
            />
          </div>
          <div className="flex-1 min-h-0">
            {mobileTab === 'transcript' ? renderTranscript() : renderNotes()}
          </div>
        </div>
      </div>

      {/* 회의록 다시 생성 모달 (오디오/STT 재실행 없이 notes 만 갱신) */}
      {showRegen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (!isGenerating) setShowRegen(false); }}
          />
          <div className="relative w-full max-w-[480px] bg-surface border border-line rounded-card shadow-modal overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-accent" /> 회의록 다시 생성
              </h3>
              <IconButton size="sm" onClick={() => setShowRegen(false)} disabled={isGenerating} title="닫기">
                <X className="w-4 h-4" />
              </IconButton>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-[13px] text-ink-soft -mt-1">
                기존 발화록을 그대로 사용해 회의록만 다시 만듭니다. (오디오·STT 재실행 없음)
              </p>

              {editingTemplate ? (
                renderTemplateEditor()
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-ink-soft">템플릿</label>
                      <button
                        onClick={() => setEditingTemplate(templates.find((t) => t.id === selectedTemplateId) || null)}
                        className="text-xs text-accent-ink hover:text-accent font-medium focus-ring rounded"
                      >
                        편집
                      </button>
                    </div>
                    <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className={inputCls}>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.sections.length}개 섹션)</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-soft mb-1.5">LLM 프로바이더</label>
                    <Segmented
                      value={regenProvider}
                      onChange={onRegenProvider}
                      options={providers.map((p) => ({ value: p, label: p }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-soft mb-1.5">모델</label>
                    {providerModels.length > 0 ? (
                      <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value as LLMModel)} className={inputCls}>
                        {providerModels.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}{m.reasoning ? ' · 추론형(요약 비권장)' : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-[13px] text-ink-faint px-1 py-2">
                        사용 가능한 모델이 없습니다{regenProvider === 'Ollama' ? ' (Ollama 서버 미연결)' : ''}. 설정에서 구성하세요.
                      </p>
                    )}
                    {providerModels.find((m) => m.id === selectedModel)?.reasoning && (
                      <p className="mt-1.5 text-[12px] text-warning flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>추론(thinking)형 모델은 요약 전 사고에 토큰을 소진해 회의록이 비거나 부실할 수 있습니다. <b>gemma3:4b·qwen2.5</b> 등 일반 모델을 권장합니다.</span>
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {!editingTemplate && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
                <Button variant="secondary" onClick={() => setShowRegen(false)} disabled={isGenerating}>
                  취소
                </Button>
                <Button
                  variant="primary"
                  onClick={handleGenerateNotes}
                  disabled={isGenerating || providerModels.length === 0 || !selectedTemplateId}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isGenerating ? '생성 중...' : '다시 생성'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
