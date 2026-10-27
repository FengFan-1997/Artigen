import type { Page } from '@playwright/test';

declare global {
  interface Window {
    localPermissionFixture: {
      requests: string[];
      reads: number;
      failRead: boolean;
      granted: boolean;
      release: (result: 'granted' | 'denied' | 'error') => void;
    };
  }
}

// Real origin-private handles persisted by the app; permission outcomes are
// controlled. This never opens an OS picker or reads a user's local folders.
export async function installLocalPermissionFixture(page: Page) {
  await page.addInitScript(() => {
    const state: Window['localPermissionFixture'] = {
      requests: [], reads: 0, failRead: false, granted: false, release: () => {}
    };
    window.localPermissionFixture = state;
    const prototype = FileSystemDirectoryHandle.prototype as FileSystemDirectoryHandle & {
      queryPermission(options: { mode: string }): Promise<PermissionState>;
      requestPermission(options: { mode: string }): Promise<PermissionState>;
      values(): AsyncIterable<FileSystemHandle>;
    };
    const query = prototype.queryPermission;
    const request = prototype.requestPermission;
    const values = prototype.values;
    prototype.queryPermission = async function (options) {
      return this.name === 'local-permission-fixture'
        ? state.granted ? 'granted' : 'prompt'
        : query.call(this, options);
    };
    prototype.requestPermission = async function (options) {
      if (this.name !== 'local-permission-fixture') return request.call(this, options);
      state.requests.push(options.mode);
      return new Promise<PermissionState>((resolve, reject) => {
        state.release = result => {
          if (result === 'error') reject(new DOMException('Controlled permission failure', 'NotAllowedError'));
          else { state.granted = result === 'granted'; resolve(result); }
        };
      });
    };
    prototype.values = async function* () {
      if (this.name === 'local-permission-fixture') {
        state.reads++;
        if (state.failRead) throw new DOMException('Controlled directory failure', 'NotAllowedError');
      }
      for await (const entry of values.call(this)) yield entry;
    };
  });
  return {
    prepare: () => page.evaluate(async () => {
      const storage = await navigator.storage.getDirectory();
      const root = await storage.getDirectoryHandle('local-permission-fixture', { create: true });
      const file = await root.getFileHandle('permission-note.txt', { create: true });
      const writable = await file.createWritable();
      await writable.write('Local permission UI fixture.');
      await writable.close();
      Object.assign(window, { showDirectoryPicker: async () => root });
    }),
    requests: () => page.evaluate(() => window.localPermissionFixture.requests),
    reads: () => page.evaluate(() => window.localPermissionFixture.reads),
    release: (result: 'granted' | 'denied' | 'error') => page.evaluate(value => window.localPermissionFixture.release(value), result),
    failRead: (value: boolean) => page.evaluate(fail => { window.localPermissionFixture.failRead = fail; }, value)
  };
}
