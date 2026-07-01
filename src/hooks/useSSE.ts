import { useEffect, useRef, useState, useCallback } from 'react';
import { apiUrl } from '../api/client';

interface ProgressEvent {
  step: string;
  progress: number;
  message: string;
  error?: string;
}

export function useSSEProgress(meetingId: string | null) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    const es = new EventSource(apiUrl(`/stt/${meetingId}/progress`));
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data: ProgressEvent = JSON.parse(event.data);

      if (data.error) {
        setError(data.error);
        es.close();
        return;
      }

      setProgress(data);

      if (data.step === 'complete') {
        setIsComplete(true);
        es.close();
      } else if (data.step === 'failed') {
        setError(data.error || 'Processing failed');
        es.close();
      }
    };

    es.onerror = () => {
      setError('서버 연결이 끊어졌습니다');
      es.close();
    };

    return () => {
      es.close();
    };
  }, [meetingId]);

  const cancel = useCallback(async () => {
    if (meetingId) {
      await fetch(apiUrl(`/stt/${meetingId}/cancel`), { method: 'POST' });
    }
    eventSourceRef.current?.close();
  }, [meetingId]);

  return { progress, isComplete, error, cancel };
}
