import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameOverModal } from '../components/GameOverModal';

describe('daily replay prevention', () => {
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
});
