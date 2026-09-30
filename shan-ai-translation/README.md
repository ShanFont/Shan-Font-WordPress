# Shan AI Translation

English-to-Shan translation platform for collecting reviewed parallel text. The app does not train or host a model.

This directory is the project root. It is not part of the Shan Font WordPress plugin.

## Local run

PostgreSQL 16 is required. Docker Compose is provided; any local Postgres with the same URL also works.

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm exec bash scripts/dev-all.sh
```

Web: http://localhost:3000  
API: http://localhost:3001/api/v1/health

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before seeding to create the first admin. Leave Google, Supabase, email, and Sentry blank until those accounts exist. `DEV_EXPOSE_TOKENS=true` returns verification and reset tokens in local responses so the flow can be tested without an email provider. A relative `STORAGE_LOCAL_PATH` is resolved from this folder, so the API and worker share one local file directory.

## Checks

```bash
pnpm test
pnpm test:integration
pnpm typecheck
pnpm lint
pnpm build
```

Integration tests need `postgresql://sat:sat@127.0.0.1:5432/shan_translation_test`.

## Production shape

- Web on Vercel. Set `API_PROXY_TARGET` to the API origin.
- API and worker on Render. See `infrastructure/render.yaml`.
- `AUTH_MODE=supabase` with `SUPABASE_JWT_SECRET`. Admin routes then require MFA (AAL2).
- `STORAGE_DRIVER=supabase` for private files.
- Apply reviewed migrations before the application deploy.

The translation guide, contributor terms, branding, Google OAuth client, transactional email, and source permissions are launch inputs. Placeholder guide and terms are marked replace-before-launch.
