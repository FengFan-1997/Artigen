<template>
  <div>
    <a-typography-title :level="2">Settings</a-typography-title>

    <a-row :gutter="24">
      <a-col :span="24" :lg="16">
        <a-card title="Profile Settings" :loading="loadingProfile">
          <a-form layout="vertical">
            <a-form-item label="User ID">
              <a-input :value="userId" disabled />
            </a-form-item>
            <a-form-item label="Display Name">
              <a-input v-model:value="profile.displayName" placeholder="Enter your display name" />
            </a-form-item>
            <a-form-item label="Email Notification">
              <a-switch v-model:checked="profile.emailNotify" />
              <span style="margin-left: 8px">{{
                profile.emailNotify ? 'Enabled' : 'Disabled'
              }}</span>
            </a-form-item>
            <a-form-item>
              <a-button type="primary" @click="saveProfile" :loading="savingProfile"
                >Save Changes</a-button
              >
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>

      <a-col :span="24" :lg="8">
        <a-card title="API Keys">
          <p>Manage your API keys for programmatic access.</p>
          <a-button block type="dashed" @click="createApiKey" :loading="creatingKey">
            <template #icon><plus-outlined /></template>
            Generate New Key
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
                    title="Are you sure delete this key?"
                    ok-text="Yes"
                    cancel-text="No"
                    @confirm="deleteApiKey(item.id)"
                  >
                    <a-button type="text" danger size="small">Revoke</a-button>
                  </a-popconfirm>
                </template>
                <a-list-item-meta :title="item.name">
                  <template #description>
                    <a-typography-text copyable>{{
                      item.masked || item.maskedKey
                    }}</a-typography-text>
                    <br />
                    <small>Created: {{ new Date(item.createdAt).toLocaleDateString() }}</small>
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
      title="New API Key Created"
      @ok="showKeyModal = false"
      footer=""
    >
      <a-result
        status="success"
        title="API Key Generated Successfully"
        sub-title="Please copy your API key now. You won't be able to see it again!"
      >
        <template #extra>
          <div
            style="background: #f5f5f5; padding: 16px; border-radius: 4px; word-break: break-all"
          >
            <a-typography-text copyable>{{ newKeyRaw }}</a-typography-text>
          </div>
          <a-button type="primary" style="margin-top: 16px" @click="showKeyModal = false"
            >Done</a-button
          >
        </template>
      </a-result>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { useAuth } from '@/agent/composables/useAuth';
import { getCurrentUserId } from '@/login/session';

const { currentUser } = useAuth();
const userId = computed(() => currentUser.value?.userId || getCurrentUserId());

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
  { id: '1', name: 'Default Key', maskedKey: 'sk-....................ab12', createdAt: Date.now() }
]);

const saveProfile = async () => {
  savingProfile.value = true;
  setTimeout(() => {
    savingProfile.value = false;
    message.success('Profile updated successfully');
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
      name: 'New API Key',
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
  message.success('API Key revoked');
};
</script>
