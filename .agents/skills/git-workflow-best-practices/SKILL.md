---
name: git-workflow-best-practices
description: Apply consistent Git conventions for commit messages, branch naming, pull requests, merge strategies, conflict resolution, repository protection, and safe team workflows. Use when creating commits or branches, reviewing Git history, merging changes, resolving conflicts, or defining repository contribution standards.
---

# Git Workflow Best Practices

## Purpose

Produce Git history that is readable, traceable, reviewable, and safe to deploy. Explain not only which command to run, but why it is appropriate. Prefer small, focused changes and consistent team conventions over unnecessary process.

## 1. Commit messages

Use the Conventional Commits structure:

```text
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

Examples:

```text
feat(voice-agent): add ElevenLabs provider
fix(dialer): handle failed call retries
refactor(api): simplify call dispatch logic
test(agent): cover timeout scenarios
docs(api): document webhook payloads
ci(github): add test workflow
```

Use these types consistently:

- `feat`: new functionality
- `fix`: bug fix
- `refactor`: internal restructuring without intended behavior changes
- `perf`: performance improvement
- `test`: test changes
- `docs`: documentation changes
- `build`: build system or dependency changes
- `ci`: continuous integration or delivery configuration
- `chore`: maintenance tasks
- `style`: formatting-only changes
- `revert`: revert a previous commit

Commit-message rules:

1. Use an imperative, specific subject, for example `fix(telephony): handle missing call SID`.
2. Describe the outcome, not merely the files changed.
3. Keep the subject concise, preferably around 50 characters and generally no more than 72 characters.
4. Add a body for nontrivial changes. Explain the motivation, important implementation choices, and relevant risks.
5. Keep each commit focused on one logical change. Separate unrelated features, fixes, formatting, and dependency upgrades.
6. Reference issues when applicable, for example `Closes #142`.
7. Mark incompatible changes with `!` and describe them in a `BREAKING CHANGE:` footer.

Example:

```text
fix(queue): prevent duplicate call dispatches

Check provider concurrency before scheduling a call. This avoids
exceeding the configured provider limit and reduces avoidable failures.

Closes #205
```

Avoid vague messages such as `changes`, `fixed stuff`, `updates`, or `final fix`.

## 2. Branch naming

Use lowercase, hyphen-separated names. Preferred format:

```text
<type>/<ticket-or-issue>-<short-description>
```

The ticket or issue identifier is optional if the team does not use issue tracking.

Recommended prefixes:

- `feature/`: new functionality
- `bugfix/`: non-urgent bug fix
- `hotfix/`: urgent production fix
- `refactor/`: internal restructuring
- `test/`: test-only work
- `docs/`: documentation
- `chore/`: maintenance and tooling
- `release/`: release preparation when needed

Examples:

```text
feature/142-elevenlabs-integration
bugfix/201-call-status-mapping
hotfix/205-failed-call-retries
refactor/call-dispatcher
test/voice-agent-timeouts
docs/api-reference
```

Branch rules:

- Keep branches short-lived and based on the latest target branch.
- Use descriptive names and ticket identifiers where available.
- Avoid spaces, uppercase names, underscores, and vague names such as `my-work` or `new-branch`.
- Delete merged branches unless there is a clear reason to keep them.
- Do not create a `develop` branch by default. Add it only when the release process requires a separate integration branch.

## 3. Recommended development workflow

For a continuous-delivery workflow, use protected `main` with short-lived feature and fix branches:

1. Update local `main`.
2. Create a branch for one logical task.
3. Implement and commit focused changes.
4. Run tests, linting, formatting, and static checks.
5. Push the branch and open a pull request (PR).
6. Review the diff and verify CI checks.
7. Merge using the repository's chosen strategy.
8. Deploy through the normal release process and verify the result.
9. Delete the merged branch.

Typical commands:

```bash
git switch main
git fetch origin
git pull --ff-only origin main
git switch -c feature/142-elevenlabs-integration

# Inspect changes before staging
git status
git diff
git diff --check

# Stage only files related to this task
git add path/to/relevant_file.py
git diff --cached
git commit -m "feat(voice): add ElevenLabs provider"
git push -u origin feature/142-elevenlabs-integration
```

Do not work directly on `main` for normal development. Avoid blindly using `git add .` when unrelated files, secrets, generated files, or local configuration may be present.

## 4. Pull request quality

A useful PR should state:

- **Summary:** What changed?
- **Motivation:** Why is the change needed?
- **Implementation:** What approach was taken?
- **Testing:** Which checks were run, and what were the results?
- **Risks and rollout:** Are there migrations, configuration changes, API compatibility concerns, or deployment dependencies?

Keep PRs small enough to review effectively. Request review from the appropriate code owners and address feedback before merging.

## 5. Merge strategies

Choose one primary strategy at repository level and document exceptions.

### Squash merge

Combines the PR's changes into one commit on the target branch. Use it when the team wants a compact history with one meaningful commit per PR.

```bash
git switch main
git merge --squash feature/my-feature
git commit -m "feat(agent): add provider integration"
```

The original feature commits do not remain as individual commits on the target branch.

### Fast-forward merge

Advances the target branch pointer without creating a merge commit. Use it when the target branch is an ancestor of the feature branch tip and individual feature commits should be preserved.

```bash
git switch main
git merge --ff-only feature/my-feature
```

If Git cannot fast-forward, the command fails safely rather than creating a merge commit.

### Merge commit

Creates an explicit merge commit and preserves the branch's individual commits. Use it when integration history is important or the team explicitly prefers this history model.

```bash
git switch main
git merge --no-ff feature/my-feature
```

Trade-offs:

- Squash merge: compact target history; individual feature commits are not preserved on the target branch.
- Fast-forward: linear target history and preserved commits; the feature commits must already be suitable for the target history.
- Merge commit: explicit integration event and preserved branch history; target history may not be linear.

Do not mix strategies arbitrarily. Keep the policy consistent and do not rewrite shared branch history without coordination.

## 6. Merge conflicts

When integrating the latest `main` into a feature branch:

```bash
git fetch origin
git switch feature/my-feature
git merge origin/main
```

When conflicts occur:

1. Inspect each conflicted file and understand both implementations.
2. Resolve the code intentionally; do not blindly accept all current or incoming changes.
3. Remove conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
4. Review the resolved diff.
5. Run relevant tests, linting, and type checks.
6. Stage resolved files and finish the merge.

```bash
git add path/to/resolved_file.py
git diff --cached
git commit
```

If the merge was started by mistake and has not been committed, abort it with:

```bash
git merge --abort
```

Rebasing can also integrate updated base commits and create a linear history, but it rewrites commit IDs. Do not rebase a shared branch without coordinating with everyone using it.

## 7. Repository safeguards

Recommended repository settings:

- Protect `main` and prohibit direct pushes for normal development.
- Require PRs, successful CI checks, and appropriate approvals.
- Run unit and integration tests, linters, formatters, and static checks in CI.
- Never commit credentials, access tokens, private keys, or real `.env` files.
- Review database migrations for locking, data-loss, compatibility, and rollback risks.
- Use version tags such as `v1.2.0` when versioned releases are appropriate.
- Delete merged branches and periodically prune stale remote-tracking references.
- Keep deployment and rollback procedures documented.

Adapt branch protections and approval requirements to the repository's risk level and team size.

## 8. `.gitignore` guidance

A Python/TypeScript project may start with rules such as:

```gitignore
.env
.env.*
!.env.example
.venv/
venv/
__pycache__/
*.py[cod]
node_modules/
dist/
build/
.pytest_cache/
.mypy_cache/
.ruff_cache/
```

Treat this as a starting point, not a universal file. Teams may intentionally commit selected editor settings or generated artifacts. Ensure `.env.example` contains placeholders only, never real secrets.

## 9. Commit-message validation

A simple subject-line regex for the listed Conventional Commit types is:

```regex
^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([a-z0-9-]+\))?!?: .{1,72}$
```

This checks syntax only. It cannot determine whether the message accurately describes the change. For automated enforcement, use a configurable tool such as Commitlint in local hooks or CI.

## 10. Safety and decision rules

- Inspect `git status` and the diff before committing, merging, resetting, or deleting branches.
- Never commit secrets. If a secret was committed, removing it in a later commit is insufficient; rotate the secret and follow the repository's incident procedure.
- Do not use destructive commands such as `git reset --hard`, force-push, or branch deletion unless the target and consequences are understood.
- Do not force-push shared branches. If rewriting a private branch is necessary, prefer `--force-with-lease` over `--force` and explain the reason.
- Do not claim tests passed unless they were actually run and their results are known.
- Preserve unrelated user changes. Do not discard or overwrite them as part of a Git task.
- If repository policy is available, follow it over these defaults.
- When context is insufficient to choose a safe operation, inspect the repository state or ask a focused clarification question instead of guessing.

## Definition of done

Before declaring a Git task complete, verify as applicable:

- [ ] Branch name follows the repository convention.
- [ ] Commit messages are meaningful and correctly typed.
- [ ] Only intended files are staged and committed.
- [ ] No secrets or unintended generated files are included.
- [ ] Tests, linting, and type checks have been run where applicable.
- [ ] PR review and required CI checks are complete before merge.
- [ ] Merge strategy matches repository policy.
- [ ] The final branch and working-tree state are understood.
