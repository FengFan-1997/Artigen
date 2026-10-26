import type { Page } from '@playwright/test';

declare global {
  interface Window {
    lazyDirectoryFixture: { calls: number; fail: boolean; target: string; release: () => void };
  }
}

// Real origin-private directory handles; the picker result and read failure are
// controlled fixtures. This does not exercise OS picker permission or user files.
export async function installLazyDirectoryFixture(page: Page) {
  await page.evaluate(async () => {
    const storage = await navigator.storage.getDirectory();
    const root = await storage.getDirectoryHandle('local-ui-fixture', { create: true });
    const notes = await root.getDirectoryHandle('reference-notes', { create: true });
    const file = await notes.getFileHandle('brief.txt', { create: true });
    const writable = await file.createWritable();
    await writable.write('Local directory UI fixture.');
    await writable.close();
    const nested = await notes.getDirectoryHandle('nested', { create: true });
    await nested.getFileHandle('nested-note.txt', { create: true });
    const state = { calls: 0, fail: true, target: 'reference-notes', release: () => {} };
    Object.assign(window, { lazyDirectoryFixture: state, showDirectoryPicker: async () => root });
    const prototype = FileSystemDirectoryHandle.prototype as FileSystemDirectoryHandle & {
      values(): AsyncIterable<FileSystemHandle>;
    };
    const original = prototype.values;
    prototype.values = async function* () {
      if (this.name === state.target) {
        state.calls++;
        await new Promise<void>(resolve => { state.release = resolve; });
        if (state.fail) throw new DOMException('Controlled read failure', 'NotAllowedError');
      }
      for await (const entry of original.call(this)) yield entry;
    };
  });
  return {
    calls: () => page.evaluate(() => window.lazyDirectoryFixture.calls),
    release: (fail: boolean) => page.evaluate(value => {
      window.lazyDirectoryFixture.fail = value;
      window.lazyDirectoryFixture.release();
    }, fail),
    target: (name: string) => page.evaluate(value => { window.lazyDirectoryFixture.target = value; }, name)
  };
}
