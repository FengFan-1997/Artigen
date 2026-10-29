import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { getAuthSessionSnapshot } from '@/login/session';

export function useUserIdentity(zh: Ref<boolean>) {
  const session = ref(getAuthSessionSnapshot());
  const refresh = () => { session.value = getAuthSessionSnapshot(); };
  onMounted(() => {
    refresh();
    window.addEventListener('app-auth-changed', refresh);
  });
  onBeforeUnmount(() => window.removeEventListener('app-auth-changed', refresh));
  const userId = computed(() => session.value.verified && session.value.authenticated ? session.value.userId : '');
  const userLabel = computed(() => `${zh.value ? '用户' : 'User'}${userId.value ? ` ${userId.value.slice(0, 8)}` : ''}`);
  return { userId, userLabel };
}
