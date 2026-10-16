# TV Arena - Agent Guidelines

## Git & Pull Request Operations

- **Branching Model (Gitflow):**
  - **Day-to-day work:** All feature, chore, and fix branches (`feat/*`, `chore/*`, `fix/*`) target **`develop`**.
  - **Production Releases:** Staged periodically from `develop` → `main`.
- **Explicit Commits Only:** Never execute `git commit` unless explicitly and directly requested in the user's most recent prompt. Always keep commits surgical and minimal.
- **Pull Request Automation:** When explicitly requested by the user to raise, create, or open a Pull Request (PR):
  - You are authorized to push the current working branch to `origin` using `git push -u origin <branch>`.
  - You are authorized to use GitHub CLI (`gh pr create`) to open the pull request with a clear, structured title and summary against the default base branch **`develop`** (or `main` when specifically requested for releases).
  - **Invariants:**
    - **NEVER** push directly to `main` or `develop`.
    - **NEVER** execute force pushes (`--force` or `-f`).
    - Push operations are strictly restricted to opening pull requests upon explicit request.

## Backend Integrity & No Masked Dummy Data

- **No Synthesized / Masked Dummy Data:** Never inject fabricated, hardcoded mock/dummy datasets that simulate Supabase or any database/API without explicit user request.
- **Explicit Connection & Empty States:** When Supabase credentials (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are missing, or when tables contain 0 records, render a clear, honest setup/connection prompt or empty state rather than falling back to fake data.

