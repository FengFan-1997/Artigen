<template>
  <div class="pdf-document">
    <div class="pdf-controls" role="group" :aria-label="zh ? 'PDF 页面导航' : 'PDF page navigation'">
      <button
        class="pdf-page-step"
        type="button"
        :aria-label="zh ? '上一页' : 'Previous page'"
        :title="zh ? '上一页' : 'Previous page'"
        :disabled="loading || error || pageNumber <= 1"
        @click="pageNumber--"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4-6 6 6 6" /></svg>
      </button>
      <output
        class="pdf-page-counter"
        :aria-label="
          loading
            ? (zh ? '正在加载 PDF' : 'Loading PDF')
            : error
              ? (zh ? 'PDF 预览不可用' : 'PDF preview unavailable')
              : (zh ? `第 ${pageNumber} 页，共 ${count} 页` : `Page ${pageNumber} of ${count}`)
        "
        aria-live="polite"
      >
        <template v-if="loading"><span class="pdf-loading">{{ zh ? '载入中' : 'Loading' }}</span></template>
        <template v-else-if="error"><span class="pdf-loading">— / —</span></template>
        <template v-else>
          <strong>{{ pageNumber }}</strong
          ><span>{{ ' / ' }}</span
          ><span>{{ count }}</span>
        </template>
      </output>
      <button
        class="pdf-page-step"
        type="button"
        :aria-label="zh ? '下一页' : 'Next page'"
        :title="zh ? '下一页' : 'Next page'"
        :disabled="loading || error || pageNumber >= count"
        @click="pageNumber++"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 4 6 6-6 6" /></svg>
      </button>
    </div>
    <div v-if="error" class="pdf-error" role="status">
      <WorkspaceIcon name="file" :size="20" />
      <div>
        <h3>{{ zh ? 'PDF 暂时无法预览' : 'PDF preview unavailable' }}</h3>
        <p>{{ zh ? '可从上方下载原文件，在本机 PDF 阅读器中检查。' : 'Download the original file above to check it in a local PDF reader.' }}</p>
      </div>
    </div>
    <div v-show="!error" class="pdf-page-scroll"><canvas ref="canvas"></canvas></div>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import WorkspaceIcon from './WorkspaceIcon.vue';
const props = defineProps<{ blob: Blob; zh: boolean }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const pageNumber = ref(1);
const count = ref(0);
const error = ref(false);
const loading = ref(true);
let doc: PDFDocumentProxy | null = null;
let task: RenderTask | null = null;
let active = true;
async function render() {
  task?.cancel();
  try {
    const page = await doc?.getPage(pageNumber.value);
    if (!active || !page || !canvas.value) return;
    const view = page.getViewport({ scale: 1 });
    const scale = Math.min(1.4, 800 / view.width);
    const viewport = page.getViewport({ scale });
    canvas.value.width = viewport.width;
    canvas.value.height = viewport.height;
    task = page.render({ canvasContext: canvas.value.getContext('2d')!, viewport });
    await task.promise;
  } catch (e) {
    if (active && String(e).indexOf('cancel') < 0) error.value = true;
  }
}
onMounted(async () => {
  try {
    const [pdf, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker?url')
    ]);
    pdf.GlobalWorkerOptions.workerSrc = worker.default;
    const loaded = await pdf.getDocument({
      data: await props.blob.arrayBuffer(),
      isEvalSupported: false
    }).promise;
    if (!active) {
      await loaded.destroy();
      return;
    }
    doc = loaded;
    count.value = doc.numPages;
    loading.value = false;
    await render();
  } catch {
    if (active) {
      loading.value = false;
      error.value = true;
    }
  }
});
watch(pageNumber, render);
onBeforeUnmount(() => {
  active = false;
  task?.cancel();
  void doc?.destroy();
});
</script>
<style scoped>
.pdf-document {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  padding: 12px;
}
.pdf-page-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.pdf-controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 3px;
  width: max-content;
  margin: 0 auto 16px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
  font-size: 12px;
}
.pdf-page-step {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  background: transparent;
  cursor: pointer;
}
.pdf-page-step:hover:not(:disabled) {
  background: var(--surface-hover);
}
.pdf-page-step:focus-visible {
  outline: 2px solid var(--acid-text);
  outline-offset: 1px;
}
.pdf-page-step:disabled {
  color: var(--muted);
  opacity: 0.48;
  cursor: default;
}
.pdf-page-step svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.pdf-page-counter {
  display: inline-flex;
  min-width: 62px;
  height: 28px;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 0 8px;
  border-right: 1px solid var(--border);
  border-left: 1px solid var(--border);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.pdf-page-counter strong {
  color: var(--text);
  font-weight: 600;
}
.pdf-loading {
  font-size: 11px;
}
canvas {
  display: block;
  max-width: 100%;
  height: auto;
  margin: auto;
}
.pdf-error { display: grid; grid-template-columns: 20px minmax(0, 1fr); align-items: start; gap: 12px; margin: 24px 4px; text-align: left; }
.pdf-error > .workspace-icon { margin-top: 1px; color: var(--muted); }
.pdf-error h3 { margin: 0; color: var(--text); font-size: 15px; font-weight: 500; line-height: 22px; overflow-wrap: anywhere; }
.pdf-error p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
@media (pointer: coarse) {
  .pdf-page-step {
    width: 44px;
    height: 44px;
  }
  .pdf-page-counter {
    height: 38px;
    min-width: 70px;
  }
}
</style>
