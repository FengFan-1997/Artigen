import type { RouteRecordRaw } from 'vue-router';
import LoginPage from './views/LoginPage.vue';
import VerifyPage from './views/VerifyPage.vue';
import AccountPage from './views/AccountPage.vue';

export const loginRoutes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/login/verify', name: 'login-verify', component: VerifyPage },
  { path: '/login/account', name: 'login-account', component: AccountPage }
];
