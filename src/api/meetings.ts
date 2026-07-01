import { apiRequest, apiUrl } from './client';
import type { MeetingRecord, TranscriptionData, TranscriptionSegment, TemplateSection } from '../App';

interface RawMeeting {
  id: string;
  title: string;
  date: string;
  engine: string;
  duration: number;
  speaker_count: number;
  status: string;
  progress: number;
  transcription?: TranscriptionData;
  speaker_names?: Record<string, string>;
  notes?: string;
  template_id?: string;
  error_message?: string;
  created_at?: string;
}

function mapMeeting(raw: RawMeeting): MeetingRecord {
  return {
    id: raw.id,
    title: raw.title,
    date: raw.date,
    engine: raw.engine as MeetingRecord['engine'],
    duration: raw.duration,
    speakerCount: raw.speaker_count,
    status: raw.status as MeetingRecord['status'],
    progress: raw.progress,
    transcription: raw.transcription,
    notes: raw.notes,
    templateId: raw.template_id,
    speakerNames: raw.speaker_names,
    errorMessage: raw.error_message,
  };
}

interface MeetingListResponse {
  meetings: RawMeeting[];
  total: number;
}

export interface MeetingQuery {
  q?: string;
  status?: string[];
}

export async function listMeetings(params: MeetingQuery = {}): Promise<MeetingRecord[]> {
  const qs = new URLSearchParams();
  if (params.q?.trim()) qs.set('q', params.q.trim());
  for (const s of params.status ?? []) qs.append('status', s);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiRequest<MeetingListResponse>(`/meetings${suffix}`);
  return data.meetings.map(mapMeeting);
}

export async function getMeeting(id: string): Promise<MeetingRecord> {
  const raw = await apiRequest<RawMeeting>(`/meetings/${id}`);
  return mapMeeting(raw);
}

/** Streamable audio URL for the meeting's uploaded file (supports Range/seek). */
export function meetingAudioUrl(id: string): string {
  return apiUrl(`/meetings/${id}/audio`);
}

export async function createMeeting(formData: FormData): Promise<{ id: string }> {
  const res = await fetch(apiUrl('/meetings'), {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Upload failed');
  }
  return res.json();
}

export async function updateMeeting(
  id: string,
  updates: Partial<MeetingRecord>
): Promise<MeetingRecord> {
  const raw = await apiRequest<RawMeeting>(`/meetings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return mapMeeting(raw);
}

export async function deleteMeeting(id: string): Promise<void> {
  await apiRequest(`/meetings/${id}`, { method: 'DELETE' });
}

/** Replace the speaker-label → display-name map (idempotent). */
export async function updateSpeakerNames(
  id: string,
  speakerNames: Record<string, string>
): Promise<MeetingRecord> {
  const raw = await apiRequest<RawMeeting>(`/meetings/${id}/speaker-names`, {
    method: 'PATCH',
    body: JSON.stringify({ speaker_names: speakerNames }),
  });
  return mapMeeting(raw);
}

export async function generateNotes(params: {
  meeting_id: string;
  template_sections: TemplateSection[];
  model_id: string;
  segments: TranscriptionSegment[];
  meeting_title: string;
  meeting_date: string;
}): Promise<{ notes: string; model_id: string }> {
  return apiRequest('/llm/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface LLMModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning?: boolean;
}

export async function fetchLLMModels(): Promise<LLMModelInfo[]> {
  const data = await apiRequest<{ models: LLMModelInfo[] }>('/llm/models');
  return data.models;
}

// Ollama model management
export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
  connected: boolean;
  base_url: string;
  error?: string;
}

export async function fetchOllamaModels(): Promise<OllamaModelsResponse> {
  return apiRequest<OllamaModelsResponse>('/llm/ollama/models');
}

export async function pullOllamaModel(name: string): Promise<{ status: string; name: string; message?: string }> {
  return apiRequest('/llm/ollama/pull', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function deleteOllamaModel(name: string): Promise<{ status: string; name: string; message?: string }> {
  return apiRequest('/llm/ollama/models', {
    method: 'DELETE',
    body: JSON.stringify({ name }),
  });
}

export async function exportMeeting(
  meetingId: string,
  format: 'md' | 'pdf' | 'docx'
): Promise<Blob> {
  const res = await fetch(apiUrl(`/export/${meetingId}?format=${format}`), {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Export failed');
  return res.blob();
}
