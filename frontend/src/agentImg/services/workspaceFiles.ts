import { workspaceRequest } from './workspace';
export type WorkspaceFile = {
  id: string;
  path: string;
  revision: number;
  assetId: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  url: string;
  originArtifactId?: string | null;
  verificationStatus?: string;
  editable?: boolean;
  editTarget?: { source: string; id: string; name: string; sha256: string } | null;
};
export type PublicMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: string;
  text: string;
  createdAt: string;
};
const filesPath = (projectId: string) =>
  `/api/workspace/projects/${encodeURIComponent(projectId)}/files`;
export const listWorkspaceFiles = (id: string) =>
  workspaceRequest<{ files: WorkspaceFile[] }>(filesPath(id));
export const readWorkspaceFile = (project: string, id: string, revision?: number) =>
  workspaceRequest<{ file: WorkspaceFile; text: string }>(
    `${filesPath(project)}/${encodeURIComponent(id)}/content${revision === undefined ? '' : '?revision=' + revision}`
  );
export const saveWorkspaceFile = (
  project: string,
  file: WorkspaceFile | null,
  text: string,
  path?: string
) =>
  workspaceRequest<{ file: WorkspaceFile }>(
    filesPath(project) + (file ? '/' + encodeURIComponent(file.id) : ''),
    {
      method: file ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        path,
        expectedRevision: file?.revision || 0,
        baseSha256: file?.sha256
      })
    }
  );
export const getWorkspaceVersions = (project: string, id: string) =>
  workspaceRequest<{ versions: Array<{ revision: number; createdAt: string; sha256: string }> }>(
    `${filesPath(project)}/${encodeURIComponent(id)}/versions`
  );
export const getRunMessages = (id: string, cursor = '') =>
  workspaceRequest<{ messages: PublicMessage[]; nextCursor: string | null }>(
    `/api/agent-runs/${encodeURIComponent(id)}/messages${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`
  );
export type WorkspaceFileRef = {
  source: 'local' | 'cloud' | 'artifact';
  id: string;
  name: string;
  projectId: string;
  sha256: string;
  assetId?: string;
  originArtifactId?: string | null;
};
export const openWorkspaceFile = (file: WorkspaceFile) =>
  window.dispatchEvent(new CustomEvent('workspace:open-file', { detail: file }));
