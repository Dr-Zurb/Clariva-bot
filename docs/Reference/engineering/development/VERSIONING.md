# Versioning Guide

**Purpose:** Semantic versioning, changelog management, and deprecation policy for the Clariva bot.

**Audience:** AI agents and developers managing releases.

**Related:** [DEPLOYMENT.md](../operations/DEPLOYMENT.md) | [API_DESIGN.md](../architecture/API_DESIGN.md)

---

## 📌 Semantic Versioning (SemVer)

**Format:** `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

### When to Bump

**MAJOR (1.x.x → 2.0.0):**
- Breaking API changes (remove endpoint, change response structure, incompatible update)
- Database schema changes that require migration and break backward compatibility
- Major architecture changes (e.g., switch from REST to GraphQL)

**MINOR (1.2.x → 1.3.0):**
- New features (add endpoint, add optional field, new payment gateway)
- Enhancements to existing features (add pagination, add filtering)
- Backward-compatible changes

**PATCH (1.2.3 → 1.2.4):**
- Bug fixes (fix validation error, fix webhook processing)
- Security patches
- Performance improvements
- Dependency updates (no breaking changes)

### Examples

```
1.0.0 → Initial release (MVP with Instagram bot, appointments, Razorpay)
1.1.0 → Add PayPal for international payments (new feature, backward-compatible)
1.1.1 → Fix payment webhook idempotency bug (bug fix)
1.2.0 → Add doctor availability API (new feature)
2.0.0 → Remove deprecated `/api/appointments` endpoint; require `/api/v1/appointments` (breaking change)
```

---

## 📝 Changelog

### Format

**File:** `CHANGELOG.md` in project root

**Structure:** Newest version at top; group changes by type

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- (Nothing yet)

### Changed
- (Nothing yet)

### Fixed
- (Nothing yet)

## [1.1.0] - 2026-02-01

### Added
- PayPal payment gateway for international payments
- Payment gateway abstraction layer for future Stripe migration
- Region-based payment routing (India → Razorpay; US/UK/EU → PayPal)

### Changed
- Payment service now routes by doctor country instead of single global gateway

### Fixed
- Webhook idempotency now supports multiple providers (Instagram, Razorpay, PayPal)

## [1.0.0] - 2026-01-15

### Added
- Instagram bot with AI-powered intent detection
- Appointment booking via Instagram DM
- Razorpay payment integration (India)
- Multi-turn conversation flow (patient data collection)
- Async webhook processing with BullMQ
- RLS policies for multi-tenant data isolation
```

### Change Categories

- **Added:** New features, endpoints, integrations
- **Changed:** Updates to existing features, refactors
- **Deprecated:** Features marked for removal (see deprecation policy below)
- **Removed:** Deleted features, endpoints, or code
- **Fixed:** Bug fixes
- **Security:** Security patches

---

## 🚫 Deprecation Policy

### When to Deprecate

- Replacing an API endpoint with a better version
- Removing a feature that's no longer needed
- Changing a contract in a breaking way

### Deprecation Process

**1. Announce deprecation** (version X.Y.0)
- Add deprecation warning to API response header: `Deprecated: true; sunset=2026-06-01`
- Document in changelog: "Deprecated: `/api/appointments` endpoint (use `/api/v1/appointments` instead)"
- Notify users (email, docs, dashboard message)

**2. Grace period** (at least 3-6 months for public APIs)
- Old endpoint still works but returns deprecation warning
- Update docs to show new pattern
- Help users migrate

**3. Remove** (version X+1.0.0 — next major)
- Remove deprecated endpoint/feature
- Document removal in changelog
- Bump major version

### Example Deprecation

```markdown
## [1.5.0] - 2026-03-01
### Deprecated
- `/api/appointments` endpoint (use `/api/v1/appointments` instead; removal in v2.0.0)

## [2.0.0] - 2026-06-01
### Removed
- `/api/appointments` endpoint (use `/api/v1/appointments`)
```

---

## 🏷️ Git Tagging

### Tag Format

- **Format:** `v{MAJOR}.{MINOR}.{PATCH}` (e.g., `v1.2.3`)
- **When:** After merging release to main branch

**Create tag:**
```bash
git tag -a v1.1.0 -m "Release v1.1.0: PayPal integration"
git push origin v1.1.0
```

### Release Branch Strategy (optional, for larger teams)

- **main:** Production-ready code
- **develop:** Integration branch for features
- **feature/xyz:** Feature branches
- **release/v1.1.0:** Release preparation branch

---

## 📦 Release Checklist

Before releasing a new version:

- [ ] All tests pass
- [ ] Type-check and lint pass
- [ ] Changelog updated with changes since last version
- [ ] Version bumped in `package.json`
- [ ] Migration files numbered sequentially (if applicable)
- [ ] `.env.example` updated with new vars (if applicable)
- [ ] Documentation updated (if API or contracts changed)
- [ ] Git tag created (`v{MAJOR}.{MINOR}.{PATCH}`)
- [ ] Deployed to staging and smoke tested (if applicable)

---

## 🔢 Version in package.json

**MUST:** Keep `package.json` version in sync with Git tags

```json
{
  "name": "clariva-bot-backend",
  "version": "1.1.0",
  ...
}
```

**Update with:**
```bash
npm version minor # 1.0.0 → 1.1.0 (creates Git tag automatically)
npm version patch # 1.1.0 → 1.1.1
npm version major # 1.1.1 → 2.0.0
```

---

## 🔗 Related Documentation

- [DEPLOYMENT.md](../operations/DEPLOYMENT.md) — Deployment checklist
- [API_DESIGN.md](../architecture/API_DESIGN.md) — API versioning strategy
- [MIGRATIONS_AND_CHANGE.md](./MIGRATIONS_AND_CHANGE.md) — Database versioning

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
