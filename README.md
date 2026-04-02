# Texas Star Loan CRM

Next.js 16 app for **Texas Star Cash & Title Loans**: Wix form submissions, staff workflows, optional **customer portal**, SMS (Twilio), email (Resend), and status-based automation (Vercel cron).

## Stack

- **Framework**: Next.js (App Router), React 19, TypeScript
- **Auth & data**: Supabase (Postgres + RLS + Auth)
- **Deploy**: Vercel (`vercel.json` defines a cron for scheduled messages)

## Local setup

1. **Install**

   ```bash
   npm install
   ```

2. **Supabase**

   - Create a project and run migrations in `supabase/migrations/` (in order).
   - Copy URL and keys into `.env.local` (see below).

3. **Environment variables**

   Create `.env.local`:

   | Variable | Purpose |
   |----------|---------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only — webhooks, admin client, cron) |
   | `WIX_WEBHOOK_SECRET` | Shared secret for `POST /api/webhooks/wix` |
   | `RESEND_API_KEY` | Outbound email |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS |
   | `CRON_SECRET` | Bearer token for `GET /api/cron/scheduled-messages` (Vercel Cron sends `Authorization: Bearer …`) |

4. **Dev server**

   ```bash
   npm run dev
   ```

## Customer portal

- Admins invite borrowers from an **application detail** page: **Invite to customer portal**.
- The invite includes Supabase `user_metadata.customer_id`. On first signup, the trigger links `customers.auth_user_id` to the new user.
- RLS restricts customers to their own applications, comments timeline, and logged email/SMS. They cannot change application status or use staff email/SMS tools.

## Scripts

- `npm run dev` — development
- `npm run build` — production build
- `npm run lint` — ESLint

## CI

GitHub Actions runs `lint` and `build` on push and pull requests (see `.github/workflows/ci.yml`).
