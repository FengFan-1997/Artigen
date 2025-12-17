<template>
  <transition name="task-bounce">
    <div v-if="plan" class="task-display" :class="placement">
      <div class="task-header">
        <div class="header-icon">📋</div>
        <div class="header-info">
          <span class="title">Mission Log</span>
          <span class="status-badge" :class="plan.status">{{ plan.status }}</span>
        </div>
      </div>

      <div class="task-progress-bar">
        <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
      </div>

      <div class="task-steps">
        <div
          v-for="(step, index) in plan.steps"
          :key="index"
          class="step-item"
          :class="step.status"
        >
          <div class="step-icon">
            <span v-if="step.status === 'completed'" class="icon-success">✓</span>
            <span v-else-if="step.status === 'running'" class="spinner">↻</span>
            <span v-else-if="step.status === 'failed'" class="icon-fail">✕</span>
            <span v-else class="icon-dot">●</span>
          </div>
          <div class="step-desc">{{ step.description }}</div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TaskPlan } from '../types/task';

const props = withDefaults(
  defineProps<{
    plan: TaskPlan | null;
    placement?: 'left' | 'right' | 'top' | 'bottom';
  }>(),
  {
    placement: 'right'
  }
);

const progressPercentage = computed(() => {
  if (!props.plan || props.plan.steps.length === 0) return 0;
  const completed = props.plan.steps.filter((s) => s.status === 'completed').length;
  return (completed / props.plan.steps.length) * 100;
});
</script>

<style scoped>
.task-display {
  position: absolute;
  top: 0;
  width: 260px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 24px;
  padding: 20px;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset;
  font-family: 'Nunito', 'Segoe UI', sans-serif;
  transform: translateY(0);
  pointer-events: auto;
  z-index: 90;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.task-display.right {
  left: 140%;
}

.task-display.left {
  right: 140%;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.header-icon {
  font-size: 24px;
  background: #fff;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.header-info {
  display: flex;
  flex-direction: column;
}

.title {
  font-size: 16px;
  font-weight: 800;
  color: #2c3e50;
  letter-spacing: -0.5px;
}

.status-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #888;
  margin-top: 2px;
}

.status-badge.running {
  color: #3498db;
}
.status-badge.completed {
  color: #2ecc71;
}
.status-badge.failed {
  color: #e74c3c;
}

.task-progress-bar {
  height: 6px;
  background: #f0f2f5;
  border-radius: 3px;
  margin-bottom: 16px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 10px rgba(79, 172, 254, 0.4);
}

.task-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 4px;
}

/* Scrollbar styling */
.task-steps::-webkit-scrollbar {
  width: 4px;
}
.task-steps::-webkit-scrollbar-track {
  background: transparent;
}
.task-steps::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 13px;
  color: #57606f;
  padding: 10px;
  background: rgba(248, 249, 250, 0.8);
  border-radius: 12px;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.step-item.running {
  background: #fff;
  border-color: #4facfe;
  color: #2c3e50;
  box-shadow: 0 4px 12px rgba(79, 172, 254, 0.15);
  transform: scale(1.02);
}

.step-item.completed {
  color: #a4b0be;
  background: transparent;
  text-decoration: line-through;
  opacity: 0.8;
}

.step-item.failed {
  background: #fff0f0;
  border-color: #ffccc7;
  color: #e74c3c;
}

.step-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  flex-shrink: 0;
}

.icon-success {
  color: #2ecc71;
  font-weight: 900;
}
.icon-fail {
  color: #e74c3c;
  font-weight: 900;
}
.icon-dot {
  color: #ced6e0;
  font-size: 10px;
}

.spinner {
  animation: spin 1s linear infinite;
  color: #4facfe;
  font-weight: bold;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

/* Transition */
.task-bounce-enter-active {
  animation: bounce-in 0.5s;
}
.task-bounce-leave-active {
  animation: bounce-in 0.5s reverse;
}

@keyframes bounce-in {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
  100% {
    transform: scale(1);
  }
}
</style>
