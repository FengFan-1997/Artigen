import { ref, computed } from 'vue';
import {
  getUserId,
  isLoggedIn as checkIsLoggedIn,
  loginUser,
  registerUser,
  logoutUser
} from '../utils/user';
import { getUserProfile } from '../services/aiService';

const currentUser = ref<any>(null);
const isAuthenticated = ref(checkIsLoggedIn());

export function useAuth() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const isGuest = computed(() => !isAuthenticated.value);

  const initAuth = async () => {
    isAuthenticated.value = checkIsLoggedIn();
    if (isAuthenticated.value) {
      try {
        const profile = await getUserProfile();
        currentUser.value = profile;
      } catch (e) {
        console.error('Failed to load user profile', e);
      }
    }
  };

  const login = async (username: string, password: string) => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await loginUser(username, password);
      currentUser.value = data;
      isAuthenticated.value = true;
      return data;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      isLoading.value = false;
    }
  };

  const register = async (username: string, password: string, name: string) => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await registerUser(username, password, name);
      currentUser.value = data;
      isAuthenticated.value = true;
      return data;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      isLoading.value = false;
    }
  };

  const logout = () => {
    logoutUser();
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
