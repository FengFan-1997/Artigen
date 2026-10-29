import { beforeEach, expect, it, vi } from 'vitest';
import { useAgentImgAuth } from './useAgentImgAuth';

const session = vi.hoisted(() => ({ userId: 'returning-user', authenticated: false }));
const open = vi.hoisted(() => vi.fn());
vi.mock('@/login/session', () => ({
  getCurrentUserId: () => session.userId,
  isLocalLoggedIn: () => session.authenticated
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ currentRoute: { value: { fullPath: '/artigen/projects' } } })
}));
vi.mock('@/stores', () => ({ useLoginModel: () => ({ open }) }));

beforeEach(() => {
  session.userId = 'returning-user';
  session.authenticated = false;
  open.mockClear();
});

it('updates cached auth state when cookie verification restores the same stored user ID', () => {
  const auth = useAgentImgAuth();
  expect(auth.isAuthed.value).toBe(false);
  session.authenticated = true;
  auth.syncAuth();
  expect(auth.authUserId.value).toBe('returning-user');
  expect(auth.isAuthed.value).toBe(true);
  expect(auth.ensureAuthed()).toBe(true);
  expect(open).not.toHaveBeenCalled();
});

it('removes cached authenticated UI when verification changes without an identity change', () => {
  session.authenticated = true;
  const auth = useAgentImgAuth();
  expect(auth.isAuthed.value).toBe(true);
  session.authenticated = false;
  auth.syncAuth();
  expect(auth.isAuthed.value).toBe(false);
  expect(auth.ensureAuthed()).toBe(false);
  expect(open).toHaveBeenCalledOnce();
});
