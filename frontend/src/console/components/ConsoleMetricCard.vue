<template>
  <div class="metric-card" :class="`metric-card--${tone}`">
    <div class="metric-top">
      <span class="metric-label">{{ label }}</span>
      <span v-if="$slots.icon" class="metric-icon"><slot name="icon" /></span>
    </div>
    <strong>{{ value }}</strong>
    <p v-if="hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'blue' | 'violet' | 'green' | 'orange';
  }>(),
  { hint: '', tone: 'blue' }
);
</script>

<style scoped>
.metric-card {
  min-height: 132px;
  padding: 18px;
  border: 1px solid #e6eaf0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 5px 20px rgba(37, 52, 86, 0.035);
}

.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.metric-label {
  color: #6e798e;
  font-size: 12px;
  font-weight: 650;
}

.metric-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: #3159df;
  background: #eef2ff;
}

.metric-card--violet .metric-icon {
  color: #7954d8;
  background: #f2edff;
}

.metric-card--green .metric-icon {
  color: #188a5b;
  background: #e8f8f1;
}

.metric-card--orange .metric-icon {
  color: #b46d14;
  background: #fff3e2;
}

strong {
  display: block;
  margin-top: 14px;
  color: #18233b;
  font-size: 28px;
  line-height: 1;
  letter-spacing: -0.035em;
}

p {
  margin: 10px 0 0;
  color: #8a94a6;
  font-size: 11px;
}
</style>
