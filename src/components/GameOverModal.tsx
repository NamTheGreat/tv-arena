// ponytail: zero-dependency share modal with navigator.clipboard and Wordle-style emoji grid
import React, { useState } from 'react';

interface GameOverModalProps {
  isOpen: boolean;
  streak: number;
  bestStreak: number;
  knownTitle: string;
  challengerTitle: string;
  guessHistory: boolean[];
  onPlayAgain: () => void;
  onClose: () => void;
}

export function GameOverModal({
  isOpen,
  streak,
  bestStreak,
  knownTitle,
  challengerTitle,
  guessHistory,
  onPlayAgain,
  onClose,
}: GameOverModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Generate Wordle-style emoji string: 🟩 for correct, 🟥 for final strike
  const emojiGrid = guessHistory.map((g) => (g ? '🟩' : '🟥')).join('') || '🟥';
  const shareText = `TV Arena 📺🔥\nStreak: ${streak} in a row!\n${emojiGrid}\nhttps://tv-arena.pages.dev`;

  const handleShare = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-arena-surface border border-arena-border rounded-3xl p-6 sm:p-7 shadow-soft-card flex flex-col items-center text-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-arena-muted hover:text-arena-charcoal text-lg leading-none"
          aria-label="Close modal"
        >
          ✕
        </button>

        <span className="text-3xl mb-2">💥</span>
        <h2 className="text-2xl font-serif font-bold text-arena-charcoal">Run Ended!</h2>
        <p className="text-xs text-arena-muted mt-1">
          Fell to: <span className="font-semibold text-stone-700">{knownTitle}</span> vs{' '}
          <span className="font-semibold text-stone-700">{challengerTitle}</span>
        </p>

        <div className="grid grid-cols-2 gap-3 w-full my-5">
          <div className="bg-stone-100/80 rounded-2xl p-3">
            <span className="text-[10px] uppercase font-bold tracking-wider text-arena-muted block">
              Final Streak
            </span>
            <span className="text-3xl font-serif font-bold text-rose-600">{streak}</span>
          </div>
          <div className="bg-stone-100/80 rounded-2xl p-3">
            <span className="text-[10px] uppercase font-bold tracking-wider text-arena-muted block">
              All-Time Best
            </span>
            <span className="text-3xl font-serif font-bold text-arena-charcoal">{bestStreak}</span>
          </div>
        </div>

        {/* Wordle-style Emoji Grid Preview */}
        <div className="bg-white border border-arena-border px-4 py-2.5 rounded-xl font-mono text-sm tracking-widest text-center mb-5 max-w-full overflow-hidden text-ellipsis select-all">
          {emojiGrid}
        </div>

        <div className="flex flex-col gap-2.5 w-full">
          <button
            type="button"
            onClick={handleShare}
            className="w-full py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs tracking-wider uppercase transition-colors shadow-sm"
          >
            {copied ? '✓ Copied to Clipboard!' : '📋 Share Result'}
          </button>
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full py-2.5 rounded-full bg-arena-terracotta hover:bg-arena-terracottaHover text-white font-semibold text-xs tracking-wider uppercase transition-colors shadow-sm"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
