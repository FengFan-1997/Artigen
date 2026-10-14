import { onScopeDispose, ref, watch, type Ref } from 'vue';

const storageKey = (owner: string, task: string) =>
  `artigen:workspace-draft:v1:${encodeURIComponent(owner || 'guest')}:${encodeURIComponent(task)}`;

// Only text is durable. Files remain local File objects and must be chosen again
// after a reload; a restored draft must never imply that a file was uploaded.
export function useWorkspaceDraft(options: {
  owner: () => string;
  task: () => string;
  draft: Ref<string>;
}) {
  const restored = ref(false);
  let key = '';
  let restoring = false;
  let lastScope: [string, string] | undefined;
  const read = (target: string) => {
    try {
      return (window.localStorage.getItem(target) || '').slice(0, 20_000);
    } catch {
      return '';
    }
  };
  const save = (target: string, text: string) => {
    if (!target) return;
    try {
      if (text) window.localStorage.setItem(target, text.slice(0, 20_000));
      else window.localStorage.removeItem(target);
    } catch {
      /* Storage denial must not disable the composer. */
    }
  };

  const switchScope = ([owner, task]: [string, string]) => {
    const nextKey = storageKey(owner, task);
    if (nextKey === key) return;
    const previous = lastScope;
    lastScope = [owner, task];
    const currentText = options.draft.value;
    save(key, currentText);
    key = nextKey;
    // A guest who signs in to submit a new request keeps that request. Switching
    // between authenticated accounts or tasks always restores a separate draft.
    const guestLogin = Boolean(
      currentText &&
      previous &&
      (!previous[0] || previous[0].startsWith('guest_')) &&
      owner &&
      !owner.startsWith('guest_') &&
      previous[1] === task
    );
    const text = guestLogin ? currentText : read(key);
    restoring = true;
    options.draft.value = text;
    restoring = false;
    restored.value = Boolean(text);
    if (guestLogin) save(key, text);
  };
  watch([options.owner, options.task], (scope) => switchScope(scope), {
    immediate: true,
    flush: 'sync'
  });
  const onAuthChanged = () => switchScope([options.owner(), options.task()]);
  window.addEventListener('app-auth-changed', onAuthChanged);

  watch(
    options.draft,
    (text) => {
      if (restoring) return;
      restored.value = false;
      save(key, text);
    },
    { flush: 'sync' }
  );
  onScopeDispose(() => {
    save(key, options.draft.value);
    window.removeEventListener('app-auth-changed', onAuthChanged);
  });

  const discardSaved = (owner: string, task: string, submittedText: string) => {
    const target = storageKey(owner, task);
    // A late successful send may clear its own draft, never a newer edit.
    if (read(target) === submittedText) save(target, '');
  };
  return { restored, discardSaved };
}
