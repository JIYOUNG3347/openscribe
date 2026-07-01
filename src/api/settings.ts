import { apiRequest } from './client';

export interface SettingItem {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  hint: string;
  masked_value: string;
  has_value: boolean;
}

interface SettingsResponse {
  settings: SettingItem[];
}

interface SettingsUpdateResponse {
  updated: string[];
}

export async function getSettings(): Promise<SettingItem[]> {
  const res = await apiRequest<SettingsResponse>('/settings');
  return res.settings;
}

export async function updateSettings(settings: Record<string, string>): Promise<string[]> {
  const res = await apiRequest<SettingsUpdateResponse>('/settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
  return res.updated;
}

export interface SystemStatus {
  gpu: boolean;
  llm: { ollama: { ok: boolean; models: string[]; base_url: string }; openai: boolean; ready: boolean };
  stt: {
    whisper: { ok: boolean; gpu: boolean };
    riva: { ok: boolean; server: string };
    clova: { ok: boolean };
  };
  keys: { openai: boolean; clova: boolean; huggingface: boolean };
}

export async function getSystemStatus(): Promise<SystemStatus> {
  return apiRequest<SystemStatus>('/system/status');
}
