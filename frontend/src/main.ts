import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './style.css';
import App from './App.vue';
import router from './router';
import { initAnalytics } from '@/utils/analytics';

const app = createApp(App);

initAnalytics();

app.use(createPinia());
app.use(router);
app.use(Antd);

app.mount('#app');
