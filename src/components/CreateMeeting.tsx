import React, { useState } from 'react';
import { Upload, FileAudio, X, ArrowLeft } from 'lucide-react';
import type { Template } from '../App';
import { Button, IconButton, cx } from './ds';

interface CreateMeetingProps {
  templates: Template[];
  onStart: (data: any) => void;
  onCancel: () => void;
}

export function CreateMeeting({ onStart, onCancel }: CreateMeetingProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [engine, setEngine] = useState<'whisper' | 'clova' | 'riva'>('whisper');
  const [timestampEnabled, setTimestampEnabled] = useState(true);
  const [diarizationEnabled, setDiarizationEnabled] = useState(true);
  const [speakerCount, setSpeakerCount] = useState<number | 'auto'>('auto');

  // Engine-specific options
  const [whisperModel, setWhisperModel] = useState<'large-v3' | 'large-v3-turbo'>('large-v3');
  const [whisperLanguage, setWhisperLanguage] = useState<'auto' | 'ko' | 'en'>('auto');
  const [clovaLanguage, setClovaLanguage] = useState<'ko-KR' | 'en-US' | 'ja'>('ko-KR');
  const [clovaMode, setClovaMode] = useState<'sync' | 'async'>('async');
  const [rivaServer, setRivaServer] = useState('localhost:50051');

  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('audio/')) {
        setFile(droppedFile);
        if (!title) {
          setTitle(droppedFile.name.replace(/\.[^/.]+$/, ''));
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleSubmit = () => {
    if (!file || !title) return;

    onStart({
      title,
      date,
      engine,
      file,
      options: {
        timestampEnabled,
        diarizationEnabled,
        speakerCount,
        engineOptions: engine === 'whisper'
          ? { model: whisperModel, language: whisperLanguage }
          : engine === 'clova'
          ? { language: clovaLanguage, mode: clovaMode }
          : { server: rivaServer }
      }
    });
  };

  const isFormValid = file && title;

  const inputClass =
    'w-full h-9 px-3 bg-surface border border-line-strong rounded-control text-sm text-ink ' +
    'focus-ring focus:border-accent';
  const selectClass = inputClass;
  const labelClass = 'block text-[13px] font-medium text-ink-soft mb-2';

  return (
    <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-7">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-ink-soft hover:text-ink mb-4 focus-ring rounded-control"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>뒤로가기</span>
        </button>
        <h1 className="text-[22px] font-semibold text-ink mb-2">새 회의록 만들기</h1>
        <p className="text-ink-soft">음성 파일을 업로드하고 설정을 완료하세요</p>
      </div>

      <div className="space-y-6">
        {/* File Upload */}
        <div className="bg-surface border border-line rounded-card p-6">
          <h3 className="font-semibold text-ink mb-4">
            음성 파일 업로드 <span className="text-danger">*</span>
          </h3>

          {!file ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cx(
                'border-[1.5px] border-dashed rounded-card p-12 text-center bg-surface transition-colors',
                dragActive
                  ? 'border-accent bg-accent-subtle'
                  : 'border-line-strong'
              )}
            >
              <input
                type="file"
                id="audio-file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="audio-file" className="cursor-pointer">
                <div className="flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-ink-faint" />
                </div>
                <h3 className="text-sm font-medium text-ink mb-2">
                  파일을 드래그하거나 클릭하여 업로드
                </h3>
                <p className="text-xs text-ink-faint">
                  MP3, WAV, M4A, FLAC, OGG 지원 (최대 500MB)
                </p>
              </label>
            </div>
          ) : (
            <div className="bg-subtle border border-line rounded-control p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent rounded-control flex items-center justify-center">
                    <FileAudio className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-ink">{file.name}</p>
                    <p className="text-sm text-ink-soft font-mono tabular">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <IconButton onClick={() => setFile(null)} aria-label="파일 제거">
                  <X className="w-5 h-5" />
                </IconButton>
              </div>
            </div>
          )}
        </div>

        {/* Basic Info */}
        <div className="bg-surface border border-line rounded-card p-6">
          <h3 className="font-semibold text-ink mb-4">기본 정보</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                회의 제목 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 제품 개발 회의"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                회의 날짜
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* STT Engine */}
        <div className="bg-surface border border-line rounded-card p-6">
          <h3 className="font-semibold text-ink mb-4">
            STT 엔진 선택 <span className="text-danger">*</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { id: 'whisper' as const, name: 'Whisper', desc: '로컬 GPU, 높은 정확도' },
              { id: 'clova' as const, name: 'CLOVA', desc: '클라우드 API, 한국어 특화' },
              { id: 'riva' as const, name: 'Riva', desc: '로컬 gRPC, 실시간' },
            ].map((eng) => (
              <button
                key={eng.id}
                onClick={() => setEngine(eng.id)}
                className={cx(
                  'p-4 rounded-card border text-left transition-colors focus-ring',
                  engine === eng.id
                    ? 'border-accent bg-accent-subtle'
                    : 'border-line hover:border-line-strong'
                )}
              >
                <div className="font-medium text-ink mb-1">{eng.name}</div>
                <div className="text-sm text-ink-soft">{eng.desc}</div>
              </button>
            ))}
          </div>

          {/* Engine Options */}
          {engine === 'whisper' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-line">
              <div>
                <label className={labelClass}>모델</label>
                <select
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value as any)}
                  className={selectClass}
                >
                  <option value="large-v3">large-v3 (정확도 높음)</option>
                  <option value="large-v3-turbo">large-v3-turbo (속도 빠름)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>언어</label>
                <select
                  value={whisperLanguage}
                  onChange={(e) => setWhisperLanguage(e.target.value as any)}
                  className={selectClass}
                >
                  <option value="auto">자동 감지</option>
                  <option value="ko">한국어</option>
                  <option value="en">영어</option>
                </select>
              </div>
            </div>
          )}

          {engine === 'clova' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-line">
              <div>
                <label className={labelClass}>언어</label>
                <select
                  value={clovaLanguage}
                  onChange={(e) => setClovaLanguage(e.target.value as any)}
                  className={selectClass}
                >
                  <option value="ko-KR">한국어</option>
                  <option value="en-US">영어</option>
                  <option value="ja">일본어</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>처리 방식</label>
                <select
                  value={clovaMode}
                  onChange={(e) => setClovaMode(e.target.value as any)}
                  className={selectClass}
                >
                  <option value="async">비동기 (긴 음성)</option>
                  <option value="sync">동기 (짧은 음성)</option>
                </select>
              </div>
            </div>
          )}

          {engine === 'riva' && (
            <div className="pt-4 border-t border-line">
              <label className={labelClass}>서버 주소</label>
              <input
                type="text"
                value={rivaServer}
                onChange={(e) => setRivaServer(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {/* Options */}
        <div className="bg-surface border border-line rounded-card p-6">
          <h3 className="font-semibold text-ink mb-4">옵션</h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 border border-line rounded-control cursor-pointer hover:bg-subtle">
              <div>
                <div className="font-medium text-ink">타임스탬프</div>
                <div className="text-sm text-ink-soft">발화 시작/종료 시간 표시</div>
              </div>
              <input
                type="checkbox"
                checked={timestampEnabled}
                onChange={(e) => setTimestampEnabled(e.target.checked)}
                className="w-4 h-4 accent-accent focus-ring"
              />
            </label>

            <label className="flex items-center justify-between p-3 border border-line rounded-control cursor-pointer hover:bg-subtle">
              <div>
                <div className="font-medium text-ink">화자 분리</div>
                <div className="text-sm text-ink-soft">누가 말했는지 구분</div>
              </div>
              <input
                type="checkbox"
                checked={diarizationEnabled}
                onChange={(e) => setDiarizationEnabled(e.target.checked)}
                className="w-4 h-4 accent-accent focus-ring"
              />
            </label>

            {diarizationEnabled && (
              <div className="ml-6">
                <label className={labelClass}>
                  예상 화자 수
                </label>
                <select
                  value={speakerCount}
                  onChange={(e) => setSpeakerCount(e.target.value === 'auto' ? 'auto' : parseInt(e.target.value))}
                  className={selectClass}
                >
                  <option value="auto">자동 감지</option>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n}명</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="flex-1"
          >
            변환 시작
          </Button>
        </div>
      </div>
    </div>
  );
}
