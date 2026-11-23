import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  validateCommentBody,
  commentAuthorName,
  commentBadge,
  formatCommentTime,
  wasEdited,
  COMMENT_MAX_LENGTH,
  type ShowComment,
} from '../lib/comments';

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  fetchComments: vi.fn(),
  postComment: vi.fn(),
  deleteComment: vi.fn(),
  updateComment: vi.fn(),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock('../lib/comments', async (orig) => ({
  ...(await orig<typeof import('../lib/comments')>()),
  fetchComments: mocks.fetchComments,
  postComment: mocks.postComment,
  deleteComment: mocks.deleteComment,
  updateComment: mocks.updateComment,
}));

import { ShowComments } from '../components/ShowComments';

const comment = (over: Partial<ShowComment> = {}): ShowComment => ({
  id: 'c1', user_id: 'u1', body: 'Deserves #1', created_at: '2026-11-23T10:00:00Z', updated_at: '2026-11-23T10:00:00Z',
  username: 'pilot', display_name: null, best_streak: 0, ...over,
});

describe('comment helpers', () => {
  it('accepts normal text and trims it', () => {
    expect(validateCommentBody('  I <3 this & 2 > 1  ')).toEqual({ ok: true, body: 'I <3 this & 2 > 1' });
  });
  it('rejects empty, too long, markup and script URLs', () => {
    expect(validateCommentBody('   ').ok).toBe(false);
    expect(validateCommentBody('a'.repeat(COMMENT_MAX_LENGTH + 1)).ok).toBe(false);
    expect(validateCommentBody('a'.repeat(COMMENT_MAX_LENGTH)).ok).toBe(true);
    expect(validateCommentBody('<script>alert(1)</script>').ok).toBe(false);
    expect(validateCommentBody('<img src=x onerror=1>').ok).toBe(false);
    expect(validateCommentBody('JavaScript:alert(1)').ok).toBe(false);
  });
  it('strips control characters', () => {
    expect(validateCommentBody('he\u0007llo')).toEqual({ ok: true, body: 'hello' });
  });
  it('hides blocked usernames and prefers display names', () => {
    expect(commentAuthorName({ username: 'admin', display_name: 'Admin' })).toBe('Anonymous');
    expect(commentAuthorName({ username: 'pilot', display_name: 'Test Pilot' })).toBe('Test Pilot');
    expect(commentAuthorName({ username: 'pilot', display_name: null })).toBe('@pilot');
  });
  it('shows a streak badge from 3 days', () => {
    expect(commentBadge(2)).toBeNull();
    expect(commentBadge(5)).toBe('🔥 5-day best streak');
  });
  it('formats relative time and detects edits', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    expect(formatCommentTime('2026-11-23T11:59:50Z', now)).toBe('just now');
    expect(formatCommentTime('2026-11-23T11:30:00Z', now)).toBe('30m ago');
    expect(formatCommentTime('2026-11-23T09:00:00Z', now)).toBe('3h ago');
    expect(formatCommentTime('2026-11-20T12:00:00Z', now)).toBe('3d ago');
    expect(wasEdited(comment())).toBe(false);
    expect(wasEdited(comment({ updated_at: '2026-11-23T10:05:00Z' }))).toBe(true);
  });
});

describe('ShowComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.fetchComments.mockResolvedValue({ comments: [comment({ best_streak: 4 })], hasMore: false });
  });

  it('renders comments with author, badge and timestamp, and renders HTML as text', async () => {
    mocks.fetchComments.mockResolvedValue({
      comments: [comment({ body: '&lt;b&gt;hi&lt;/b&gt; ok', best_streak: 4, display_name: 'Test Pilot' })],
      hasMore: false,
    });
    const { container } = render(<ShowComments seriesId="s1" />);
    expect(await screen.findByText('Test Pilot')).toBeTruthy();
    expect(screen.getByText('🔥 4-day best streak')).toBeTruthy();
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-23T10:00:00Z');
    expect(container.querySelector('b')).toBeNull();
  });

  it('asks signed-out visitors to sign in and hides the form', async () => {
    const onOpenAuth = vi.fn();
    render(<ShowComments seriesId="s1" onOpenAuth={onOpenAuth} />);
    await screen.findByText('Deserves #1');
    expect(screen.queryByLabelText('Add a comment')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onOpenAuth).toHaveBeenCalled();
  });

  it('posts a validated comment for a signed-in user and shows it first', async () => {
    mocks.user = { id: 'u2' };
    mocks.postComment.mockResolvedValue(comment({ id: 'c2', user_id: 'u2', body: 'New take', username: 'me' }));
    render(<ShowComments seriesId="s1" />);
    await screen.findByText('Deserves #1');
    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: '  New take ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(mocks.postComment).toHaveBeenCalledWith('s1', 'u2', 'New take'));
    expect(await screen.findByText('New take')).toBeTruthy();
  });

  it('blocks markup client-side without calling the API', async () => {
    mocks.user = { id: 'u2' };
    render(<ShowComments seriesId="s1" />);
    await screen.findByText('Deserves #1');
    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: '<script>x</script>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not allowed/i);
    expect(mocks.postComment).not.toHaveBeenCalled();
  });

  it('shows edit and delete only on your own comments', async () => {
    mocks.user = { id: 'u2' };
    render(<ShowComments seriesId="s1" />);
    await screen.findByText('Deserves #1');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('lets the author delete their comment', async () => {
    mocks.user = { id: 'u1' };
    mocks.deleteComment.mockResolvedValue(undefined);
    render(<ShowComments seriesId="s1" />);
    await screen.findByText('Deserves #1');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteComment).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.queryByText('Deserves #1')).toBeNull());
  });

  it('shows an empty state and a load error message', async () => {
    mocks.fetchComments.mockResolvedValueOnce({ comments: [], hasMore: false });
    const { unmount } = render(<ShowComments seriesId="s1" />);
    expect(await screen.findByText(/No comments yet/)).toBeTruthy();
    unmount();
    mocks.fetchComments.mockRejectedValueOnce(new Error('boom'));
    render(<ShowComments seriesId="s1" />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load comments/);
  });
});
