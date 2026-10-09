# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Authorization core (Phase 2).** Deterministic engine returning
  `ALLOW` / `ASK` / `DENY` with stable reason codes, runtime validation of
  untrusted input (fail-safe), and integer minor-unit money handling.
- **Purchase lifecycle (Phase 3).** Request fingerprints, propose / approve /
  reject flow with re-check against current rules, pre-execution revalidation,
  and a pluggable storage interface with an in-memory implementation.
- **Spending accounting (Phase 3).** An event-log ledger that counts completed
  spending only from a verified capture, is idempotent by provider capture id,
  tracks reservations without counting them as spent, and derives monthly totals
  from persisted events.
- **Budget period (`utcMonthPeriod`).** The monthly window is the UTC calendar
  month, per the owner's decision.
- **Durable storage (Phase 3).** A PostgreSQL schema (Drizzle ORM) with SQL
  migrations and durable implementations of the purchase and spending stores,
  targeting Supabase. Database-level primary keys enforce capture idempotency.
  Persistence is tested against a real in-process PostgreSQL engine, including a
  close-and-reopen durability test. Also includes the **active spending-rules
  store** (single global rule set), closing the Phase 3 "persistent rules" item.
- Project scaffold: Next.js + TypeScript, Vitest test runner.
- Engineering standards (`ENGINEERING.md`), requirements traceability
  (`TRACEABILITY.md`), decision register (`OPEN-DECISIONS.md`).

### Security

- `.gitignore` excludes environment files and build output; secrets are
  intended to stay server-side.
- Authorization is enforced server-side by design; the core is isolated from
  the AI, UI, network, and storage.
