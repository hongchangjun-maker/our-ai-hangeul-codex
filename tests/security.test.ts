import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdmin, verifyPassword } from '../app/server/security';
import { getEnv } from '../app/server/env';

vi.mock('../app/server/env', () => ({ getEnv: vi.fn() }));

const mockedEnv = vi.mocked(getEnv);

afterEach(() => mockedEnv.mockReset());

describe('server security boundary', () => {
  it('rejects malformed password hashes instead of throwing', async () => {
    mockedEnv.mockReturnValue({ ADMIN_PASSWORD_HASH: 'pbkdf2$100000$%%%$%%%' } as ReturnType<typeof getEnv>);
    await expect(verifyPassword('correct horse')).resolves.toBe(false);
  });

  it('rejects malformed signed cookies instead of returning a server error', async () => {
    mockedEnv.mockReturnValue({ SESSION_SECRET: 'a'.repeat(32) } as ReturnType<typeof getEnv>);
    const request = new Request('https://example.test/api/admin/settings', { headers: { cookie: 'our_ai_hangeul_admin=e30.%%%' } });
    await expect(isAdmin(request)).resolves.toBe(false);
  });
});
