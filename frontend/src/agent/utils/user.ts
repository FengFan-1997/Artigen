export { normalizeBaseUrl, getApiBaseUrl, buildApiUrl } from '../../utils/api';
import {
  ensureGuestUserId,
  getAuthToken as getAuthTokenLocal,
  isLocalLoggedIn,
  logoutLocal
} from '@/login/session';

export const getUserId = () => ensureGuestUserId();
export const isLoggedIn = () => isLocalLoggedIn();
export const getAuthToken = () => getAuthTokenLocal();
export const logoutUser = () => logoutLocal();
