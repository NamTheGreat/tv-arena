# TV Arena - Agent Guidelines

## Git & Pull Request Operations

- **Branching Model (Gitflow):**
  - **Day-to-day work:** All feature, chore, and fix branches (`feat/*`, `chore/*`, `fix/*`) target **`dev`**.
  - **Production Releases:** Staged periodically from `dev` → `main`.
- **Stay on the User's Active Branch:** When instructed to commit or push, execute directly on the current checked-out branch. NEVER unilaterally switch branches or create a new branch unless explicitly instructed (e.g., "create a new branch").
- **Explicit Commits Only:** Never execute `git commit` unless explicitly and directly requested in the user's most recent prompt. Always keep commits surgical and minimal.
- **Strict PR Invariant:** NEVER raise, open, or draft a Pull Request unless the user explicitly and verbatim requests it (e.g., "raise PR", "open PR", "create PR"). Phrases like "commit to github", "push", or "save to github" mean commit and/or push ONLY—NEVER open a PR.
- **Pull Request Automation:** When explicitly requested by the user to raise, create, or open a Pull Request (PR):
  - You are authorized to push the current working branch to `origin` using `git push -u origin <branch>`.
  - You are authorized to use GitHub CLI (`gh pr create`) to open the pull request with a clear, structured title and summary against the default base branch **`dev`** (or `main` when specifically requested for releases).
- **Push Invariants:**
  - **NEVER** push directly to `main` (production). Pushing directly to `dev` is allowed when the user explicitly requests to commit/push on dev.
  - **NEVER** execute force pushes (`--force` or `-f`).
  - Push operations are allowed when the user explicitly says "commit to github", "push", or explicitly requests a PR.

## Backend Integrity & No Masked Dummy Data

- **No Synthesized / Masked Dummy Data:** Never inject fabricated, hardcoded mock/dummy datasets that simulate Supabase or any database/API without explicit user request.
- **Explicit Connection & Empty States:** When Supabase credentials (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are missing, or when tables contain 0 records, render a clear, honest setup/connection prompt or empty state rather than falling back to fake data.
