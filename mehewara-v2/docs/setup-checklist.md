# Dedicated provider setup checklist

Complete this checklist manually and replace each `REPLACE_*` value in the
private resource ledger. Do not put IDs or credentials into this repository.

## 1. Dedicated Cloudflare account

- [ ] Create a new Cloudflare account owned by the Mehewara organization, not
      a personal account: account ID `REPLACE_CF_ACCOUNT_ID`.
- [ ] Add at least two administrators, enroll both in MFA, and store recovery
      codes in the organization password vault.
- [ ] Record billing contact, alert contact, account owner, and break-glass
      owner: `REPLACE_OWNER`, `REPLACE_ALERT_CHANNEL`.
- [ ] Create separate local/preview/production resources and label them with
      environment and owner. Never point a preview Worker at production D1/B2.
- [ ] Create a least-privilege deployment token for CI/manual deploys. Do not
      use a global API key or an administrator token in CI.

## 2. D1

- [ ] Create production database `REPLACE_D1_PRODUCTION_NAME`, database ID
      `REPLACE_D1_PRODUCTION_ID`, binding `D1` (the Worker code binds D1
      under the name `D1`; any other binding name fails closed).
- [ ] Create separate preview and local databases with IDs
      `REPLACE_D1_PREVIEW_ID` and `REPLACE_D1_LOCAL_ID`.
- [ ] Restrict migration execution to an approved operator. Record the applied
      migration number and backup/export location before each production change.
- [ ] Verify Worker service bindings resolve to the intended environment before
      deploying; a binding name alone is not proof of the target database.

## 3. Backblaze B2 and private media

- [ ] Create private B2 buckets `REPLACE_B2_PRODUCTION_BUCKET`,
      `REPLACE_B2_PREVIEW_BUCKET`, and `REPLACE_B2_LOCAL_BUCKET`; record the
      S3-compatible endpoint, region, and bucket per environment in
      `apps/api/wrangler.toml` vars (key ID + application key go through
      `wrangler secret put`, never into files).
- [ ] Keep every bucket private: do not enable public bucket access or custom
      public domains, and do not serve any unauthenticated Worker route that
      reaches B2.
- [ ] Disable/remove any “public bypass” or debug route before production.
      Confirm an unauthenticated object request returns denial, not the object.
      Exception: the Worker media read route is intentionally public, but it
      serves only confirmed-upload or inventoried-migration keys (unguessable
      UUIDs, verified server-side) — never arbitrary bucket access.
- [ ] Define object key prefixes and maximum sizes/content types. Validate
      ownership in the Worker before every B2 operation; uploads go through
      the ticket→confirm intent lifecycle, never direct browser writes.
- [ ] Configure the B2 bucket CORS rules for browser PUTs (exact Pages
      origins, PUT, exposed ETag, allowed Content-Type/Content-Length/x-amz-*)
      and the `staging/` lifecycle rule (hide 1 day after upload, delete
      hidden copies 1 day later). See the deployment runbook.
- [ ] Test a signed/authorized read, unauthorized read, overwrite policy, and
      deletion recovery procedure in the preview bucket.

## 4. Worker and Access

- [ ] Create Worker `REPLACE_WORKER_PRODUCTION_NAME` in the dedicated account;
      record script/version ID `REPLACE_WORKER_VERSION_ID` and route
      `api.REPLACE_PRODUCTION_DOMAIN`.
- [ ] Configure the D1 binding, B2 variables, environment variables, and secret
      values using Wrangler/Cloudflare secret storage. Never commit `.dev.vars`.
- [ ] Create a Cloudflare Access application for the protected API hostname.
      Team domain: `https://REPLACE_TEAM.cloudflareaccess.com`; audience:
      `REPLACE_ACCESS_AUDIENCE`; issuer:
      `https://REPLACE_TEAM.cloudflareaccess.com`.
- [ ] Set Access policy to the approved organization/group and deny by default.
      Test expired, wrong-audience, wrong-issuer, and missing-token requests.
- [ ] Map IdP groups to a token claim the Worker authorizes: either a `roles`
      array claim or the standard `groups` array claim (the Worker accepts
      `roles` first, then `groups`). Without one of the two, every admin
      route fails closed with 403 — verify an admin token yields its role
      before considering auth done.
- [ ] Ensure production Access, CORS, and Worker environments do not accept
      preview/local origins or tokens.
- [ ] Configure rate limiting/WAF rules at the Worker edge where appropriate,
      and alert on 4xx/5xx spikes and unusual B2 egress.

## 5. Cloudflare Pages static site

- [ ] Create a Cloudflare Pages project in the dedicated account from this
      repository, root directory `mehewara-v2`, named
      `REPLACE_PAGES_PROJECT`.
- [ ] Configure build command `npm run build`, output directory `apps/web/dist`,
      and no Pages Functions. The public files `_headers` and `_redirects` must
      be copied into the built static output by the web build.
- [ ] Configure branch previews for staging branches and set each preview's
      `VITE_API_BASE_URL` to a preview Worker host. Preview CORS must allow only
      the corresponding preview Pages origin.
- [ ] Set the production `VITE_API_BASE_URL` separately. It is public build
      metadata; do not put API keys, Access secrets, or Resend credentials in
      Pages variables.
- [ ] Attach custom domains `REPLACE_PREVIEW_DOMAIN` and
      `REPLACE_PRODUCTION_DOMAIN` to the intended Pages project/branch; verify
      HTTPS, SPA deep links, `_headers` security/cache behavior, and `_redirects`.
- [ ] Review the current Cloudflare Pages plan/free allowance before launch.
      Do not treat Pages free limits as a billing hard stop or use Pages for API
      execution, scheduled jobs, migration, or secret storage.

## 6. Environment separation and custom domains

- [ ] Use explicit local/preview/production origin lists:
      `http://localhost:5173`, `https://REPLACE_PREVIEW_DOMAIN`, and
      `https://REPLACE_PRODUCTION_DOMAIN` respectively.
- [ ] Use separate Access applications, Worker routes, D1 databases, B2
      buckets, Resend credentials/senders, and Pages environment variables.
- [ ] Verify DNS ownership and TLS for `REPLACE_PRODUCTION_DOMAIN` and
      `api.REPLACE_PRODUCTION_DOMAIN`. Keep DNS changes reversible and record
      the previous records before editing.
- [ ] Confirm a production browser cannot call a preview API through CORS and
      a preview Worker cannot read production bindings.

## 7. Resend

- [ ] Create/verify sending domain `REPLACE_EMAIL_DOMAIN` in the Resend account
      owned by the organization; publish the required SPF, DKIM, and DMARC DNS
      records.
- [ ] Create environment-specific sender identities, for example
      `Mehewara Preview <preview@REPLACE_EMAIL_DOMAIN>` and
      `Mehewara <noreply@REPLACE_EMAIL_DOMAIN>`.
- [ ] Store separate Resend API keys in Worker secret storage with the minimum
      permissions needed. Never use `RESEND_API_KEY` as a Vite variable.
- [ ] Send a preview test to an approved mailbox and verify bounce/complaint
      handling before production enablement.
