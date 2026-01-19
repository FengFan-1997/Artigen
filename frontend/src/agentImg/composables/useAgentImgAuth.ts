import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLoginModel } from '@/stores';
import { getCurrentUserId, getAuthToken, isLocalLoggedIn } from '@/login/session';

export function useAgentImgAuth() {
  const router = useRouter();
  const loginStore = useLoginModel();

  const authUserId = ref(getCurrentUserId());
  const authToken = ref(getAuthToken());
  const authTick = ref(0);

  const syncAuth = () => {
    authUserId.value = getCurrentUserId();
    authToken.value = getAuthToken();
  };

  const isAuthed = computed(() => {
    void authTick.value;
    const uid = String(authUserId.value || '').trim();
    const token = String(authToken.value || '').trim();
    return !!uid && !uid.startsWith('guest_') && !!token && isLocalLoggedIn();
  });

  const openLogin = (afterLogin?: null | (() => Promise<void> | void)) => {
    const returnTo = router.currentRoute.value.fullPath;
    loginStore.open({ mode: 'login', returnTo, afterLogin });
  };

  const ensureAuthed = (after?: () => Promise<void> | void) => {
    syncAuth();
    if (isAuthed.value) return true;
    openLogin(after || null);
    return false;
  };

  const onLoginClick = () => {
    openLogin(null);
  };

  const avatarText = computed(() => {
    const uid = String(authUserId.value || '').trim();
    if (!uid) return '?';
    if (uid.startsWith('guest_')) return 'G';
    return uid.slice(0, 1).toUpperCase();
  });

  const openAccountPopup = (tab?: 'orders' | 'usage') => {
    try {
      window.dispatchEvent(
        new CustomEvent('app-account-popup-open', tab ? { detail: { tab } } : undefined)
      );
    } catch {}
  };

  return {
    authUserId,
    authToken,
    authTick,
    syncAuth,
    isAuthed,
    ensureAuthed,
    openLogin,
    onLoginClick,
    avatarText,
    openAccountPopup
  };
}
