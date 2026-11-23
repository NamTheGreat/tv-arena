import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  FriendEntry,
  compareStreaks,
  isValidUsername,
  normalizeUsername,
  sortFriends,
} from '../lib/follows';

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  fetchFriendsLeaderboard: vi.fn(),
  fetchFollowing: vi.fn(),
  fetchIncomingRequests: vi.fn(),
  fetchStatsVisibility: vi.fn(),
  fetchHeadToHead: vi.fn(),
  followUser: vi.fn(),
  unfollow: vi.fn(),
  acceptRequest: vi.fn(),
  declineRequest: vi.fn(),
  setStatsVisibility: vi.fn(),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock('../lib/follows', async (orig) => ({ ...(await orig<typeof import('../lib/follows')>()), ...mocks, user: undefined }));

import { FriendsView } from '../components/FriendsView';

const entry = (over: Partial<FriendEntry>): FriendEntry => ({
  user_id: 'u', username: 'u', display_name: null, score: null, current_streak: 0, best_streak: 0,
  daily_rank: null, streak_rank: 1, is_self: false, is_mutual: false, ...over,
});

describe('follow helpers', () => {
  it('normalises and validates usernames', () => {
    expect(normalizeUsername('  @Test_Pilot ')).toBe('test_pilot');
    expect(isValidUsername('test_pilot')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('bad name')).toBe(false);
  });

  it('sorts the daily board by rank with unplayed friends last', () => {
    const rows = [
      entry({ user_id: '1', username: 'zed', daily_rank: null }),
      entry({ user_id: '2', username: 'bo', daily_rank: 2 }),
      entry({ user_id: '3', username: 'al', daily_rank: 1 }),
      entry({ user_id: '4', username: 'amy', daily_rank: null }),
    ];
    expect(sortFriends(rows, 'daily').map((r) => r.username)).toEqual(['al', 'bo', 'amy', 'zed']);
  });

  it('sorts the streak board by streak rank', () => {
    const rows = [entry({ username: 'b', streak_rank: 2 }), entry({ username: 'a', streak_rank: 1 })];
    expect(sortFriends(rows, 'streak').map((r) => r.username)).toEqual(['a', 'b']);
  });

  it('compares streaks including ties', () => {
    expect(compareStreaks(3, 3)).toBe('tied');
    expect(compareStreaks(5, 3)).toBe('you');
    expect(compareStreaks(1, 3)).toBe('them');
  });
});

describe('FriendsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: 'me' };
    mocks.fetchFriendsLeaderboard.mockResolvedValue([
      entry({ user_id: 'me', username: 'me_user', is_self: true, score: 7, daily_rank: 2, current_streak: 3, best_streak: 5, streak_rank: 2 }),
      entry({ user_id: 'f1', username: 'friend_one', score: 9, daily_rank: 1, current_streak: 8, best_streak: 9, streak_rank: 1, is_mutual: true }),
      entry({ user_id: 'f2', username: 'quiet_pal', score: null, current_streak: 1, best_streak: 1, streak_rank: 3 }),
    ]);
    mocks.fetchFollowing.mockResolvedValue([
      { user_id: 'f1', username: 'friend_one', display_name: null, status: 'accepted' },
      { user_id: 'p1', username: 'private_pal', display_name: null, status: 'pending' },
    ]);
    mocks.fetchIncomingRequests.mockResolvedValue([{ user_id: 'r1', username: 'newcomer', display_name: null, status: 'pending' }]);
    mocks.fetchStatsVisibility.mockResolvedValue('public');
  });

  it('asks signed-out visitors to sign in', () => {
    mocks.user = null;
    const onOpenAuth = vi.fn();
    render(<FriendsView onOpenAuth={onOpenAuth} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onOpenAuth).toHaveBeenCalled();
    expect(mocks.fetchFriendsLeaderboard).not.toHaveBeenCalled();
  });

  it('renders the daily board, mutual marker and unplayed friends', async () => {
    render(<FriendsView />);
    const board = await screen.findByRole('region', { name: 'Friends leaderboard' });
    const items = within(board).getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/friend_one/);
    expect(items[0].textContent).toMatch(/Mutual/);
    expect(items[0].textContent).toMatch(/9\/10/);
    expect(items[2].textContent).toMatch(/Not played/);
    expect(items[1].textContent).toMatch(/\(you\)/);
  });

  it('switches to streak ordering', async () => {
    render(<FriendsView />);
    await screen.findByRole('region', { name: 'Friends leaderboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Streaks' }));
    const items = within(screen.getByRole('region', { name: 'Friends leaderboard' })).getAllByRole('listitem');
    expect(items.map((i) => i.textContent?.match(/friend_one|me_user|quiet_pal/)?.[0])).toEqual(['friend_one', 'me_user', 'quiet_pal']);
  });

  it('follows a player and reports a pending request', async () => {
    mocks.followUser.mockResolvedValue('pending');
    render(<FriendsView />);
    await screen.findByRole('region', { name: 'Friends leaderboard' });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: '@Private_Pal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    await waitFor(() => expect(mocks.followUser).toHaveBeenCalledWith('me', '@Private_Pal'));
    expect((await screen.findByRole('status')).textContent).toMatch(/Request sent/);
  });

  it('accepts and declines incoming requests and unfollows', async () => {
    mocks.acceptRequest.mockResolvedValue(undefined);
    mocks.declineRequest.mockResolvedValue(undefined);
    mocks.unfollow.mockResolvedValue(undefined);
    render(<FriendsView />);
    await screen.findByText('Requests to follow you');
    fireEvent.click(screen.getByRole('button', { name: /Accept/ }));
    await waitFor(() => expect(mocks.acceptRequest).toHaveBeenCalledWith('me', 'r1'));
    fireEvent.click(screen.getByRole('button', { name: /Decline/ }));
    await waitFor(() => expect(mocks.declineRequest).toHaveBeenCalledWith('me', 'r1'));
    fireEvent.click(screen.getByRole('button', { name: /^Unfollow/ }));
    await waitFor(() => expect(mocks.unfollow).toHaveBeenCalledWith('me', 'f1'));
    expect(screen.getByText('(request pending)')).toBeTruthy();
  });

  it('saves the privacy setting', async () => {
    mocks.setStatsVisibility.mockResolvedValue(undefined);
    render(<FriendsView />);
    await screen.findByRole('region', { name: 'Friends leaderboard' });
    fireEvent.change(screen.getByLabelText('Who can see my game stats'), { target: { value: 'followers' } });
    await waitFor(() => expect(mocks.setStatsVisibility).toHaveBeenCalledWith('me', 'followers'));
  });

  it('shows head-to-head details and the private-profile message', async () => {
    mocks.fetchHeadToHead.mockResolvedValueOnce({
      opponent_id: 'f1', opponent_username: 'friend_one', visible: true,
      my_current_streak: 3, my_best_streak: 5, their_current_streak: 8, their_best_streak: 9,
      my_score_today: 7, their_score_today: 9, shared_days: 3, my_wins: 1, their_wins: 1, ties: 1,
    });
    render(<FriendsView />);
    await screen.findByRole('region', { name: 'Friends leaderboard' });
    fireEvent.click(screen.getByRole('button', { name: /Compare with friend_one/ }));
    const card = await screen.findByRole('region', { name: 'Head to head' });
    expect(card.textContent).toMatch(/@friend_one leads on current streak/);
    expect(card.textContent).toMatch(/Across 3 shared days: you won 1, they won 1, 1 tied/);

    mocks.fetchHeadToHead.mockResolvedValueOnce({ opponent_id: 'x', opponent_username: 'friend_one', visible: false, my_current_streak: 3, my_best_streak: 5,
      their_current_streak: null, their_best_streak: null, my_score_today: null, their_score_today: null, shared_days: null, my_wins: null, their_wins: null, ties: null });
    fireEvent.click(screen.getByRole('button', { name: /Compare with friend_one/ }));
    await waitFor(() => expect(screen.getByText(/approved followers only/)).toBeTruthy());
  });
});
