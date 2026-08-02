# Contributing to Frontdesk.ai

Thanks for considering a contribution. This project is early and moving fast, so a few ground rules keep things sane.

## Development setup

Follow the [README's Getting Started section](./README.md#getting-started) to get a local environment running against a Supabase project, Redis instance, and the required API keys.

## Workflow

1. Fork the repo and create a branch off `main`.
2. Make your change. Keep commits focused — one logical change per commit.
3. Run the checks locally before opening a PR:
   ```bash
   pnpm build
   pnpm test
   pnpm lint
   ```
4. Open a pull request against `main` with a clear description of what changed and why.

## Coding conventions

- **Server-scoped data access**: any query that touches an `organization_id`-scoped table must filter by the caller's org, looked up via `supabase.auth.getUser()` → `members` table — never trust a client-supplied org id. See `app/onboarding/actions.ts`'s `createAgent` for the reference pattern.
- **Validation**: request/form input is validated with Zod schemas in `lib/validations/`, not inline.
- **UI components**: this project uses shadcn/ui vendored onto [Base UI](https://base-ui.com) (not Radix). Composition uses a `render={<Component />}` prop instead of `asChild`. Reuse what's already in `components/ui/` before adding new primitives.
- **Icons**: use `lucide-react` for all app code — the same library vendored shadcn internals already use.
- **Tests**: Vitest. Server actions and data-access helpers should have unit tests covering validation failures, success paths, and org-scoping (a user must not be able to read/write another org's data).
- **Migrations**: numbered SQL files in `supabase/migrations/`, following the RLS policy pattern already established (`organization_id in (select organization_id from members where user_id = auth.uid())`).

## Reporting bugs / requesting features

Open a GitHub issue. Include repro steps for bugs, and the problem you're trying to solve for feature requests.

## License

By contributing, you agree that your contributions will be licensed under the project's [Apache License 2.0](./LICENSE).
