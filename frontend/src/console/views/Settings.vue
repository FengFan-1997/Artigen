<template>
  <div class="settings-page">
    <ConsolePageHeader :eyebrow="ui.eyebrow" :title="ui.title" :description="ui.description">
      <template #actions>
        <a-button type="primary" :loading="loading" @click="loadPrincipal">
          <template #icon><ReloadOutlined /></template>
          {{ ui.refresh }}
        </a-button>
      </template>
    </ConsolePageHeader>

    <a-alert
      v-if="errorMessage"
      type="error"
      show-icon
      :message="ui.loadFailed"
      :description="errorMessage"
      style="margin-bottom: 14px"
    />

    <section class="settings-grid">
      <a-card>
        <template #title><span class="card-title">{{ ui.adminIdentity }}</span></template>
        <div class="identity-profile">
          <span class="identity-avatar">{{ initial }}</span>
          <div>
            <h2>{{ principal?.username || userId || 'admin' }}</h2>
            <span class="role-pill">{{ roleLabel }}</span>
          </div>
        </div>
        <dl class="detail-list">
          <div>
            <dt>{{ ui.authentication }}</dt>
            <dd>{{ ui.shortToken }}</dd>
          </div>
          <div>
            <dt>{{ ui.databaseCheck }}</dt>
            <dd>{{ principal?.legacy ? ui.legacyMode : ui.activeAdmin }}</dd>
          </div>
          <div>
            <dt>{{ ui.sessionStorage }}</dt>
            <dd>{{ ui.memoryOnly }}</dd>
          </div>
          <div>
            <dt>{{ ui.environment }}</dt>
            <dd><span class="environment-pill">{{ environmentLabel }}</span></dd>
          </div>
        </dl>
      </a-card>

      <a-card>
        <template #title><span class="card-title">{{ ui.permissions }}</span></template>
        <div class="permission-list">
          <div v-for="permission in permissionRows" :key="permission.label">
            <span class="permission-icon" :class="{ 'permission-icon--off': !permission.enabled }">
              <CheckOutlined v-if="permission.enabled" />
              <MinusOutlined v-else />
            </span>
            <span>
              <strong>{{ permission.label }}</strong>
              <small>{{ permission.description }}</small>
            </span>
          </div>
        </div>
      </a-card>

      <a-card class="wide-card">
        <template #title><span class="card-title">{{ ui.securityPolicy }}</span></template>
        <div class="policy-grid">
          <article>
            <SafetyCertificateOutlined />
            <div>
              <strong>{{ ui.rolePolicy }}</strong>
              <p>{{ ui.rolePolicyText }}</p>
            </div>
          </article>
          <article>
            <AuditOutlined />
            <div>
              <strong>{{ ui.auditPolicy }}</strong>
              <p>{{ ui.auditPolicyText }}</p>
            </div>
          </article>
          <article>
            <RadarChartOutlined />
            <div>
              <strong>{{ ui.behaviorPolicy }}</strong>
              <p>{{ ui.behaviorPolicyText }}</p>
            </div>
          </article>
          <article>
            <DatabaseOutlined />
            <div>
              <strong>{{ ui.sourcePolicy }}</strong>
              <p>{{ ui.sourcePolicyText }}</p>
            </div>
          </article>
        </div>
      </a-card>

      <a-card class="wide-card">
        <template #title><span class="card-title">{{ ui.systemInfo }}</span></template>
        <div class="system-table">
          <div>
            <span>{{ ui.frontendOrigin }}</span>
            <code>{{ origin }}</code>
          </div>
          <div>
            <span>{{ ui.apiMode }}</span>
            <code>{{ ui.sameOrigin }}</code>
          </div>
          <div>
            <span>{{ ui.behaviorRetention }}</span>
            <code>90 days</code>
          </div>
          <div>
            <span>{{ ui.adminEndpoint }}</span>
            <code>/api/admin/me</code>
          </div>
        </div>
      </a-card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  AuditOutlined,
  CheckOutlined,
  DatabaseOutlined,
  MinusOutlined,
  RadarChartOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons-vue';
import { storeToRefs } from 'pinia';
import ConsolePageHeader from '@/console/components/ConsolePageHeader.vue';
import { getConsoleUserId, useConsoleStore } from '@/stores/console';
import { useLanguageStore } from '@/stores/language';

const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const loading = ref(false);
const errorMessage = ref('');
const principal = computed(() => consoleStore.adminPrincipal);
const userId = computed(() => getConsoleUserId());
const role = computed(() => principal.value?.role || 'operator');
const initial = computed(() => String(principal.value?.username || userId.value || 'A').slice(0, 1).toUpperCase());
const origin = window.location.origin;
const environmentLabel = computed(() =>
  /(^|\\.)dev[.-]|localhost|127\\.0\\.0\\.1/i.test(window.location.hostname)
    ? 'DEV'
    : 'PRODUCTION'
);
const roleLabel = computed(() => {
  if (role.value === 'owner') return 'Owner';
  if (role.value === 'admin') return 'Administrator';
  return 'Operator';
});

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        eyebrow: 'Access & policy',
        title: '系统设置',
        description: '查看当前管理员身份、权限边界、数据保留与后台安全策略。这里不生成虚假的本地 API Key。',
        refresh: '刷新身份',
        loadFailed: '管理员身份加载失败',
        adminIdentity: '管理员身份',
        authentication: '认证方式',
        shortToken: '服务端短时 Bearer token',
        databaseCheck: '数据库复核',
        legacyMode: '非生产兼容模式',
        activeAdmin: '每次请求检查 active 管理员',
        sessionStorage: '凭证存储',
        memoryOnly: '仅页面内存，不持久化',
        environment: '当前环境',
        permissions: '角色权限',
        readData: '读取运营数据',
        readDataDesc: '用户、点数、行为、用量和审计',
        adjustCredits: '调整用户点数',
        adjustCreditsDesc: '需要 admin 或 owner，自动写账本与审计',
        manageStatus: '停用或恢复用户',
        manageStatusDesc: '需要 admin 或 owner，停用时撤销会话',
        ownerGovernance: '管理员治理',
        ownerGovernanceDesc: '仅 owner 可执行最高权限操作',
        securityPolicy: '安全与数据策略',
        rolePolicy: '最小权限',
        rolePolicyText: 'operator 默认只读；敏感写操作由服务端再次判定角色，前端隐藏按钮不作为安全边界。',
        auditPolicy: '操作可追责',
        auditPolicyText: '账号状态和钱包调整保存真实操作者、目标、请求编号与前后状态。',
        behaviorPolicy: '行为最小化',
        behaviorPolicyText: '只记录页面和稳定操作标识，不保存输入文字、prompt、图片地址、密码或密钥。',
        sourcePolicy: '真实数据源',
        sourcePolicyText: '用户、钱包、行为与系统审计来自 PostgreSQL；localStorage 不保存业务真相。',
        systemInfo: '运行信息',
        frontendOrigin: '前端 Origin',
        apiMode: 'API 连接',
        sameOrigin: '同源 /api',
        behaviorRetention: '行为保留',
        adminEndpoint: '身份接口'
      }
    : {
        eyebrow: 'Access & policy',
        title: 'System settings',
        description: 'Inspect the current administrator, access boundaries, retention, and console security policy. No fake local API keys are generated.',
        refresh: 'Refresh identity',
        loadFailed: 'Failed to load administrator identity',
        adminIdentity: 'Administrator identity',
        authentication: 'Authentication',
        shortToken: 'Short-lived server Bearer token',
        databaseCheck: 'Database validation',
        legacyMode: 'Non-production compatibility',
        activeAdmin: 'Active administrator checked per request',
        sessionStorage: 'Credential storage',
        memoryOnly: 'Page memory only; not persisted',
        environment: 'Environment',
        permissions: 'Role permissions',
        readData: 'Read operations data',
        readDataDesc: 'Users, credits, behavior, usage, and audit',
        adjustCredits: 'Adjust user credits',
        adjustCreditsDesc: 'Admin or owner; writes ledger and audit',
        manageStatus: 'Disable or enable users',
        manageStatusDesc: 'Admin or owner; disabling revokes sessions',
        ownerGovernance: 'Administrator governance',
        ownerGovernanceDesc: 'Highest-privilege operations require owner',
        securityPolicy: 'Security and data policy',
        rolePolicy: 'Least privilege',
        rolePolicyText: 'Operators are read-only. The server re-checks sensitive writes; hidden UI is never the security boundary.',
        auditPolicy: 'Accountable operations',
        auditPolicyText: 'Status and wallet changes record actor, target, request ID, and before/after state.',
        behaviorPolicy: 'Minimized behavior',
        behaviorPolicyText: 'Only pages and stable action keys are stored—never input text, prompts, image URLs, passwords, or secrets.',
        sourcePolicy: 'Canonical sources',
        sourcePolicyText: 'Users, wallets, behavior, and audit come from PostgreSQL. localStorage is not business truth.',
        systemInfo: 'Runtime information',
        frontendOrigin: 'Frontend origin',
        apiMode: 'API connection',
        sameOrigin: 'Same-origin /api',
        behaviorRetention: 'Behavior retention',
        adminEndpoint: 'Identity endpoint'
      }
);

const permissionRows = computed(() => [
  { label: ui.value.readData, description: ui.value.readDataDesc, enabled: true },
  {
    label: ui.value.adjustCredits,
    description: ui.value.adjustCreditsDesc,
    enabled: ['admin', 'owner', 'development'].includes(role.value)
  },
  {
    label: ui.value.manageStatus,
    description: ui.value.manageStatusDesc,
    enabled: ['admin', 'owner', 'development'].includes(role.value)
  },
  {
    label: ui.value.ownerGovernance,
    description: ui.value.ownerGovernanceDesc,
    enabled: ['owner', 'development'].includes(role.value)
  }
]);

const loadPrincipal = async () => {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    await consoleStore.fetchAdminPrincipal();
  } catch (error: any) {
    errorMessage.value = String(error?.message || error);
  } finally {
    loading.value = false;
  }
};

onMounted(loadPrincipal);
</script>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.card-title {
  color: #27334a;
  font-size: 14px;
}

.identity-profile {
  display: flex;
  align-items: center;
  gap: 14px;
}

.identity-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(145deg, #3159df, #7958d8);
  box-shadow: 0 10px 24px rgba(49, 89, 223, 0.2);
  font-size: 19px;
  font-weight: 800;
}

.identity-profile h2 {
  margin: 0 0 5px;
  color: #202c44;
  font-size: 18px;
}

.role-pill,
.environment-pill {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 20px;
  color: #3159df;
  background: #edf1ff;
  font-size: 9px;
  font-weight: 750;
}

.detail-list {
  display: grid;
  margin: 22px 0 0;
}

.detail-list > div {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid #eef0f4;
}

.detail-list > div:last-child {
  border-bottom: 0;
}

.detail-list dt {
  color: #8993a5;
  font-size: 10px;
}

.detail-list dd {
  margin: 0;
  color: #3a465c;
  font-size: 11px;
  text-align: right;
}

.permission-list {
  display: grid;
}

.permission-list > div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 11px;
  padding: 10px 0;
  border-bottom: 1px solid #eef0f4;
}

.permission-list > div:last-child {
  border-bottom: 0;
}

.permission-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #16845a;
  background: #e9f8f1;
}

.permission-icon--off {
  color: #939cad;
  background: #eff1f4;
}

.permission-list > div > span:last-child {
  display: grid;
  gap: 2px;
}

.permission-list strong {
  color: #344056;
  font-size: 11px;
}

.permission-list small {
  color: #9099aa;
  font-size: 9px;
}

.wide-card {
  grid-column: 1 / -1;
}

.policy-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 13px;
}

.policy-grid article {
  display: flex;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e8ebf1;
  border-radius: 11px;
  background: #fafbfc;
}

.policy-grid article > span {
  flex: 0 0 auto;
  color: #5572dc;
  font-size: 16px;
}

.policy-grid article div {
  display: grid;
  gap: 5px;
}

.policy-grid strong {
  color: #303c53;
  font-size: 11px;
}

.policy-grid p {
  margin: 0;
  color: #828c9e;
  font-size: 9px;
  line-height: 1.65;
}

.system-table {
  display: grid;
}

.system-table > div {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 20px;
  padding: 11px 0;
  border-bottom: 1px solid #eef0f4;
}

.system-table > div:last-child {
  border-bottom: 0;
}

.system-table span {
  color: #8490a3;
  font-size: 10px;
}

.system-table code {
  overflow: hidden;
  color: #42506a;
  font-size: 10px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1000px) {
  .policy-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .settings-grid,
  .policy-grid {
    grid-template-columns: 1fr;
  }

  .wide-card {
    grid-column: auto;
  }

  .system-table > div {
    grid-template-columns: 1fr;
    gap: 5px;
  }

  .system-table code {
    text-align: left;
  }
}
</style>
