import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useSSEProgress } from '../hooks/useSSE';
import { Button, cx } from './ds';

interface ProcessingPageProps {
  meetingId: string;
  onComplete: (meetingId: string) => void;
  onCancel: () => void;
}

type StepStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'queued';

interface ProcessingStep {
  id: string;
  label: string;
  status: StepStatus;
}

function getStepStatuses(currentStep: string): Record<string, StepStatus> {
  const statuses: Record<string, StepStatus> = {
    preprocess: 'pending',
    stt: 'pending',
    diarization: 'pending',
  };

  if (currentStep === 'queued') {
    // All pending
  } else if (currentStep === 'preprocess') {
    statuses.preprocess = 'processing';
  } else if (currentStep === 'stt') {
    statuses.preprocess = 'completed';
    statuses.stt = 'processing';
  } else if (currentStep === 'diarization') {
    statuses.preprocess = 'completed';
    statuses.stt = 'completed';
    statuses.diarization = 'processing';
  } else if (currentStep === 'complete') {
    statuses.preprocess = 'completed';
    statuses.stt = 'completed';
    statuses.diarization = 'completed';
  }

  return statuses;
}

export function ProcessingPage({ meetingId, onComplete, onCancel }: ProcessingPageProps) {
  const { progress: sseProgress, isComplete, error, cancel } = useSSEProgress(meetingId);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const progressValue = sseProgress?.progress ?? 0;
  const currentStep = sseProgress?.step ?? 'queued';
  const isQueued = currentStep === 'queued';
  const stepStatuses = getStepStatuses(currentStep);

  const steps: ProcessingStep[] = [
    { id: 'preprocess', label: '오디오 전처리', status: stepStatuses.preprocess },
    { id: 'stt', label: 'STT 변환', status: stepStatuses.stt },
    { id: 'diarization', label: '화자 분리', status: stepStatuses.diarization },
  ];

  useEffect(() => {
    if (isComplete) {
      onComplete(meetingId);
    }
  }, [isComplete, meetingId, onComplete]);

  const getStepNode = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-accent animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-danger" />;
      default:
        return <span className="w-5 h-5 rounded-full border border-line-strong" />;
    }
  };

  // 큐 대기 문구는 진행 바 위 캡션에만 노출하는 단일 소스. 헤더 subtitle에선 중복 제거.
  const queueCaption = sseProgress?.message || '대기열에서 순서를 기다리고 있습니다';
  const headerSubtitle = error
    ? error
    : isQueued
    ? null
    : sseProgress?.message || '음성을 텍스트로 변환하고 있습니다';

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="bg-surface border border-line rounded-card shadow-card p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-5">
            {error ? (
              <div className="w-16 h-16 bg-danger-subtle rounded-card flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-danger" />
              </div>
            ) : isQueued ? (
              <div className="w-16 h-16 bg-subtle rounded-card flex items-center justify-center">
                <Clock className="w-8 h-8 text-ink-faint" />
              </div>
            ) : (
              <div className="w-16 h-16 bg-accent-subtle rounded-card flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
              </div>
            )}
          </div>
          <h2 className="text-xl font-semibold text-ink mb-1">
            {error ? '처리 실패' : isQueued ? '대기 중' : '음성 변환 중'}
          </h2>
          {headerSubtitle && <p className="text-sm text-ink-soft">{headerSubtitle}</p>}
        </div>

        {/* 큐 대기 캡션 — 큐 상태의 단일 진실 (processing/completed 시 미노출) */}
        {isQueued && (
          <p className="text-sm text-ink-soft text-center mb-8">{queueCaption}</p>
        )}

        {/* Progress */}
        {!isQueued && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-ink-faint uppercase tracking-wider">진행률</span>
              <span className="text-sm font-mono tabular text-accent">{progressValue}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cx(
                  'h-full rounded-full transition-all duration-500',
                  error ? 'bg-danger' : 'bg-accent'
                )}
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
        )}

        {/* Steps — vertical stepper */}
        {!isQueued && (
          <div className="mb-8">
            {steps.map((step, i) => {
              const isLast = i === steps.length - 1;
              return (
                <div key={step.id} className="flex gap-3">
                  {/* Node + connector */}
                  <div className="flex flex-col items-center">
                    <div className="flex items-center justify-center w-5 h-5">
                      {getStepNode(step.status)}
                    </div>
                    {!isLast && (
                      <div
                        className={cx(
                          'w-0.5 flex-1 my-1',
                          step.status === 'completed' ? 'bg-success' : 'bg-line'
                        )}
                      />
                    )}
                  </div>
                  {/* Label + chip */}
                  <div className={cx('flex items-center gap-2 min-h-5', isLast ? 'pb-0' : 'pb-6')}>
                    <span
                      className={cx(
                        'text-sm',
                        step.status === 'completed'
                          ? 'text-ink'
                          : step.status === 'processing'
                          ? 'text-accent font-semibold'
                          : step.status === 'failed'
                          ? 'text-danger'
                          : 'text-ink-faint'
                      )}
                    >
                      {step.label}
                    </span>
                    {step.status === 'processing' && (
                      <span className="text-xs font-mono text-white bg-accent px-2 rounded-control">
                        {progressValue}%
                      </span>
                    )}
                    {step.status === 'completed' && (
                      <span className="text-xs text-success bg-success-subtle px-2 rounded-control">
                        완료
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cancel / Error / Back */}
        <div className="flex justify-center">
          {error ? (
            <Button variant="secondary" onClick={onCancel}>
              돌아가기
            </Button>
          ) : !showCancelConfirm ? (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={onCancel}
                className="text-sm text-ink-soft hover:text-ink transition-colors focus-ring rounded-control"
              >
                대시보드로 돌아가기
              </button>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-sm text-danger hover:opacity-80 transition-opacity focus-ring rounded-control"
              >
                변환 취소
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-3 bg-subtle px-4 py-2.5 rounded-card border border-line">
              <span className="text-sm text-ink-soft">변환을 취소하시겠습니까?</span>
              <Button
                variant="danger-solid"
                size="sm"
                onClick={async () => {
                  await cancel();
                  onCancel();
                }}
              >
                예
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowCancelConfirm(false)}>
                아니오
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
