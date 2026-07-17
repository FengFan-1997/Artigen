import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './style.css';
import App from './App.vue';
import router from './router';
import { initAnalytics } from '@/utils/analytics';

const app = createApp(App);

initAnalytics();

app.use(createPinia());
app.use(router);

let consoleUiPromise: Promise<void> | null = null;
router.beforeEach(async (to) => {
  if (!String(to.path || '').startsWith('/console')) return true;
  if (!consoleUiPromise) {
    consoleUiPromise = Promise.all([
      import('ant-design-vue'),
      import('ant-design-vue/dist/reset.css')
    ]).then(([module]) => {
      app.use(module.default);
    });
  }
  await consoleUiPromise;
  return true;
});

app.mount('#app');
