<template>
  <svg class="connection-line-svg">
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#4facfe" />
      </marker>
      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color: #4facfe; stop-opacity: 0.8" />
        <stop offset="100%" style="stop-color: #00f2fe; stop-opacity: 0.8" />
      </linearGradient>
    </defs>

    <!-- Animated Path -->
    <path
      :d="pathData"
      stroke="url(#lineGradient)"
      stroke-width="3"
      fill="none"
      stroke-dasharray="8, 6"
      class="animated-dash"
      marker-end="url(#arrowhead)"
    />

    <!-- Moving Dot -->
    <circle r="4" fill="#fff" filter="url(#glow)">
      <animateMotion :path="pathData" dur="1s" repeatCount="indefinite" rotate="auto" />
    </circle>

    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
      <feMerge>
        <feMergeNode in="coloredBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  start: { x: number; y: number };
  end: { x: number; y: number };
}>();

const pathData = computed(() => {
  const { start, end } = props;
  // Simple straight line for now, can be curved (Bezier) for more style
  // Using a quadratic curve for a bit of "slack"
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Add some curve offset based on distance?
  // For simplicity, straight line is often clearer for pointing
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
});
</script>

<style scoped>
.connection-line-svg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 9998; /* Below Agent (9999) but above content */
  overflow: visible;
}

.animated-dash {
  animation: dash 1s linear infinite;
}

@keyframes dash {
  from {
    stroke-dashoffset: 14;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
