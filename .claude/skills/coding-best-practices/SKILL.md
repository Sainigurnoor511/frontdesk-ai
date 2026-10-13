---
name: coding-best-practices
description: Use when writing commit messages or adding code comments, in any repo or language, before committing changes or writing inline documentation.
metadata:
  author: Sainigurnoor511
  maintainer: Sainigurnoor511
---

# Coding Best Practices

## Overview
Three standing conventions: commit hygiene, comment density, and log
hygiene. Apply all three whenever committing code, writing comments, or
adding logging, regardless of project.

## Commits

- Never add Claude, or any AI, as co-author or in the commit trailer.
- Keep messages short and precise, focused on one specific feature or fix.
- Don't over-split into micro-commits (e.g. one commit per line changed) —
  group a coherent change together.
- Don't under-split either — a commit mixing an unrelated fix with a feature
  is as wrong as ten commits for one feature.

Rule of thumb: one commit = one reviewable change a person would describe in
a single sentence.

```
# Good
fix: correct off-by-one in pagination offset
add: CSV export for monthly reports

# Bad
fix bug                    (too vague)
wip                        (not precise)
add feature + fix typo + refactor helper   (bundles unrelated changes)
```

## Comments

- Default to no *new* comments beyond what's warranted below.
- When a comment is warranted (non-obvious WHY, hidden constraint, subtle
  invariant), write a single line only.
- Wrap that line at 80-90 characters. Never write multi-line or block
  comments, and never restate what the code already says.
- Don't touch comments that already exist unless they're clearly wrong or a
  multi-line block restating the obvious. In particular, leave alone:
  section-header/divider comments (e.g. `# Logging Setup`, `# Local Imports`)
  that group related lines, and existing single-line comments in schema
  files — these aid navigation and aren't in scope for cleanup.

```python
# Bad: multi-line block explaining what the loop does
# This loop iterates over all users and checks if they are
# active, then appends them to the result list for later use.
for u in users:
    if u.active:
        result.append(u)

# Good: single line, only when the why isn't obvious
for u in users:
    if u.active:  # inactive users are soft-deleted, not filtered in SQL
        result.append(u)
```
