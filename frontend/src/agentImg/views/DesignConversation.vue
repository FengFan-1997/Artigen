<template>
  <AgentWorkspaceShell
    :project-id="conversation?.projectId || String(route.query.projectId || '')"
    :artifacts="activeRun?.artifacts || []"
    :zh="zh"
    :title="conversation?.title || selectedConversationTitle"
    :subtitle="conversation ? executorSummary : ''"
    :status-label="runtimeLabel"
    :status-tone="workspaceStatusTone"
    :task-cost-label="currentCostLabel"
    :default-inspector-collapsed="!hasConversation"
    :badges="inspectorBadges"
    :live-announcement="notice"
    @new-task="newConversation"
    @search="workspaceSearch = $event"
  >
    <template #history>
      <div v-for="group in conversationGroups" :key="group.label" class="history-group">
        <p>{{ group.label }}</p>
        <button
          v-for="item in group.items"
          :key="item.conversationId"
          class="history-item"
          :class="{ active: item.conversationId === selectedConversationId }"
          :aria-current="item.conversationId === selectedConversationId ? 'true' : undefined"
          type="button"
          @click="openConversation(item.conversationId)"
        >
          <span class="history-state" :class="{ running: conversationIsRunning(item.conversationId) }"></span>
          <span><b>{{ item.title }}</b><small>{{ formatRelative(item.updatedAt) }}</small></span>
        </button>
      </div>
        <div v-if="!visibleConversations.length" class="history-empty">
          <WorkspaceIcon name="file" />
          <span>{{ zh ? '任务会保存在这里' : 'Your tasks will appear here' }}</span>
        </div>
    </template>

    <template #topbar>
      <div class="conversation-heading">
        <span class="conversation-icon" :class="latestExecution?.routeKind || 'reply'" aria-hidden="true">
          <WorkspaceIcon :name="latestExecution?.routeKind === 'agent_run' ? 'agent' : 'folder'" :size="18" />
        </span>
        <div>
          <strong>{{ conversation?.title || selectedConversationTitle }}</strong>
          <small v-if="!planning && (latestExecution || activeRun)">{{ executorSummary }}</small>
        </div>
      </div>
    </template>

    <template #topbar-actions>
      <button v-if="conversation" class="quiet-action" type="button" @click="removeCurrentConversation">
        <WorkspaceIcon name="trash" />
        <span>{{ zh ? '删除' : 'Delete' }}</span>
      </button>
    </template>

    <section v-if="loadingConversation || conversationLoadError" class="conversation-load-state" :aria-busy="loadingConversation">
      <h1>{{ loadingConversation ? (zh ? '正在读取对话…' : 'Loading conversation…') : (zh ? '对话暂时无法打开' : 'Conversation could not open') }}</h1>
      <p v-if="conversationLoadError" role="alert">{{ conversationLoadError }}</p>
      <div v-if="conversationLoadError" class="conversation-load-actions">
        <button type="button" @click="openConversation(selectedConversationId)">{{ zh ? '重新读取' : 'Retry loading' }}</button>
        <button type="button" @click="newConversation">{{ zh ? '开始新任务' : 'Start a new task' }}</button>
      </div>
    </section>
    <section v-else-if="!hasConversation" class="workspace-zero">
      <div class="zero-copy">
        <h1>{{ zh ? '你想完成什么？' : 'What should we make?' }}</h1>
      </div>
      <p v-if="statusUnavailable" class="service-unavailable-note" role="status">
        <i aria-hidden="true"></i>
        <span>{{ zh ? '服务暂时不可用，草稿会保留，请稍后重试。' : 'The service is temporarily unavailable. Your draft will stay here—please try again later.' }}</span>
      </p>
      <ComposerBox
        :draft="draft"
        :attachments="selectedAttachments"
        :busy="sending"
        :busy-label="zh ? '正在发送…你可以继续编辑下一条。' : 'Sending… You can draft the next message.'"
        :keyboard-hint="zh ? 'Enter 发送 · Shift+Enter 换行' : 'Enter to send · Shift+Enter for a new line'"
        :placeholder="zh ? '描述一个设计、图片、调研或多文件交付任务…' : 'Describe a design, image, research, or multi-file task…'"
        :attach-label="zh ? '添加文件' : 'Add files'"
        :attachment-count-label="zh ? '个文件' : 'files'"
        :attachment-hint="zh ? '文件会留在当前设备，只有云端任务需要时才上传' : 'Files stay on this device until a cloud task needs them'"
        :request-label="zh ? '设计需求' : 'Design request'"
        :send-label="zh ? '发送需求' : 'Send request'"
        :remove-attachment-label="zh ? '移除' : 'Remove'"
        @update:draft="draft = $event"
        @submit="submitMessage"
        @attach="openFilePicker()"
        @remove-attachment="removeAttachment"
      />
      <p v-if="draftRestored" class="draft-restored" role="status">{{ zh ? '已恢复本机草稿；如需参考文件，请重新选择。' : 'Your local draft was restored. Choose any reference files again.' }}</p>
      <div class="suggestion-grid">
        <header>
          <span>{{ zh ? '试试这些' : 'Try one of these' }}</span>
          <button type="button" :aria-label="zh ? '换一组建议' : 'Rotate suggestions'" @click="rotateSuggestions">
            <WorkspaceIcon name="refresh" />
          </button>
        </header>
        <button v-for="suggestion in visibleSuggestions" :key="suggestion" type="button" @click="useSuggestion(suggestion)">
          <b>{{ suggestion }}</b>
        </button>
      </div>
    </section>

    <section v-else class="workspace-chat">
      <div ref="scrollArea" class="message-scroll" @scroll="onConversationScroll">
        <p v-if="statusUnavailable" class="service-unavailable-note chat-service-note" role="status">
          <i aria-hidden="true"></i>
          <span>{{ zh ? '服务暂时不可用。已有内容不会丢失，请稍后重试。' : 'The service is temporarily unavailable. Your existing work is safe—please try again later.' }}</span>
        </p>
        <section v-if="activeAuthorizations.length" class="authorization-strip" aria-live="polite">
          <header>
            <span>{{ zh ? '会话授权' : 'Session authorization' }}</span>
            <small>{{ zh ? '按站点与动作绑定，30 分钟未使用后失效' : 'Bound to site and action; expires after 30 idle minutes' }}</small>
          </header>
          <article v-for="authorization in activeAuthorizations" :key="authorization.authorizationId">
            <span><b>{{ authorization.siteOrigin }}</b><small>{{ authorizationActionLabel(authorization.actionType) }} · {{ formatAuthorizationExpiry(authorization.expiresAt) }}</small></span>
            <button type="button" @click="revokeAuthorization(authorization.authorizationId)">{{ zh ? '撤销' : 'Revoke' }}</button>
          </article>
        </section>

        <template v-for="message in conversation?.messages || []" :key="message.messageId">
          <article class="message" :class="message.role">
            <div v-if="message.role === 'assistant'" class="assistant-mark" aria-hidden="true">A</div>
            <div class="message-body">
              <WorkspaceMarkdown :text="message.text" />
              <small
                v-if="message.role === 'user' && ['queued', 'running'].includes(message.planningStatus || '')"
                class="planning-state"
                role="status"
              >{{ zh ? '正在分析这条需求…' : 'Analyzing this request…' }}</small>
              <button
                v-if="canRetryPlanning(message)"
                class="planning-retry"
                type="button"
                :disabled="retryingPlanningMessageId === message.retryableMessageId"
                @click="retryFailedPlanning(message)"
              >{{ retryingPlanningMessageId === message.retryableMessageId
                ? (zh ? '正在重新提交…' : 'Retrying…')
                : (zh ? '重新分析原需求' : 'Retry this request') }}</button>
              <div v-if="message.attachments.length" class="message-files">
                <span v-for="file in message.attachments" :key="file.clientId">
                  <WorkspaceIcon name="file" :size="14" />
                  {{ file.name }} · {{ formatBytes(file.byteSize) }}
                </span>
              </div>
              <div v-if="message.sourceArtifacts?.length" class="message-files source-message-files">
                <span v-for="artifact in message.sourceArtifacts" :key="artifact.artifactId">
                  <WorkspaceIcon name="file" :size="14" />
                  {{ zh ? '沿用上一轮' : 'Continued from' }} · {{ artifact.filename }} · v{{ artifact.version }}
                </span>
              </div>
              <div v-if="message.questions.length" class="clarification">
                <button v-for="question in message.questions" :key="question" type="button" @click="draft = question">{{ question }}</button>
                <button class="recommended" type="button" @click="sendRecommended">{{ zh ? '按推荐直接做' : 'Use recommended assumptions' }}</button>
              </div>
              <div v-if="message.memoryCandidates?.some((candidate, index) => !memoryCandidateHandled(message.messageId, index, candidate))" class="memory-suggestions">
                <article v-for="(candidate, index) in message.memoryCandidates" :key="`${message.messageId}:${index}`" v-show="!memoryCandidateHandled(message.messageId, index, candidate)">
                  <span><small>{{ zh ? '保存到项目' : 'Save to project' }}</small><b>{{ formatMemoryCandidate(candidate) }}</b></span>
                  <div>
                    <button type="button" @click="dismissMemoryCandidate(message.messageId, index)">{{ zh ? '忽略' : 'Dismiss' }}</button>
                    <button class="save-memory" type="button" @click="saveMemoryCandidate(message.messageId, index, candidate)">{{ zh ? '保存' : 'Save' }}</button>
                  </div>
                </article>
              </div>
            </div>
          </article>

          <template v-for="execution in executionsForMessage(message.messageId)" :key="execution.executionId">
          <ExecutionCard
            :execution="execution"
            :task="execution.toolTaskId ? toolTasks[execution.toolTaskId] : undefined"
            :run="execution.agentRunId ? agentRuns[execution.agentRunId] : undefined"
            :busy="startingExecutions.has(execution.executionId) || decidingExecutions.has(execution.executionId)"
            :zh="zh"
            @start="startExecution(execution)"
            @attach="openFilePicker(execution.executionId)"
            @open-local="openLocalTool(execution)"
            @increase-budget="increaseBudget(execution)"
            @cancel="cancelExecution(execution)"
            @retry="prepareRetry(execution)"
            @approve="approveAgentAction(execution, $event, false)"
            @authorize="approveAgentAction(execution, $event, true)"
            @deny="denyAgentAction(execution, $event)"
            @continue-from-artifact="selectSourceArtifact"
          />
          <RunConversationStream v-if="execution.agentRunId" :run-id="execution.agentRunId" :events="runEvents[execution.agentRunId] || []" :files="runFiles(execution.agentRunId)" :zh="zh" :terminal="['succeeded','failed','cancelled'].includes(agentRuns[execution.agentRunId]?.status || '')" :subagents="[]" @layout-change="scrollToBottom()" />
          </template>
        </template>

        <article v-if="planning" class="message assistant planning-message" aria-live="polite">
          <div class="assistant-mark" aria-hidden="true">A</div>
          <div class="message-body">
            <div class="planning-line"><span></span><span></span><span></span></div>
            <p>{{ zh ? '正在理解需求并选择执行器…' : 'Understanding the request and choosing an executor…' }}</p>
          </div>
        </article>
      </div>

      <div class="docked-composer">
        <div v-if="selectedSourceArtifacts.length" class="selected-source-artifacts">
          <span class="source-context-label">{{ zh ? '本轮会参考上一轮文件' : 'Using files from an earlier run' }}</span>
          <span v-for="artifact in selectedSourceArtifacts" :key="artifact.artifactId" class="source-context-chip">
            <WorkspaceIcon name="file" :size="14" />
            <b>{{ artifact.filename }} · v{{ artifact.version }}</b>
            <button type="button" :aria-label="zh ? `移除 ${artifact.filename}` : `Remove ${artifact.filename}`" @click="removeSourceArtifact(artifact.artifactId)">×</button>
          </span>
        </div>
        <button v-if="hasUnreadUpdates" class="new-updates" type="button" @click="scrollToBottom(true)">{{ zh ? '有新内容 · 回到底部' : 'New updates · Jump to latest' }}</button>
        <p v-if="draftRestored" class="draft-restored" role="status">{{ zh ? '已恢复本机草稿；如需参考文件，请重新选择。' : 'Your local draft was restored. Choose any reference files again.' }}</p>
        <ComposerBox
          :draft="draft"
          :attachments="selectedAttachments"
          :busy="sending"
          :busy-label="zh ? '正在发送…你可以继续编辑下一条。' : 'Sending… You can draft the next message.'"
          :keyboard-hint="zh ? 'Enter 发送 · Shift+Enter 换行' : 'Enter to send · Shift+Enter for a new line'"
          :placeholder="openAgentRuns.length ? (zh ? '补充当前任务的要求…' : 'Add instructions to the current task…') : (zh ? '继续对话，或提出一个新的设计任务…' : 'Continue, or describe a new design task…')"
          :attach-label="zh ? '添加文件' : 'Add files'"
          :attachment-count-label="zh ? '个文件' : 'files'"
          :attachment-hint="zh ? '文件会留在当前设备，只有云端任务需要时才上传' : 'Files stay on this device until a cloud task needs them'"
          :request-label="zh ? '设计需求' : 'Design request'"
          :send-label="zh ? '发送需求' : 'Send request'"
          :remove-attachment-label="zh ? '移除' : 'Remove'"
          compact
          @update:draft="draft = $event"
          @submit="submitMessage"
          @attach="openFilePicker()"
          @remove-attachment="removeAttachment"
        />
        <p v-if="openAgentRuns.length">{{ selectedSourceArtifacts.length
          ? (zh ? '当前任务结束后，选中的上一版文件会用于下一轮；执行中的任务无法切换输入文件。' : 'The selected files will be used for the next run after this task ends; inputs cannot be switched during a run.')
          : (zh ? '补充要求会发给当前任务，并记录在上方；新任务可从侧栏创建。' : 'Updates go to the current task and appear above. Start a new task from the sidebar.') }}</p>
      </div>
    </section>

    <template #environment>
      <div class="inspector-stack">
        <section class="inspector-section">
          <header>
            <span>{{ zh ? '本次任务' : 'This task' }}</span>
            <b v-if="environmentStatusLabel">{{ environmentStatusLabel }}</b>
          </header>
          <dl>
            <div v-if="latestExecution || activeRun"><dt>{{ zh ? '执行方式' : 'Executor' }}</dt><dd>{{ executorSummary }}</dd></div>
            <div><dt>{{ zh ? '预算上限' : 'Budget cap' }}</dt><dd>{{ activeRun?.budget.maximum ?? latestExecution?.maxCredits ?? status?.autoCreditCap ?? 50 }} cr</dd></div>
          </dl>
        </section>
        <section v-if="activeRun?.browserConfig.allowedOrigins?.length" class="inspector-section">
          <header><span>{{ zh ? '允许站点' : 'Allowed origins' }}</span><b>{{ activeRun.browserConfig.allowedOrigins.length }}</b></header>
          <ul><li v-for="origin in activeRun.browserConfig.allowedOrigins" :key="origin">{{ origin }}</li></ul>
        </section>
        <TechnicalDetails :label="zh ? '技术详情' : 'Technical details'">
          <dl class="technical-list">
            <div v-if="activeRun?.runtime"><dt>{{ zh ? '运行时' : 'Runtime' }}</dt><dd>V{{ activeRun.runtime.version }} · {{ activeRun.runtime.promptProfile || 'legacy' }}</dd></div>
            <div v-if="activeRun?.runtime?.skills?.length"><dt>{{ zh ? '已加载规范' : 'Loaded skills' }}</dt><dd>{{ activeRun.runtime.skills.map((skill) => `${skill.id}@${skill.version}`).join(' · ') }}</dd></div>
            <div><dt>{{ zh ? '理解与规划' : 'Reasoning' }}</dt><dd>{{ activeRun?.model.name || status?.model || '—' }}</dd></div>
            <div><dt>{{ zh ? '全部图片' : 'All images' }}</dt><dd>Kwai-Kolors/Kolors</dd></div>
            <div><dt>{{ zh ? '运行环境' : 'Runtime' }}</dt><dd>{{ activeRun?.sandbox.provider || (zh ? '按需创建' : 'On demand') }}</dd></div>
            <div><dt>{{ zh ? '保留时间' : 'Retention' }}</dt><dd>{{ status?.retentionDays ?? 30 }} {{ zh ? '天' : 'days' }}</dd></div>
            <div><dt>{{ zh ? '授权失效' : 'Authorization expiry' }}</dt><dd>{{ status?.authorizationIdleMinutes ?? 30 }} {{ zh ? '分钟' : 'minutes' }}</dd></div>
            <div><dt>{{ zh ? '当前队列' : 'Queue' }}</dt><dd>{{ (status?.running ?? 0) + (status?.queued ?? 0) }}</dd></div>
          </dl>
        </TechnicalDetails>
      </div>
    </template>

    <template #plan>
      <div class="execution-spine">
        <header><span>{{ activeRun?.progress.planExplanation || (zh ? '实时执行计划' : 'Live execution plan') }}</span><b>{{ planProgressLabel }}</b></header>
        <ol v-if="activePlan.length">
          <li v-for="(step, index) in activePlan" :key="step.label + index" :class="step.status">
            <span><i></i></span>
            <div><small>0{{ index + 1 }}</small><b>{{ step.label }}</b><em>{{ planStatusLabel(step.status) }}</em></div>
          </li>
        </ol>
        <div v-else class="inspector-inline-empty">{{ zh ? '发送第一条消息后，计划会在这里展开。' : 'The plan appears here after your first message.' }}</div>
      </div>
    </template>

    <template #subagents>
      <div class="subagent-panel">
        <header>
          <span>{{ zh ? '父 Agent 与并行上下文' : 'Parent and parallel contexts' }}</span>
          <b>{{ activeRun?.subagents?.length || 0 }}/3</b>
        </header>
        <article class="subagent-card parent">
          <span class="agent-node"><i></i></span>
          <div><b>{{ zh ? '主任务' : 'Main task' }}</b><small>{{ zh ? '负责汇总与交付' : 'Owns synthesis and delivery' }}</small></div>
          <em :class="activeRun?.status">{{ activeRun ? runStatusLabel(activeRun.status) : (zh ? '待命' : 'Idle') }}</em>
        </article>
        <div class="subagent-branch" v-if="activeRun?.subagents?.length"></div>
        <article v-for="subagent in activeRun?.subagents || []" :key="subagent.subagentId" class="subagent-card">
          <span class="agent-node"><i></i></span>
          <div>
            <b>{{ subagent.label }}</b>
            <small>{{ subagent.role }} · {{ subagent.progress.stepCount }}/{{ subagent.progress.maxSteps }} steps · {{ subagent.usage.credits.toFixed(2) }} cr</small>
            <p v-if="subagent.summary">{{ subagent.summary }}</p>
          </div>
          <em :class="subagent.status">{{ subagentStatusLabel(subagent.status) }}</em>
          <button v-if="['queued','running'].includes(subagent.status)" type="button" @click="cancelSubagentRun(subagent.subagentId)">{{ zh ? '取消' : 'Cancel' }}</button>
        </article>
        <div v-if="!activeRun?.subagents?.length" class="inspector-inline-empty">{{ zh ? '需要并行处理时会在这里出现。' : 'Parallel work appears here when needed.' }}</div>
        <TechnicalDetails :label="zh ? '能力边界' : 'Capability limits'">
          <p class="technical-copy">{{ zh ? '最多 3 个独立上下文。子任务只能读取授权输入并使用离线工具；浏览器、电脑、图片生成、审批与最终交付只由主任务执行。' : 'Up to three isolated contexts. Subtasks can read granted inputs and use offline tools; browser, computer, image generation, approvals, and final delivery remain with the main task.' }}</p>
        </TechnicalDetails>
      </div>
    </template>

    <template #computer>
      <div class="computer-panel">
        <div class="computer-screen" :class="{ active: activeRun && ['provisioning','running','waiting_user'].includes(activeRun.status) }">
          <span class="screen-bar"><i></i><i></i><i></i></span>
          <div>
            <WorkspaceIcon name="monitor" :size="20" />
            <b>{{ activeRun?.sandbox.takeoverAvailable ? (zh ? '等待你接管' : 'Waiting for takeover') : (zh ? '安全桌面' : 'Secure desktop') }}</b>
            <small>{{ activeRun ? runStatusLabel(activeRun.status) : (zh ? '任务启动后才会创建' : 'Created only after a run starts') }}</small>
          </div>
        </div>
        <TechnicalDetails :label="zh ? '安全边界' : 'Safety boundaries'">
          <dl class="technical-list">
            <div><dt>{{ zh ? '外部写操作' : 'External writes' }}</dt><dd>{{ zh ? '逐次审批' : 'Per-action approval' }}</dd></div>
            <div><dt>{{ zh ? '密码 / OTP' : 'Password / OTP' }}</dt><dd>{{ zh ? '仅用户接管' : 'Takeover only' }}</dd></div>
            <div><dt>{{ zh ? '付款' : 'Payments' }}</dt><dd>{{ zh ? '禁止' : 'Forbidden' }}</dd></div>
          </dl>
        </TechnicalDetails>
      </div>
    </template>

    <template #files>
      <div class="file-panel">
        <header><span>{{ zh ? '验证交付物' : 'Verified deliverables' }}</span><b>{{ activeRun?.artifacts?.length || 0 }}</b></header>
        <a v-for="artifact in activeRun?.artifacts || []" :key="artifact.artifactId" :href="artifact.url || undefined" target="_blank" rel="noopener">
          <span class="file-icon"><WorkspaceIcon name="file" /></span>
          <span><b>{{ artifact.filename }}</b><small>{{ artifact.role }} · {{ formatBytes(artifact.byteSize) }}</small></span>
          <em :class="artifact.verificationStatus">{{ artifact.verificationStatus }}</em>
        </a>
        <div v-if="!activeRun?.artifacts?.length" class="inspector-inline-empty">{{ zh ? '生成、扫描和验证中的文件会在这里出现。' : 'Generating, scanning, and verified files appear here.' }}</div>
      </div>
    </template>

    <div v-if="notice" class="workspace-notice" role="status">
      <span>{{ notice }}</span>
      <button type="button" :aria-label="zh ? '关闭通知' : 'Dismiss notification'" @click="notice = ''">
        <WorkspaceIcon name="close" :size="14" />
      </button>
    </div>
  </AgentWorkspaceShell>

  <input
    ref="fileInput"
    class="visually-hidden"
    name="design-attachments"
    type="file"
    tabindex="-1"
    multiple
    accept=".pdf,.zip,.docx,.xlsx,.pptx,.txt,.md,.csv,image/png,image/jpeg,image/webp"
    :aria-label="zh ? '添加参考文件' : 'Add reference files'"
    @change="onFilesSelected"
  />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AgentWorkspaceShell from '../components/workspace/AgentWorkspaceShell.vue';
import TechnicalDetails from '../components/workspace/TechnicalDetails.vue';
import WorkspaceIcon from '../components/workspace/WorkspaceIcon.vue';
const WorkspaceMarkdown = defineAsyncComponent(() => import('../components/workspace/WorkspaceMarkdown.vue'));
import { takeWorkspaceAttachment, type WorkspaceAttachment } from '../services/workspaceAttachmentTransfer';
import { mergeReferenceFiles, referenceFileKey } from '../utils/referenceFiles';
import RunConversationStream from '../components/workspace/RunConversationStream.vue';
import type { WorkspaceFile } from '../services/workspaceFiles';
import ComposerBox from '../components/designConversation/ComposerBox.vue';
import ExecutionCard from '../components/designConversation/ExecutionCard.vue';
import { useLanguageStore } from '@/stores/language';
import { useAgentImgAuth } from '../composables/useAgentImgAuth';
import { useWorkspaceDraft } from '../composables/useWorkspaceDraft';
import { approvalIsAvailable } from '../composables/useAgentApprovals';
import {
  attachDesignExecutionTarget,
  cancelDesignExecution,
  createDesignConversation,
  deleteDesignConversation,
  getDesignAssistantStatus,
  getDesignConversation,
  grantDesignSessionAuthorization,
  increaseDesignExecutionBudget,
  listDesignConversations,
  listDesignSessionAuthorizations,
  openDesignEventStream,
  quoteDesignAgentExecution,
  recordDesignToolQuote,
  revokeDesignSessionAuthorization,
  retryDesignPlanning,
  sendDesignMessage,
  uploadDesignAttachments,
  type DesignAssistantStatus,
  type DesignAttachmentManifest,
  type DesignConversation,
  type DesignExecution,
  type DesignMessage,
  type DesignSourceArtifact,
  type DesignSessionAuthorization
} from '../services/designConversations';
import {
  getCreativeProject,
  updateCreativeProject,
  type CreativeProject,
  type DesignMemory
} from '../services/creativeProjects';
import {
  createAgentRun,
  cancelAgentSubagent,
  getAgentRun,
  openAgentEventStream,
  submitAgentInput,
  type AgentApproval,
  type AgentRun,
  type AgentRunStatus,
  type AgentSubagentStatus
} from '../services/agentRuns';
import {
  createToolTask,
  getToolTask,
  quoteToolTask,
  type ServerToolTask
} from '../services/toolTasks';
import { useAgentActivity } from '../composables/useAgentActivity';
import { createLocalToolHandoff } from '../services/localToolHandoff';
import {
  prepareDesignExecutionAssetIds,
  type DesignExecutionAssetLink
} from '../domain/designExecutionAssets';

type SelectedAttachment = DesignAttachmentManifest & { file: File };

const router = useRouter();
const route = useRoute();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const { isAuthed, ensureAuthed, syncAuth, authUserId } = useAgentImgAuth();
const zh = computed(() => currentLang.value === 'zh');

const status = ref<DesignAssistantStatus | null>(null);
const statusUnavailable = ref(false);
const conversations = ref<DesignConversation[]>([]);
const conversation = ref<DesignConversation | null>(null);
const authorizations = ref<DesignSessionAuthorization[]>([]);
const projectSnapshot = ref<CreativeProject | null>(null);
const draft = ref('');
const selectedConversationId = ref(String(route.query.c || '').trim());
const loadingConversation = ref(Boolean(selectedConversationId.value));
const conversationLoadError = ref('');
const conversationDraftTask = () => selectedConversationId.value ? `conversation:${selectedConversationId.value}` : `conversation:new:${String(route.query.projectId || '')}:${String(route.query.sourceRun || '')}`;
const { restored: draftRestored, discardSaved } = useWorkspaceDraft({ owner: () => authUserId.value, task: conversationDraftTask, draft });
const selectedAttachments = ref<SelectedAttachment[]>([]);
const selectedSourceArtifacts = ref<DesignSourceArtifact[]>([]);
const notice = ref('');
const sending = ref(false);
const planning = ref(false);
const retryingPlanningMessageId = ref('');
const workspaceSearch = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const scrollArea = ref<HTMLElement | null>(null);
const nearBottom = ref(true);
const hasUnreadUpdates = ref(false);
const scrollPositions = new Map<string, number>();
let conversationRevision = 0;
let disposed = false;
const attachmentTarget = ref('');
const suggestionOffset = ref(0);
const localFiles = new Map<string, File>();
const executionFileIds = reactive<Record<string, string[]>>({});
const toolTasks = reactive<Record<string, ServerToolTask>>({});
const activity = useAgentActivity();
const agentRuns = reactive<Record<string, AgentRun>>({});
const runEvents = activity.records;
const runFiles = (id: string): WorkspaceFile[] => (agentRuns[id]?.artifacts || []).filter(a => a.url && a.assetId && a.verificationStatus === 'passed').map(a => ({id:'artifact:'+a.artifactId,path:a.filename,revision:0,assetId:a.assetId!,mimeType:a.mimeType,byteSize:a.byteSize,sha256:a.sha256||'',url:a.url!,originArtifactId:a.artifactId}));

const startingExecutions = reactive(new Set<string>());
const decidingExecutions = reactive(new Set<string>());
const executionStreams = new Map<string, () => void>();
const toolTaskTimers = new Map<string, number>();
const runReadRevisions = new Map<string, number>();
let closeConversationStream: null | (() => void) = null;
let refreshTimer: number | null = null;
let activityPollTimer: number | null = null;
const scheduledAutoStarts = new Set<string>();
const handledMemoryCandidates = reactive(new Set<string>());
const LAST_CONVERSATION_KEY = 'artigen:last-design-conversation';
const lastConversationKey = () => `${LAST_CONVERSATION_KEY}:${encodeURIComponent(authUserId.value)}`;
let visibilityCleanup: (() => void) | null = null;

const suggestionsZh = [
  '为一款柚子气泡水生成夏日主视觉',
  '把这张商品图换成干净的咖啡店场景',
  '审计我的品牌官网并交付 PDF 和可编辑提案',
  '把一批图片压缩到适合网页使用',
  '修复并自然上色一张旧照片',
  '为独立香氛品牌规划一套发布视觉'
];
const suggestionsEn = [
  'Create a summer key visual for a yuzu soda',
  'Move this product into a clean café scene',
  'Audit my brand site and deliver a PDF and editable proposal',
  'Compress a batch of images for the web',
  'Restore and naturally colorize an old photo',
  'Plan a launch visual system for an indie fragrance brand'
];
const visibleSuggestions = computed(() => {
  const source = zh.value ? suggestionsZh : suggestionsEn;
  return Array.from({ length: 3 }, (_, index) => source[(suggestionOffset.value + index) % source.length]);
});
const hasConversation = computed(() => Boolean(conversation.value?.messages?.length));
const visibleConversations = computed(() => {
  const query = workspaceSearch.value.trim().toLowerCase();
  return query
    ? conversations.value.filter((item) => item.title.toLowerCase().includes(query))
    : conversations.value;
});
const selectedConversationTitle = computed(() => conversations.value.find((item) => item.conversationId === selectedConversationId.value)?.title || (zh.value ? '新的设计任务' : 'New design task'));
const conversationGroups = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const week = new Date(today); week.setDate(today.getDate() - 7);
  const groups = [
    { label: zh.value ? '今天' : 'Today', items: [] as DesignConversation[] },
    { label: zh.value ? '昨天' : 'Yesterday', items: [] as DesignConversation[] },
    { label: zh.value ? '过去七天' : 'Past seven days', items: [] as DesignConversation[] },
    { label: zh.value ? '更早' : 'Earlier', items: [] as DesignConversation[] }
  ];
  for (const item of [...visibleConversations.value].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    const time = Date.parse(item.updatedAt);
    groups[time >= today.getTime() ? 0 : time >= yesterday.getTime() ? 1 : time >= week.getTime() ? 2 : 3].items.push(item);
  }
  return groups.filter((group) => group.items.length);
});
const latestExecution = computed(() => conversation.value?.executions?.at(-1) || null);
const activeRun = computed(() => {
  const runs = conversation.value?.executions
    ?.map((execution) => execution.agentRunId ? agentRuns[execution.agentRunId] : null)
    .filter((run): run is AgentRun => Boolean(run)) || [];
  return runs.at(-1) || null;
});
const openAgentRuns = computed(() => (conversation.value?.executions || [])
  .map((execution) => execution.agentRunId ? agentRuns[execution.agentRunId] : null)
  .filter((run): run is AgentRun => Boolean(run && !['succeeded', 'failed', 'cancelled'].includes(run.status))));
const pendingRunInput = ref<{ runId: string; text: string; inputId: string } | null>(null);
const currentExecutionRun = computed(() => latestExecution.value?.agentRunId ? agentRuns[latestExecution.value.agentRunId] || null : null);
const currentExecutionTask = computed(() => latestExecution.value?.toolTaskId ? toolTasks[latestExecution.value.toolTaskId] || null : null);
const workspaceStatusTone = computed<'ready' | 'busy' | 'warning' | 'offline'>(() => {
  if (conversationLoadError.value) return 'offline';
  if (loadingConversation.value || planning.value) return 'busy';
  const state = currentExecutionRun.value?.status || currentExecutionTask.value?.status || latestExecution.value?.status;
  if (state && ['failed', 'cancelled'].includes(state)) return 'offline';
  if (state && ['queued', 'provisioning', 'running', 'verifying', 'planning'].includes(state)) return 'busy';
  if (state && ['waiting_user', 'paused', 'waiting_budget', 'waiting_upload', 'waiting_authorization', 'waiting_clarification'].includes(state)) return 'warning';
  if (!status.value?.enabled || !status.value?.plannerReady) return 'offline';
  return 'ready';
});
const currentCostLabel = computed(() => !planning.value && currentExecutionRun.value
  ? `${zh.value ? '已用' : 'Used'} ${currentExecutionRun.value.budget.used.toFixed(1)} / ${currentExecutionRun.value.budget.maximum} ${zh.value ? '点' : 'credits'}`
  : !planning.value && currentExecutionTask.value && ['success', 'failed', 'cancelled'].includes(currentExecutionTask.value.status)
    ? `${zh.value ? '已结算' : 'Charged'} ${currentExecutionTask.value.receipt.chargedCredits} / ${latestExecution.value?.maxCredits} ${zh.value ? '点上限' : 'credit limit'}`
  : !planning.value && latestExecution.value?.quotedCredits != null
    ? `${zh.value ? '报价' : 'Quote'} ${latestExecution.value.quotedCredits} / ${latestExecution.value.maxCredits} ${zh.value ? '点上限' : 'credit limit'}`
    : `${zh.value ? '自动预算上限' : 'Automatic budget limit'} ${status.value?.autoCreditCap ?? 50} ${zh.value ? '点' : 'credits'}`);
const inspectorBadges = computed(() => ({
  subagents: activeRun.value?.subagents?.filter((item) => ['queued', 'running'].includes(item.status)).length || 0,
  computer: activeRun.value?.approvals?.filter((item) => item.status === 'pending').length || 0,
  files: activeRun.value?.artifacts?.filter((item) => item.verificationStatus === 'passed').length || 0
}));
const activePlan = computed(() => {
  if (activeRun.value?.progress.plan?.length) return activeRun.value.progress.plan;
  return (latestExecution.value?.plan.steps || []).map((label, index) => ({
    label,
    status: (index === 0 && latestExecution.value?.status === 'running'
      ? 'in_progress'
      : latestExecution.value?.status === 'succeeded'
        ? 'completed'
        : 'pending') as 'pending' | 'in_progress' | 'completed'
  }));
});
const planProgressLabel = computed(() => {
  const complete = activePlan.value.filter((step) => step.status === 'completed').length;
  return `${complete}/${activePlan.value.length || 0}`;
});
const runtimeLabel = computed(() => {
  if (loadingConversation.value) return zh.value ? '正在读取对话' : 'Loading conversation';
  if (conversationLoadError.value) return zh.value ? '读取失败' : 'Could not load';
  if (planning.value) return zh.value ? '正在整理你的要求' : 'Preparing your request';
  if (currentExecutionRun.value) return runStatusLabel(currentExecutionRun.value.status);
  if (currentExecutionTask.value) return runStatusLabel(currentExecutionTask.value.status === 'success' ? 'succeeded' : currentExecutionTask.value.status);
  if (latestExecution.value) {
    const labels: Record<string, [string, string]> = {
      queued: ['排队中', 'Queued'], running: ['执行中', 'Running'], succeeded: ['已完成', 'Completed'], failed: ['失败', 'Failed'], cancelled: ['已取消', 'Cancelled'],
      planning: ['规划中', 'Planning'], waiting_budget: ['等待确认预算', 'Review budget'], waiting_upload: ['等待附件', 'Needs files'],
      waiting_authorization: ['等待你确认', 'Needs approval'], waiting_clarification: ['等待你补充', 'Needs details']
    };
    return labels[latestExecution.value.status]?.[zh.value ? 0 : 1] || latestExecution.value.status;
  }
  if (statusUnavailable.value) return zh.value ? '服务暂不可用' : 'Service unavailable';
  if (!status.value) return zh.value ? '正在检查执行器' : 'Checking executors';
  if (!status.value.enabled) return zh.value ? '对话入口尚未开放' : 'Conversation entry is closed';
  if (!status.value.plannerReady) return zh.value ? '规划器暂不可用' : 'Planner unavailable';
  const active = status.value.running + status.value.queued;
  return active
    ? (zh.value ? `${active} 个请求处理中` : `${active} requests in progress`)
    : (zh.value ? '设计 Agent 就绪' : 'Design agent ready');
});
const environmentStatusLabel = computed(() => {
  if (statusUnavailable.value) return zh.value ? '暂不可用' : 'Unavailable';
  if (!status.value) return zh.value ? '检查中' : 'Checking';
  if (!status.value.enabled) return zh.value ? '未开放' : 'Closed';
  if (!status.value.plannerReady) return zh.value ? '规划器不可用' : 'Planner unavailable';
  return '';
});
const executorSummary = computed(() => {
  const latest = latestExecution.value;
  if (!latest) return zh.value ? '智能路由' : 'Smart routing';
  const labels: Record<string, string> = {
    reply: zh.value ? '设计对话' : 'Design conversation',
    local_tool: zh.value ? '本地工具 · 不上传' : 'Local tool · no upload',
    tool_task: zh.value ? '专项工作流' : 'Specialist workflow',
    agent_run: 'Computer Agent'
  };
  return labels[latest.routeKind] || (zh.value ? '智能路由' : 'Smart routing');
});
const activeAuthorizations = computed(() => authorizations.value.filter((item) => item.status === 'active'));

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const formatRelative = (value: string) => {
  const timestamp = new Date(value).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return zh.value ? '刚刚' : 'now';
  if (minutes < 60) return zh.value ? `${minutes} 分钟前` : `${minutes}m ago`;
  const days = Math.floor(minutes / 1440);
  if (days > 0) return zh.value ? `${days} 天前` : `${days}d ago`;
  const hours = Math.floor(minutes / 60);
  return zh.value ? `${hours} 小时前` : `${hours}h ago`;
};
const conversationIsRunning = (conversationId: string) => (
  conversation.value?.conversationId === conversationId &&
  Boolean(latestExecution.value && !['succeeded', 'failed', 'cancelled'].includes(latestExecution.value.status))
);
const runStatusLabel = (value: AgentRunStatus) => ({
  draft: zh.value ? '草稿' : 'Draft',
  queued: zh.value ? '排队' : 'Queued',
  provisioning: zh.value ? '准备环境' : 'Provisioning',
  running: zh.value ? '运行中' : 'Running',
  waiting_user: zh.value ? '等待你' : 'Needs you',
  paused: zh.value ? '已暂停' : 'Paused',
  verifying: zh.value ? '验证中' : 'Verifying',
  succeeded: zh.value ? '已完成' : 'Done',
  failed: zh.value ? '失败' : 'Failed',
  cancelled: zh.value ? '已取消' : 'Cancelled'
}[value]);
const subagentStatusLabel = (value: AgentSubagentStatus) => ({
  queued: zh.value ? '排队' : 'Queued',
  running: zh.value ? '运行中' : 'Running',
  succeeded: zh.value ? '已完成' : 'Done',
  failed: zh.value ? '失败' : 'Failed',
  cancelled: zh.value ? '已取消' : 'Cancelled'
}[value]);
const planStatusLabel = (value: 'pending' | 'in_progress' | 'completed') => ({
  pending: zh.value ? '待执行' : 'Pending',
  in_progress: zh.value ? '当前' : 'Current',
  completed: zh.value ? '完成' : 'Done'
}[value]);
const authorizationActionLabel = (action: string) => {
  const labels: Record<string, [string, string]> = {
    send: ['发送', 'Send'], publish: ['发布', 'Publish'], submit: ['提交', 'Submit'], delete: ['删除', 'Delete'],
    change_permissions: ['权限变更', 'Permission changes'], browser_fill: ['填写页面', 'Page filling'], browser_interaction: ['页面操作', 'Page interactions']
  };
  return labels[action]?.[zh.value ? 0 : 1] || action.replace(/_/g, ' ');
};
const formatAuthorizationExpiry = (value: string) => {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return zh.value ? '即将失效' : 'expiring soon';
  return zh.value
    ? `${time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 前有效`
    : `until ${time.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`;
};
const errorText = (error: unknown) => {
  const code = String((error as { code?: string })?.code || error || 'UNKNOWN_ERROR');
  const labels: Record<string, [string, string]> = {
    AGENT_INPUT_FINALIZING: ['任务正在验证交付，草稿已保留，请完成后发送下一轮要求。', 'The task is verifying delivery. Your draft is saved; send it after completion.'],
    AGENT_INPUT_TARGET_REQUIRED: ['有多个任务正在执行，请在对应任务的高级详情中补充要求。', 'Several tasks are running. Add instructions in the intended task’s details.'],
    AGENT_INPUT_ATTACHMENTS_UNSUPPORTED: ['执行中暂不支持新增附件；请移除附件后发送文字，或创建新任务。草稿已保留。', 'New attachments are not supported during execution. Remove them to send text, or start a new task. Your draft is saved.'],
    LOGIN_REQUIRED: ['请先登录，登录后会自动发送当前草稿。', 'Sign in first; your draft will send automatically.'],
    DESIGN_CONVERSATION_DISABLED: ['对话入口尚未开放，现有 AI 与 Agent 工作台仍可使用。', 'The conversation entry is not open yet; the existing workbenches remain available.'],
    INSUFFICIENT_CREDITS: ['点数不足，任务没有创建，也没有冻结点数。', 'Not enough credits. No task was created or held.'],
    DESIGN_EXECUTION_BUDGET_EXCEEDED: ['真实报价超过当前上限，任务尚未创建。', 'The verified quote exceeds this limit. No task was created.'],
    DESIGN_ATTACHMENTS_REQUIRED: ['这个任务需要附件，请选择文件后继续。', 'This task needs an attachment. Choose a file to continue.'],
    DESIGN_PLANNING_RETRY_LIMIT: ['这条需求最近已重试 3 次，请一小时后再试。', 'This request has been retried three times recently. Try again in an hour.'],
    DESIGN_CONVERSATION_HAS_ACTIVE_EXECUTION: ['当前会话还有 Agent 任务正在执行。请等它结束后再重试规划。', 'An Agent run is still active in this conversation. Wait for it to finish before retrying.'],
    DESIGN_PLANNING_NOT_RETRYABLE: ['这条需求当前不能重试，请刷新会话查看状态。', 'This request cannot be retried in its current state. Refresh to see the latest status.']
  };
  return labels[code]?.[zh.value ? 0 : 1] || (zh.value ? `暂时无法继续：${code}` : `Unable to continue: ${code}`);
};

const isCurrentConversation = (id: string, revision: number) =>
  !disposed && revision === conversationRevision && id === selectedConversationId.value;

const onConversationScroll = () => {
  const area = scrollArea.value;
  if (!area) return;
  nearBottom.value = area.scrollHeight - area.scrollTop - area.clientHeight < 96;
  if (selectedConversationId.value) scrollPositions.set(selectedConversationId.value, area.scrollTop);
  if (nearBottom.value) hasUnreadUpdates.value = false;
};
const scrollToBottom = async (force = false) => {
  if (!force && !nearBottom.value) { hasUnreadUpdates.value = true; return; }
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  await nextTick();
  if (!isCurrentConversation(id, revision)) return;
  scrollArea.value?.scrollTo({ top: scrollArea.value.scrollHeight, behavior: 'auto' });
  nearBottom.value = true;
  hasUnreadUpdates.value = false;
};

const stopConversationMonitoring = () => {
  closeConversationStream?.();
  closeConversationStream = null;
  executionStreams.forEach((close) => close());
  executionStreams.clear();
  toolTaskTimers.forEach((timer) => window.clearTimeout(timer));
  toolTaskTimers.clear();
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = null;
  scheduledAutoStarts.clear();
};
const beginConversationSelection = (id: string) => {
  if (scrollArea.value && selectedConversationId.value) scrollPositions.set(selectedConversationId.value, scrollArea.value.scrollTop);
  conversationRevision += 1;
  stopConversationMonitoring();
  selectedConversationId.value = id;
  conversation.value = null;
  projectSnapshot.value = null;
  authorizations.value = [];
  selectedAttachments.value = [];
  selectedSourceArtifacts.value = [];
  pendingRunInput.value = null;
  activity.clear();
  notice.value = '';
  sending.value = false;
  planning.value = false;
  nearBottom.value = true;
  hasUnreadUpdates.value = false;
  return conversationRevision;
};

const scheduleRefresh = (autoStartExecutionId?: string) => {
  if (autoStartExecutionId) scheduledAutoStarts.add(autoStartExecutionId);
  if (refreshTimer !== null) return;
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    if (!isCurrentConversation(id, revision)) return;
    const executionIds = [...scheduledAutoStarts];
    void refreshConversation(executionIds).catch(() => {});
  }, 180);
};

const connectConversationStream = (id: string, revision = conversationRevision) => {
  closeConversationStream?.();
  closeConversationStream = openDesignEventStream(id, {
    onEvent: (event) => {
      if (!isCurrentConversation(id, revision) || event.conversationId !== id) return;
      if (['execution.ready', 'clarification.required', 'planning.failed'].includes(event.type)) planning.value = false;
      scheduleRefresh(event.type === 'execution.ready' && typeof event.data.executionId === 'string' ? event.data.executionId : undefined);
    }
  });
};

const loadRun = async (runId: string, id = selectedConversationId.value, revision = conversationRevision) => {
  const previous = agentRuns[runId];
  const requestRevision = (runReadRevisions.get(runId) || 0) + 1;
  runReadRevisions.set(runId, requestRevision);
  const loaded = await getAgentRun(runId);
  if (!isCurrentConversation(id, revision) || requestRevision !== runReadRevisions.get(runId)) return;
  agentRuns[runId] = loaded;
  await activity.refresh(runId);
  if (!isCurrentConversation(id, revision) || requestRevision !== runReadRevisions.get(runId)) return;
  const becameTerminal = previous && previous.status !== loaded.status && ['succeeded', 'failed', 'cancelled'].includes(loaded.status);
  const nextPending = loaded.approvals?.filter((item) => approvalIsAvailable(item)).length || 0;
  const previousPending = previous?.approvals?.filter((item) => approvalIsAvailable(item)).length || 0;
  if (!previous || nextPending > previousPending || becameTerminal) await scrollToBottom();
  if (!['succeeded', 'failed', 'cancelled'].includes(loaded.status)) return;
  executionStreams.get(runId)?.();
  executionStreams.delete(runId);
};

const monitorRun = (runId: string, id = selectedConversationId.value, revision = conversationRevision) => {
  if (executionStreams.has(runId) || !isCurrentConversation(id, revision)) return;
  if (['succeeded', 'failed', 'cancelled'].includes(agentRuns[runId]?.status || '')) { if (!runEvents[runId]) void loadRun(runId, id, revision).catch(() => {}); return; }
  const close = openAgentEventStream(runId, {
    onEvent: () => {
      if (!isCurrentConversation(id, revision)) return;
      void loadRun(runId, id, revision).then(() => {
        if (isCurrentConversation(id, revision)) scheduleRefresh();
      }).catch(() => {});
    }
  });
  executionStreams.set(runId, close);
  void loadRun(runId, id, revision).catch(() => {});
};

const monitorToolTask = (taskId: string, id = selectedConversationId.value, revision = conversationRevision) => {
  if (toolTaskTimers.has(taskId) || !isCurrentConversation(id, revision)) return;
  if (['success', 'failed', 'cancelled'].includes(toolTasks[taskId]?.status || '')) return;
  // Reserve before the first async read, so repeated hydration cannot start a
  // second polling chain for the same task.
  toolTaskTimers.set(taskId, 0);
  const poll = async () => {
    try {
      const task = await getToolTask(taskId);
      if (!isCurrentConversation(id, revision)) return;
      toolTasks[taskId] = task;
      if (['success', 'failed', 'cancelled'].includes(task.status)) {
        toolTaskTimers.delete(taskId);
        // A failed conversation refresh must not restart a terminal task poll.
        await refreshConversation().catch(() => {});
        return;
      }
    } catch { /* A transient read error can be retried while this task is selected. */ }
    if (!isCurrentConversation(id, revision)) return;
    toolTaskTimers.set(taskId, window.setTimeout(() => {
      if (isCurrentConversation(id, revision)) void poll();
    }, document.visibilityState === 'visible' ? 1500 : 5000));
  };
  void poll();
};

const hydrateExecutionTargets = (executions: DesignExecution[], id = selectedConversationId.value, revision = conversationRevision) => {
  if (!isCurrentConversation(id, revision)) return;
  for (const execution of executions) {
    if (execution.toolTaskId) monitorToolTask(execution.toolTaskId, id, revision);
    if (execution.agentRunId) monitorRun(execution.agentRunId, id, revision);
  }
};

const syncConversationProject = async (projectId: string | null | undefined, id = selectedConversationId.value, revision = conversationRevision) => {
  if (!projectId) { if (isCurrentConversation(id, revision)) projectSnapshot.value = null; return; }
  if (projectSnapshot.value?.projectId === projectId) return;
  const project = await getCreativeProject(projectId).catch(() => null);
  if (isCurrentConversation(id, revision)) projectSnapshot.value = project;
};

let conversationRefreshRevision = 0;
const refreshConversation = async (autoStartExecutionIds: string[] = []) => {
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  if (!id || conversation.value?.conversationId !== id) return;
  autoStartExecutionIds.forEach((executionId) => scheduledAutoStarts.add(executionId));
  const requestRevision = ++conversationRefreshRevision;
  const fresh = await getDesignConversation(id);
  if (!isCurrentConversation(id, revision) || requestRevision !== conversationRefreshRevision) return;
  const previous = conversation.value;
  const changed = JSON.stringify(previous?.messages) !== JSON.stringify(fresh.messages) || JSON.stringify(previous?.executions) !== JSON.stringify(fresh.executions);
  conversation.value = fresh;
  await syncConversationProject(fresh.projectId, id, revision);
  if (!isCurrentConversation(id, revision)) return;
  hydrateExecutionTargets(fresh.executions || [], id, revision);
  const allowed = new Set(scheduledAutoStarts);
  for (const execution of fresh.executions || []) {
    if (!allowed.has(execution.executionId)) continue;
    scheduledAutoStarts.delete(execution.executionId);
    if (!execution.toolTaskId && !execution.agentRunId && ['queued', 'waiting_upload'].includes(execution.status)) void startExecution(execution);
  }
  if (changed) await scrollToBottom();
};

const refreshConversationList = async () => {
  if (!isAuthed.value) return;
  const owner = authUserId.value;
  const list = await listDesignConversations();
  if (!disposed && owner === authUserId.value && isAuthed.value) conversations.value = list;
};

const openConversation = async (conversationId: string) => {
  const id = String(conversationId || '').trim();
  if (!id) return;
  const revision = beginConversationSelection(id);
  loadingConversation.value = true;
  conversationLoadError.value = '';
  try {
    const loaded = await getDesignConversation(id);
    if (!isCurrentConversation(id, revision)) return;
    conversation.value = loaded;
    try { window.localStorage.setItem(lastConversationKey(), id); } catch {}
    await syncConversationProject(loaded.projectId, id, revision);
    const grants = await listDesignSessionAuthorizations(id).catch(() => []);
    if (!isCurrentConversation(id, revision)) return;
    authorizations.value = grants;
    connectConversationStream(id, revision);
    await router.replace({ path: '/artigen/create', query: { c: id, ...(conversation.value?.projectId ? { projectId: conversation.value.projectId } : {}) } });
    if (!isCurrentConversation(id, revision)) return;
    loadingConversation.value = false;
    hydrateExecutionTargets(loaded.executions || [], id, revision);
    await nextTick();
    if (!isCurrentConversation(id, revision)) return;
    const previousPosition = scrollPositions.get(id);
    if (previousPosition !== undefined && scrollArea.value) { scrollArea.value.scrollTop = previousPosition; onConversationScroll(); }
    else await scrollToBottom(true);
  } catch (error) {
    if (isCurrentConversation(id, revision)) {
      conversationLoadError.value = errorText(error);
      notice.value = conversationLoadError.value;
    }
  } finally {
    if (isCurrentConversation(id, revision)) loadingConversation.value = false;
  }
};

const newConversation = async () => {
  const wasNew = !selectedConversationId.value;
  beginConversationSelection('');
  loadingConversation.value = false;
  conversationLoadError.value = '';
  if (wasNew) draft.value = '';
  try { window.localStorage.setItem(lastConversationKey(), 'new'); } catch {}
  await router.replace({ path: '/artigen/create', query: route.query.projectId ? { projectId: String(route.query.projectId) } : {} });
};

const removeCurrentConversation = async () => {
  const id = conversation.value?.conversationId;
  const revision = conversationRevision;
  if (!id) return;
  const confirmed = window.confirm(zh.value
    ? '删除这个设计会话？消息、执行记录和短期附件关联将一起删除。'
    : 'Delete this design session? Messages, executions, and temporary attachment links will be removed.');
  if (!confirmed) return;
  try {
    await deleteDesignConversation(id);
    await refreshConversationList();
    if (isCurrentConversation(id, revision)) await newConversation();
  } catch (error) {
    if (isCurrentConversation(id, revision)) notice.value = errorText(error);
  }
};

const useSuggestion = (suggestion: string) => {
  draft.value = suggestion;
};
const rotateSuggestions = () => {
  suggestionOffset.value = (suggestionOffset.value + 3) % suggestionsZh.length;
};
const removeAttachment = (clientId: string) => {
  selectedAttachments.value = selectedAttachments.value.filter((item) => item.clientId !== clientId);
};
const openFilePicker = (executionId = '') => {
  attachmentTarget.value = executionId;
  fileInput.value?.click();
};
const onFilesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const incoming = Array.from(input.files || []);
  input.value = '';
  if (sending.value) return;
  const previous = attachmentTarget.value ? [] : selectedAttachments.value.map(item => item.file);
  // The design entry also routes to local browser tools; keep their existing
  // size policy. Cloud executors still enforce their own upload limits.
  const selection = mergeReferenceFiles(previous, incoming);
  if (selection.error) {
    notice.value = zh.value ? '最多添加 10 个文件。原有选择已保留，请先移除部分文件。' : 'Choose up to 10 files. Your selection is kept; remove a file before adding more.';
    return;
  }
  const existing = new Map(selectedAttachments.value.map(item => [referenceFileKey(item.file), item]));
  const added = selection.files.map((file) => existing.get(referenceFileKey(file)) || ({
    clientId: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
    file
  }));
  for (const item of added) localFiles.set(item.clientId, item.file);
  if (attachmentTarget.value) {
    const executionId = attachmentTarget.value;
    executionFileIds[executionId] = added.map((item) => item.clientId);
    attachmentTarget.value = '';
    const execution = conversation.value?.executions.find((item) => item.executionId === executionId);
    if (execution) void startExecution(execution);
    return;
  }
  selectedAttachments.value = added;
};

const acceptWorkspaceAttachment = (attachment: WorkspaceAttachment) => {
  if (attachment.owner !== authUserId.value || attachment.project !== (conversation.value?.projectId || String(route.query.projectId || ''))) return false;
  if (sending.value || selectedAttachments.value.length >= 10) { notice.value = zh.value ? '请等待发送完成，或先移除一些附件。' : 'Wait for sending or remove a reference first.'; return false; }
  const existing = selectedAttachments.value.find(item => item.fileRef?.id === attachment.reference.id && item.fileRef?.sha256 === attachment.reference.sha256);
  if (!existing) selectedAttachments.value.push({ clientId: crypto.randomUUID(), name: attachment.file.name, byteSize: attachment.file.size, mimeType: attachment.file.type || 'text/plain', file: attachment.file, fileRef: attachment.reference });
  if (!draft.value.trim()) draft.value = zh.value ? `请根据我的要求修改 ${attachment.file.name}，保留原文件并交付可比较的新版本。` : `Update ${attachment.file.name} and deliver a comparable new version.`;
  return true;
};
const onWorkspaceAttachment = (event: Event) => {
  const attachment = (event as CustomEvent<WorkspaceAttachment>).detail;
  attachment.accepted = acceptWorkspaceAttachment(attachment);
};
const submitAuthenticated = async () => {
  const submittedDraft = draft.value;
  const text = submittedDraft.trim();
  if (!text || sending.value || loadingConversation.value) return;
  const revision = conversationRevision;
  const owner = authUserId.value;
  const originalDraftTask = conversationDraftTask();
  let id = selectedConversationId.value;
  const attachments = [...selectedAttachments.value];
  sending.value = true;
  notice.value = '';
  conversationRefreshRevision += 1;
  try {
    // Resolve still-loading runs before deciding whether this is steering or a new request.
    await Promise.all((conversation.value?.executions || [])
      .filter((execution) => execution.agentRunId && !agentRuns[execution.agentRunId])
      .map((execution) => loadRun(execution.agentRunId!)));
    if (openAgentRuns.value.length) {
      if (openAgentRuns.value.length !== 1) throw { code: 'AGENT_INPUT_TARGET_REQUIRED' };
      if (selectedSourceArtifacts.value.length) {
        notice.value = zh.value
          ? '当前任务结束后，再用已选文件开始下一轮；文件选择和执行中补充不能混在一起。'
          : 'Start the next run with the selected files after this task ends. File selection cannot be combined with an in-run update.';
        return;
      }
      if (selectedAttachments.value.length) throw { code: 'AGENT_INPUT_ATTACHMENTS_UNSUPPORTED' };
      const target = openAgentRuns.value[0];
      if (target.status === 'verifying') throw { code: 'AGENT_INPUT_FINALIZING' };
      if (pendingRunInput.value?.runId !== target.runId || pendingRunInput.value.text !== text) {
        pendingRunInput.value = { runId: target.runId, text, inputId: crypto.randomUUID() };
      }
      await submitAgentInput(target.runId, { message: text, inputId: pendingRunInput.value.inputId });
      if (!isCurrentConversation(id, revision) || owner !== authUserId.value) return;
      pendingRunInput.value = null;
      discardSaved(owner, originalDraftTask, submittedDraft);
      if (draft.value === submittedDraft) draft.value = '';
      await loadRun(target.runId);
      await scrollToBottom();
      return;
    }
    if (!conversation.value) {
      const created = await createDesignConversation(String(route.query.projectId || '') || null, String(route.query.sourceRun || '') || null);
      if (!isCurrentConversation(id, revision)) return;
      const currentDraft = draft.value;
      id = created.conversationId;
      selectedConversationId.value = id;
      draft.value = currentDraft;
      conversation.value = { ...created, messages: [], executions: [] };
      connectConversationStream(id, revision);
      await router.replace({ path: '/artigen/create', query: { c: id, ...(conversation.value?.projectId ? { projectId: conversation.value.projectId } : {}) } });
      if (!isCurrentConversation(id, revision)) return;
    }
    const manifest = attachments.map(({ file: _file, ...item }) => item);
    for (const item of attachments) localFiles.set(item.clientId, item.file);
    planning.value = true;
    const sourceArtifactIds = selectedSourceArtifacts.value.map(artifact => artifact.artifactId);
    const sent = await sendDesignMessage(id, text, manifest, sourceArtifactIds);
    discardSaved(owner, `conversation:${id}`, submittedDraft);
    discardSaved(owner, originalDraftTask, submittedDraft);
    if (!isCurrentConversation(id, revision)) return;
    if (conversation.value && !conversation.value.messages.some((message) => message.messageId === sent.messageId)) {
      conversation.value.messages = [...conversation.value.messages, sent];
    }
    if (draft.value === submittedDraft) draft.value = '';
    selectedSourceArtifacts.value = [];
    const sentFileIds = new Set(attachments.map((item) => item.clientId));
    selectedAttachments.value = selectedAttachments.value.filter((item) => !sentFileIds.has(item.clientId));
    window.dispatchEvent(new Event('workspace:navigation-changed'));
    await refreshConversationList();
    if (isCurrentConversation(id, revision)) await scrollToBottom(true);
  } catch (error) {
    if (isCurrentConversation(id, revision)) { planning.value = false; notice.value = errorText(error); }
  } finally {
    if (isCurrentConversation(id, revision)) sending.value = false;
  }
};

const selectSourceArtifact = (artifact: DesignSourceArtifact) => {
  const current = selectedSourceArtifacts.value.filter((item) => item.artifactId !== artifact.artifactId);
  selectedSourceArtifacts.value = [...current, artifact].slice(-10);
  if (!draft.value.trim()) {
    draft.value = zh.value
      ? '请基于选中的上一版文件继续修改，并生成可下载的新版本。'
      : 'Please continue editing the selected previous file and deliver a downloadable new version.';
  }
};

const removeSourceArtifact = (artifactId: string) => {
  selectedSourceArtifacts.value = selectedSourceArtifacts.value.filter((item) => item.artifactId !== artifactId);
};

const submitMessage = () => {
  if (!draft.value.trim() || loadingConversation.value || conversationLoadError.value) return;
  if (!ensureAuthed(submitAuthenticated)) return;
  void submitAuthenticated();
};

const canRetryPlanning = (message: DesignMessage) => {
  if (message.kind !== 'error' || !message.retryableMessageId || !conversation.value) return false;
  const latestFailure = [...conversation.value.messages].reverse().find((candidate) => (
    candidate.kind === 'error' && candidate.retryableMessageId === message.retryableMessageId
  ));
  if (latestFailure?.messageId !== message.messageId) return false;
  return conversation.value.messages.some((candidate) => (
    candidate.messageId === message.retryableMessageId &&
    candidate.role === 'user' &&
    candidate.planningStatus === 'failed'
  ));
};

const retryFailedPlanning = async (errorMessage: DesignMessage) => {
  const sourceMessage = conversation.value?.messages.find((message) => (
    message.messageId === errorMessage.retryableMessageId && message.role === 'user'
  ));
  const conversationId = conversation.value?.conversationId;
  if (!conversationId || !sourceMessage || retryingPlanningMessageId.value) return;
  if (openAgentRuns.value.length) {
    notice.value = zh.value
      ? '当前会话还有 Agent 任务正在执行。请等它结束后再重试规划，避免把原需求发进正在运行的任务。'
      : 'An Agent run is still active in this conversation. Wait for it to finish before retrying, so this request is not sent into that run.';
    return;
  }
  retryingPlanningMessageId.value = sourceMessage.messageId;
  planning.value = true;
  notice.value = '';
  try {
    const result = await retryDesignPlanning(conversationId, sourceMessage.messageId);
    sourceMessage.planningStatus = result.status;
    await refreshConversation();
  } catch (error) {
    planning.value = false;
    notice.value = errorText(error);
    await refreshConversation().catch(() => {});
  } finally {
    retryingPlanningMessageId.value = '';
  }
};

const sendRecommended = () => {
  draft.value = zh.value
    ? '按你的推荐直接做；请自行作出合理假设，不再追问。'
    : 'Use your recommended assumptions and proceed without further questions.';
  submitMessage();
};

const executionInputFiles = (execution: DesignExecution) => {
  const ids = executionFileIds[execution.executionId] || execution.plan.attachmentClientIds || [];
  return ids
    .map((clientId) => ({ clientId, file: localFiles.get(clientId) }))
    .filter((item): item is { clientId: string; file: File } => item.file instanceof File);
};

const ensureUploadedAssets = async (execution: DesignExecution) => {
  const active = conversation.value;
  if (!active || active.conversationId !== execution.conversationId) return [];
  const selectedClientIds = executionFileIds[execution.executionId];
  const clientIds = selectedClientIds?.length
    ? selectedClientIds
    : execution.plan.attachmentClientIds || [];
  if (execution.plan.uploadRequired && !clientIds.length) {
    throw Object.assign(new Error('DESIGN_ATTACHMENTS_REQUIRED'), { code: 'DESIGN_ATTACHMENTS_REQUIRED' });
  }
  const uploads: DesignExecutionAssetLink[] = active.uploads || [];
  return prepareDesignExecutionAssetIds({
    clientIds,
    uploads,
    availableClientIds: [...localFiles.keys()],
    uploadMissing: (clientIdsToUpload) => uploadDesignAttachments(
      conversation.value!.conversationId,
      clientIdsToUpload.map((clientId) => ({
        clientId,
        file: localFiles.get(clientId)!
      }))
    )
  });
};

const runToolExecution = async (execution: DesignExecution, assetIds: string[], revision: number) => {
  const id = execution.conversationId;
  if (!execution.toolId || !execution.operation || !isCurrentConversation(id, revision)) return;
  const quote = await quoteToolTask({ toolId: execution.toolId, operation: execution.operation, options: execution.plan.options || {} });
  if (!isCurrentConversation(id, revision)) return;
  const checked = await recordDesignToolQuote(id, execution.executionId, quote.quoteId);
  if (!isCurrentConversation(id, revision)) return;
  if (checked.status === 'waiting_budget') { await refreshConversation(); return; }
  const task = await createToolTask({
    toolId: execution.toolId, operation: execution.operation,
    options: execution.plan.options || {}, quoteId: quote.quoteId,
    inputAssets: assetIds, idempotencyKey: `design:${execution.executionId}`
  });
  // Once a task was created, attach it to its original execution even if the
  // viewer changed tasks. Never bind its result to the newly selected session.
  await attachDesignExecutionTarget(id, execution.executionId, { toolTaskId: task.taskId });
  if (!isCurrentConversation(id, revision)) return;
  toolTasks[task.taskId] = task;
  monitorToolTask(task.taskId, id, revision);
};

const runAgentExecution = async (execution: DesignExecution, assetIds: string[], revision: number) => {
  const id = execution.conversationId;
  if (!isCurrentConversation(id, revision)) return;
  const projectId = conversation.value?.projectId || null;
  const quoted = await quoteDesignAgentExecution(id, execution.executionId);
  if (!isCurrentConversation(id, revision)) return;
  if (!quoted.quote.canStart || quoted.execution.status === 'waiting_budget') { await refreshConversation(); return; }
  const plan = execution.plan;
  const created = await createAgentRun({
    fileEditTargets: (execution.plan.attachmentClientIds || []).flatMap(clientId => { const manifest = conversation.value?.messages.flatMap(m => m.attachments || []).find(a => a.clientId === clientId); const upload = conversation.value?.uploads?.find(a => a.clientId === clientId); return manifest?.fileRef && /^text\//.test(manifest.mimeType) && manifest.byteSize <= 1024 * 1024 && upload ? [{ ...manifest.fileRef, assetId: upload.assetId }] : []; }),
    sourceArtifactIds: plan.sourceArtifactIds || [],
    sourceConversationId: plan.sourceArtifactIds?.length ? id : undefined,
    objective: String(plan.objective || ''), assetIds, maxCredits: execution.maxCredits,
    capabilities: plan.capabilities || { files: true, shell: true },
    deliverables: plan.deliverables || [], taskSpec: plan.taskSpec || null,
    browserConfig: plan.browserConfig || { allowedOrigins: [], persistSession: false },
    projectId, idempotencyKey: `design:${execution.executionId}`
  });
  await attachDesignExecutionTarget(id, execution.executionId, { agentRunId: created.runId });
  if (!isCurrentConversation(id, revision)) return;
  agentRuns[created.runId] = created;
  monitorRun(created.runId, id, revision);
};

const startExecution = async (execution: DesignExecution) => {
  const id = execution.conversationId;
  const revision = conversationRevision;
  if (!isCurrentConversation(id, revision) || startingExecutions.has(execution.executionId)) return;
  if (execution.routeKind === 'reply' || execution.routeKind === 'local_tool') return;
  if (execution.toolTaskId || execution.agentRunId || execution.status === 'waiting_budget') return;
  startingExecutions.add(execution.executionId);
  try {
    const assetIds = await ensureUploadedAssets(execution);
    if (!isCurrentConversation(id, revision)) return;
    if (execution.routeKind === 'tool_task') await runToolExecution(execution, assetIds, revision);
    if (execution.routeKind === 'agent_run') await runAgentExecution(execution, assetIds, revision);
    if (isCurrentConversation(id, revision)) await refreshConversation();
  } catch (error) {
    if (isCurrentConversation(id, revision) && String((error as { code?: string })?.code || '') !== 'DESIGN_ATTACHMENTS_REQUIRED') notice.value = errorText(error);
  } finally {
    startingExecutions.delete(execution.executionId);
  }
};

const openLocalTool = async (execution: DesignExecution) => {
  if (!execution.localRoute) return;
  const files = executionInputFiles(execution).map((item) => item.file);
  const handoff = files.length ? createLocalToolHandoff(files) : '';
  await router.push({
    path: execution.localRoute,
    query: {
      ...(execution.operation ? { operation: execution.operation } : {}),
      ...(handoff ? { handoff } : {})
    }
  });
};

const increaseBudget = async (execution: DesignExecution) => {
  if (!conversation.value) return;
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  const minimum = Math.max(execution.quotedCredits || 0, execution.maxCredits + 10);
  try {
    await increaseDesignExecutionBudget(
      id,
      execution.executionId,
      Math.min(500, minimum)
    );
    if (!isCurrentConversation(id, revision)) return;
    await refreshConversation();
    if (!isCurrentConversation(id, revision)) return;
    notice.value = zh.value
      ? `本次上限已提高到 ${Math.min(500, minimum)} 点；请确认新上限后再启动。`
      : `This execution cap is now ${Math.min(500, minimum)} credits. Review it before starting.`;
  } catch (error) {
    if (!isCurrentConversation(id, revision)) return;
    notice.value = errorText(error);
  }
};

const cancelExecution = async (execution: DesignExecution) => {
  if (!conversation.value) return;
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  try {
    await cancelDesignExecution(id, execution.executionId);
    if (!isCurrentConversation(id, revision)) return;
    await refreshConversation();
  } catch (error) {
    if (!isCurrentConversation(id, revision)) return;
    notice.value = errorText(error);
  }
};

const prepareRetry = (execution: DesignExecution) => {
  const original = String(
    execution.plan.objective ||
    execution.plan.options?.prompt ||
    conversation.value?.title ||
    ''
  ).trim();
  draft.value = original;
  notice.value = zh.value
    ? '原要求已放回输入框；检查失败原因并修改后重新发送。'
    : 'The original request is back in the composer. Adjust it using the failure reason, then send again.';
  void scrollToBottom(true);
};

const approveAgentAction = async (
  execution: DesignExecution,
  approval: AgentApproval,
  authorizeSession: boolean
) => {
  if (!conversation.value || !execution.agentRunId) return;
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  if (!approvalIsAvailable(approval)) { notice.value = zh.value ? '审批已过期，请刷新任务。' : 'This approval expired. Refresh the task.'; return; }
  if (decidingExecutions.has(execution.executionId)) return;
  decidingExecutions.add(execution.executionId);
  try {
    await submitAgentInput(execution.agentRunId, {
      approvalId: approval.approvalId,
      decision: 'approved'
    });
    if (!isCurrentConversation(id, revision)) return;
    if (authorizeSession) {
      const origin = new URL(approval.recipient).origin;
      await grantDesignSessionAuthorization(
        id,
        origin,
        approval.actionType
      );
      const grants = await listDesignSessionAuthorizations(id);
      if (isCurrentConversation(id, revision)) authorizations.value = grants;
    }
    if (!isCurrentConversation(id, revision)) return;
    await loadRun(execution.agentRunId, id, revision);
    if (!isCurrentConversation(id, revision)) return;
    await refreshConversation();
  } catch (error) {
    if (!isCurrentConversation(id, revision)) return;
    notice.value = errorText(error);
  } finally {
    decidingExecutions.delete(execution.executionId);
  }
};

const revokeAuthorization = async (authorizationId: string) => {
  if (!conversation.value) return;
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  try {
    await revokeDesignSessionAuthorization(id, authorizationId);
    const grants = await listDesignSessionAuthorizations(id);
    if (isCurrentConversation(id, revision)) authorizations.value = grants;
  } catch (error) {
    if (!isCurrentConversation(id, revision)) return;
    notice.value = errorText(error);
  }
};

const denyAgentAction = async (execution: DesignExecution, approval: AgentApproval) => {
  if (!conversation.value || !execution.agentRunId) return;
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  if (!approvalIsAvailable(approval)) { notice.value = zh.value ? '审批已过期，请刷新任务。' : 'This approval expired. Refresh the task.'; return; }
  if (decidingExecutions.has(execution.executionId)) return;
  decidingExecutions.add(execution.executionId);
  try {
    await submitAgentInput(execution.agentRunId, {
      approvalId: approval.approvalId,
      decision: 'denied',
      decisionReason: zh.value
        ? '用户在设计会话中拒绝了此操作。'
        : 'Denied from the design conversation.'
    });
    if (!isCurrentConversation(id, revision)) return;
    await loadRun(execution.agentRunId, id, revision);
    if (!isCurrentConversation(id, revision)) return;
    await refreshConversation();
  } catch (error) {
    if (!isCurrentConversation(id, revision)) return;
    notice.value = errorText(error);
  } finally {
    decidingExecutions.delete(execution.executionId);
  }
};

const cancelSubagentRun = async (subagentId: string) => {
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  const run = activeRun.value;
  if (!run) return;
  try {
    await cancelAgentSubagent(run.runId, subagentId);
    await loadRun(run.runId, id, revision);
    if (!isCurrentConversation(id, revision)) return;
    notice.value = zh.value ? '子 Agent 已取消，父任务会继续。' : 'Subagent cancelled; the parent run will continue.';
  } catch (error) {
    if (!isCurrentConversation(id, revision)) return;
    notice.value = errorText(error);
  }
};

type MemoryCandidate = DesignMessage['memoryCandidates'][number];
const memoryCandidateKey = (messageId: string, index: number) => `${messageId}:${index}`;
const memoryFieldLabel = (field: keyof DesignMemory) => ({
  audience: zh.value ? '受众' : 'Audience',
  goals: zh.value ? '目标' : 'Goals',
  tone: zh.value ? '语气' : 'Tone',
  visualKeywords: zh.value ? '视觉关键词' : 'Visual keywords',
  mustInclude: zh.value ? '必须包含' : 'Must include',
  avoid: zh.value ? '避免' : 'Avoid',
  outputPreferences: zh.value ? '输出偏好' : 'Output preferences',
  factualConstraints: zh.value ? '事实约束' : 'Factual constraints'
}[field] || field);
const formatMemoryCandidate = (candidate: MemoryCandidate) => {
  const value = Array.isArray(candidate.value)
    ? candidate.value.join('、')
    : candidate.value && typeof candidate.value === 'object'
      ? Object.values(candidate.value).flat().filter(Boolean).join('、')
      : String(candidate.value || '');
  return `${memoryFieldLabel(candidate.field)} · ${value}`;
};
const memoryAlreadyStored = (candidate: MemoryCandidate) => {
  const memory = projectSnapshot.value?.designMemory;
  if (!memory) return false;
  const current = memory[candidate.field];
  if (Array.isArray(current)) {
    const values = Array.isArray(candidate.value) ? candidate.value : [candidate.value];
    return values.every((value) => current.includes(String(value)));
  }
  if (current && typeof current === 'object' && candidate.value && typeof candidate.value === 'object') {
    return Object.entries(candidate.value).every(([key, value]) => (
      JSON.stringify((current as Record<string, unknown>)[key]) === JSON.stringify(value)
    ));
  }
  return String(current || '') === String(candidate.value || '');
};
const memoryCandidateHandled = (messageId: string, index: number, candidate: MemoryCandidate) => (
  !conversation.value?.projectId ||
  handledMemoryCandidates.has(memoryCandidateKey(messageId, index)) ||
  memoryAlreadyStored(candidate)
);
const dismissMemoryCandidate = (messageId: string, index: number) => {
  handledMemoryCandidates.add(memoryCandidateKey(messageId, index));
};
const mergeMemoryCandidate = (memory: DesignMemory, candidate: MemoryCandidate): DesignMemory => {
  if (candidate.field === 'audience') {
    return { ...memory, audience: String(candidate.value || '') };
  }
  if (candidate.field === 'outputPreferences') {
    const value = candidate.value && typeof candidate.value === 'object'
      ? candidate.value as Partial<DesignMemory['outputPreferences']>
      : {};
    return {
      ...memory,
      outputPreferences: { ...memory.outputPreferences, ...value }
    };
  }
  const values = (Array.isArray(candidate.value) ? candidate.value : [candidate.value])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const field = candidate.field as Exclude<keyof DesignMemory, 'audience' | 'outputPreferences'>;
  return { ...memory, [field]: [...new Set([...(memory[field] || []), ...values])] };
};
const saveMemoryCandidate = async (
  messageId: string,
  index: number,
  candidate: MemoryCandidate
) => {
  const id = selectedConversationId.value;
  const revision = conversationRevision;
  const projectId = conversation.value?.projectId;
  if (!projectId) return;
  try {
    let project = projectSnapshot.value || await getCreativeProject(projectId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        project = await updateCreativeProject(projectId, {
          revision: project.revision,
          designMemory: mergeMemoryCandidate(project.designMemory, candidate)
        });
        if (!isCurrentConversation(id, revision)) return;
        projectSnapshot.value = project;
        handledMemoryCandidates.add(memoryCandidateKey(messageId, index));
        notice.value = zh.value ? '已保存到项目记忆。' : 'Saved to project memory.';
        return;
      } catch (error) {
        if (String((error as { code?: string })?.code || '') !== 'PROJECT_REVISION_CONFLICT' || attempt > 0) {
          throw error;
        }
        project = await getCreativeProject(projectId);
      }
    }
  } catch (error) {
    if (isCurrentConversation(id, revision)) notice.value = errorText(error);
  }
};

const executionsForMessage = (messageId: string) => (
  conversation.value?.executions?.filter((item) => item.sourceMessageId === messageId) || []
);

let restoringConversation: { owner: string; revision: number; promise: Promise<void> } | null = null;
const restoreAuthenticatedConversation = () => {
  syncAuth();
  if (disposed || !isAuthed.value) return Promise.resolve();
  const owner = authUserId.value;
  const revision = conversationRevision;
  if (restoringConversation?.owner === owner && restoringConversation.revision === revision) {
    return restoringConversation.promise;
  }
  const pending = (async () => {
    await refreshConversationList().catch(() => {});
    if (disposed || owner !== authUserId.value || !isAuthed.value || revision !== conversationRevision || conversation.value || sending.value) return;
    if (!route.query.c && !selectedConversationId.value && (draft.value.trim() || selectedAttachments.value.length || selectedSourceArtifacts.value.length)) return;
    const requested = String(route.query.c || '').trim() || ((route.query.projectId || route.query.sourceRun) ? '' : (() => {
      try {
        const scoped = window.localStorage.getItem(lastConversationKey());
        if (scoped !== null) return scoped;
        const legacy = window.localStorage.getItem(LAST_CONVERSATION_KEY) || '';
        return conversations.value.some((item) => item.conversationId === legacy) ? legacy : '';
      } catch { return ''; }
    })());
    if (requested && requested !== 'new') await openConversation(requested);
  })();
  restoringConversation = { owner, revision, promise: pending };
  void pending.finally(() => {
    if (restoringConversation?.promise === pending) restoringConversation = null;
  });
  return pending;
};

const handleAuthChanged = () => {
  const previousOwner = authUserId.value;
  syncAuth();
  if (previousOwner !== authUserId.value || !isAuthed.value) {
    const requested = isAuthed.value ? String(route.query.c || '').trim() : '';
    beginConversationSelection(requested);
    loadingConversation.value = Boolean(requested);
    conversationLoadError.value = '';
    conversations.value = [];
    localFiles.clear();
    Object.keys(toolTasks).forEach((key) => delete toolTasks[key]);
    Object.keys(agentRuns).forEach((key) => delete agentRuns[key]);
    Object.keys(runEvents).forEach((key) => delete runEvents[key]);
  }
  void restoreAuthenticatedConversation();
};

onMounted(async () => {
  window.addEventListener('workspace:attach-file', onWorkspaceAttachment);
  const pending = takeWorkspaceAttachment(authUserId.value, String(route.query.projectId || ''));
  const explicitNew = Boolean(pending || route.query.projectId || route.query.sourceRun);

  activityPollTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    for (const execution of conversation.value?.executions || []) {
      const id = execution.agentRunId;
      if (id && (!agentRuns[id] || !['succeeded', 'failed', 'cancelled'].includes(agentRuns[id].status) || activity.errors[id])) {
        void loadRun(id).catch(() => {});
      }
    }
  }, 5000);
  window.addEventListener('app-auth-changed', handleAuthChanged as EventListener);
  try {
    status.value = await getDesignAssistantStatus();
    statusUnavailable.value = false;
  } catch {
    status.value = null;
    statusUnavailable.value = true;
  }
  if (disposed) return;
  syncAuth();
  if (!isAuthed.value) {
    loadingConversation.value = false;
    if (selectedConversationId.value) conversationLoadError.value = errorText({ code: 'LOGIN_REQUIRED' });
    return;
  }
  if (!explicitNew || route.query.c) await restoreAuthenticatedConversation();
  else await refreshConversationList().catch(() => {});
  if (pending && !disposed) acceptWorkspaceAttachment(pending);
  if (disposed) return;
  const onVisible = () => {
    if (document.visibilityState === 'visible' && conversation.value) {
      void refreshConversation().catch(() => {});
      void refreshConversationList().catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  visibilityCleanup = () => document.removeEventListener('visibilitychange', onVisible);
});

watch(() => String(route.query.projectId || ''), (value, previous) => {
  if (value === previous || route.query.c || disposed) return;
  beginConversationSelection('');
  const pending = takeWorkspaceAttachment(authUserId.value, value);
  if (pending) acceptWorkspaceAttachment(pending);
});

watch(() => String(route.query.c || '').trim(), (id, previous) => {
  if (disposed || id === selectedConversationId.value) return;
  if (id) void openConversation(id);
  else if (previous) void newConversation();
});

onBeforeUnmount(() => {
  window.removeEventListener('workspace:attach-file', onWorkspaceAttachment);
  disposed = true;
  if (activityPollTimer !== null) window.clearInterval(activityPollTimer);
  conversationRevision += 1;
  window.removeEventListener('app-auth-changed', handleAuthChanged as EventListener);
  stopConversationMonitoring();
  visibilityCleanup?.();
  try {
    if (isAuthed.value && conversation.value?.conversationId === selectedConversationId.value) {
      window.localStorage.setItem(lastConversationKey(), selectedConversationId.value);
    }
  } catch {}
});
</script>

<style scoped>

.history-group { display: grid; gap: 4px; }
.history-group > p { margin: 8px 8px 5px; color: var(--muted-2); font-size: 12px; font-weight: 680; letter-spacing: .05em; text-transform: uppercase; }
.history-item { display: grid; grid-template-columns: 8px minmax(0,1fr); width: 100%; align-items: start; gap: 9px; min-height: 46px; padding: 8px 9px; border: 0; border-radius: 9px; color: var(--muted); text-align: left; background: transparent; cursor: pointer; }
.history-item:hover { color: var(--text); background: var(--surface-raised); }
.history-item.active { color: var(--text); background: var(--surface-hover); }
.history-state { width: 6px; height: 6px; margin-top: 5px; border-radius: 50%; background: var(--muted-2); }
.history-state.running { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb,var(--acid) 13%,transparent); }
.history-item > span:last-child { display: grid; min-width: 0; gap: 2px; }
.history-item b { overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.history-item small { color: var(--muted-2); font-size: 12px; }
.history-empty { display: grid; min-height: 140px; place-content: center; place-items: center; gap: 9px; color: var(--muted-2); font-size: 12px; }
.history-empty svg { width: 20px; height: 20px; }

.conversation-heading { display: flex; width: 100%; min-width: 0; align-items: center; gap: 10px; }
.conversation-heading > div { display: grid; min-width: 0; gap: 2px; }
.conversation-heading strong { overflow: hidden; font-size: 14px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.conversation-heading small { overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.conversation-icon { position: relative; display: grid; flex: 0 0 auto; width: 28px; height: 28px; place-items: center; color: var(--muted); }
.conversation-icon.agent_run::after,.conversation-icon.tool_task::after { position: absolute; right: 0; bottom: 1px; width: 6px; height: 6px; border-radius: 50%; background: var(--acid); content: ""; box-shadow: 0 0 0 2px var(--bg); }
.quiet-action { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 8px; border: 0; border-radius: 8px; color: var(--muted); font-size: 12px; background: transparent; cursor: pointer; }
.quiet-action:hover { color: var(--danger); background: var(--surface-hover); }
.quiet-action svg { width: 14px; height: 14px; }

.workspace-zero { display: grid; grid-template-columns:minmax(0,1fr); width: min(var(--conversation-max),calc(100% - var(--conversation-gutter) * 2)); height: 100%; min-height: 0; margin: 0 auto; padding: clamp(64px,10vh,118px) 0 48px; overflow-y: auto; overscroll-behavior: contain; align-content: safe center; scrollbar-color: var(--border) transparent; }
.zero-copy { margin: 0 0 20px; }
.zero-copy:has(+ .service-unavailable-note) { margin-bottom: 10px; }
.zero-copy h1 { margin: 0; font-size: clamp(30px,3vw,38px); font-weight: 680; letter-spacing: -.04em; line-height: 1.12; text-wrap: balance; }
.service-unavailable-note { display: flex; width: min(var(--conversation-max),100%); min-width: 0; align-items: flex-start; gap: 8px; margin: 0 auto 14px; color: var(--warning); font-size: 13px; line-height: 1.5; }
.service-unavailable-note i { flex: 0 0 auto; width: 6px; height: 6px; margin-top: 7px; border-radius: 50%; background: currentColor; }
.service-unavailable-note span { min-width: 0; overflow-wrap: anywhere; }
.workspace-zero :deep(.composer-box),.docked-composer :deep(.composer-box) { color: var(--text); background: var(--surface); }
:deep(.composer-box textarea) { color: var(--text); font-size: 16px; line-height: 1.58; }
:deep(.composer-box textarea::placeholder) { color: var(--muted-2); }
:deep(.composer-box .attach) { color: var(--muted); background: transparent; }
:deep(.composer-box .privacy) { color: var(--muted-2); }
:deep(.composer-box .send) { color: var(--acid-ink); background: var(--acid); }
:deep(.composer-box .send:disabled) { color: var(--muted-2); background: var(--surface-hover); }
:deep(.composer-box .attachment-list > span) { border: 0; color: var(--text); background: var(--surface-hover); }
:deep(.composer-box .attachment-list small),:deep(.composer-box .attachment-list button) { color: var(--muted); }
.suggestion-grid { display: grid; gap: 3px; margin-top: 26px; }
.suggestion-grid header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; color: var(--muted); font-size: 12px; font-weight: 620; }
.suggestion-grid header button { display: grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 7px; color: var(--muted); background: transparent; cursor: pointer; }
.suggestion-grid header button:hover { color: var(--text); background: var(--surface); }.suggestion-grid header svg { width: 16px; height: 16px; }
.suggestion-grid > button { display: block; min-height: 42px; padding: 9px 10px; border: 0; border-radius: 9px; color: var(--muted); text-align: left; background: transparent; cursor: pointer; transition: color 170ms ease,background-color 170ms ease,transform 120ms cubic-bezier(.23,1,.32,1); }
.suggestion-grid > button:hover { color: var(--text); background: var(--surface-hover); }
.suggestion-grid > button:active { transform: scale(.995); }
.suggestion-grid > button b { font-size: 14px; font-weight: 540; line-height: 1.5; }

.workspace-chat { position: relative; display: grid; grid-template-rows: minmax(0,1fr) auto; height: 100%; min-height: 0; }
.message-scroll { min-height: 0; overflow-y: auto; padding: 32px var(--conversation-gutter) 32px; overflow-anchor: none; scrollbar-color: var(--border) transparent; scroll-padding-bottom: 40px; }
.chat-service-note { margin-bottom: 24px; }
.authorization-strip { display: grid; width: min(var(--conversation-max),100%); gap: 8px; margin: 0 auto 24px; padding: 12px 12px 12px 15px; border: 0; border-radius: 10px; background: color-mix(in srgb,var(--warning) 8%,var(--surface)); box-shadow: inset 3px 0 var(--warning); }
.authorization-strip header,.authorization-strip article { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; }.authorization-strip header span { font-size: 12px; font-weight: 680; }.authorization-strip small { color: var(--muted); font-size: 12px; }.authorization-strip article { padding-top: 8px; }.authorization-strip article > span { display: grid; min-width: 0; gap: 2px; overflow-wrap: anywhere; }.authorization-strip article b { font-size: 12px; }.authorization-strip button { flex: 0 0 auto; min-height: 32px; padding: 0 9px; border: 0; border-radius: 7px; color: var(--danger); font-size: 12px; background: var(--surface-hover); cursor: pointer; }
.message { display: flex; width: min(var(--conversation-max),100%); gap: 12px; margin: 0 auto 24px; }
.message.user { justify-content: flex-end; }
.assistant-mark { display: grid; flex: 0 0 auto; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 9px; color: var(--text); font-size: 12px; font-weight: 700; background: var(--surface-raised); }
.message-body { min-width: 0; max-width: 82%; padding: 2px 0; overflow-wrap: anywhere; color: var(--text); font-size: 15px; line-height: 1.72; }
.message.user .message-body { max-width: 74%; padding: 10px 13px; border: 0; border-radius: 13px 13px 4px 13px; background: var(--surface-raised); }
.message-body p { margin: 0; white-space: pre-wrap; }
.planning-state { display: block; margin-top: 7px; color: var(--muted); font-size: 11px; }
.planning-retry { min-height: 32px; margin-top: 9px; padding: 0 9px; border: 0; border-radius: 7px; color: var(--acid-text); font-size: 11px; background: color-mix(in srgb,var(--acid) 10%,var(--surface)); cursor: pointer; }
.planning-retry:disabled { opacity: .6; cursor: wait; }
.message-files { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }.message-files span { display: inline-flex; max-width: 100%; min-width: 0; align-items: center; gap: 5px; padding: 5px 7px; overflow-wrap: anywhere; border: 0; border-radius: 7px; color: var(--muted); font-size: 12px; background: var(--surface-hover); }.message-files svg { flex: 0 0 auto; width: 12px; }
.clarification { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }.clarification button { min-height: 34px; padding: 0 10px; border: 0; border-radius: 8px; color: var(--text); font-size: 12px; background: var(--surface-hover); cursor: pointer; }.clarification button:hover { color: var(--acid-text); }.clarification .recommended { color: var(--acid-ink); background: var(--acid); }
.memory-suggestions { display: grid; gap: 6px; margin-top: 12px; }
.memory-suggestions article { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 10px; border-radius: 9px; background: var(--surface-raised); }
.memory-suggestions article > span { display: grid; min-width: 0; gap: 2px; }
.memory-suggestions small { color: var(--muted); font-size: 12px; }
.memory-suggestions b { overflow-wrap: anywhere; font-size: 12px; font-weight: 580; }
.memory-suggestions article > div { display: flex; flex: 0 0 auto; gap: 4px; }
.memory-suggestions button { min-height: 32px; padding: 0 9px; border: 0; border-radius: 7px; color: var(--muted); font-size: 12px; background: transparent; cursor: pointer; }
.memory-suggestions .save-memory { color: var(--acid-ink); background: var(--acid); }
.planning-message { color: var(--muted); }.planning-line { display: flex; gap: 3px; margin-bottom: 6px; }.planning-line span { width: 5px; height: 5px; border-radius: 50%; background: var(--acid); animation: thinking 800ms ease-in-out infinite alternate; }.planning-line span:nth-child(2) { animation-delay: 120ms; }.planning-line span:nth-child(3) { animation-delay: 240ms; }
@keyframes thinking { to { opacity: .25; transform: translateY(-2px); } }
.docked-composer { position: relative; z-index: 12; padding: 18px var(--conversation-gutter) 16px; background: var(--bg); }
.docked-composer :deep(.composer-box) { max-width: var(--conversation-max); margin: 0 auto; }
.docked-composer > p { max-width: var(--conversation-max); margin: 6px auto 0; color: var(--muted-2); font-size: 12px; text-align: center; }
.selected-source-artifacts { display: flex; width: min(var(--conversation-max),100%); flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 auto 8px; }
.source-context-label { width: 100%; color: var(--muted); font-size: 11px; }
.source-context-chip { display: inline-flex; min-width: 0; max-width: 100%; align-items: center; gap: 6px; padding: 5px 7px 5px 9px; border-radius: 7px; color: var(--acid-text); background: color-mix(in srgb,var(--acid) 10%,var(--surface)); }
.source-context-chip b { overflow: hidden; font-size: 11px; font-weight: 580; text-overflow: ellipsis; white-space: nowrap; }
.source-context-chip button { display: grid; flex: 0 0 auto; width: 22px; height: 22px; place-items: center; border: 0; border-radius: 5px; color: var(--muted); font-size: 16px; background: transparent; cursor: pointer; }
.source-context-chip button:hover { color: var(--danger); background: var(--surface-hover); }

:deep(.execution-card) { max-width: var(--conversation-max); margin: 4px auto 22px; border: 0; border-radius: 12px; color: var(--text); background: var(--surface); box-shadow: none; }
:deep(.execution-card > header) { padding: 11px 13px; border: 0; background: transparent; }
:deep(.execution-card .executor-icon) { width: 30px; height: 30px; border: 0; border-radius: 7px; color: var(--acid-ink); background: var(--acid); }
:deep(.execution-card header p),:deep(.execution-card .status-chip),:deep(.execution-card .execution-meta span),:deep(.execution-card .footer-actions > span) { color: var(--muted); }
:deep(.execution-card header h3) { font-size: 14px; }:deep(.execution-card .status-chip) { border: 0; border-radius: 7px; background: var(--surface-hover); }
:deep(.execution-card .execution-body) { padding: 13px; }
:deep(.execution-card .execution-meta) { border: 0; }:deep(.execution-card .execution-meta span),:deep(.execution-card .deliverables > a),:deep(.execution-card .footer-actions button),:deep(.execution-card .footer-actions a) { border: 0; color: var(--text); background: var(--surface-raised); }
:deep(.execution-card .local-note),:deep(.execution-card .upload-note),:deep(.execution-card .budget-block),:deep(.execution-card .failure-block),:deep(.execution-card .approval-card) { border-color: var(--border); color: var(--text); background: var(--surface-raised); }
:deep(.execution-card .local-note span),:deep(.execution-card .upload-note span),:deep(.execution-card .budget-block span),:deep(.execution-card .failure-block span),:deep(.execution-card .approval-card p),:deep(.execution-card .approval-card small) { color: var(--muted); }
:deep(.execution-card .approval-actions button) { border: 0; color: var(--text); background: var(--surface-hover); }
:deep(.execution-card .approval-actions button:first-child),:deep(.execution-card .approval-card a),:deep(.execution-card .footer-actions .primary) { border-color: var(--acid); color: var(--acid-ink); background: var(--acid); }
:deep(.execution-card .approval-actions .session) { border-color: color-mix(in srgb,var(--warning) 55%,var(--border)); color: var(--text); background: transparent; }
:deep(.execution-card .approval-actions .deny),:deep(.execution-card .footer-actions .cancel) { border-color: color-mix(in srgb,var(--danger) 50%,var(--border)); color: var(--danger); background: transparent; }
:deep(.execution-card .continue-artifact) { min-height: 34px; padding: 0 9px; border: 0; border-radius: 7px; color: var(--acid-text); font-size: 11px; background: color-mix(in srgb,var(--acid) 10%,var(--surface)); cursor: pointer; }
:deep(.execution-card .continue-artifact:hover) { background: color-mix(in srgb,var(--acid) 17%,var(--surface)); }
:deep(.execution-card .source-artifact-note) { margin-top: 9px; color: var(--muted); font-size: 11px; }
:deep(.execution-card > footer) { padding-inline: 13px; }:deep(.execution-card .progress-track) { background: var(--border); }:deep(.execution-card .progress-track span) { background: var(--acid); }

.inspector-stack,.computer-panel { display: grid; gap: 14px; }
.inspector-section { overflow: hidden; border: 0; border-radius: 10px; background: transparent; }
.inspector-section > header,.execution-spine > header,.subagent-panel > header,.file-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 9px; min-height: 38px; padding: 0 11px; border: 0; color: var(--muted); font-size: 13px; }
.inspector-section > header b,.execution-spine > header b,.subagent-panel > header b,.file-panel > header b { font-size: 12px; font-weight: 620; }.inspector-section > header .verified { color: var(--success); }
.inspector-section dl,.technical-list { display: grid; margin: 0; }.inspector-section dl > div,.technical-list > div { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,auto); gap: 8px; padding: 8px 11px; }.inspector-section dt,.technical-list dt { color: var(--muted); font-size: 12px; }.inspector-section dd,.technical-list dd { max-width: 190px; overflow: hidden; margin: 0; font-size: 12px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }.inspector-section ul { display: grid; gap: 5px; margin: 0; padding: 9px 11px 11px; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; list-style: none; }
.inspector-section dt,.technical-list dt,.inspector-section dd,.technical-list dd,.inspector-section ul { font-size: 12px; }
.technical-copy { margin: 0; padding: 2px 4px 6px; color: var(--muted); font-size: 12px; line-height: 1.6; }

.execution-spine { overflow: hidden; border: 0; border-radius: 10px; background: var(--surface); }
.execution-spine ol { margin: 0; padding: 0; list-style: none; }
.execution-spine li { position: relative; display: grid; grid-template-columns: 24px minmax(0,1fr); gap: 8px; min-height: 58px; padding: 9px 9px 7px; }
.execution-spine li:not(:last-child)::after { position: absolute; top: 31px; bottom: -3px; left: 20px; width: 1px; background: var(--border); content: ""; }
.execution-spine li > span { position: relative; z-index: 1; display: grid; width: 24px; height: 24px; place-items: center; }
.execution-spine li > span i { width: 7px; height: 7px; border: 1px solid var(--muted-2); border-radius: 50%; background: var(--surface); }
.execution-spine li.completed > span i { border-color: var(--success); background: var(--success); }.execution-spine li.in_progress > span i { border-color: var(--acid); background: var(--acid); box-shadow: 0 0 0 4px color-mix(in srgb,var(--acid) 13%,transparent); }
.execution-spine li > div { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 6px; }.execution-spine li small { color: var(--muted-2); font-family: ui-monospace,SFMono-Regular,monospace; font-size: 12px; }.execution-spine li b { font-size: 12px; font-weight: 580; line-height: 1.45; }.execution-spine li em { color: var(--muted); font-size: 12px; font-style: normal; }

.subagent-panel,.file-panel { overflow: hidden; border: 0; border-radius: 10px; background: var(--surface); }
.subagent-card { position: relative; display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: start; gap: 8px; padding: 10px; border: 0; }
.subagent-card.parent { background: color-mix(in srgb,var(--acid) 4%,var(--surface)); }.subagent-card > div { display: grid; min-width: 0; gap: 3px; }.subagent-card b { overflow-wrap: anywhere; font-size: 12px; }.subagent-card small { overflow-wrap: anywhere; color: var(--muted); font-size: 12px; line-height: 1.45; }.subagent-card p { display: -webkit-box; overflow: hidden; margin: 3px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.agent-node { display: grid; width: 22px; height: 22px; place-items: center; border: 0; border-radius: 7px; background: var(--surface-raised); }.agent-node i { width: 6px; height: 6px; border-radius: 50%; background: var(--acid); }
.subagent-card em { padding: 3px 5px; border: 0; border-radius: 5px; color: var(--muted); font-size: 12px; font-style: normal; white-space: nowrap; }.subagent-card em.running,.subagent-card em.queued { color: var(--acid-text); background: color-mix(in srgb,var(--acid) 8%,transparent); }.subagent-card em.succeeded { color: var(--success); }.subagent-card em.failed { color: var(--danger); }
.subagent-card button { grid-column: 2/-1; justify-self: start; min-height: 30px; padding: 0 8px; border: 0; border-radius: 7px; color: var(--danger); font-size: 12px; background: var(--surface-hover); cursor: pointer; }

.computer-screen { overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); aspect-ratio: 16/10; }.computer-screen.active { border-color: color-mix(in srgb,var(--acid) 34%,var(--border)); }.screen-bar { display: flex; align-items: center; gap: 4px; height: 22px; padding: 0 7px; border-bottom: 1px solid var(--border); background: var(--surface-raised); }.screen-bar i { width: 5px; height: 5px; border-radius: 50%; background: var(--muted-2); }.computer-screen > div { display: grid; height: calc(100% - 22px); place-content: center; place-items: center; gap: 5px; color: var(--muted); text-align: center; }.computer-screen > div svg { width: 20px; height: 20px; }.computer-screen > div b { font-size: 12px; }.computer-screen > div small { color: var(--muted-2); font-size: 12px; }

.file-panel > a { display: grid; grid-template-columns: 28px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 9px 10px; border: 0; color: var(--text); text-decoration: none; }.file-panel > a:hover { background: var(--surface-raised); }.file-icon { display: grid; width: 26px; height: 26px; place-items: center; border: 0; border-radius: 7px; color: var(--muted); background: var(--surface-raised); }.file-icon svg { width: 16px; height: 16px; }.file-panel > a > span:nth-child(2) { display: grid; min-width: 0; gap: 2px; }.file-panel > a b { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.file-panel > a small { color: var(--muted); font-size: 12px; }.file-panel em { font-size: 12px; font-style: normal; }.file-panel em.passed { color: var(--success); }.file-panel em.failed { color: var(--danger); }
.inspector-inline-empty { padding: 18px 12px; color: var(--muted); font-size: 12px; line-height: 1.55; text-align: center; }

.workspace-notice { position: fixed; top: 68px; right: 20px; z-index: 300; display: flex; align-items: center; gap: 12px; max-width: 420px; padding: 10px 11px; border: 0; border-radius: 9px; color: var(--text); font-size: 12px; background: var(--surface); box-shadow: 0 18px 50px rgb(0 0 0 / 30%); }.workspace-notice span { flex: 1; min-width: 0; overflow-wrap: anywhere; }.workspace-notice button { display: grid; flex: 0 0 auto; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 7px; color: var(--muted); background: transparent; cursor: pointer; }.workspace-notice svg { width: 14px; height: 14px; }
.visually-hidden { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

.conversation-load-state { display: grid; width: min(var(--conversation-max),calc(100% - var(--conversation-gutter) * 2)); height: 100%; margin: 0 auto; align-content: center; justify-items: start; gap: 14px; }
.conversation-load-state h1 { margin: 0; color: var(--text); font-size: 24px; }
.conversation-load-state p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.6; }
.conversation-load-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.conversation-load-actions button,.new-updates { min-height: 44px; padding: 10px 14px; border: 0; border-radius: 10px; color: var(--text); font-size: 13px; background: var(--surface-raised); cursor: pointer; }
.new-updates { display: block; margin: 0 auto 10px; color: var(--acid-text); }
.draft-restored,.docked-composer > .draft-restored { max-width: var(--conversation-max); margin: 8px auto; color: var(--muted); font-size: 12px; line-height: 1.5; text-align: left; }
@media (max-width: 799px) {

  .history-item { min-height: 44px; }
  .quiet-action { min-width: 44px; min-height: 44px; justify-content: center; }
  .quiet-action span { display: none; }
  .conversation-icon { display: none; }
  .workspace-zero { width: min(100% - var(--conversation-gutter) * 2,var(--conversation-max)); padding: 34px 0 24px; align-content: start; }
  .zero-copy { margin-top: 10px; }.zero-copy h1 { font-size: 27px; }
  .suggestion-grid { grid-template-columns: 1fr; margin-top: 18px; }.suggestion-grid > button { min-height: 52px; }
  .suggestion-grid header button,.authorization-strip button,.clarification button,.memory-suggestions button,.subagent-card button,.workspace-notice button { min-width: 44px; min-height: 44px; }
  .memory-suggestions article { align-items: flex-start; flex-direction: column; }
  .memory-suggestions article > div { align-self: flex-end; }
  .zero-meta span:nth-child(n+2) { display: none; }
  .authorization-strip header,.authorization-strip article { align-items: flex-start; flex-wrap: wrap; }.authorization-strip button { margin-left: auto; }
  .message-scroll { padding-block: 24px; }.message-body,.message.user .message-body { max-width: 88%; font-size: 14px; }
  .docked-composer { padding-block: 10px 8px; }.docked-composer > p { display: none; }
  :deep(.composer-box textarea) { font-size: 16px; }
  :deep(.composer-box .attach),:deep(.composer-box .send) { min-width: 44px; min-height: 44px; }
  .workspace-notice { top: 62px; right: 10px; left: 10px; max-width: none; }
}
@media (max-height: 620px) {
  .workspace-zero { padding-block: 24px; align-content: start; }
  .zero-copy { margin-bottom: 14px; }
  .suggestion-grid { margin-top: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; transition-duration: 0s !important; animation-duration: 0s !important; animation-iteration-count: 1 !important; }
}
</style>
