import { apiRequest } from './client';
import type { Template } from '../App';

interface TemplateApiResponse {
  id: string;
  name: string;
  is_default: boolean;
  sections: any[];
}

function toFrontend(t: TemplateApiResponse): Template {
  return {
    id: t.id,
    name: t.name,
    isDefault: t.is_default,
    sections: t.sections,
  };
}

export async function listTemplates(): Promise<Template[]> {
  const data = await apiRequest<TemplateApiResponse[]>('/templates');
  return data.map(toFrontend);
}

export async function createTemplate(
  name: string,
  sections: any[]
): Promise<Template> {
  const data = await apiRequest<TemplateApiResponse>('/templates', {
    method: 'POST',
    body: JSON.stringify({ name, sections }),
  });
  return toFrontend(data);
}

export async function updateTemplate(
  id: string,
  updates: { name?: string; sections?: any[] }
): Promise<Template> {
  const data = await apiRequest<TemplateApiResponse>(`/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return toFrontend(data);
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiRequest(`/templates/${id}`, { method: 'DELETE' });
}
