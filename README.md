# Nexora — POS + Storefront (Next.js App Router, TypeScript, MongoDB)

Nexora is a complete point-of-sale + ecommerce storefront built with Next.js (App Router), TypeScript, React, Tailwind CSS, Mongoose (MongoDB), Zod, bcryptjs, and TOTP-based MFA. 

## Key features
- Public storefront (products, categories, search, cart validation, PayPal checkout with guest support, order tracking)
- Customer accounts (email/password, Google, Facebook, OTP password recovery, protected account area, order history)
- POS portal (/pos) for staff (SUPER_ADMIN/MANAGER/CASHIER) with role-based permissions
- Staff MFA (mandatory for SUPER_ADMIN/MANAGER, optional for CASHIER) using TOTP; sessions are MFA-verified at the session document level
- Team Access (invitations, role changes, activate/deactivate) with transactional acceptance and audit logging
- Inventory management, POS sales (idempotency keys), orders management (ONLINE delivery workflow), full-order refunds (transactional + stock restoration)
- Reports (MongoDB aggregation, business timezone aware), audit trail, server-side price/stock validation

## Architecture notes
- Money: integer paise (priceInPaise) throughout; use lib/utils/money.ts and constants in lib/constants/*
- Sessions: opaque HttpOnly token + SHA-256 hash stored in MongoDB (StaffSession, CustomerSession). Staff sessions carry mfaVerified (enforced in loadCurrentStaff)
- Security: CSRF protection via sameSite=lax + HttpOnly, input validation (Zod), bcrypt for passwords, TOTP secrets AES-256-GCM encrypted (MFA_ENCRYPTION_KEY), audit logging of sensitive actions (never logging secrets)
- Transactions: MongoDB replica set is required (order creation, refund, invitation acceptance use transactions). Single-node dev replica set documented below.
- Data integrity: server re-reads prices/stock for all checkouts/sales/refunds (never trusts client totals), optimistic/CAS style guards where applicable

## Prerequisites
- Node.js 20+ (tested with Next.js 16.3.5)
- MongoDB 6.0+ running as a replica set (local development). A single-node replica set is sufficient.
- Windows PowerShell (development environment as noted). Commands shown with 
pm.

## Environment setup
1. Copy .env.example to .env.local and fill values:
   - MONGODB_URI (e.g. mongodb://127.0.0.1:27018/nexora-rs?replicaSet=rs0)
   - NEXT_PUBLIC_APP_URL (e.g. http://localhost:3000)
   - STAFF_SESSION_SECRET (>=32 chars recommended)
   - MFA_ENCRYPTION_KEY (32+ chars)
   - BUSINESS_TIMEZONE (IANA, e.g. Asia/Kolkata)
2. Start your local MongoDB replica set (port 27018, 
exora-rs as in example). Ensure transactions are available.

## Database seeding
- 
pm run seed — idempotent upsert of categories + products (never touches orders)
- 
pm run seed:reset — deletes catalogue collections first, then re-seeds
- 
pm run seed:accounts — upserts demo customer (demo@nexora.example / Demo@12345, development only)
- 
pm run create-super-admin — creates/updates SUPER_ADMIN (interactive or via env vars). MFA not enabled until first login (required for that role)

## Development
- 
pm run dev — Next.js dev server (Turbopack)
- 
pm run typecheck — TypeScript --noEmit
- 
pm run lint — ESLint (allow ~5 minutes in some environments)
- 
pm run build — production build
- 
pm start — start production server

## Testing
Tests expect a running dev server + seeded development database (MongoDB replica set). Run in order as needed:
- 
pm run test:unit — cart/validation unit tests
- 
pm run test:api — integration API tests
- 
pm run test:account — customer account flows
- 
pm run test:phase3 — staff onboarding, MFA, sessions, team/invitations
- 
pm run test:phase4 — POS sales, inventory, images, permissions
- 
pm run test:phase5 — orders workflow (status transitions), refunds (transactional), reports
- 
pm run test:e2e — storefront smoke (placeholder in this environment)

## RBAC summary
Roles: SUPER_ADMIN, MANAGER, CASHIER. Permissions centralized in lib/constants/staff.ts (includes MANAGE_ORDER_STATUS, ISSUE_REFUND, team/invite/report/inventory access). Self-protection enforced server-side; SUPER_ADMIN cannot be modified by others. Staff sessions enforce mfaVerified for MFA-required roles.

## MFA model
- mfaEnabled on staff profile; TOTP secret AES-256-GCM encrypted at rest. 
- Pre-auth MFA state uses STAFF_MFA_PENDING_COOKIE (HMAC-signed, short TTL). A full StaffSession (with mfaVerified=true) is only minted after successful TOTP verification (or not created at all for MFA-required roles). Cashier sessions are created at COMPLETE login with mfaVerified=false (MFA optional).

## Important constraints (project requirements)
- MongoDB only (no PostgreSQL/Prisma/MySQL/Supabase/Firebase)
- Money in paise (integers). Server-side revalidation of prices/stock on every purchase/sale/refund.
- Transactions require a replica set (documented in .env.example). Do not assume standalone MongoDB for transactional paths.
- Never commit secrets; .env* ignored. Audit logs contain only safe metadata.
- No fake success claims; errors surface proper codes/messages.

## PayPal setup

1. Create a REST app in the PayPal Developer Dashboard. Put its sandbox client ID/secret in `PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`; keep `PAYPAL_ENVIRONMENT=sandbox` while testing. Use matching live credentials and `PAYPAL_ENVIRONMENT=live` only in production.
2. Set `PAYPAL_CURRENCY` to the merchant-supported three-letter currency used by the store. Nexora retains integer minor units internally and converts only at the PayPal boundary.
3. Register `https://YOUR_DOMAIN/api/webhooks/paypal` and subscribe at minimum to `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED`; copy the resulting webhook ID to `PAYPAL_WEBHOOK_ID`.
4. Schedule `POST /api/maintenance/checkout-reservations` every few minutes with `Authorization: Bearer CHECKOUT_CLEANUP_SECRET`. Checkout creation also performs lazy cleanup. Reservations last 15 minutes.

PayPal order creation, capture, amount/currency checks, and refund calls happen server-side. `stock` is available stock: reservation decrements it atomically, capture consumes it without a second decrement, and cancellation/definite failure/expiry restores it once. `paypalOrderId` and `paypalCaptureId` have unique indexes.

## Google and Facebook customer OAuth

Create OAuth web applications and configure these exact redirect URIs (replace the origin with `NEXT_PUBLIC_APP_URL`):

- Google: `https://YOUR_DOMAIN/api/account/oauth/google/callback`
- Facebook: `https://YOUR_DOMAIN/api/account/oauth/facebook/callback`

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, and `FACEBOOK_CLIENT_SECRET`. Google uses authorization code + state + PKCE and requires `email_verified`. Facebook uses authorization code + state. Provider access tokens are used only to fetch identity and are not persisted. Provider identities live in `OAuthAccount` with a unique `(provider, providerAccountId)` index and point to the existing `Customer` entity. A verified Google email may link to an existing same-email customer; Facebook is deliberately refused on a collision so an unverified email claim cannot take over an account. Customer OAuth never creates a staff session and cannot authorize `/pos`.

For local setup, register callbacks using the exact `NEXT_PUBLIC_APP_URL`, for example `http://localhost:3000/api/account/oauth/google/callback`. Production Facebook Login generally requires HTTPS and an approved/live app configuration.

## Resend password-reset OTP

Verify a sending domain/address in Resend, set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, and set a random 32+ character `AUTH_SECRET`. `/account/forgot-password` uses a generic response for known, unknown, and social-only emails. Eligible password accounts receive a cryptographically random six-digit code. Only an HMAC is stored; codes expire after 10 minutes, allow five attempts, have a 60-second resend cooldown, and are invalidated on resend. Successful verification creates a short-lived HttpOnly reset authorization. Password update uses bcrypt, consumes the authorization once, invalidates the OTP, and deletes every existing `CustomerSession` in the same MongoDB transaction.

The built-in password-reset limiter is MongoDB-backed by email and HMAC-hashed IP, so it works across app instances. Provider/payment/email secrets are server-only.

## Integration testing

Automated tests can validate server price authority, reservation concurrency, idempotent finalization, OTP hashing/attempts/session revocation, and mocked provider boundary failures. Genuine provider acceptance still requires credentials: use a PayPal sandbox buyer to approve/cancel/capture and refund, Google/Meta test users to exercise callbacks, and a verified Resend recipient/domain to receive the OTP. Never point automated tests at live PayPal credentials.

## Build status (as of Phase 6)

- `npm run typecheck` ✓
- `npm run lint` ✓
- `npm run build` ✓ (Next.js 16.3.5 Turbopack; 44 static pages). All phases integrated.
- See [FINAL PROJECT REPORT](/FINAL_PROJECT_REPORT.md) for the full route/model/RBAC inventory, security notes, env vars, commands, and per-suite test results.
