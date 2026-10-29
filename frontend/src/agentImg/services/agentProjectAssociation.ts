import { workspaceRequest } from './workspace';
export type AgentProjectScope = {
  runId: string;
  projectId: string | null;
  scope: 'run' | 'conversation';
  conversationId: string | null;
  affectedRunCount: number;
  canAssociate: boolean;
  requiresPause: boolean;
  pausableRunIds: string[];
  requiresPausedConfirmation: boolean;
  blockedReason: string | null;
};
const endpoint = (runId: string) => `/api/agent-runs/${encodeURIComponent(runId)}/project`;
export const getAgentProjectScope = (runId: string) => workspaceRequest<AgentProjectScope>(endpoint(runId));
export const associateAgentProject = (runId: string, projectId: string, scope: AgentProjectScope) =>
  workspaceRequest<AgentProjectScope>(endpoint(runId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, confirmConversation: scope.scope === 'conversation', confirmPaused: scope.requiresPausedConfirmation })
  });
export const projectAssociationError = (error: unknown, zh: boolean) => {
  const code = error instanceof Error ? error.message : String(error || '');
  const messages: Record<string, [string, string]> = {
    AGENT_PROJECT_PAUSE_REQUIRED: ['请先暂停正在执行的任务，再返回关联。', 'Pause the active task before linking.'],
    AGENT_PROJECT_WORKER_ACTIVE: ['任务尚未安全暂停，请稍后刷新。', 'The task has not safely paused yet. Refresh shortly.'],
    AGENT_PROJECT_VERIFYING: ['任务正在验证结果，结束后可关联。', 'Wait for result verification to finish before linking.'],
    AGENT_PROJECT_CHILDREN_ACTIVE: ['仍有子任务未结束，任务结束后可关联。', 'Subtasks are still active. Link after they finish.'],
    AGENT_PROJECT_CALL_PENDING: ['仍有调用等待确认，任务结束后可关联。', 'A call is still pending. Link after the task finishes.'],
    AGENT_PROJECT_CONVERSATION_BUSY: ['同一会话仍在处理其他请求，请结束后重试。', 'This conversation is processing another request. Retry when it finishes.'],
    AGENT_PROJECT_CONFLICT: ['任务已有其他项目归属，不能在这里更换。', 'This task already belongs to another project and cannot be moved here.'],
    AGENT_PROJECT_STATE_CHANGED: ['任务状态刚刚变化，请刷新后重新确认。', 'The task changed. Refresh and confirm again.'],
    AGENT_PROJECT_CONVERSATION_CONFIRM_REQUIRED: ['请确认关联整个会话后再试。', 'Confirm linking the whole conversation first.'],
    AGENT_PROJECT_PAUSED_CONFIRM_REQUIRED: ['请确认关联后仍保持暂停，再试一次。', 'Confirm that the task will remain paused, then retry.'],
    PROJECT_NOT_FOUND: ['项目不可用或没有访问权限，请重新选择。', 'The project is unavailable or inaccessible. Choose another.'],
    AGENT_RUN_NOT_FOUND: ['任务不可用或没有访问权限。', 'The task is unavailable or inaccessible.'],
    LOGIN_REQUIRED: ['登录已失效，请重新登录。', 'Your session expired. Sign in again.']
  };
  return messages[code]?.[zh ? 0 : 1] || (zh ? '项目操作未完成，请重试。' : 'The project action failed. Try again.');
};
