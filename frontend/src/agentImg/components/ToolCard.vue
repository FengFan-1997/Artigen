<template>
  <button class="tool-card" type="button" @click="emit('click')">
    <div class="card-header">
      <span class="tool-id">{{ toolId }}</span>
      <span class="tool-badge" :class="badgeTone" v-html="badge"></span>
    </div>

    <div class="tool-icon-wrapper">
      <div class="tool-icon">
        <slot name="icon">
          {{ icon }}
        </slot>
      </div>
    </div>

    <h3 class="tool-title">{{ title }}</h3>
    <p class="tool-desc">{{ desc }}</p>

    <div class="card-footer">
      <span class="launch-text">{{ launch }}</span>
      <span class="arrow"
        ><svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          width="16"
          height="16"
        >
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline></svg
      ></span>
    </div>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  toolId: string;
  badge: string;
  badgeTone?: string;
  icon: string;
  title: string;
  desc: string;
  launch: string;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();
</script>

<style scoped>
.tool-card {
  background: rgba(20, 20, 20, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 40px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
  height: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.tool-card:hover {
  background: rgba(30, 30, 30, 0.6);
  border-color: rgba(204, 255, 0, 0.3);
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.card-header {
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 60px;
}

.tool-id {
  font-family: 'JetBrains Mono', monospace;
  color: #666;
  font-size: 12px;
}

.tool-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
}

.tool-badge.hot {
  background: rgba(255, 100, 0, 0.2);
  color: #ffaa80;
}

.tool-icon-wrapper {
  margin-bottom: 32px;
}

.tool-icon {
  font-size: 48px;
  border: 2px solid #fff;
  padding: 8px 16px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-title {
  font-size: 32px;
  font-weight: 800;
  margin: 0 0 16px;
}

.tool-desc {
  color: #94a3b8;
  font-size: 16px;
  margin: 0;
  flex: 1;
}

.card-footer {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 32px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: auto;
}

.launch-text {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: #666;
  transition: color 0.3s;
}

.tool-card:hover .launch-text {
  color: #fff;
}

.arrow {
  color: #ccff00;
  font-weight: 900;
  transform: translateX(0);
  transition: transform 0.3s;
}

.tool-card:hover .arrow {
  transform: translateX(5px);
}

@media (max-width: 768px) {
  .tool-card {
    padding: 24px;
    height: auto;
    min-height: 300px;
  }
}
</style>
