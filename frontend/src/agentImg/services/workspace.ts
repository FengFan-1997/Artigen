import { authFetch } from '@/login/authFetch';
import { buildApiUrl } from '@/utils/api';
export type WorkspaceSession = {
  id: string;
  projectId: string | null;
  title: string;
  kind: 'conversation' | 'run';
  status: string;
  updatedAt: string;
};
export type NavigationPage = {
  projects: { projectId: string; title: string }[];
  sessions: WorkspaceSession[];
  nextCursor: string | null;
};
export async function workspaceRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(buildApiUrl(path), init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.code || `API_ERROR_${response.status}`);
  return body as T;
}
export const getWorkspaceNavigation = (cursor = '') =>
  workspaceRequest<NavigationPage>(
    `/api/workspace/navigation${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`
  );
export const updateWorkspaceConversation = (
  id: string,
  input: { title?: string; projectId?: string | null }
) =>
  workspaceRequest(`/api/workspace/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
