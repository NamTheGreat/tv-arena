const blockedUsernames = new Set([
  'admin',
  'administrator',
  'help',
  'moderator',
  'mod',
  'official',
  'owner',
  'root',
  'security',
  'staff',
  'support',
  'system',
  'tv_arena',
  'tvarena',
  'verified',
  'nigger',
  'nigga',
  'faggot',
  'tranny',
  'retard',
  'kike',
  'spic',
  'chink',
  'coon',
  'wetback',
]);

export function isBlockedUsername(username: string): boolean {
  return blockedUsernames.has(username.trim().toLowerCase());
}
