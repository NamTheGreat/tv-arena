import { describe, expect, it } from 'vitest';
import { isBlockedUsername } from '../lib/usernameBlocklist';

describe('username blocklist', () => {
  it('rejects reserved names case-insensitively', () => {
    expect(isBlockedUsername('Admin')).toBe(true);
    expect(isBlockedUsername(' tv_arena ')).toBe(true);
    expect(isBlockedUsername('support')).toBe(true);
  });

  it('rejects a small set of slurs and allows ordinary usernames', () => {
    expect(isBlockedUsername('nigger')).toBe(true);
    expect(isBlockedUsername('taylor_fan')).toBe(false);
  });
});
