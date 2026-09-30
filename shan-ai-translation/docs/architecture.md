# Architecture

Browsers talk to the Next.js app. Next.js proxies `/api` to the NestJS API. The API is the only component that writes application tables. Supabase Auth is used when `AUTH_MODE=supabase`; local email and password is used when `AUTH_MODE=local`.

PostgreSQL holds the domain data and the pg-boss schedules. Imports, exports, reservation expiry, payout preparation, and overdue checks run in the worker. Domain changes and their outbox rows commit in one transaction.

Money is integer satang. Assignment claims use `FOR UPDATE SKIP LOCKED`. A contributor can hold one in-progress task. Approval creates exactly one earning. Monthly payouts qualify sentences and pages separately, in Asia/Bangkok.

See `packages/database/prisma/schema.prisma` for the tables and `apps/api/src/openapi-document.ts` for the routes.
