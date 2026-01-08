<template>
  <div>
    <a-typography-title :level="2">User Management</a-typography-title>

    <a-card>
      <div style="margin-bottom: 16px">
        <a-input-search
          v-model:value="searchText"
          placeholder="Search by User ID or Email"
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
              <a-button type="link" size="small" @click="openUserDetails(record)">Details</a-button>
              <a-divider type="vertical" />
              <a-button type="primary" size="small" @click="openEditModal(record)">Edit</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- User Details Drawer -->
    <a-drawer v-model:visible="isDrawerVisible" title="User Details" width="600" placement="right">
      <div v-if="selectedUser">
        <a-descriptions title="Basic Info" bordered column="1">
          <a-descriptions-item label="User ID">{{ selectedUser.userId }}</a-descriptions-item>
          <a-descriptions-item label="Email">{{ selectedUser.email }}</a-descriptions-item>
          <a-descriptions-item label="Level">
            <a-tag :color="getLevelColor(selectedUser.level)">{{
              selectedUser.level.toUpperCase()
            }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="Points">{{ selectedUser.points }}</a-descriptions-item>
          <a-descriptions-item label="Joined At">{{
            new Date(selectedUser.joinedAt).toLocaleString()
          }}</a-descriptions-item>
        </a-descriptions>

        <a-divider />

        <a-tabs default-active-key="transactions">
          <a-tab-pane key="transactions" tab="Transactions">
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
          <a-tab-pane key="logs" tab="Activity Logs">
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
    <a-modal v-model:visible="isEditModalVisible" title="Edit User" @ok="handleEditSubmit">
      <a-form layout="vertical">
        <a-form-item label="User">
          <a-input disabled :value="selectedUser?.email" />
        </a-form-item>
        <a-form-item label="Level">
          <a-select v-model:value="editForm.level">
            <a-select-option value="free">Free</a-select-option>
            <a-select-option value="pro">Pro</a-select-option>
            <a-select-option value="biz">Biz</a-select-option>
            <a-select-option value="enterprise">Enterprise</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Points Balance">
          <a-input-number v-model:value="editForm.points" style="width: 100%" :min="0" />
          <div style="margin-top: 8px">
            <a-button size="small" @click="editForm.points = 9999">Set to 9999</a-button>
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

const consoleStore = useConsoleStore();
const searchText = ref('');
const users = computed(() => consoleStore.users);

const filteredUsers = computed(() => {
  if (!searchText.value) return users.value;
  const lower = searchText.value.toLowerCase();
  return users.value.filter(
    (u) => u.userId.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower)
  );
});

const columns = [
  { title: 'User ID', dataIndex: 'userId', key: 'userId' },
  { title: 'Email', dataIndex: 'email', key: 'email' },
  { title: 'Level', dataIndex: 'level', key: 'level' },
  {
    title: 'Points',
    dataIndex: 'points',
    key: 'points',
    sorter: (a: any, b: any) => a.points - b.points
  },
  { title: 'Joined At', dataIndex: 'joinedAt', key: 'joinedAt' },
  { title: 'Action', key: 'action' }
];

// Drawer & Details
const isDrawerVisible = ref(false);
const userTransactions = computed(() =>
  selectedUser.value ? consoleStore.getUserTransactions(selectedUser.value.userId) : []
);
const userLogs = computed(() =>
  selectedUser.value ? consoleStore.getUserLogs(selectedUser.value.userId) : []
);

const transactionColumns = [
  { title: 'Time', dataIndex: 'timestamp', key: 'timestamp' },
  { title: 'Type', dataIndex: 'type', key: 'type' },
  { title: 'Amount', dataIndex: 'amount', key: 'amount' },
  { title: 'Desc', dataIndex: 'description', key: 'description' }
];

const logColumns = [
  { title: 'Time', dataIndex: 'timestamp', key: 'timestamp' },
  { title: 'Action', dataIndex: 'action', key: 'action' },
  { title: 'Details', dataIndex: 'details', key: 'details', ellipsis: true }
];

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
    message.success('User updated successfully');
    isEditModalVisible.value = false;
  }
};
</script>
