<template>
  <div class="pdf-document">
    <div class="pdf-controls">
      <button :disabled="pageNumber <= 1" @click="pageNumber--">上一页</button
      ><span>{{ pageNumber }} / {{ count }}</span
      ><button :disabled="pageNumber >= count" @click="pageNumber++">下一页</button>
    </div>
    <p v-if="error" role="status">{{ error }}</p>
    <canvas ref="canvas"></canvas>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
const props = defineProps<{ blob: Blob }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const pageNumber = ref(1);
const count = ref(0);
const error = ref('');
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
    if (active && String(e).indexOf('cancel') < 0) error.value = 'PDF 暂时无法预览，可下载后打开。';
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
    await render();
  } catch {
    if (active) error.value = 'PDF 暂时无法预览，可下载后打开。';
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
  overflow: auto;
  height: 100%;
  padding: 12px;
}
.pdf-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 14px;
  font-size: 12px;
}
.pdf-controls button {
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
canvas {
  display: block;
  max-width: 100%;
  height: auto;
  margin: auto;
}
p {
  color: var(--muted);
}
</style>
