<template>
  <div class="users-page">
    <ConsolePageHeader :eyebrow="ui.eyebrow" :title="ui.title" :description="ui.description">
      <template #actions>
        <a-button :loading="loading" @click="fetchUsers">
          <template #icon><ReloadOutlined /></template>
          {{ ui.refresh }}
        </a-button>
      </template>
    </ConsolePageHeader>

    <section class="summary-row">
      <div>
        <span>{{ ui.totalUsers }}</span>
        <strong>{{ total.toLocaleString() }}</strong>
      </div>
      <div>
        <span>{{ ui.activeUsers }}</span>
        <strong>{{ activeCount.toLocaleString() }}</strong>
      </div>
      <div>
        <span>{{ ui.disabledUsers }}</span>
        <strong>{{ disabledCount.toLocaleString() }}</strong>
      </div>
      <div>
        <span>{{ ui.visibleCredits }}</span>
        <strong>{{ visibleCredits.toLocaleString() }}</strong>
      </div>
    </section>

    <a-card class="users-card">
      <div class="table-toolbar">
        <a-input-search
          v-model:value="searchText"
          class="user-search"
          :placeholder="ui.searchPlaceholder"
          allow-clear
          @search="applySearch"
        />
        <a-select
          v-model:value="statusFilter"
          :options="statusOptions"
          :placeholder="ui.statusFilter"
          allow-clear
          style="width: 150px"
        />
        <span class="table-total">{{ ui.matching(total) }}</span>
      </div>

      <a-alert
        v-if="errorMessage"
        type="error"
        show-icon
        :message="ui.loadFailed"
        :description="errorMessage"
        style="margin-bottom: 14px"
      />

      <a-table
        :data-source="filteredUsers"
        :columns="columns"
        row-key="userId"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1120 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'identity'">
            <button class="identity-button" type="button" @click="openUserDetails(record)">
              <span class="user-avatar">{{ avatarText(record) }}</span>
              <span>
                <strong>{{ record.name || record.username || ui.unnamed }}</strong>
                <small>{{ record.email || record.userId }}</small>
              </span>
            </button>
          </template>
          <template v-else-if="column.key === 'userId'">
            <span class="mono">{{ record.userId }}</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <span class="status-pill" :class="`status-pill--${record.status}`">
              <i></i>{{ statusLabel(record.status) }}
            </span>
          </template>
          <template v-else-if="column.key === 'credits'">
            <div class="credit-cell">
              <strong>{{ Number(record.wallet?.available || 0).toLocaleString() }}</strong>
              <small>{{ ui.frozen }} {{ Number(record.wallet?.frozen || 0).toLocaleString() }}</small>
            </div>
          </template>
          <template v-else-if="column.key === 'visits'">
            {{ Number(record.visits || 0).toLocaleString() }}
          </template>
          <template v-else-if="column.key === 'lastSeen'">
            <div class="date-cell">
              <strong>{{ relativeTime(record.lastSeen) }}</strong>
              <small>{{ formatDate(record.lastSeen) }}</small>
            </div>
          </template>
          <template v-else-if="column.key === 'createdAt'">
            {{ formatDate(record.createdAt) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="openUserDetails(record)">
              {{ ui.viewDetails }} <ArrowRightOutlined />
            </a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer
      v-model:open="drawerOpen"
      :width="isMobile ? '100%' : 920"
      placement="right"
      :title="ui.userDetails"
      destroy-on-close
    >
      <template v-if="selectedUser">
        <div class="drawer-profile">
          <span class="drawer-avatar">{{ avatarText(selectedUser) }}</span>
          <div>
            <div class="drawer-name-row">
              <h2>{{ selectedUser.name || selectedUser.username || ui.unnamed }}</h2>
              <span class="status-pill" :class="`status-pill--${selectedUser.status}`">
                <i></i>{{ statusLabel(selectedUser.status) }}
              </span>
            </div>
            <p>{{ selectedUser.email || '-' }} · <span class="mono">{{ selectedUser.userId }}</span></p>
          </div>
        </div>

        <section class="drawer-metrics">
          <div>
            <span>{{ ui.availableCredits }}</span>
            <strong>{{ Number(selectedUser.wallet?.available || 0).toLocaleString() }}</strong>
          </div>
          <div>
            <span>{{ ui.frozenCredits }}</span>
            <strong>{{ Number(selectedUser.wallet?.frozen || 0).toLocaleString() }}</strong>
          </div>
          <div>
            <span>{{ ui.visits }}</span>
            <strong>{{ Number(selectedUser.visits || 0).toLocaleString() }}</strong>
          </div>
          <div>
            <span>{{ ui.lastSeen }}</span>
            <strong>{{ relativeTime(selectedUser.lastSeen) }}</strong>
          </div>
        </section>

        <section class="admin-actions">
          <div class="action-copy">
            <strong>{{ ui.accountActions }}</strong>
            <span>{{ canManage ? ui.accountActionsHint : ui.readOnlyHint }}</span>
          </div>
          <div class="action-controls">
            <a-input-number
              v-model:value="editAvailableCredits"
              :min="0"
              :precision="0"
              :disabled="!canManage"
              style="width: 150px"
            />
            <a-button type="primary" :loading="savingCredits" :disabled="!canManage" @click="saveCredits">
              {{ ui.updateCredits }}
            </a-button>
            <a-popconfirm
              v-if="selectedUser.status === 'active'"
              :title="ui.disableConfirm"
              :ok-text="ui.confirm"
              :cancel-text="ui.cancel"
              @confirm="changeStatus('disabled')"
            >
              <a-button danger :loading="savingStatus" :disabled="!canManage">{{ ui.disable }}</a-button>
            </a-popconfirm>
            <a-button
              v-else
              :loading="savingStatus"
              :disabled="!canManage"
              @click="changeStatus('active')"
            >
              {{ ui.enable }}
            </a-button>
          </div>
        </section>

        <a-tabs v-model:active-key="activeTab" class="detail-tabs">
          <a-tab-pane key="behavior" :tab="ui.behaviorTab">
            <a-alert
              v-if="detailErrors.behavior"
              type="error"
              show-icon
              :message="ui.detailLoadFailed"
              :description="detailErrors.behavior"
              style="margin-bottom: 12px"
            >
              <template #action>
                <a-button size="small" @click="retryDetailTab('behavior')">{{ ui.retry }}</a-button>
              </template>
            </a-alert>
            <a-table
              :data-source="behaviorRows"
              :columns="behaviorColumns"
              row-key="eventId"
              size="small"
              :loading="detailsLoading"
              :pagination="false"
              :scroll="{ x: 720 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'event'">
                  <div class="event-cell">
                    <strong>{{ eventLabel(record.eventType) }}</strong>
                    <small>{{ record.category }}</small>
                  </div>
                </template>
                <template v-else-if="column.key === 'path'">
                  <span class="mono">{{ record.path || '-' }}</span>
                </template>
                <template v-else-if="column.key === 'action'">
                  <span class="mono">{{ record.action || '-' }}</span>
                </template>
                <template v-else-if="column.key === 'time'">
                  {{ formatDate(record.ts) }}
                </template>
              </template>
            </a-table>
          </a-tab-pane>

          <a-tab-pane key="credits" :tab="ui.creditsTab">
            <a-alert
              v-if="detailErrors.credits"
              type="error"
              show-icon
              :message="ui.detailLoadFailed"
              :description="detailErrors.credits"
              style="margin-bottom: 12px"
            >
              <template #action>
                <a-button size="small" @click="retryDetailTab('credits')">{{ ui.retry }}</a-button>
              </template>
            </a-alert>
            <a-table
              :data-source="creditRows"
              :columns="creditColumns"
              row-key="id"
              size="small"
              :loading="detailsLoading"
              :pagination="false"
              :scroll="{ x: 720 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'delta'">
                  <span :class="record.deltaAvailable >= 0 ? 'delta-positive' : 'delta-negative'">
                    {{ signed(record.deltaAvailable) }}
                  </span>
                </template>
                <template v-else-if="column.key === 'time'">{{ formatDate(record.createdAt) }}</template>
              </template>
            </a-table>
          </a-tab-pane>

          <a-tab-pane key="orders" :tab="ui.ordersTab">
            <a-alert
              v-if="detailErrors.orders"
              type="error"
              show-icon
              :message="ui.detailLoadFailed"
              :description="detailErrors.orders"
              style="margin-bottom: 12px"
            >
              <template #action>
                <a-button size="small" @click="retryDetailTab('orders')">{{ ui.retry }}</a-button>
              </template>
            </a-alert>
            <a-table
              :data-source="orderRows"
              :columns="orderColumns"
              :row-key="(record: any) => String(record.id || record.orderId)"
              size="small"
              :loading="detailsLoading"
              :pagination="false"
              :scroll="{ x: 720 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'time'">{{ formatDate(record.createdAt || record.ts) }}</template>
                <template v-else-if="column.key === 'amount'">
                  {{ formatMoney(record.expectedAmountMinor ?? record.amountMinor ?? record.amount) }}
                </template>
              </template>
            </a-table>
          </a-tab-pane>

          <a-tab-pane key="chats" :tab="ui.chatsTab">
            <a-alert
              v-if="detailErrors.chats"
              type="error"
              show-icon
              :message="ui.detailLoadFailed"
              :description="detailErrors.chats"
              style="margin-bottom: 12px"
            >
              <template #action>
                <a-button size="small" @click="retryDetailTab('chats')">{{ ui.retry }}</a-button>
              </template>
            </a-alert>
            <a-alert type="warning" show-icon :message="ui.chatPrivacyNotice" style="margin-bottom: 12px" />
            <a-table
              :data-source="chatRows"
              :columns="chatColumns"
              :row-key="(_record: any, index?: number) => `${_record.ts || _record.timestamp || 0}_${index || 0}`"
              size="small"
              :loading="detailsLoading"
              :pagination="false"
              :scroll="{ x: 720 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'time'">{{ formatDate(record.ts) }}</template>
                <template v-else-if="column.key === 'text'">
                  <p class="chat-content">{{ record.text || '-' }}</p>
                </template>
              </template>
            </a-table>
          </a-tab-pane>
        </a-tabs>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { storeToRefs } from 'pinia';
import ConsolePageHeader from '@/console/components/ConsolePageHeader.vue';
import { useLanguageStore } from '@/stores/language';
import { useConsoleStore, type AdminUserItem } from '@/stores/console';

const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const searchText = ref('');
const committedSearch = ref('');
const statusFilter = ref<string>();
const loading = ref(false);
const detailsLoading = ref(false);
const savingCredits = ref(false);
const savingStatus = ref(false);
const errorMessage = ref('');
type DetailTab = 'behavior' | 'credits' | 'orders' | 'chats';
const detailErrors = ref<Record<DetailTab, string>>({
  behavior: '',
  credits: '',
  orders: '',
  chats: ''
});
const drawerOpen = ref(false);
const selectedUser = ref<AdminUserItem | null>(null);
const editAvailableCredits = ref<number>(0);
const activeTab = ref('behavior');
const currentPage = ref(1);
const pageSize = ref(50);
const isMobile = ref(false);

const users = computed(() => consoleStore.adminUsers);
const total = computed(() => consoleStore.adminUsersTotal);
const activeCount = computed(() => users.value.filter((item) => item.status === 'active').length);
const disabledCount = computed(() => users.value.filter((item) => item.status === 'disabled').length);
const visibleCredits = computed(() =>
  users.value.reduce((sum, item) => sum + Number(item.wallet?.available || 0), 0)
);
const filteredUsers = computed(() =>
  statusFilter.value
    ? users.value.filter((item) => item.status === statusFilter.value)
    : users.value
);
const behaviorRows = computed(() => consoleStore.adminBehaviorEvents);
const creditRows = computed(() => consoleStore.adminCreditLedger);
const orderRows = computed(() => consoleStore.adminOrders);
const chatRows = computed(() => consoleStore.adminChats);
const canManage = computed(() => ['admin', 'owner', 'development'].includes(consoleStore.adminPrincipal?.role || ''));

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        eyebrow: 'Identity & access',
        title: '用户管理',
        description: '查看账号状态、余额、访问轨迹与业务记录；点数和封禁操作都会写入审计日志。',
        refresh: '刷新用户',
        totalUsers: '用户总数',
        activeUsers: '当前页正常',
        disabledUsers: '当前页停用',
        visibleCredits: '当前页可用点数',
        searchPlaceholder: '搜索用户 ID、邮箱或用户名',
        statusFilter: '账号状态',
        matching: (count: number) => `共 ${count.toLocaleString()} 位用户`,
        loadFailed: '用户数据加载失败',
        detailLoadFailed: '该项数据加载失败',
        retry: '重试',
        identity: '用户',
        userId: '用户 ID',
        status: '状态',
        credits: '点数',
        visits: '访问次数',
        lastSeen: '最近活跃',
        createdAt: '注册时间',
        action: '操作',
        viewDetails: '查看',
        unnamed: '未设置昵称',
        frozen: '冻结',
        userDetails: '用户详情',
        availableCredits: '可用点数',
        frozenCredits: '冻结点数',
        accountActions: '账号操作',
        accountActionsHint: '以下变更会记录操作者、目标用户和变更前后状态。',
        readOnlyHint: '当前角色为只读 operator，需要 admin 或 owner 才能修改。',
        updateCredits: '更新点数',
        disable: '停用账号',
        enable: '恢复账号',
        disableConfirm: '停用后会立即撤销该用户的所有登录会话，确认继续？',
        confirm: '确认停用',
        cancel: '取消',
        behaviorTab: '行为轨迹',
        creditsTab: '点数流水',
        ordersTab: '订单',
        chatsTab: '会话记录',
        chatPrivacyNotice: '该页可能包含用户会话内容，仅限必要的安全审计与客户支持使用。',
        event: '事件',
        page: '页面',
        actionKey: '操作标识',
        device: '设备',
        time: '时间',
        entryType: '流水类型',
        delta: '可用变动',
        balance: '变动后余额',
        reference: '业务引用',
        orderId: '订单号',
        orderStatus: '订单状态',
        amount: '金额',
        role: '角色',
        content: '内容',
        creditsUpdated: '点数已更新',
        statusUpdated: '账号状态已更新',
        statusActive: '正常',
        statusDisabled: '已停用',
        statusDeleted: '已删除',
        eventPageView: '页面访问',
        eventClick: '界面点击'
      }
    : {
        eyebrow: 'Identity & access',
        title: 'User management',
        description: 'Inspect account status, balances, visits, and business activity. Credit and status changes are audited.',
        refresh: 'Refresh users',
        totalUsers: 'Total users',
        activeUsers: 'Active on page',
        disabledUsers: 'Disabled on page',
        visibleCredits: 'Credits on page',
        searchPlaceholder: 'Search user ID, email, or username',
        statusFilter: 'Account status',
        matching: (count: number) => `${count.toLocaleString()} users`,
        loadFailed: 'Failed to load users',
        detailLoadFailed: 'This data could not be loaded',
        retry: 'Retry',
        identity: 'User',
        userId: 'User ID',
        status: 'Status',
        credits: 'Credits',
        visits: 'Visits',
        lastSeen: 'Last active',
        createdAt: 'Created',
        action: 'Action',
        viewDetails: 'View',
        unnamed: 'Unnamed user',
        frozen: 'Frozen',
        userDetails: 'User details',
        availableCredits: 'Available',
        frozenCredits: 'Frozen',
        accountActions: 'Account actions',
        accountActionsHint: 'These changes record the actor, target, and before/after state.',
        readOnlyHint: 'Operator access is read-only. Admin or owner is required.',
        updateCredits: 'Update credits',
        disable: 'Disable account',
        enable: 'Enable account',
        disableConfirm: 'This immediately revokes every active session. Continue?',
        confirm: 'Disable',
        cancel: 'Cancel',
        behaviorTab: 'Behavior',
        creditsTab: 'Credit ledger',
        ordersTab: 'Orders',
        chatsTab: 'Chats',
        chatPrivacyNotice: 'This view may contain user content. Use only for necessary security review and support.',
        event: 'Event',
        page: 'Page',
        actionKey: 'Action key',
        device: 'Device',
        time: 'Time',
        entryType: 'Entry type',
        delta: 'Delta',
        balance: 'Balance',
        reference: 'Reference',
        orderId: 'Order ID',
        orderStatus: 'Status',
        amount: 'Amount',
        role: 'Role',
        content: 'Content',
        creditsUpdated: 'Credits updated',
        statusUpdated: 'Account status updated',
        statusActive: 'Active',
        statusDisabled: 'Disabled',
        statusDeleted: 'Deleted',
        eventPageView: 'Page view',
        eventClick: 'UI click'
      }
);

const columns = computed(() => [
  { title: ui.value.identity, key: 'identity', width: 230, fixed: 'left' },
  { title: ui.value.userId, key: 'userId', width: 180 },
  { title: ui.value.status, key: 'status', width: 105 },
  { title: ui.value.credits, key: 'credits', width: 125 },
  { title: ui.value.visits, key: 'visits', width: 95 },
  { title: ui.value.lastSeen, key: 'lastSeen', width: 170 },
  { title: ui.value.createdAt, key: 'createdAt', width: 165 },
  { title: ui.value.action, key: 'action', width: 90, fixed: 'right' }
]);
const behaviorColumns = computed(() => [
  { title: ui.value.event, key: 'event', width: 140 },
  { title: ui.value.page, key: 'path', width: 220 },
  { title: ui.value.actionKey, key: 'action', width: 180 },
  { title: ui.value.device, dataIndex: 'deviceCategory', key: 'device', width: 100 },
  { title: ui.value.time, key: 'time', width: 165 }
]);
const creditColumns = computed(() => [
  { title: ui.value.entryType, dataIndex: 'entryType', key: 'entryType', width: 160 },
  { title: ui.value.delta, key: 'delta', width: 110 },
  { title: ui.value.balance, dataIndex: 'balanceAvailable', key: 'balance', width: 120 },
  { title: ui.value.reference, dataIndex: 'referenceType', key: 'reference', width: 150 },
  { title: ui.value.time, key: 'time', width: 165 }
]);
const orderColumns = computed(() => [
  { title: ui.value.orderId, dataIndex: 'id', key: 'id', width: 210 },
  { title: ui.value.orderStatus, dataIndex: 'status', key: 'status', width: 120 },
  { title: ui.value.amount, key: 'amount', width: 120 },
  { title: ui.value.time, key: 'time', width: 165 }
]);
const chatColumns = computed(() => [
  { title: ui.value.role, dataIndex: 'role', key: 'role', width: 100 },
  { title: ui.value.content, key: 'text', width: 430 },
  { title: ui.value.time, key: 'time', width: 165 }
]);
const statusOptions = computed(() => [
  { label: ui.value.statusActive, value: 'active' },
  { label: ui.value.statusDisabled, value: 'disabled' },
  { label: ui.value.statusDeleted, value: 'deleted' }
]);
const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['20', '50', '100'],
  showTotal: (value: number) => ui.value.matching(value)
}));

const avatarText = (user: AdminUserItem) =>
  String(user.name || user.username || user.email || user.userId || 'U').slice(0, 1).toUpperCase();
const formatDate = (value?: number) => (value ? new Date(value).toLocaleString() : '-');
const relativeTime = (value?: number) => {
  if (!value) return '-';
  const delta = Math.max(0, Date.now() - value);
  if (delta < 60_000) return currentLang.value === 'zh' ? '刚刚' : 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
};
const statusLabel = (status: string) => {
  if (status === 'disabled') return ui.value.statusDisabled;
  if (status === 'deleted') return ui.value.statusDeleted;
  return ui.value.statusActive;
};
const eventLabel = (type: string) => {
  if (type === 'page_view') return ui.value.eventPageView;
  if (type === 'ui_click') return ui.value.eventClick;
  return type || '-';
};
const signed = (value: number) => `${value > 0 ? '+' : ''}${Number(value || 0).toLocaleString()}`;
const formatMoney = (minor: unknown) => {
  const value = Number(minor || 0);
  return `¥${(value / 100).toFixed(2)}`;
};

const fetchUsers = async () => {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    await consoleStore.fetchAdminUsers({
      q: committedSearch.value,
      limit: pageSize.value,
      offset: (currentPage.value - 1) * pageSize.value
    });
  } catch (error: any) {
    errorMessage.value = String(error?.message || error);
  } finally {
    loading.value = false;
  }
};
const applySearch = () => {
  committedSearch.value = searchText.value.trim();
  currentPage.value = 1;
  void fetchUsers();
};
const handleTableChange = (page: any) => {
  currentPage.value = Number(page?.current || 1);
  pageSize.value = Number(page?.pageSize || 50);
  void fetchUsers();
};
const loadUserDetailTab = async (tab: DetailTab, userId: string) => {
  detailErrors.value[tab] = '';
  try {
    if (tab === 'behavior') {
      await consoleStore.fetchAdminBehaviorEvents({ userId, limit: 100 });
    } else if (tab === 'credits') {
      await consoleStore.fetchAdminCreditLedger({ userId, limit: 100 });
    } else if (tab === 'orders') {
      await consoleStore.fetchAdminOrders({ userId, limit: 100 });
    } else {
      await consoleStore.fetchAdminChatsHistory({ userId, limit: 100 });
    }
  } catch (error: any) {
    detailErrors.value[tab] = String(error?.apiError || error?.message || error);
  }
};
const retryDetailTab = async (tab: DetailTab) => {
  if (!selectedUser.value) return;
  await loadUserDetailTab(tab, selectedUser.value.userId);
};
const openUserDetails = async (user: AdminUserItem) => {
  selectedUser.value = user;
  editAvailableCredits.value = Number(user.wallet?.available || 0);
  activeTab.value = 'behavior';
  drawerOpen.value = true;
  detailsLoading.value = true;
  detailErrors.value = { behavior: '', credits: '', orders: '', chats: '' };
  try {
    await Promise.all(
      (['behavior', 'credits', 'orders', 'chats'] as DetailTab[])
        .map((tab) => loadUserDetailTab(tab, user.userId))
    );
  } finally {
    detailsLoading.value = false;
  }
};
const saveCredits = async () => {
  if (!selectedUser.value || savingCredits.value) return;
  savingCredits.value = true;
  try {
    const result = await consoleStore.setAdminUserCredits({
      userId: selectedUser.value.userId,
      available: Number(editAvailableCredits.value || 0)
    });
    selectedUser.value = { ...selectedUser.value, wallet: result.wallet };
    message.success(ui.value.creditsUpdated);
    await consoleStore.fetchAdminCreditLedger({ userId: selectedUser.value.userId, limit: 100 });
  } catch (error: any) {
    message.error(String(error?.apiError || error?.message || error));
  } finally {
    savingCredits.value = false;
  }
};
const changeStatus = async (status: 'active' | 'disabled') => {
  if (!selectedUser.value || savingStatus.value) return;
  savingStatus.value = true;
  try {
    const result = await consoleStore.setAdminUserStatus({
      userId: selectedUser.value.userId,
      status
    });
    if (result.user) selectedUser.value = { ...selectedUser.value, ...result.user };
    message.success(ui.value.statusUpdated);
  } catch (error: any) {
    message.error(String(error?.apiError || error?.message || error));
  } finally {
    savingStatus.value = false;
  }
};

const syncMobile = () => {
  isMobile.value = window.innerWidth < 768;
};
onMounted(() => {
  syncMobile();
  window.addEventListener('resize', syncMobile);
  void fetchUsers();
});
onBeforeUnmount(() => window.removeEventListener('resize', syncMobile));
</script>

<style scoped>
.summary-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 14px;
  overflow: hidden;
  border: 1px solid #e6eaf0;
  border-radius: 13px;
  background: #fff;
}

.summary-row > div {
  display: grid;
  gap: 7px;
  padding: 16px 20px;
  border-right: 1px solid #edf0f4;
}

.summary-row > div:last-child {
  border-right: 0;
}

.summary-row span {
  color: #7c879b;
  font-size: 11px;
}

.summary-row strong {
  color: #1e2a42;
  font-size: 21px;
}

.users-card :deep(.ant-card-body) {
  padding: 0;
}

.table-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px;
  border-bottom: 1px solid #edf0f4;
}

.user-search {
  width: min(360px, 100%);
}

.table-total {
  margin-left: auto;
  color: #8b95a7;
  font-size: 11px;
}

.identity-button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.user-avatar,
.drawer-avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: #3159df;
  background: #edf1ff;
  font-size: 12px;
  font-weight: 800;
}

.identity-button > span:last-child,
.date-cell,
.credit-cell,
.event-cell {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.identity-button strong,
.date-cell strong,
.credit-cell strong,
.event-cell strong {
  overflow: hidden;
  color: #2c384f;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-button small,
.date-cell small,
.credit-cell small,
.event-cell small {
  overflow: hidden;
  color: #949dad;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  display: inline-block;
  max-width: 230px;
  overflow: hidden;
  color: #657087;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 20px;
  color: #17845b;
  background: #e9f8f1;
  font-size: 10px;
  font-weight: 650;
}

.status-pill i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.status-pill--disabled {
  color: #c05850;
  background: #fff0ee;
}

.status-pill--deleted {
  color: #69748a;
  background: #eef0f4;
}

.drawer-profile {
  display: flex;
  align-items: center;
  gap: 14px;
}

.drawer-avatar {
  width: 50px;
  height: 50px;
  border-radius: 14px;
  font-size: 17px;
}

.drawer-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drawer-name-row h2 {
  margin: 0;
  color: #1d2941;
  font-size: 19px;
}

.drawer-profile p {
  margin: 4px 0 0;
  color: #778297;
  font-size: 11px;
}

.drawer-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 22px 0 14px;
  border: 1px solid #e7eaf0;
  border-radius: 12px;
}

.drawer-metrics > div {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-right: 1px solid #edf0f4;
}

.drawer-metrics > div:last-child {
  border-right: 0;
}

.drawer-metrics span {
  color: #8993a5;
  font-size: 10px;
}

.drawer-metrics strong {
  color: #27334a;
  font-size: 16px;
}

.admin-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 16px;
  border: 1px solid #e4e9f8;
  border-radius: 12px;
  background: #f8faff;
}

.action-copy {
  display: grid;
  gap: 3px;
}

.action-copy strong {
  color: #27344b;
  font-size: 12px;
}

.action-copy span {
  color: #7e899d;
  font-size: 10px;
}

.action-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.detail-tabs {
  margin-top: 20px;
}

.delta-positive {
  color: #14865a;
  font-weight: 700;
}

.delta-negative {
  color: #d05448;
  font-weight: 700;
}

.chat-content {
  max-height: 100px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 900px) {
  .summary-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-row > div:nth-child(2) {
    border-right: 0;
  }

  .summary-row > div:nth-child(n + 3) {
    border-top: 1px solid #edf0f4;
  }

  .drawer-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .drawer-metrics > div:nth-child(2) {
    border-right: 0;
  }

  .drawer-metrics > div:nth-child(n + 3) {
    border-top: 1px solid #edf0f4;
  }

  .admin-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .action-controls {
    justify-content: flex-start;
  }
}

@media (max-width: 560px) {
  .table-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .table-toolbar :deep(.ant-select),
  .user-search {
    width: 100% !important;
  }

  .table-total {
    margin-left: 0;
  }

  .drawer-metrics,
  .summary-row {
    grid-template-columns: 1fr;
  }

  .drawer-metrics > div,
  .summary-row > div {
    border-right: 0;
    border-bottom: 1px solid #edf0f4;
  }
}
</style>
