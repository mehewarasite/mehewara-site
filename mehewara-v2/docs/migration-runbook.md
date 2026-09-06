# Supabase to Cloudflare + Backblaze B2 migration runbook

The legacy site writes to a public Supabase Postgres database and Storage
buckets directly from the browser. v2 replaces that with Cloudflare D1 for
structured data, private Backblaze B2 (S3-compatible) for media, and a
Cloudflare Worker API in front of both. The browser never talks to B2 on the
read path (Worker streams through the Cloudflare edge cache); uploads go
through Worker-minted short-lived signed PUTs plus intent confirmation. The
target schema is `migrations/0001_initial.sql` plus
`migrations/0002_media_upload_intents.sql` plus
`migrations/0003_publication_builds.sql` plus
`migrations/0004_publication_rollback_intents.sql`; the
fixture-driven round-trip harness is `scripts/migration-roundtrip.mjs`; the
deterministic transformer is `scripts/migration-transform.mjs`.

This runbook is intentionally source-schema agnostic for the audit step. After
the audit, the concrete field mapping is recorded here, then the v2 cutover is
executed from a developer laptop with the temporary service-role credential in
the local environment only.

## Source inventory (audit only)

1. Obtain a temporary, least-lived source service-role credential through the
   approved vault. Set `MIGRATION_SOURCE_SUPABASE_URL`,
   `MIGRATION_SOURCE_SUPABASE_SERVICE_ROLE_KEY`,
   `MIGRATION_SOURCE_TABLES`, and `MIGRATION_SOURCE_STORAGE_BUCKETS` only in a
   local secret environment. Never commit, copy, or print the values.
2. Run `npm run audit:migration`. The default is a dry run with no network
   calls and no credential output. It reports the expected REST and Storage
   inputs only.
3. Confirm the source tables, row-count strategy, relationships, nullability,
   indexes, RLS policies, timestamps, and deletion semantics with the data
   owner.
4. Inventory each Storage bucket: object count, byte total, content type,
   metadata, ownership, and collision policy. Do not download private data
   into the repository.
5. After approval only, run `npm run audit:migration -- --execute`. Execute
   mode requires explicit flags, non-placeholder env values, and performs
   read-only requests only (GET for tables and bucket metadata, plus POST
   for the Storage object listing, which has no GET form); it never writes
   to source or destination.

## Field-level mapping (legacy Supabase → v2 D1)

The deterministic transformer reads a normalized snapshot of the legacy
export and produces both a v2 backup (`mehewara-v2-backup` schema) and a v2
publish manifest. The mapping below is the contract the transformer
implements and the round-trip harness verifies.

| Legacy surface                          | v2 destination                                          | Notes |
|-----------------------------------------|---------------------------------------------------------|-------|
| `subjects` rows                          | `subjects`                                              | Stable UUID v5 from `mehewara-v2:subject:<legacyId>`; `legacy_id_map` keeps the source ID. |
| `papers` rows                            | `papers`                                                | Stable UUID v5; `exam_type` and `language` normalized to `ol`/`al` and `en`/`si`. |
| `questions` rows + `options_html`        | `questions` + nested `question_options`                 | `answer_mode` and `correct_option_indexes` derived; nested options carry `is_correct` only on admin reads. |
| `question_options` (separate table)     | nested `question_options`                               | Merged into the question on import; not a second array. |
| `study_materials` + `study_html`         | `study_materials`                                       | `html` is rewritten through the media registry; the `object_key` is the only persisted storage reference. |
| `gallery` rows                           | `gallery_items`                                         | `image_object_key` and `thumbnail_object_key` are B2 references; dimensions are probed before publish. |
| `site_visits` (raw events)               | `daily_aggregate_metrics`                               | Aggregated per day during import; raw events are not preserved. |
| `attempts` (IndexedDB-only)              | excluded                                                | Local-only; never round-tripped. Recorded in `exceptions` as `attempts_excluded_indexdb_local_only`. |
| `publication_history`                    | `publication_snapshots` (input only)                     | Replayed manually by an admin; not auto-applied. Recorded as `publication_history_is_audit_input_not_an_automatic_replay`. |
| `about` row (image, social links)        | `about_profile` + B2 object                              | `image_url` is rewritten through the media registry; dimensions are required before publish. |
| `about.privacy_policy_*`                 | `privacy_policy`                                        | `full_html` is rewritten through the media registry. |
| Supabase Storage `images/` bucket         | private B2 bucket (per-environment `B2_BUCKET`)          | `object_key` is the only persisted reference; object bytes are mirrored with sha256 verification. |
| Supabase Storage `public/` bucket        | mirrored into private B2 on reference                   | Objects actually referenced by content are downloaded, verified, and mirrored into the private bucket; the public bucket itself is not preserved as a public surface. |

Every transformation step that is lossy, derived, or requires manual follow-up
is recorded in the plan's `exceptions` array. The round-trip harness asserts
that the canonical exception labels are present.

## Staged migration

- [ ] Export/backup source metadata and record the checksum at
      `REPLACE_SOURCE_EXPORT_LOCATION` in the private migration record.
- [ ] Run `npm run test:migration` against the fixture to confirm the
      transformer matches the contract.
- [ ] Apply `migrations/` in order (`0001_initial.sql`, then
      `0002_media_upload_intents.sql`, then `0003_publication_builds.sql`,
      then `0004_publication_rollback_intents.sql`)
      to a local D1 (or in-memory SQLite)
      and to the preview D1. Compare counts and representative records.
- [ ] Mirror media to the private target bucket with a resumable,
      checksum-aware process. Preserve source IDs and metadata where the
      mapping permits it.
- [ ] Run the transformer against the real source export to produce the v2
      backup and the publish manifest. Record the `sourceChecksum` and
      `planChecksum` in the private migration record.
- [ ] Validate counts, referential integrity, ownership authorization, date
      and encoding conversions, and sample authorized/unauthorized B2 reads
      through the Worker's `/api/v1/media/:key` edge-cached path.
- [ ] Run an initial copy, then a recorded delta window from
      `REPLACE_DELTA_START` to `REPLACE_CUTOVER_TIME`. Freeze source writes at
      cutover if a consistent snapshot is required.
- [ ] Obtain sign-off from the data owner and the operations owner before
      switching `VITE_API_BASE_URL`/Worker routing. Pages is only the static
      delivery layer and must not run migration code.

## Cutover (planned one-day downtime)

1. Announce the maintenance window and enable the static fallback (`503`
   + cached snapshot) on the legacy domain.
2. Freeze the source: turn off the legacy admin write path, take the final
   source snapshot, and verify checksums and counts against the prior delta.
3. Run the transformer on the final source snapshot with the production API
   origin (`publicBaseUrl`, https, never example.invalid), import the
   resulting backup into the production D1, and copy the media to the
   production B2 bucket (verifying per-object sha256 against the migration manifest).
4. Refuse to publish while the plan's `publicationReadiness.publishable` is
   false — the transformer always emits draft/pending content, so a
   contracts-valid manifest is NOT publishable output. Publication happens
   only through `POST /api/v1/admin/publications/build` after sanitization,
   published states, and real (non-placeholder) media bytes flip the gate;
   the endpoint assembles, validates, stores, and points current at the new
   snapshot atomically (idempotent by body `idempotencyKey`). To retreat,
   `POST /api/v1/admin/publications/rollback` moves the current pointer to
   a previous published snapshot with an audit reason.
   Once open, publish the resulting snapshot through the Worker so it is the
   current `publication_snapshots` row.
5. Deploy the Worker and the static Pages frontend with matching environment
   values; switch DNS only after the Worker reports `BUDGET_EXCEEDED` is
   `false` for the public pool.
6. Smoke-test auth, CORS, public reads, admin mutations, private media,
   quotas, and the daily Resend statistics email.
7. Monitor errors and provider usage for `REPLACE_MONITORING_WINDOW` (24
   hours minimum).
8. Retain the source read-only for 30 days; then revoke the temporary
   credential and securely delete local exports.

## Rollback (30-day read-only window)

The legacy Supabase project is retained in read-only mode for 30 days. The
rollback runbook (`docs/rollback-runbook.md`) covers DNS revert, source
restart, and Workers rollback via Pages `_redirects` and Worker version alias.

Never run a migration from CI or a Pages build. Never log service keys, JWTs,
full URLs containing credentials, personal data, or response bodies.
