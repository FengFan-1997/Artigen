import { computed, ref } from 'vue';
import { getCurrentUserId, isLocalLoggedIn, logoutLocal } from '@/login/session';
import { getLastEmail, loadUsers } from '@/login/storage';
import { getUserProfile } from '../services/aiService';
import logger from '../utils/logger';

const currentUser = ref<any>(null);
const isAuthenticated = ref(isLocalLoggedIn());

export function useAuth() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const isGuest = computed(() => !isAuthenticated.value);

  const initAuth = async () => {
    isAuthenticated.value = isLocalLoggedIn();
    if (isAuthenticated.value) {
      try {
        const profile = await getUserProfile();
        currentUser.value = profile;
      } catch (e) {
        const uid = getCurrentUserId();
        const users = loadUsers();
        const found = users.find((u) => u.userId === uid);
        currentUser.value = {
          userId: uid,
          email: found?.email || getLastEmail() || '',
          name: found?.email || getLastEmail() || ''
        };
        logger.error('Failed to load user profile', e);
      }
    }
  };

  const login = async () => {
    error.value = 'USE_EMAIL_CODE_LOGIN';
    throw new Error('USE_EMAIL_CODE_LOGIN');
  };

  const register = async () => {
    error.value = 'USE_EMAIL_CODE_LOGIN';
    throw new Error('USE_EMAIL_CODE_LOGIN');
  };

  const logout = () => {
    logoutLocal();
    currentUser.value = null;
    isAuthenticated.value = false;
  };

  return {
    currentUser,
    isAuthenticated,
    isGuest,
    isLoading,
    error,
    login,
    register,
    logout,
    initAuth
  };
}
