import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameOverModal } from '../components/GameOverModal';
import { DailyResultCard } from '../components/DailyResultCard';

const storedResult = {
  date: '2026-11-04',
  score: 7,
  correctness: [true, true, false, true, true, true, false, true, false, true],
  answers: ['higher', 'higher', 'lower', 'higher', 'higher', 'higher', 'lower', 'higher', 'lower', 'higher'] as ('higher' | 'lower')[],
  completedAt: '2026-11-04T12:00:00.000Z',
  verified: false,
};

describe('daily replay prevention', () => {
  it('copies the daily score and green/red result grid', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <DailyResultCard
        result={storedResult}
        isAuthenticated={false}
        isSubmitting={false}
        submissionError={null}
        onRetry={vi.fn()}
      />
    );

    screen.getByRole('button', { name: 'Share Result' }).click();
    expect(await screen.findByRole('status')).toHaveTextContent('Copied result to clipboard.');
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('🟩🟩🟥🟩🟩🟩🟥🟩🟥🟩'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/daily/21?g=1101110101'));

    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('does not offer replay after a daily run', () => {
    render(
      <GameOverModal
        isOpen
        mode="daily"
        streak={0}
        bestStreak={0}
        knownTitle="Show A"
        challengerTitle="Show B"
        guessHistory={[true, false]}
        onPlayAgain={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /replay daily run|play again/i })).toBeNull();
    expect(screen.getByRole('button', { name: /share result/i })).toBeInTheDocument();
  });

  it('tells anonymous players their score is device-only and offers sign-in', () => {
    const onOpenAuth = vi.fn();
    render(
      <DailyResultCard
        result={storedResult}
        isAuthenticated={false}
        isSubmitting={false}
        submissionError={null}
        onRetry={vi.fn()}
        onOpenAuth={onOpenAuth}
      />
    );

    expect(screen.getByText('Saved on this device only.')).toBeInTheDocument();
    expect(screen.getByText('Sign in to save your score to the leaderboard.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Sign in' }).click();
    expect(onOpenAuth).toHaveBeenCalledOnce();
  });

  it('shows authenticated submission failures and a retry action', () => {
    const onRetry = vi.fn();
    render(
      <DailyResultCard
        result={storedResult}
        isAuthenticated
        isSubmitting={false}
        submissionError="Your score could not be saved. Please retry."
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Your score could not be saved. Please retry.');
    screen.getByRole('button', { name: 'Retry saving score' }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
