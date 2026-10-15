import type { WorkspaceFileRef } from './workspaceFiles';
export type WorkspaceAttachment = {
  owner: string;
  project: string;
  file: File;
  reference: WorkspaceFileRef;
  accepted?: boolean;
};
let pending: { owner: string; project: string; attachment: WorkspaceAttachment } | null = null;
export const stageWorkspaceAttachment = (
  owner: string,
  project: string,
  attachment: WorkspaceAttachment
) => {
  pending = { owner, project, attachment };
};
export const takeWorkspaceAttachment = (owner: string, project: string) => {
  const value = pending;
  pending = null;
  return value?.owner === owner && value.project === project ? value.attachment : null;
};
