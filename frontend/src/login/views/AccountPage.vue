<template>
  <div class="login-page">
    <LanguageSwitcher />
    <div class="card">
      <div class="title">{{ t('login.account_title') }}</div>
      <div class="sub">{{ t('login.account_sub') }}</div>

      <div class="meta">
        <div class="meta-row">
          <div class="k">{{ t('login.user_id') }}</div>
          <div class="v">{{ userId || '-' }}</div>
        </div>
        <div class="meta-row">
          <div class="k">{{ t('login.email_label') }}</div>
          <div class="v">{{ email || '-' }}</div>
        </div>
      </div>

      <div class="actions">
        <router-link class="btn ghost" to="/artigen">{{ t('login.back') }}</router-link>
        <button class="btn ghost" type="button" @click="loginOther">
          {{ t('login.login_other') }}
        </button>
        <button class="btn danger" type="button" @click="logout">{{ t('login.logout') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getLastEmail, loadUsers } from '../storage';
import { getCurrentUserId, logoutLocal } from '../session';
import { useLanguageStore } from '@/stores/language';
import LanguageSwitcher from '../components/LanguageSwitcher.vue';

const { t } = useLanguageStore();

const userId = ref(getCurrentUserId());
const users = ref(loadUsers());
const email = computed(() => {
  const uid = userId.value;
  const found = users.value.find((u) => u.userId === uid);
  return found?.email || getLastEmail();
});

const loginOther = () => {
  logoutLocal({ redirectTo: '/login' });
};

const logout = () => {
  logoutLocal({ redirectTo: '/artigen' });
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 10%, rgba(204, 255, 0, 0.08), transparent 40%),
    radial-gradient(circle at 80% 30%, rgba(147, 51, 234, 0.12), transparent 45%), #050505;
  color: #f1f5f9;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    Segoe UI,
    Roboto,
    Arial,
    sans-serif;
}

.card {
  width: min(640px, 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 12, 12, 0.9);
  box-shadow:
    0 0 50px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 22px;
}

.title {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.5px;
  margin-bottom: 8px;
}

.sub {
  color: #94a3b8;
  font-size: 13px;
  margin-bottom: 18px;
}

.meta {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  padding: 12px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.meta-row:last-child {
  border-bottom: none;
}

.k {
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  color: #94a3b8;
}

.v {
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  color: #f1f5f9;
  word-break: break-all;
  text-align: right;
  max-width: 420px;
}

.actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn {
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.4);
  color: #f1f5f9;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.btn.ghost:hover {
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
}

.btn.danger {
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}

.btn.danger:hover {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(239, 68, 68, 0.8);
}
</style>
