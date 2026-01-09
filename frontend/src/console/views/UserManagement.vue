<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-card>
      <div style="margin-bottom: 16px">
        <a-input-search
          v-model:value="searchText"
          :placeholder="ui.searchPh"
          style="width: 300px"
        />
      </div>

      <a-table :dataSource="filteredUsers" :columns="columns" rowKey="userId">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'level'">
            <a-tag :color="getLevelColor(record.level)">{{ record.level.toUpperCase() }}</a-tag>
          </template>
          <template v-else-if="column.key === 'points'">
            <span :style="{ color: record.points < 100 ? 'red' : 'green', fontWeight: 'bold' }">
              {{ record.points }}
            </span>
          </template>
          <template v-else-if="column.key === 'joinedAt'">
            {{ new Date(record.joinedAt).toLocaleDateString() }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="openUserDetails(record)">{{
                ui.details
              }}</a-button>
              <a-divider type="vertical" />
              <a-button type="primary" size="small" @click="openEditModal(record)">{{
                ui.edit
              }}</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- User Details Drawer -->
    <a-drawer
      v-model:visible="isDrawerVisible"
      :title="ui.userDetails"
      width="600"
      placement="right"
    >
      <div v-if="selectedUser">
        <a-descriptions :title="ui.basicInfo" bordered column="1">
          <a-descriptions-item :label="ui.userId">{{ selectedUser.userId }}</a-descriptions-item>
          <a-descriptions-item :label="ui.email">{{ selectedUser.email }}</a-descriptions-item>
          <a-descriptions-item :label="ui.level">
            <a-tag :color="getLevelColor(selectedUser.level)">{{
              selectedUser.level.toUpperCase()
            }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item :label="ui.points">{{ selectedUser.points }}</a-descriptions-item>
          <a-descriptions-item :label="ui.joinedAt">{{
            new Date(selectedUser.joinedAt).toLocaleString()
          }}</a-descriptions-item>
        </a-descriptions>

        <a-divider />

        <a-tabs default-active-key="transactions">
          <a-tab-pane key="transactions" :tab="ui.transactions">
            <a-table
              size="small"
              :dataSource="userTransactions"
              :columns="transactionColumns"
              rowKey="id"
              :pagination="{ pageSize: 5 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'amount'">
                  <span :style="{ color: record.amount > 0 ? 'green' : 'red' }">
                    {{ record.amount > 0 ? '+' : '' }}{{ record.amount }}
                  </span>
                </template>
                <template v-else-if="column.key === 'timestamp'">
                  {{ new Date(record.timestamp).toLocaleDateString() }}
                </template>
              </template>
            </a-table>
          </a-tab-pane>
          <a-tab-pane key="logs" :tab="ui.activityLogs">
            <a-table
              size="small"
              :dataSource="userLogs"
              :columns="logColumns"
              rowKey="id"
              :pagination="{ pageSize: 5 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'timestamp'">
                  {{ new Date(record.timestamp).toLocaleString() }}
                </template>
              </template>
            </a-table>
          </a-tab-pane>
        </a-tabs>
      </div>
    </a-drawer>

    <!-- Edit User Modal -->
    <a-modal v-model:visible="isEditModalVisible" :title="ui.editUser" @ok="handleEditSubmit">
      <a-form layout="vertical">
        <a-form-item :label="ui.user">
          <a-input disabled :value="selectedUser?.email" />
        </a-form-item>
        <a-form-item :label="ui.level">
          <a-select v-model:value="editForm.level">
            <a-select-option value="free">{{ ui.levelFree }}</a-select-option>
            <a-select-option value="pro">{{ ui.levelPro }}</a-select-option>
            <a-select-option value="biz">{{ ui.levelBiz }}</a-select-option>
            <a-select-option value="enterprise">{{ ui.levelEnterprise }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="ui.pointsBalance">
          <a-input-number v-model:value="editForm.points" style="width: 100%" :min="0" />
          <div style="margin-top: 8px">
            <a-button size="small" @click="editForm.points = 9999">{{ ui.set9999 }}</a-button>
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import { useConsoleStore, type ConsoleUser } from '@/stores/console';
import { message } from 'ant-design-vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const consoleStore = useConsoleStore();
const searchText = ref('');
const users = computed(() => consoleStore.users);

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '用户管理',
        searchPh: '按用户 ID 或邮箱搜索',
        details: '详情',
        edit: '编辑',
        userDetails: '用户详情',
        basicInfo: '基本信息',
        userId: '用户 ID',
        email: '邮箱',
        level: '等级',
        points: '点数',
        joinedAt: '加入时间',
        transactions: '交易记录',
        activityLogs: '活动日志',
        editUser: '编辑用户',
        user: '用户',
        levelFree: '免费',
        levelPro: 'Pro',
        levelBiz: 'Biz',
        levelEnterprise: '企业',
        pointsBalance: '点数余额',
        set9999: '设为 9999',
        colUserId: '用户 ID',
        colEmail: '邮箱',
        colLevel: '等级',
        colPoints: '点数',
        colJoinedAt: '加入时间',
        colAction: '操作',
        colTime: '时间',
        colType: '类型',
        colAmount: '数量',
        colDesc: '描述',
        colLogAction: '动作',
        colLogDetails: '详情',
        updated: '更新成功'
      }
    : {
        title: 'User Management',
        searchPh: 'Search by User ID or Email',
        details: 'Details',
        edit: 'Edit',
        userDetails: 'User Details',
        basicInfo: 'Basic Info',
        userId: 'User ID',
        email: 'Email',
        level: 'Level',
        points: 'Points',
        joinedAt: 'Joined At',
        transactions: 'Transactions',
        activityLogs: 'Activity Logs',
        editUser: 'Edit User',
        user: 'User',
        levelFree: 'Free',
        levelPro: 'Pro',
        levelBiz: 'Biz',
        levelEnterprise: 'Enterprise',
        pointsBalance: 'Points Balance',
        set9999: 'Set to 9999',
        colUserId: 'User ID',
        colEmail: 'Email',
        colLevel: 'Level',
        colPoints: 'Points',
        colJoinedAt: 'Joined At',
        colAction: 'Action',
        colTime: 'Time',
        colType: 'Type',
        colAmount: 'Amount',
        colDesc: 'Desc',
        colLogAction: 'Action',
        colLogDetails: 'Details',
        updated: 'User updated successfully'
      }
);

const filteredUsers = computed(() => {
  if (!searchText.value) return users.value;
  const lower = searchText.value.toLowerCase();
  return users.value.filter(
    (u) => u.userId.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower)
  );
});

const columns = computed(() => [
  { title: ui.value.colUserId, dataIndex: 'userId', key: 'userId' },
  { title: ui.value.colEmail, dataIndex: 'email', key: 'email' },
  { title: ui.value.colLevel, dataIndex: 'level', key: 'level' },
  {
    title: ui.value.colPoints,
    dataIndex: 'points',
    key: 'points',
    sorter: (a: any, b: any) => a.points - b.points
  },
  { title: ui.value.colJoinedAt, dataIndex: 'joinedAt', key: 'joinedAt' },
  { title: ui.value.colAction, key: 'action' }
]);

// Drawer & Details
const isDrawerVisible = ref(false);
const userTransactions = computed(() =>
  selectedUser.value ? consoleStore.getUserTransactions(selectedUser.value.userId) : []
);
const userLogs = computed(() =>
  selectedUser.value ? consoleStore.getUserLogs(selectedUser.value.userId) : []
);

const transactionColumns = computed(() => [
  { title: ui.value.colTime, dataIndex: 'timestamp', key: 'timestamp' },
  { title: ui.value.colType, dataIndex: 'type', key: 'type' },
  { title: ui.value.colAmount, dataIndex: 'amount', key: 'amount' },
  { title: ui.value.colDesc, dataIndex: 'description', key: 'description' }
]);

const logColumns = computed(() => [
  { title: ui.value.colTime, dataIndex: 'timestamp', key: 'timestamp' },
  { title: ui.value.colLogAction, dataIndex: 'action', key: 'action' },
  { title: ui.value.colLogDetails, dataIndex: 'details', key: 'details', ellipsis: true }
]);

const openUserDetails = (user: ConsoleUser) => {
  selectedUser.value = user;
  isDrawerVisible.value = true;
};

// Edit User Modal
const isEditModalVisible = ref(false);
const selectedUser = ref<ConsoleUser | null>(null);
const editForm = reactive({
  level: 'free' as ConsoleUser['level'],
  points: 0
});

onMounted(() => {
  consoleStore.init();
});

const getLevelColor = (level: string) => {
  switch (level) {
    case 'enterprise':
      return 'purple';
    case 'biz':
      return 'orange';
    case 'pro':
      return 'blue';
    default:
      return 'default';
  }
};

const openEditModal = (user: ConsoleUser) => {
  selectedUser.value = user;
  editForm.level = user.level;
  editForm.points = user.points;
  isEditModalVisible.value = true;
};

const handleEditSubmit = () => {
  if (selectedUser.value) {
    consoleStore.setUserDetails(selectedUser.value.userId, {
      level: editForm.level,
      points: editForm.points
    });
    message.success(ui.value.updated);
    isEditModalVisible.value = false;
  }
};
</script>
