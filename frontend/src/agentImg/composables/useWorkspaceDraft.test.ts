import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceDraft } from './useWorkspaceDraft';

describe('workspace text drafts', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    const events = new EventTarget();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events)
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores each task independently, including after remounting', () => {
    const owner = ref('fixture-a'),
      task = ref('one'),
      draft = ref('');
    const scope = effectScope();
    scope.run(() => useWorkspaceDraft({ owner: () => owner.value, task: () => task.value, draft }));
    draft.value = 'first unsent request';
    task.value = 'two';
    expect(draft.value).toBe('');
    draft.value = 'second unsent request';
    task.value = 'one';
    expect(draft.value).toBe('first unsent request');
    scope.stop();
    const restored = ref('');
    const next = effectScope();
    next.run(() =>
      useWorkspaceDraft({ owner: () => 'fixture-a', task: () => 'two', draft: restored })
    );
    expect(restored.value).toBe('second unsent request');
    next.stop();
  });

  it('does not expose another authenticated account draft on account change or logout', () => {
    const owner = ref('fixture-a'),
      draft = ref('');
    const scope = effectScope();
    scope.run(() => useWorkspaceDraft({ owner: () => owner.value, task: () => 'one', draft }));
    draft.value = 'account A';
    owner.value = 'fixture-b';
    expect(draft.value).toBe('');
    draft.value = 'account B';
    owner.value = 'guest_new';
    expect(draft.value).toBe('');
    owner.value = 'fixture-a';
    expect(draft.value).toBe('account A');
    scope.stop();
  });

  it('retains the guest request when signing in to send it', () => {
    const owner = ref('guest_fixture'),
      draft = ref('');
    const scope = effectScope();
    scope.run(() => useWorkspaceDraft({ owner: () => owner.value, task: () => 'new', draft }));
    draft.value = 'ready to send';
    owner.value = 'fixture-a';
    expect(draft.value).toBe('ready to send');
    scope.stop();
  });

  it('handles a non-reactive cookie identity change through the auth event', () => {
    let owner = 'fixture-a';
    const draft = ref('');
    const scope = effectScope();
    scope.run(() => useWorkspaceDraft({ owner: () => owner, task: () => 'one', draft }));
    draft.value = 'account A';
    owner = 'fixture-b';
    window.dispatchEvent(new Event('app-auth-changed'));
    expect(draft.value).toBe('');
    scope.stop();
  });

  it('a late send acknowledgement clears only its exact saved text', () => {
    const task = ref('one'),
      draft = ref('');
    const scope = effectScope();
    const api = scope.run(() =>
      useWorkspaceDraft({ owner: () => 'fixture-a', task: () => task.value, draft })
    )!;
    draft.value = 'sent';
    draft.value = 'new edit';
    task.value = 'two';
    api.discardSaved('fixture-a', 'one', 'sent');
    task.value = 'one';
    expect(draft.value).toBe('new edit');
    task.value = 'two';
    api.discardSaved('fixture-a', 'one', 'new edit');
    task.value = 'one';
    expect(draft.value).toBe('');
    scope.stop();
  });

  it('keeps input usable when storage is denied', () => {
    window.localStorage.getItem = () => {
      throw new Error('storage denied');
    };
    window.localStorage.setItem = () => {
      throw new Error('storage denied');
    };
    window.localStorage.removeItem = () => {
      throw new Error('storage denied');
    };
    const draft = ref('');
    const scope = effectScope();
    expect(() =>
      scope.run(() => useWorkspaceDraft({ owner: () => 'fixture-a', task: () => 'one', draft }))
    ).not.toThrow();
    draft.value = 'still editable';
    expect(draft.value).toBe('still editable');
    expect(() => scope.stop()).not.toThrow();
  });
});
