<template>
  <div class="playground-container">
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>
    <a-alert
      type="warning"
      show-icon
      :message="ui.disabledTitle"
      :description="ui.disabledDescription"
    />
    <a-card :title="ui.actionsTitle" style="margin-top: 24px">
      <a-space wrap>
        <a-button type="primary" @click="router.push('/artigen/ai')">
          {{ ui.openAi }}
        </a-button>
        <a-button @click="router.push('/artigen/image-workshop')">
          {{ ui.openWorkshop }}
        </a-button>
        <a-button @click="router.push('/console/usage')">
          {{ ui.openUsage }}
        </a-button>
      </a-space>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const router = useRouter();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '生成试验场',
        disabledTitle: '旧模拟生成器已停用',
        disabledDescription:
          '旧页面只会返回随机占位图并在浏览器里模拟扣点，不能用于产品或计费验收。请使用真实 AI 工作台；provider、登录、余额或付费门禁未就绪时，它会明确失败而不会伪造结果。',
        actionsTitle: '受控入口',
        openAi: '打开真实 AI 工作台',
        openWorkshop: '打开影像工坊',
        openUsage: '查看服务端用量'
      }
    : {
        title: 'Generation Playground',
        disabledTitle: 'The legacy simulated generator is disabled',
        disabledDescription:
          'The old page returned random placeholder images and charged browser-local mock credits. Use the real AI workspace instead; missing providers, login, balance, or billing gates fail explicitly without fabricating a result.',
        actionsTitle: 'Controlled entry points',
        openAi: 'Open Real AI Workspace',
        openWorkshop: 'Open Image Workshop',
        openUsage: 'View Server Usage'
      }
);
</script>

<style scoped>
.playground-container {
  padding: 24px;
}

@media (max-width: 768px) {
  .playground-container {
    padding: 12px;
  }
}
</style>
