import React, { useEffect, useRef, useState } from 'react';

export interface UserProfileDropdownProps {
  user: any;
  bestStreak: number;
  onSelectTab: (tab: 'leaderboard' | 'arena' | 'charts' | 'guess') => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenMethodology: () => void;
  onOpenLearnToPlay?: () => void;
}

export function UserProfileDropdown({
  user,
  bestStreak,
  onSelectTab,
  onOpenAuth,
  onSignOut,
  onOpenMethodology,
  onOpenLearnToPlay,
}: UserProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const emailName = user?.email ? user.email.split('@')[0] : 'Guest Viewer';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Top Profile Circular Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="User Account"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="w-9 h-9 rounded-full bg-white/95 border border-black/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-center text-stone-600 hover:text-stone-900 hover:bg-white hover:scale-105 active:scale-95 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-arena-terracotta/40 relative"
      >
        <svg className="w-4 h-4 text-[#382e2b]" fill="currentColor" viewBox="0 0 24 24">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2.5a5 5 0 100 10 5 5 0 000-10zM4.75 19.75a8.25 8.25 0 0114.5 0c-.06.28-.24.5-.53.5h-13.44a.58.58 0 01-.53-.5z"
          />
        </svg>
        {user && (
          <span
            className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"
            title="Signed in"
          />
        )}
      </button>

      {/* Dropdown Floating Panel */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2.5 w-72 sm:w-80 bg-white rounded-2xl shadow-[0_4px_6px_-1px_rgba(74,62,57,0.05),0_20px_25px_-5px_rgba(74,62,57,0.1),0_0_0_1px_rgba(238,230,223,0.8)] border border-arena-border overflow-hidden transition-all duration-150 z-50 animate-in fade-in zoom-in-95 origin-top-right"
        >
          {/* User Header Section */}
          <div className="p-5 bg-arena-surface border-b border-arena-border/80 flex items-center gap-3.5 relative">
            {/* Profile Avatar with Custom Silhouette */}
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-white border border-arena-border flex items-center justify-center shadow-sm overflow-hidden text-arena-charcoal">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 128 128"
                  className="w-full h-full"
                >
                  <circle cx="64" cy="64" r="54" fill="#ffffff" stroke="#e8dfd8" strokeWidth="2" />
                  <clipPath id="profile-dropdown-circle-clip">
                    <circle cx="64" cy="64" r="53" />
                  </clipPath>
                  <g clipPath="url(#profile-dropdown-circle-clip)">
                    <circle cx="64" cy="51" r="15" fill="#382e2b" />
                    <path
                      d="M64 72 C46 72 35 84 33 99 C37 107 45 113 54 116 C57 117 71 117 74 116 C83 113 91 107 95 99 C93 84 82 72 64 72 Z"
                      fill="#382e2b"
                    />
                  </g>
                </svg>
              </div>
            </div>

            {/* Identity Text */}
            <div className="min-w-0 flex-1 pr-14">
              <h2 className="font-serif text-lg font-semibold text-arena-charcoal leading-snug tracking-tight truncate capitalize">
                {emailName}
              </h2>
              <p className="text-xs text-arena-muted font-sans truncate">
                {user ? user.email : 'viewer@tvarena.internal'}
              </p>
            </div>

            {/* Plan / Status Badge */}
            <div className="absolute right-4 top-5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-arena-surface border border-arena-border text-[10px] font-semibold tracking-wider text-arena-terracotta uppercase">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  user ? 'bg-emerald-500' : 'bg-arena-terracotta'
                } animate-pulse`}
              />
              <span>{user ? 'ACTIVE' : 'FREE'}</span>
            </div>
          </div>

          {/* Navigation Items Relevant to TV Arena */}
          <div className="p-2 space-y-0.5">
            {/* Guess Game Stats */}
            <button
              type="button"
              onClick={() => {
                onSelectTab('guess');
                setIsOpen(false);
              }}
              className="w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-arena-surface transition-colors duration-150 text-stone-700 hover:text-stone-900 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-arena-muted group-hover:text-arena-terracotta transition-colors">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M6 9v12m6-16v16m6-8v8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium">Guess Game Stats</span>
              </div>
              <span className="text-xs text-arena-terracotta font-semibold bg-arena-border/50 px-2 py-0.5 rounded-full">
                Best: {bestStreak}
              </span>
            </button>

            {/* Head to Head Arena */}
            <button
              type="button"
              onClick={() => {
                onSelectTab('arena');
                setIsOpen(false);
              }}
              className="w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-arena-surface transition-colors duration-150 text-stone-700 hover:text-stone-900 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-arena-muted group-hover:text-arena-terracotta transition-colors">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M4 4l7 7m0 0l-7 7m7-7h9M20 4l-7 7m0 0l7 7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium">Head to Head Arena</span>
              </div>
            </button>

            {/* Global Leaderboard */}
            <button
              type="button"
              onClick={() => {
                onSelectTab('leaderboard');
                setIsOpen(false);
              }}
              className="w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-arena-surface transition-colors duration-150 text-stone-700 hover:text-stone-900 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-arena-muted group-hover:text-arena-terracotta transition-colors">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M3 10h18M3 14h18M3 18h18M3 6h18"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium">Global Leaderboard</span>
              </div>
            </button>

            {/* Trajectory Analytics */}
            <button
              type="button"
              onClick={() => {
                onSelectTab('charts');
                setIsOpen(false);
              }}
              className="w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-arena-surface transition-colors duration-150 text-stone-700 hover:text-stone-900 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-arena-muted group-hover:text-arena-terracotta transition-colors">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M3 3v18h18M7 15l4-5 4 4 6-7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium">Trajectory Charts</span>
              </div>
            </button>

            {/* Intelligence Methodology */}
            <button
              type="button"
              onClick={() => {
                onOpenMethodology();
                setIsOpen(false);
              }}
              className="w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-arena-surface transition-colors duration-150 text-stone-700 hover:text-stone-900 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-arena-muted group-hover:text-arena-terracotta transition-colors">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="12" y1="16" x2="12" y2="12" strokeLinecap="round" />
                    <circle cx="12" cy="8" r="0.5" fill="currentColor" />
                  </svg>
                </span>
                <span className="text-sm font-medium">Intelligence Methodology</span>
              </div>
            </button>

            {/* Learn to Play Guide */}
            {onOpenLearnToPlay && (
              <button
                type="button"
                onClick={() => {
                  onOpenLearnToPlay();
                  setIsOpen(false);
                }}
                className="w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-arena-surface transition-colors duration-150 text-stone-700 hover:text-stone-900 text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-arena-muted group-hover:text-arena-terracotta transition-colors">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-sm font-medium">How to Play Guide</span>
                </div>
              </button>
            )}
          </div>

          {/* Divider Line */}
          <div className="mx-3.5 my-1 border-t border-arena-border/80" />

          {/* Account & Auth Actions */}
          <div className="p-2 space-y-0.5">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  setIsOpen(false);
                }}
                className="w-full group flex items-center justify-between px-3.5 py-2 rounded-xl hover:bg-rose-50/70 transition-colors duration-150 text-[#b8533e] hover:text-[#9e3f2c] text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#b8533e] group-hover:text-[#9e3f2c] transition-colors">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium">Sign Out</span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onOpenAuth();
                  setIsOpen(false);
                }}
                className="w-full group flex items-center justify-between px-3.5 py-2 rounded-xl bg-amber-50/50 hover:bg-amber-100/60 transition-colors duration-150 text-arena-terracotta hover:text-arena-terracotta-dark text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-arena-terracotta transition-colors">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold">Sign In / Register</span>
                </div>
                <span className="text-xs font-bold text-arena-terracotta">→</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
