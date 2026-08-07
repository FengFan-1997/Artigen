<template>
  <header class="page-header">
    <div>
      <span v-if="eyebrow" class="page-eyebrow">{{ eyebrow }}</span>
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  eyebrow?: string;
}>();
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}

.page-eyebrow {
  display: block;
  margin-bottom: 7px;
  color: #3159df;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: #17223a;
  font-size: clamp(24px, 3vw, 31px);
  line-height: 1.2;
  letter-spacing: -0.025em;
}

p {
  max-width: 760px;
  margin: 7px 0 0;
  color: #758096;
  font-size: 13px;
  line-height: 1.65;
}

.page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

@media (max-width: 720px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }
}
</style>
