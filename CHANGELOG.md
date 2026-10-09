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
- Project scaffold: Next.js + TypeScript, Vitest test runner.
- Engineering standards (`ENGINEERING.md`), requirements traceability
  (`TRACEABILITY.md`), decision register (`OPEN-DECISIONS.md`).

### Security

- `.gitignore` excludes environment files and build output; secrets are
  intended to stay server-side.
- Authorization is enforced server-side by design; the core is isolated from
  the AI, UI, network, and storage.
