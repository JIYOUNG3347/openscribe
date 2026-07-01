import { useState, useEffect, useCallback, useRef } from 'react';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { CreateMeeting } from './components/CreateMeeting';
import { ProcessingPage } from './components/ProcessingPage';
import { ResultPage } from './components/ResultPage';
import { SettingsPage } from './components/SettingsPage';
import { AppShell } from './components/AppShell';
import { CommandPalette } from './components/CommandPalette';
import * as meetingsApi from './api/meetings';
import * as templatesApi from './api/templates';

export interface MeetingRecord {
  id: string;
  title: string;
  date: string;
  engine: 'whisper' | 'clova' | 'riva';
  duration: number;
  speakerCount: number;
  status: 'completed' | 'processing' | 'failed' | 'queued';
  progress?: number;
  transcription?: TranscriptionData;
  notes?: string;
  templateId?: string;
  speakerNames?: Record<string, string>;
  errorMessage?: string;
}

export interface TranscriptionData {
  segments: TranscriptionSegment[];
  options: {
    timestampEnabled: boolean;
    diarizationEnabled: boolean;
  };
}

export interface TranscriptionSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface Template {
  id: string;
  name: string;
  isDefault: boolean;
  sections: TemplateSection[];
}

export interface TemplateSection {
  key: string;
  label: string;
  type: 'llm_generate' | 'raw_transcript';
  prompt: string | null;
  heading_level?: number; // 1~4, default 2
  color?: string; // hex color, e.g. #3B82F6
}

export type Page = 'landing' | 'dashboard' | 'create' | 'processing' | 'result' | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [currentMeeting, setCurrentMeeting] = useState<MeetingRecord | null>(null);
  const [loadingMeeting, setLoadingMeeting] = useState(false);
  const [processingMeetingId, setProcessingMeetingId] = useState<string | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Browser History API navigation
  const navigate = useCallback((page: Page, opts?: { meetingId?: string; replace?: boolean }) => {
    const state = { page, meetingId: opts?.meetingId };
    if (opts?.replace) {
      history.replaceState(state, '');
    } else {
      history.pushState(state, '');
    }
    sessionStorage.setItem('openscribe_page', JSON.stringify(state));
    setCurrentPage(page);
    if (opts?.meetingId) {
      if (page === 'processing') setProcessingMeetingId(opts.meetingId);
      if (page === 'result') setCurrentMeetingId(opts.meetingId);
    }
  }, []);

  // Load data from backend on mount
  const loadMeetings = useCallback(async () => {
    try {
      const data = await meetingsApi.listMeetings();
      setMeetings(data);
    } catch (e) {
      console.error('Failed to load meetings:', e);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await templatesApi.listTemplates();
      setTemplates(data);
    } catch (e) {
      console.error('Failed to load templates:', e);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
    loadTemplates();
  }, [loadMeetings, loadTemplates]);

  // Handle browser back/forward buttons + restore state on refresh
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state?.page) {
        setCurrentPage(state.page as Page);
        sessionStorage.setItem('openscribe_page', JSON.stringify(state));
        if (state.page === 'dashboard') loadMeetings();
        if (state.meetingId) {
          if (state.page === 'processing') setProcessingMeetingId(state.meetingId);
          if (state.page === 'result') setCurrentMeetingId(state.meetingId);
        }
      } else {
        setCurrentPage('landing');
        sessionStorage.removeItem('openscribe_page');
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Always start from landing page on fresh load / refresh
    sessionStorage.removeItem('openscribe_page');
    history.replaceState({ page: 'landing' }, '');
    return () => window.removeEventListener('popstate', handlePopState);
  }, [loadMeetings]);

  // Load individual meeting when navigating to result page and meeting isn't in list yet
  useEffect(() => {
    if (currentPage !== 'result' || !currentMeetingId) return;

    const found = meetings.find(m => m.id === currentMeetingId);
    if (found) {
      setCurrentMeeting(found);
      return;
    }

    // Meeting not in list — fetch individually (e.g. after page refresh)
    let cancelled = false;
    setLoadingMeeting(true);
    meetingsApi.getMeeting(currentMeetingId).then(meeting => {
      if (!cancelled) {
        setCurrentMeeting(meeting);
        setMeetings(prev => {
          if (prev.find(m => m.id === meeting.id)) return prev;
          return [meeting, ...prev];
        });
      }
    }).catch(e => {
      console.error('Failed to load meeting:', e);
      if (!cancelled) history.back();
    }).finally(() => {
      if (!cancelled) setLoadingMeeting(false);
    });

    return () => { cancelled = true; };
  }, [currentPage, currentMeetingId, meetings]);

  // Auto-refresh when on dashboard and there are active (queued/processing) meetings
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (currentPage === 'dashboard') {
      const hasActive = meetings.some(m => m.status === 'queued' || m.status === 'processing');
      if (hasActive) {
        pollRef.current = setInterval(loadMeetings, 5000);
      }
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [currentPage, meetings, loadMeetings]);

  // ⌘K / Ctrl+K opens the command palette (disabled on the landing page)
  useEffect(() => {
    if (currentPage === 'landing') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentPage]);

  const handleCreateMeeting = async (meetingData: any) => {
    try {
      const formData = new FormData();
      formData.append('file', meetingData.file);
      formData.append('title', meetingData.title);
      formData.append('date', meetingData.date);
      formData.append('engine', meetingData.engine);
      formData.append('stt_options', JSON.stringify({
        timestamp_enabled: meetingData.options.timestampEnabled,
        diarization_enabled: meetingData.options.diarizationEnabled,
        speaker_count: meetingData.options.speakerCount,
        engine_options: meetingData.options.engineOptions,
      }));
      if (meetingData.templateId) {
        formData.append('template_id', meetingData.templateId);
      }

      await meetingsApi.createMeeting(formData);
      // Go back to dashboard — queue handles processing
      await loadMeetings();
      history.back();
    } catch (e) {
      console.error('Failed to create meeting:', e);
      alert(`회의 생성 실패: ${e}`);
    }
  };

  const handleProcessingComplete = async (meetingId: string) => {
    try {
      const meeting = await meetingsApi.getMeeting(meetingId);
      setCurrentMeeting(meeting);
      setMeetings(prev => {
        const exists = prev.find(m => m.id === meetingId);
        if (exists) {
          return prev.map(m => m.id === meetingId ? meeting : m);
        }
        return [meeting, ...prev];
      });
      // Replace processing entry with result (back goes to dashboard, not processing)
      navigate('result', { meetingId, replace: true });
    } catch (e) {
      console.error('Failed to fetch completed meeting:', e);
      history.back();
    }
  };

  const handleViewMeeting = (meetingId: string) => {
    const meeting = meetings.find(m => m.id === meetingId);
    if (!meeting) return;

    if (meeting.status === 'processing' || meeting.status === 'queued') {
      navigate('processing', { meetingId });
    } else {
      navigate('result', { meetingId });
    }
  };

  const handleTemplatesChange = async (newTemplates: Template[]) => {
    setTemplates(newTemplates);
  };

  const handleSave = async (meetingId: string, updates: Partial<MeetingRecord>) => {
    try {
      await meetingsApi.updateMeeting(meetingId, updates);
      setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, ...updates } : m));
      if (currentMeeting?.id === meetingId) {
        setCurrentMeeting(prev => prev ? { ...prev, ...updates } : prev);
      }
    } catch (e) {
      console.error('Failed to save meeting:', e);
      alert(`저장 실패: ${e}`);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return <LandingPage onStart={() => navigate('dashboard')} />;
      case 'dashboard':
        return (
          <Dashboard
            meetings={meetings}
            onCreateNew={() => navigate('create')}
            onViewMeeting={handleViewMeeting}
            onSettings={() => navigate('settings')}
            onRefresh={loadMeetings}
          />
        );
      case 'create':
        return (
          <CreateMeeting
            templates={templates}
            onStart={handleCreateMeeting}
            onCancel={() => history.back()}
          />
        );
      case 'processing':
        return (
          <ProcessingPage
            meetingId={processingMeetingId!}
            onComplete={handleProcessingComplete}
            onCancel={() => history.back()}
          />
        );
      case 'result':
        if (loadingMeeting || !currentMeeting) {
          return (
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-ink-soft text-sm">회의록을 불러오는 중...</p>
              </div>
            </div>
          );
        }
        return (
          <ResultPage
            meeting={currentMeeting}
            templates={templates}
            onTemplatesChange={handleTemplatesChange}
            onBack={() => history.back()}
            onSave={handleSave}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            onBack={() => history.back()}
          />
        );
      default:
        return null;
    }
  };

  // Landing page is full-bleed (pre-app entry) — no shell.
  if (currentPage === 'landing') {
    return <div className="min-h-screen bg-canvas">{renderPage()}</div>;
  }

  const activeNav =
    currentPage === 'dashboard'
      ? 'dashboard'
      : currentPage === 'create'
      ? 'create'
      : currentPage === 'settings'
      ? 'settings'
      : null;

  return (
    <>
      <AppShell
        active={activeNav}
        onNavigate={(p) => navigate(p)}
        onOpenCommand={() => setCmdOpen(true)}
      >
        {renderPage()}
      </AppShell>
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        meetings={meetings}
        onNavigate={(p) => navigate(p)}
        onOpenMeeting={handleViewMeeting}
      />
    </>
  );
}
