<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-card>
      <div style="margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap">
        <a-input-search
          v-model:value="searchText"
          :placeholder="ui.searchPh"
          style="width: 300px"
          @search="fetchUsers"
        />
        <a-button type="primary" :loading="loading" @click="fetchUsers">{{ ui.refresh }}</a-button>
      </div>

      <a-table
        :dataSource="users"
        :columns="columns"
        rowKey="userId"
        :loading="loading"
        :pagination="pagination"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            {{ record.createdAt ? new Date(record.createdAt).toLocaleString() : '-' }}
          </template>
          <template v-else-if="column.key === 'lastSeen'">
            {{ record.lastSeen ? new Date(record.lastSeen).toLocaleString() : '-' }}
          </template>
          <template v-else-if="column.key === 'credits'">
            <a-space>
              <a-tag color="green">{{ ui.available }}: {{ record.wallet?.available ?? 0 }}</a-tag>
              <a-tag color="orange">{{ ui.frozen }}: {{ record.wallet?.frozen ?? 0 }}</a-tag>
            </a-space>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="openUserDetails(record)">{{
              ui.details
            }}</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- User Details Drawer -->
    <a-drawer
      v-model:visible="isDrawerVisible"
      :title="ui.userDetails"
      width="860"
      placement="right"
    >
      <div v-if="selectedUser">
        <a-descriptions :title="ui.basicInfo" bordered column="1">
          <a-descriptions-item :label="ui.userId">{{ selectedUser.userId }}</a-descriptions-item>
          <a-descriptions-item :label="ui.email">{{
            selectedUser.email || '-'
          }}</a-descriptions-item>
          <a-descriptions-item :label="ui.username">{{
            selectedUser.username || '-'
          }}</a-descriptions-item>
          <a-descriptions-item :label="ui.name">{{ selectedUser.name || '-' }}</a-descriptions-item>
          <a-descriptions-item :label="ui.joinedAt">{{
            selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : '-'
          }}</a-descriptions-item>
          <a-descriptions-item :label="ui.lastSeen">{{
            selectedUser.lastSeen ? new Date(selectedUser.lastSeen).toLocaleString() : '-'
          }}</a-descriptions-item>
          <a-descriptions-item :label="ui.visits">{{ selectedUser.visits }}</a-descriptions-item>
          <a-descriptions-item :label="ui.credits">
            <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center">
              <span>
                {{ ui.available }}: {{ selectedUser.wallet?.available ?? 0 }} / {{ ui.frozen }}:
                {{ selectedUser.wallet?.frozen ?? 0 }}
              </span>
              <a-space>
                <a-input-number
                  v-model:value="editAvailableCredits"
                  :min="0"
                  :precision="0"
                  style="width: 140px"
                />
                <a-button type="primary" :loading="savingCredits" @click="saveCredits">{{
                  ui.saveCredits
                }}</a-button>
              </a-space>
            </div>
          </a-descriptions-item>
        </a-descriptions>

        <a-divider style="margin: 16px 0" />

        <a-tabs v-model:activeKey="detailsTab">
          <a-tab-pane key="chats" :tab="ui.tabChats">
            <div style="margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap">
              <a-button type="primary" :loading="loadingChats" @click="fetchChats">{{
                ui.refreshChats
              }}</a-button>
            </div>
            <a-table
              :dataSource="adminChats"
              :columns="chatColumns"
              :rowKey="
                (_record: any, index: number) =>
                  String((_record as any)?.ts || (_record as any)?.timestamp || index) +
                  '_' +
                  String(index)
              "
              size="small"
              :loading="loadingChats"
              :pagination="false"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'ts'">
                  {{ record?.ts ? new Date(record.ts).toLocaleString() : '-' }}
                </template>
                <template v-else-if="column.key === 'text'">
                  <div style="white-space: pre-wrap; word-break: break-word">
                    {{ record?.text || '' }}
                  </div>
                </template>
              </template>
            </a-table>
          </a-tab-pane>

          <a-tab-pane key="orders" :tab="ui.tabOrders">
            <div style="margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap">
              <a-button type="primary" :loading="loadingOrders" @click="fetchOrders">{{
                ui.refreshOrders
              }}</a-button>
            </div>
            <a-table
              :dataSource="adminOrders"
              :columns="orderColumns"
              rowKey="id"
              size="small"
              :loading="loadingOrders"
              :pagination="false"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'createdAt'">
                  {{ record?.createdAt ? new Date(record.createdAt).toLocaleString() : '-' }}
                </template>
              </template>
            </a-table>
          </a-tab-pane>
        </a-tabs>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useConsoleStore, type AdminUserItem } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { message } from 'ant-design-vue';

const consoleStore = useConsoleStore();
const searchText = ref('');
const loading = ref(false);
const users = computed(() => consoleStore.adminUsers);

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '用户管理',
        searchPh: '按用户 ID / 邮箱 / 用户名搜索',
        refresh: '刷新',
        details: '详情',
        userDetails: '用户详情',
        basicInfo: '基本信息',
        userId: '用户 ID',
        email: '邮箱',
        username: '用户名',
        name: '昵称',
        joinedAt: '加入时间',
        lastSeen: '最近活跃',
        visits: '访问次数',
        credits: '积分',
        available: '可用',
        frozen: '冻结',
        colUserId: '用户 ID',
        colEmail: '邮箱',
        colUsername: '用户名',
        colName: '昵称',
        colJoinedAt: '加入时间',
        colLastSeen: '最近活跃',
        colVisits: '访问',
        colCredits: '积分',
        saveCredits: '保存',
        colAction: '操作',
        tabChats: '聊天记录',
        tabOrders: '订单记录',
        refreshChats: '刷新聊天',
        refreshOrders: '刷新订单',
        colChatRole: '角色',
        colChatText: '内容',
        colChatTime: '时间',
        colOrderKind: '类型',
        colOrderId: '订单号',
        colOrderPkg: '套餐',
        colOrderAmount: '金额(CNY)',
        colOrderCredits: '积分',
        colOrderTime: '时间',
        loadFailed: '加载失败，请检查登录状态与后端配置'
      }
    : {
        title: 'User Management',
        searchPh: 'Search by userId / email / username',
        refresh: 'Refresh',
        details: 'Details',
        userDetails: 'User Details',
        basicInfo: 'Basic Info',
        userId: 'User ID',
        email: 'Email',
        username: 'Username',
        name: 'Name',
        joinedAt: 'Joined At',
        lastSeen: 'Last Seen',
        visits: 'Visits',
        credits: 'Credits',
        available: 'Available',
        frozen: 'Frozen',
        colUserId: 'User ID',
        colEmail: 'Email',
        colUsername: 'Username',
        colName: 'Name',
        colJoinedAt: 'Joined At',
        colLastSeen: 'Last Seen',
        colVisits: 'Visits',
        colCredits: 'Credits',
        saveCredits: 'Save',
        colAction: 'Action',
        tabChats: 'Chats',
        tabOrders: 'Orders',
        refreshChats: 'Refresh chats',
        refreshOrders: 'Refresh orders',
        colChatRole: 'Role',
        colChatText: 'Text',
        colChatTime: 'Time',
        colOrderKind: 'Kind',
        colOrderId: 'Order ID',
        colOrderPkg: 'Package',
        colOrderAmount: 'Amount(CNY)',
        colOrderCredits: 'Credits',
        colOrderTime: 'Time',
        loadFailed: 'Load failed. Please check login and backend config.'
      }
);

const showAdminError = (e: any) => {
  const code = String(e?.message || '').trim();
  const apiError = String((e as any)?.apiError || '').trim();
  const err = apiError || code || 'REQUEST_FAILED';
  if (err === 'ADMIN_AUTH_REQUIRED') {
    message.error(currentLang.value === 'zh' ? '请先登录后台' : 'Please login first');
    return;
  }
  if (
    err === 'ADMIN_AUTH_INVALID' ||
    err === 'ADMIN_AUTH_FORBIDDEN' ||
    err === 'ADMIN_AUTH_EXPIRED'
  ) {
    message.error(
      currentLang.value === 'zh' ? '登录已失效，请重新登录' : 'Session expired, please login again'
    );
    return;
  }
  if (err === 'ADMIN_NOT_CONFIGURED') {
    message.error(
      currentLang.value === 'zh'
        ? '后端未配置 ADMIN_KEY（请在 Zeabur 设置）'
        : 'ADMIN_KEY is not configured on backend'
    );
    return;
  }
  if (err === 'ADMIN_ACCOUNT_NOT_CONFIGURED') {
    message.error(
      currentLang.value === 'zh'
        ? '后端未配置管理员账号（请设置 CONSOLE_ADMIN_USERNAME/PASSWORD）'
        : 'Admin account is not configured on backend'
    );
    return;
  }
  message.error(ui.value.loadFailed);
};

const pagination = ref({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true
});

const columns = computed(() => [
  { title: ui.value.colUserId, dataIndex: 'userId', key: 'userId' },
  { title: ui.value.colEmail, dataIndex: 'email', key: 'email' },
  { title: ui.value.colUsername, dataIndex: 'username', key: 'username' },
  { title: ui.value.colName, dataIndex: 'name', key: 'name' },
  { title: ui.value.colJoinedAt, dataIndex: 'createdAt', key: 'createdAt', width: 180 },
  { title: ui.value.colLastSeen, dataIndex: 'lastSeen', key: 'lastSeen', width: 180 },
  { title: ui.value.colVisits, dataIndex: 'visits', key: 'visits', align: 'right', width: 100 },
  { title: ui.value.colCredits, key: 'credits', width: 200 },
  { title: ui.value.colAction, key: 'action' }
]);

// Drawer & Details
const isDrawerVisible = ref(false);
const selectedUser = ref<AdminUserItem | null>(null);
const detailsTab = ref('chats');
const loadingChats = ref(false);
const loadingOrders = ref(false);
const savingCredits = ref(false);
const editAvailableCredits = ref<number | null>(null);
const adminChats = computed(() => consoleStore.adminChats || []);
const adminOrders = computed(() => consoleStore.adminOrders || []);

const chatColumns = computed(() => [
  { title: ui.value.colChatRole, dataIndex: 'role', key: 'role', width: 120 },
  { title: ui.value.colChatText, dataIndex: 'text', key: 'text' },
  { title: ui.value.colChatTime, dataIndex: 'ts', key: 'ts', width: 180 }
]);

const orderColumns = computed(() => [
  { title: ui.value.colOrderKind, dataIndex: 'kind', key: 'kind', width: 110 },
  { title: ui.value.colOrderId, dataIndex: 'id', key: 'id', ellipsis: true },
  { title: ui.value.colOrderPkg, dataIndex: 'packageId', key: 'packageId', width: 120 },
  {
    title: ui.value.colOrderAmount,
    dataIndex: 'amountCny',
    key: 'amountCny',
    width: 120,
    align: 'right'
  },
  {
    title: ui.value.colOrderCredits,
    dataIndex: 'credits',
    key: 'credits',
    width: 110,
    align: 'right'
  },
  { title: ui.value.colOrderTime, dataIndex: 'createdAt', key: 'createdAt', width: 180 }
]);

const openUserDetails = (user: AdminUserItem) => {
  selectedUser.value = user;
  isDrawerVisible.value = true;
  detailsTab.value = 'chats';
  editAvailableCredits.value = Number(user?.wallet?.available ?? 0) || 0;
  void fetchChats();
};

onMounted(() => {
  consoleStore.init();
  void fetchUsers();
});

const fetchUsers = async () => {
  if (loading.value) return;
  loading.value = true;
  try {
    const offset = (pagination.value.current - 1) * pagination.value.pageSize;
    await consoleStore.fetchAdminUsers({
      q: searchText.value,
      limit: pagination.value.pageSize,
      offset
    });
    pagination.value.total = consoleStore.adminUsersTotal;
  } catch (e) {
    showAdminError(e);
  } finally {
    loading.value = false;
  }
};

const handleTableChange = (pag: any) => {
  pagination.value.current = pag.current;
  pagination.value.pageSize = pag.pageSize;
  void fetchUsers();
};

const fetchChats = async () => {
  if (loadingChats.value) return;
  const uid = String(selectedUser.value?.userId || '').trim();
  if (!uid) return;
  loadingChats.value = true;
  try {
    await consoleStore.fetchAdminChatsHistory({ userId: uid, limit: 200, offset: 0 });
  } catch (e) {
    showAdminError(e);
  } finally {
    loadingChats.value = false;
  }
};

const fetchOrders = async () => {
  if (loadingOrders.value) return;
  const uid = String(selectedUser.value?.userId || '').trim();
  if (!uid) return;
  loadingOrders.value = true;
  try {
    await consoleStore.fetchAdminOrders({ userId: uid, limit: 200, offset: 0 });
  } catch (e) {
    showAdminError(e);
  } finally {
    loadingOrders.value = false;
  }
};

const saveCredits = async () => {
  if (savingCredits.value) return;
  const uid = String(selectedUser.value?.userId || '').trim();
  if (!uid) return;
  const availableRaw = Number.parseInt(String(editAvailableCredits.value ?? ''), 10);
  const available = Number.isFinite(availableRaw) && availableRaw >= 0 ? availableRaw : null;
  if (available === null) return;
  savingCredits.value = true;
  try {
    const res = await consoleStore.setAdminUserCredits({ userId: uid, available });
    if (selectedUser.value && selectedUser.value.userId === uid) {
      selectedUser.value = { ...selectedUser.value, wallet: res.wallet };
    }
    message.success(currentLang.value === 'zh' ? '已更新积分' : 'Credits updated');
  } catch (e) {
    showAdminError(e);
  } finally {
    savingCredits.value = false;
  }
};
</script>
