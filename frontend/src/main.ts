import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './style.css';
import App from './App.vue';
import router from './router';
import VueLazyLoad from 'vue3-lazyload';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(Antd);
app.use(VueLazyLoad, {
  loading: '', // optional
  error: '' // optional
});

app.mount('#app');
