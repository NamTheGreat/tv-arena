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

## Automated PR Triage & Review Workflow ("Do the PRs")

Whenever the user instructs "Do the PRs", "do the prs", or requests PR review/merge triage:

1. **Discovery & Verification:**
   - List all open PRs via `gh pr list --state open`.
   - Conduct two-axis review (`code-review`: Standards + Spec).
   - Verify CI quality gates (`gh pr checks <PR>`) and run local verification suite on `dev` (`npm run build`, `cargo test`, `cargo clippy`).

2. **Happy Path (CI Green & Clean Diff):**
   - Submit pending review with `APPROVE` via `gh api repos/:owner/:repo/pulls/<PR>/reviews` (or `COMMENT` if self-review restriction applies).
   - Squash-merge into `dev` using `gh pr merge <PR> --squash --delete-branch`.
   - Pull latest `dev` locally to stay synchronized: `git pull origin dev`.

3. **Failure Path (Failing Checks, Compilation Errors, or Red Flags):**
   - **Keep PRs Open:** NEVER unilaterally close PRs that have fixable issues unless explicitly told to do so.
   - **Post `REQUEST_CHANGES` Review:** Submit a formal GitHub pending review with `REQUEST_CHANGES`, providing line comments on breaking diff lines and a clear summary.
   - **Generate Copy-able Handoff Prompt:** Always output a clean, copy-pasteable Markdown brief formatted for peer agents (e.g. `MAIN_TV Arena Project Setup`) containing:
     - Exact problem description and CI failure log snippet.
     - Root cause explanation.
     - Copy-paste terminal commands: branch checkout, exact code changes, test verification commands, commit message, and push command.
   - **PR Discussion Mirroring:** Ensure the root cause and required fix steps are recorded on the PR thread.

4. **Dependabot Configuration Invariant:**
   - In `.github/dependabot.yml`, grouped updates (`groups.<name>`) with `patterns: ["*"]` override ecosystem `ignore` rules unless `update-types: ["minor", "patch"]` is explicitly configured. Always enforce `update-types` on groups to prevent breaking major upgrades from being batched.

## Backend Integrity & No Masked Dummy Data

- **No Synthesized / Masked Dummy Data:** Never inject fabricated, hardcoded mock/dummy datasets that simulate Supabase or any database/API without explicit user request.
- **Explicit Connection & Empty States:** When Supabase credentials (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are missing, or when tables contain 0 records, render a clear, honest setup/connection prompt or empty state rather than falling back to fake data.
