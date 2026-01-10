<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-row :gutter="24">
      <a-col :span="24" :lg="16">
        <a-card :title="ui.profileSettings" :loading="loadingProfile">
          <a-form layout="vertical">
            <a-form-item :label="ui.userId">
              <a-input :value="userId" disabled />
            </a-form-item>
            <a-form-item :label="ui.displayName">
              <a-input v-model:value="profile.displayName" :placeholder="ui.displayNamePh" />
            </a-form-item>
            <a-form-item :label="ui.emailNotification">
              <a-switch v-model:checked="profile.emailNotify" />
              <span style="margin-left: 8px">{{
                profile.emailNotify ? ui.enabled : ui.disabled
              }}</span>
            </a-form-item>
            <a-form-item>
              <a-button type="primary" @click="saveProfile" :loading="savingProfile">{{
                ui.saveChanges
              }}</a-button>
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>

      <a-col :span="24" :lg="8">
        <a-card :title="ui.apiKeys">
          <p>{{ ui.apiKeysDesc }}</p>
          <a-button block type="dashed" @click="createApiKey" :loading="creatingKey">
            <template #icon><plus-outlined /></template>
            {{ ui.generateNewKey }}
          </a-button>

          <a-list
            item-layout="horizontal"
            :data-source="apiKeys"
            style="margin-top: 16px"
            :loading="loadingKeys"
          >
            <template #renderItem="{ item }">
              <a-list-item>
                <template #actions>
                  <a-popconfirm
                    :title="ui.confirmDeleteKey"
                    :ok-text="ui.yes"
                    :cancel-text="ui.no"
                    @confirm="deleteApiKey(item.id)"
                  >
                    <a-button type="text" danger size="small">{{ ui.revoke }}</a-button>
                  </a-popconfirm>
                </template>
                <a-list-item-meta :title="item.name">
                  <template #description>
                    <a-typography-text copyable>{{
                      item.masked || item.maskedKey
                    }}</a-typography-text>
                    <br />
                    <small
                      >{{ ui.created }}: {{ new Date(item.createdAt).toLocaleDateString() }}</small
                    >
                  </template>
                </a-list-item-meta>
              </a-list-item>
            </template>
          </a-list>
        </a-card>
      </a-col>
    </a-row>

    <!-- New Key Modal -->
    <a-modal
      v-model:visible="showKeyModal"
      :title="ui.newApiKeyCreated"
      @ok="showKeyModal = false"
      footer=""
    >
      <a-result status="success" :title="ui.apiKeyGenerated" :sub-title="ui.apiKeyCopyHint">
        <template #extra>
          <div
            style="background: #f5f5f5; padding: 16px; border-radius: 4px; word-break: break-all"
          >
            <a-typography-text copyable>{{ newKeyRaw }}</a-typography-text>
          </div>
          <a-button type="primary" style="margin-top: 16px" @click="showKeyModal = false">{{
            ui.done
          }}</a-button>
        </template>
      </a-result>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { getConsoleUserId } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const userId = computed(() => getConsoleUserId());

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '设置',
        profileSettings: '个人资料设置',
        userId: '用户 ID',
        displayName: '显示名称',
        displayNamePh: '请输入显示名称',
        emailNotification: '邮件通知',
        enabled: '开启',
        disabled: '关闭',
        saveChanges: '保存修改',
        apiKeys: 'API Keys',
        apiKeysDesc: '管理用于程序化访问的 API Key。',
        generateNewKey: '生成新 Key',
        confirmDeleteKey: '确定要删除这个 Key 吗？',
        yes: '是',
        no: '否',
        revoke: '吊销',
        created: '创建时间',
        newApiKeyCreated: '已创建新的 API Key',
        apiKeyGenerated: 'API Key 生成成功',
        apiKeyCopyHint: '请立即复制该 Key。关闭后将无法再次查看！',
        done: '完成',
        profileUpdated: '资料更新成功',
        apiKeyRevoked: 'API Key 已吊销',
        newApiKeyName: '新 API Key',
        defaultKeyName: '默认 Key'
      }
    : {
        title: 'Settings',
        profileSettings: 'Profile Settings',
        userId: 'User ID',
        displayName: 'Display Name',
        displayNamePh: 'Enter your display name',
        emailNotification: 'Email Notification',
        enabled: 'Enabled',
        disabled: 'Disabled',
        saveChanges: 'Save Changes',
        apiKeys: 'API Keys',
        apiKeysDesc: 'Manage your API keys for programmatic access.',
        generateNewKey: 'Generate New Key',
        confirmDeleteKey: 'Are you sure delete this key?',
        yes: 'Yes',
        no: 'No',
        revoke: 'Revoke',
        created: 'Created',
        newApiKeyCreated: 'New API Key Created',
        apiKeyGenerated: 'API Key Generated Successfully',
        apiKeyCopyHint: "Please copy your API key now. You won't be able to see it again!",
        done: 'Done',
        profileUpdated: 'Profile updated successfully',
        apiKeyRevoked: 'API Key revoked',
        newApiKeyName: 'New API Key',
        defaultKeyName: 'Default Key'
      }
);

const loadingProfile = ref(false);
const savingProfile = ref(false);
const creatingKey = ref(false);
const loadingKeys = ref(false);
const showKeyModal = ref(false);
const newKeyRaw = ref('');

const profile = reactive({
  displayName: 'Admin User',
  emailNotify: true
});

const apiKeys = ref<any[]>([
  {
    id: '1',
    name: ui.value.defaultKeyName,
    maskedKey: 'sk-....................ab12',
    createdAt: Date.now()
  }
]);

const saveProfile = async () => {
  savingProfile.value = true;
  setTimeout(() => {
    savingProfile.value = false;
    message.success(ui.value.profileUpdated);
  }, 1000);
};

const createApiKey = async () => {
  creatingKey.value = true;
  setTimeout(() => {
    const newKey =
      'sk-' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    newKeyRaw.value = newKey;
    apiKeys.value.unshift({
      id: Date.now().toString(),
      name: ui.value.newApiKeyName,
      maskedKey:
        newKey.substring(0, 3) + '....................' + newKey.substring(newKey.length - 4),
      createdAt: Date.now()
    });
    creatingKey.value = false;
    showKeyModal.value = true;
  }, 1000);
};

const deleteApiKey = async (id: string) => {
  apiKeys.value = apiKeys.value.filter((k) => k.id !== id);
  message.success(ui.value.apiKeyRevoked);
};
</script>
