import React from 'react';
import { useNavigate } from 'react-router-dom';

export function NotFoundView() {
  const navigate = useNavigate();

  return (
    <main className="w-full max-w-lg mx-auto bg-white/90 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] p-6 sm:p-10 shadow-card border border-[#EFEAE2]/90 text-center my-8">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#FAEDE6] border border-[#F0D5C5] flex items-center justify-center text-3xl">
        📺
      </div>
      <h2 className="font-serif text-2xl sm:text-3xl font-medium text-arena-charcoal mb-2">
        Page Not Found
      </h2>
      <p className="text-xs sm:text-sm text-arena-muted mb-6 leading-relaxed">
        The matchup, show, or route you requested could not be located in the TV Arena database.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-5 py-2 rounded-full bg-arena-terracotta hover:bg-arena-terracottaHover text-white text-xs font-semibold shadow-pill transition-all duration-150 cursor-pointer"
        >
          View Leaderboard
        </button>
        <button
          type="button"
          onClick={() => navigate('/arena')}
          className="px-5 py-2 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs font-semibold transition-all duration-150 cursor-pointer"
        >
          Go to Arena
        </button>
      </div>
    </main>
  );
}
