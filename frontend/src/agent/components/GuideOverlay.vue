<template>
  <div v-if="visible" class="guide-overlay-container">
    <!-- Highlight Box around target -->
    <div class="guide-box" :style="boxStyle">
      <div class="guide-corner top-left"></div>
      <div class="guide-corner top-right"></div>
      <div class="guide-corner bottom-left"></div>
      <div class="guide-corner bottom-right"></div>
      <div class="guide-label" v-if="label">{{ label }}</div>
    </div>

    <!-- SVG Connection Line -->
    <svg class="guide-svg" v-if="agentPosition && targetRect">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#ff4757" />
        </marker>
      </defs>
      <path
        :d="pathData"
        stroke="#ff4757"
        stroke-width="3"
        fill="none"
        stroke-dasharray="10,5"
        marker-end="url(#arrowhead)"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="100"
          to="0"
          dur="1s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  targetRect: DOMRect | null;
  label?: string;
  agentPosition?: { x: number; y: number };
}>();

const AGENT_SIZE = 80;

const boxStyle = computed(() => {
  if (!props.targetRect) return {};

  const { top, left, width, height } = props.targetRect;
  const padding = 8;

  return {
    top: `${top - padding}px`,
    left: `${left - padding}px`,
    width: `${width + padding * 2}px`,
    height: `${height + padding * 2}px`
  };
});

const pathData = computed(() => {
  if (!props.targetRect || !props.agentPosition) return '';

  const startX = props.agentPosition.x + AGENT_SIZE / 2;
  const startY = props.agentPosition.y + AGENT_SIZE / 2;

  // Target center
  const targetX = props.targetRect.left + props.targetRect.width / 2;
  const targetY = props.targetRect.top + props.targetRect.height / 2;

  // Control point for curve (midpoint + offset)
  const midX = (startX + targetX) / 2;
  const midY = (startY + targetY) / 2;

  // Offset depends on direction to create a nice arc
  const offsetX = (startY - targetY) * 0.2;
  const offsetY = (targetX - startX) * 0.2;

  const cpX = midX + offsetX;
  const cpY = midY + offsetY;

  return `M ${startX} ${startY} Q ${cpX} ${cpY} ${targetX} ${targetY}`;
});
</script>

<style scoped>
.guide-overlay-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 9998;
}

.guide-box {
  position: absolute;
  /* border: 2px solid #ff4757; */
  /* Use corners instead of full border for cooler look */
}

.guide-corner {
  position: absolute;
  width: 15px;
  height: 15px;
  border-color: #ff4757;
  border-style: solid;
  transition: all 0.3s ease;
}

.guide-corner.top-left {
  top: 0;
  left: 0;
  border-width: 3px 0 0 3px;
  border-radius: 4px 0 0 0;
}
.guide-corner.top-right {
  top: 0;
  right: 0;
  border-width: 3px 3px 0 0;
  border-radius: 0 4px 0 0;
}
.guide-corner.bottom-left {
  bottom: 0;
  left: 0;
  border-width: 0 0 3px 3px;
  border-radius: 0 0 0 4px;
}
.guide-corner.bottom-right {
  bottom: 0;
  right: 0;
  border-width: 0 3px 3px 0;
  border-radius: 0 0 4px 0;
}

.guide-box:active .guide-corner {
  /* Flash effect */
}

.guide-label {
  position: absolute;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  background: #ff4757;
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  white-space: nowrap;
  box-shadow: 0 4px 10px rgba(255, 71, 87, 0.4);
  animation: bounce-label 1s infinite alternate;
}

.guide-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

@keyframes bounce-label {
  from {
    transform: translateX(-50%) translateY(0);
  }
  to {
    transform: translateX(-50%) translateY(-5px);
  }
}
</style>
