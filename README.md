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

## Passwordless sign-in (Supabase Auth)

The login page uses **email OTP** (6-digit code) and **SMS OTP**. Only users that already exist in Supabase Auth can sign in (`shouldCreateUser: false`).

**Sign-in email content:** Supabase sends the same “Magic link” template for `signInWithOtp`; that template must include `{{ .Token }}` so users receive a code. This repo’s template lives at `supabase/templates/magic_link.html`. Apply it in either way:

- **Hosted project:** **Authentication → Emails** → **Magic link** — set the subject to something like “Your Texas Star sign-in code” and paste the HTML from `supabase/templates/magic_link.html` into the body.
- **CLI:** from the repo root, `supabase link` to your project, then `supabase config push` to sync `supabase/config.toml` + that template (requires [Supabase CLI](https://supabase.com/docs/guides/cli)).

**Send all auth emails through Resend (SMTP)**

CRM outbound email already uses `RESEND_API_KEY` in this app. Auth emails (sign-in, invite, reset, etc.) are sent by **Supabase**, which can relay through Resend:

1. In [Resend](https://resend.com): create an API key and verify your sending domain.
2. In Supabase: **Project Settings → Authentication** (or **Authentication → Emails** depending on dashboard version) → **SMTP settings** — enable custom SMTP and use Resend’s SMTP ([Resend + Supabase guide](https://resend.com/docs/send-with-supabase-smtp)):
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SSL)
   - **Username:** `resend`
   - **Password:** your Resend API key
3. Set **Sender email** and **Sender name** to a verified address (can match `RESEND_FROM_EMAIL` branding).

**Supabase dashboard (URLs and SMS)**

1. **Authentication → Providers → Email** — enable.
2. **Authentication → Providers → Phone** — enable and attach **Twilio** (or your SMS provider). This is **separate** from the app’s Twilio env vars used for CRM outbound SMS.
3. **Authentication → URL configuration** — set **Site URL** to your deployed origin (production example: `https://tx-start-platform.vercel.app`). Under **Redirect URLs**, add:
   - `http://localhost:3000/auth/callback` (local)
   - `https://tx-start-platform.vercel.app/auth/callback` (production)

**Phone sign-in requirement:** the user’s **Auth** record must include that phone number (verified). CRM `customers.phone` alone does not update Supabase Auth; link or add the phone in Supabase (e.g. after invite, or via Admin API) if borrowers should sign in with SMS.

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
