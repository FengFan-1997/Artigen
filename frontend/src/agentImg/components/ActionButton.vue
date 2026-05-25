<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary';
    icon?: string;
    iconAlt?: string;
    iconWidth?: number;
    iconHeight?: number;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  {
    variant: 'primary',
    iconAlt: '',
    iconWidth: 19,
    iconHeight: 18,
    disabled: false,
    type: 'button'
  }
);

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const onClick = (event: MouseEvent) => {
  emit('click', event);
};
</script>

<template>
  <button
    class="btn action-button"
    :class="`btn-${props.variant}`"
    :type="props.type"
    :disabled="props.disabled"
    @click="onClick"
  >
    <img
      v-if="props.icon"
      class="action-button__icon"
      :src="props.icon"
      :alt="props.iconAlt"
      :width="props.iconWidth"
      :height="props.iconHeight"
    />
    <span class="action-button__text">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--btn-gap, 8px);
  height: var(--btn-height, 48px);
  padding: var(--btn-padding, 0);
  border-radius: var(--btn-radius, 12px);
  font-size: var(--btn-font-size, 15px);
  font-weight: var(--btn-font-weight, 500);
  cursor: pointer;
  transition: var(--btn-transition, all 0.2s);
  border: var(--btn-border, none);
  background: var(--btn-bg, transparent);
  color: var(--btn-color, inherit);
  box-shadow: var(--btn-shadow, none);
}

.btn:hover:not(:disabled) {
  background: var(--btn-hover-bg, var(--btn-bg));
  border: var(--btn-hover-border, var(--btn-border));
  color: var(--btn-hover-color, var(--btn-color));
  box-shadow: var(--btn-hover-shadow, var(--btn-shadow));
  transform: var(--btn-hover-transform, none);
}

.btn:disabled {
  opacity: var(--btn-disabled-opacity, 0.6);
  cursor: not-allowed;
  box-shadow: none;
}

.action-button__icon {
  flex: 0 0 auto;
}

.action-button__text {
  display: inline-flex;
  align-items: center;
}
</style>
