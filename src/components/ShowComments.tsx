import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  COMMENT_MAX_LENGTH,
  ShowComment,
  commentAuthorName,
  commentBadge,
  deleteComment,
  fetchComments,
  formatCommentTime,
  postComment,
  updateComment,
  validateCommentBody,
  wasEdited,
} from '../lib/comments';

interface ShowCommentsProps {
  seriesId: string;
  onOpenAuth?: () => void;
}

export function ShowComments({ seriesId, onOpenAuth }: ShowCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<ShowComment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    setComments([]);
    fetchComments(seriesId)
      .then((res) => {
        if (!active) return;
        setComments(res.comments);
        setHasMore(res.hasMore);
      })
      .catch(() => active && setLoadError('Could not load comments.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [seriesId]);

  const loadMore = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetchComments(seriesId, comments.length);
      setComments((prev) => [...prev, ...res.comments.filter((c) => !prev.some((p) => p.id === c.id))]);
      setHasMore(res.hasMore);
    } catch {
      setLoadError('Could not load more comments.');
    } finally {
      setBusy(false);
    }
  }, [seriesId, comments.length]);

  if (!isSupabaseConfigured) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const result = validateCommentBody(draft);
    if (!result.ok) return setFormError(result.error);
    setBusy(true);
    setFormError(null);
    try {
      const created = await postComment(seriesId, user.id, result.body);
      setComments((prev) => [created, ...prev]);
      setDraft('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not post comment.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string) => {
    const result = validateCommentBody(editDraft);
    if (!result.ok) return setFormError(result.error);
    setBusy(true);
    setFormError(null);
    try {
      const updated = await updateComment(id, result.body);
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save comment.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setFormError(null);
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete comment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6" aria-labelledby="show-comments-heading">
      <h2 id="show-comments-heading" className="mb-2 text-xs font-semibold text-stone-700">
        Discussion {comments.length > 0 && <span className="font-normal text-stone-500">({comments.length}{hasMore ? '+' : ''})</span>}
      </h2>

      {user ? (
        <form onSubmit={submit} className="mb-4">
          <label htmlFor="comment-draft" className="sr-only">Add a comment</label>
          <textarea
            id="comment-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            placeholder="Does this show deserve its rank? Share a take."
            className="w-full rounded-xl border border-stone-200 p-3 text-sm focus:border-arena-terracotta focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-stone-500" aria-live="polite">{draft.length}/{COMMENT_MAX_LENGTH}</span>
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="rounded-full bg-arena-terracotta px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </form>
      ) : (
        <p className="mb-4 text-xs text-stone-600">
          <button type="button" onClick={onOpenAuth} className="font-semibold text-arena-terracotta underline">Sign in</button> to join the discussion.
        </p>
      )}

      {formError && <p role="alert" className="mb-3 text-xs text-rose-700">{formError}</p>}
      {loadError && <p role="alert" className="mb-3 text-xs text-rose-700">{loadError}</p>}
      {loading && <p role="status" className="text-xs text-stone-500">Loading comments…</p>}
      {!loading && !loadError && comments.length === 0 && (
        <p className="text-xs text-stone-500">No comments yet. Be the first to weigh in.</p>
      )}

      <ul className="divide-y divide-stone-100">
        {comments.map((c) => {
          const badge = commentBadge(c.best_streak);
          const mine = user?.id === c.user_id;
          return (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-stone-500">
                <span className="text-xs font-semibold text-stone-800">{commentAuthorName(c)}</span>
                {badge && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">{badge}</span>}
                <time dateTime={c.created_at} title={new Date(c.created_at).toLocaleString()}>{formatCommentTime(c.created_at)}</time>
                {wasEdited(c) && <span>(edited)</span>}
              </div>
              {editingId === c.id ? (
                <div className="mt-2">
                  <label htmlFor={`edit-${c.id}`} className="sr-only">Edit comment</label>
                  <textarea
                    id={`edit-${c.id}`}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    maxLength={COMMENT_MAX_LENGTH}
                    rows={3}
                    className="w-full rounded-xl border border-stone-200 p-2 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => saveEdit(c.id)} className="rounded-full bg-arena-terracotta px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => { setEditingId(null); setFormError(null); }} className="rounded-full border border-stone-200 px-3 py-1 text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-800">{c.body}</p>
              )}
              {mine && editingId !== c.id && (
                <div className="mt-1 flex gap-3 text-[11px]">
                  <button type="button" className="text-stone-600 underline" onClick={() => { setEditingId(c.id); setEditDraft(c.body); setFormError(null); }}>Edit</button>
                  <button type="button" disabled={busy} className="text-rose-700 underline disabled:opacity-50" onClick={() => remove(c.id)}>Delete</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button type="button" disabled={busy} onClick={loadMore} className="mt-3 rounded-full border border-stone-200 px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
          Load more
        </button>
      )}
    </section>
  );
}
