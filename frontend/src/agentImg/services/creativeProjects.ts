import { authFetch } from '@/login/authFetch';
import { buildApiUrl } from '@/utils/api';
import { ToolTaskClientError } from './toolTasks';

export type ProjectAssetRole = 'product' | 'style' | 'scene' | 'logo' | 'result' | 'export';

export type CreativeProjectAsset = {
  assetId: string;
  role: ProjectAssetRole;
  label: string;
  position: number;
  url: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type CreativeProjectVersion = {
  versionId: string;
  projectId: string;
  parentVersionId: string | null;
  taskId: string | null;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  profileId: string;
  aspectRatio: string;
  seed: number | null;
  quotedCredits: number;
  favorite: boolean;
  outputAssetId: string | null;
  outputUrl: string | null;
  prompt: string;
  direction?: {
    id: string;
    title: string;
    summary: string;
    prompt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type BrandProfile = {
  brandName: string;
  colors: string[];
  styleKeywords: string[];
  prohibitedElements: string[];
  logoAssetId: string | null;
};

export type CreativeProject = {
  projectId: string;
  title: string;
  status: 'active' | 'archived' | 'trashed';
  productName: string;
  brief: string;
  brandProfile: BrandProfile;
  coverAssetId: string | null;
  coverUrl: string | null;
  revision: number;
  versionCount?: number;
  assets?: CreativeProjectAsset[];
  versions?: CreativeProjectVersion[];
  deletedAt?: string | null;
  purgeAfter?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const projectsUrl = buildApiUrl('/api/projects');

const responseError = async (response: Response) => {
  const body: any = await response.json().catch(() => null);
  const error = body?.error;
  const code = typeof error === 'object'
    ? String(error?.code || `API_ERROR_${response.status}`)
    : String(error || `API_ERROR_${response.status}`);
  return new ToolTaskClientError(code, {
    status: response.status,
    field: typeof error?.field === 'string' ? error.field : undefined,
    retryable: Boolean(error?.retryable)
  });
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await authFetch(url, init);
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
};

export const listCreativeProjects = async (includeTrashed = false) => {
  const json = await requestJson<{ projects: CreativeProject[] }>(
    `${projectsUrl}${includeTrashed ? '?includeTrashed=1' : ''}`
  );
  return Array.isArray(json.projects) ? json.projects : [];
};

export const createCreativeProject = async (input: {
  title: string;
  productName?: string;
  brief?: string;
  brandProfile?: Partial<BrandProfile>;
}) => {
  const json = await requestJson<{ project: CreativeProject }>(projectsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return json.project;
};

export const getCreativeProject = async (projectId: string, includeTrashed = false) => {
  const json = await requestJson<{ project: CreativeProject }>(
    buildApiUrl(`/api/projects/${encodeURIComponent(projectId)}${includeTrashed ? '?includeTrashed=1' : ''}`)
  );
  return json.project;
};

export const updateCreativeProject = async (
  projectId: string,
  input: Partial<Pick<CreativeProject, 'title' | 'productName' | 'brief' | 'brandProfile' | 'status'>> & {
    revision: number;
  }
) => {
  const json = await requestJson<{ project: CreativeProject }>(
    buildApiUrl(`/api/projects/${encodeURIComponent(projectId)}`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  );
  return json.project;
};

export const trashCreativeProject = async (projectId: string) => {
  const json = await requestJson<{ project: CreativeProject }>(
    buildApiUrl(`/api/projects/${encodeURIComponent(projectId)}`),
    { method: 'DELETE' }
  );
  return json.project;
};

export const restoreCreativeProject = async (projectId: string) => {
  const json = await requestJson<{ project: CreativeProject }>(
    buildApiUrl(`/api/projects/${encodeURIComponent(projectId)}/restore`),
    { method: 'POST' }
  );
  return json.project;
};

export const uploadCreativeProjectAsset = async (
  projectId: string,
  input: { file: File; role: ProjectAssetRole; label?: string; position?: number }
) => {
  const form = new FormData();
  form.set('role', input.role);
  form.set('label', input.label || '');
  form.set('position', String(Math.max(0, Number(input.position) || 0)));
  form.append('files', input.file, input.file.name);
  const json = await requestJson<{ asset: CreativeProjectAsset }>(
    buildApiUrl(`/api/projects/${encodeURIComponent(projectId)}/assets`),
    { method: 'POST', body: form }
  );
  return json.asset;
};

export const linkCreativeProjectAsset = async (
  projectId: string,
  input: { assetId: string; role: ProjectAssetRole; label?: string; position?: number }
) => {
  const json = await requestJson<{ asset: CreativeProjectAsset }>(
    buildApiUrl(`/api/projects/${encodeURIComponent(projectId)}/assets`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  );
  return json.asset;
};

export const removeCreativeProjectAsset = async (
  projectId: string,
  assetId: string,
  role: ProjectAssetRole
) => {
  await requestJson(
    buildApiUrl(
      `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}?role=${encodeURIComponent(role)}`
    ),
    { method: 'DELETE' }
  );
};

export const setProjectVersionFavorite = async (
  projectId: string,
  versionId: string,
  favorite: boolean
) => {
  const json = await requestJson<{ version: CreativeProjectVersion }>(
    buildApiUrl(
      `/api/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`
    ),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite })
    }
  );
  return json.version;
};

export const importCreativeProjectVersion = async (
  projectId: string,
  input: { assetId: string; prompt?: string; profileId?: string; aspectRatio?: string }
) => {
  const json = await requestJson<{ version: CreativeProjectVersion }>(
    buildApiUrl(`/api/projects/${encodeURIComponent(projectId)}/versions/import`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  );
  return json.version;
};
