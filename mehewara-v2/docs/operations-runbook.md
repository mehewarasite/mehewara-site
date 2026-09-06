# Operations runbook

## Daily/weekly checks

- Review Worker 4xx/5xx, latency, Access denials, rate limits, D1 errors, B2
  operations/egress, and Resend delivery/bounce metrics.
- Check provider quota and billing alerts against the conservative caps in the
  quota policy. Record review date and owner.
- Confirm production B2 remains private with an unauthenticated negative test;
  remove any newly introduced public route or URL immediately.
- Verify the latest static deployment, Worker version, D1 migration number,
  and backup/export checksum are recorded as `REPLACE_*` entries in the private
  operations record.

## Incident response

1. Assign incident commander `REPLACE_INCIDENT_OWNER`; capture UTC start time,
   affected environment, deployment/version, and alert links.
2. Classify as availability, authorization/data exposure, integrity, abuse, or
   provider quota/billing. Default to fail closed for protected operations.
3. Apply the smallest safe control: disable the affected mutation/upload/email
   feature, rate-limit an abusive route, or enable static fallback.
4. Follow [rollback-runbook.md](rollback-runbook.md) for version or migration
   rollback. Do not make ad-hoc production schema changes.
5. Communicate user impact and next update time. After recovery, rotate exposed
   secrets, document cause and timeline, and add a regression check.

## Emergency controls

The operator should be able to disable mutations, uploads, exports, and email
independently through reviewed Worker configuration. Store the control owner
and exact procedure at `REPLACE_EMERGENCY_CONTROL_LOCATION`; do not place
break-glass credentials in this repository. Static assets may continue to be
served while controls are active, but the UI must clearly state read-only or
stale status.

## Change discipline

The quality CI job deploys nothing and never migrates or mutates Cloudflare
resources. The separate Cloudflare deployment workflow is manual-only and uses
distinct least-privilege Pages and Worker tokens. Use that reviewed release
procedure, record the Pages deployment ID and Worker version ID, and retain a
last-known-good deployment for rollback. Provider limits and free-tier terms
are reviewed before launches and material changes.
