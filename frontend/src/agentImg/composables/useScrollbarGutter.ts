import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

// Match a separate composer to the scroller's actual content width. Overlay
// scrollbars consume zero space; native gutters must not shift one region.
export function useScrollbarGutter(target: Ref<HTMLElement | null>) {
  const width = ref(0);
  let observer: ResizeObserver | undefined;
  watch(
    target,
    (element) => {
      observer?.disconnect();
      const measure = () => {
        width.value = element ? Math.max(0, element.offsetWidth - element.clientWidth) : 0;
      };
      measure();
      if (element) {
        observer = new ResizeObserver(measure);
        observer.observe(element);
      }
    },
    { flush: 'post' }
  );
  onBeforeUnmount(() => observer?.disconnect());
  return width;
}
