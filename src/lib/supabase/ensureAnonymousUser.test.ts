import { describe, it, expect, vi } from 'vitest';
import { ensureAnonymousUser } from './ensureAnonymousUser';

function fakeClient(options: { sessionUser: { id: string } | null; signInResult?: any }) {
  const signInAnonymously = vi.fn().mockResolvedValue(
    options.signInResult ?? { data: { user: { id: 'fresh-user' } }, error: null }
  );
  const client: any = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: options.sessionUser ? { user: options.sessionUser } : null },
      }),
      signInAnonymously,
    },
  };
  return { client, signInAnonymously };
}

describe('ensureAnonymousUser', () => {
  it('reuses the existing session so earlier campaigns stay reachable', async () => {
    const { client, signInAnonymously } = fakeClient({ sessionUser: { id: 'existing-user' } });

    const result = await ensureAnonymousUser(client);

    expect(result).toEqual({ user: { id: 'existing-user' }, error: null });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when there is no session yet', async () => {
    const { client, signInAnonymously } = fakeClient({ sessionUser: null });

    const result = await ensureAnonymousUser(client);

    expect(result).toEqual({ user: { id: 'fresh-user' }, error: null });
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('surfaces the sign-in error when anonymous sign-in fails', async () => {
    const failure = new Error('sign-in disabled');
    const { client } = fakeClient({
      sessionUser: null,
      signInResult: { data: { user: null }, error: failure },
    });

    const result = await ensureAnonymousUser(client);

    expect(result).toEqual({ user: null, error: failure });
  });
});
