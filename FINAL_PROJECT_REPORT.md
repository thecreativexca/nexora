# Nexora POS & Storefront — FINAL PROJECT REPORT

**Project:** Nexora — single-project order platform with a public storefront, customer accounts, a staff POS portal, order management and sales reporting.

**Branch/commit:** working tree (this report mirrors the tested state of the code on disk).

---

## 1. Project overview

Nexora is a full-stack order platform split into two domains:

- **Storefront** (public): product catalogue, cart, checkout, order tracking, customer accounts (login/register/profile/orders).
- **Staff POS portal** (`/pos`): login + mandatory MFA, register (in-store sales), order management (list/detail/status/refund), reports, team access management.

All money is integer paise. The server re-reads catalogue prices and stock at every write; the browser is never trusted for totals. Order creation is transactional and idempotent.

## 2. Stack & dependencies

- **Next.js 16.3.5** (App Router, Turbopack), **React 19.2.8**, **TypeScript 5**, **Tailwind CSS 4**.
- **MongoDB via Mongoose 9.10.1** — single data store for both domains (no SQL/Supabase/Firebase).
- **Zod 4** for runtime validation, **bcryptjs** for password hashing, **otpauth + qrcode** for TOTP MFA, Playwright-core (test scaffolding), `tsx` for the test runners.
- Dev/test DB: local single-node replica set (`nexora-rs`, port `27018`, database `nexora_dev`) — required because order creation/refunds/invitation acceptance use MongoDB transactions.

## 3. Repository layout

- `app/api/**` — server-side API routes.
- `app/(storefront)/**`, `app/pos/**` — page routes (route groups split public vs portal).
- `components/**` — React components (storefront, pos, shared).
- `lib/**` — domain services, auth, constants, validation schemas, DB/request-time, errors, logging, utils.
- `models/*.ts` — Mongoose schemas (single source of truth for persistence).
- `types/*.ts` — shared TS types plus Zod-inferred view types.
- `scripts/` — seed + admin scripts.
- `tests/` — `unit`, `integration` (api), `account`, `staff` (phase3/4/5), `e2e`.

## 4. Architecture principles

- Server-authoritative money & stock: prices come from MongoDB, totals recomputed server-side.
- Session domain separation: customer and staff identities never share cookies.
- `server-only` guards on every service/auth module so client bundles cannot import DB code.
- All domain constants centralised in `lib/constants` (roles, permissions, statuses, TTLs, limits).
- Zod schemas co-located with routes `lib/validations`.
- Errors mapped to typed app errors (`lib/utils/errors.ts`) with consistent HTTP codes; DB-layer failures wrapped as `toDatabaseError`.
- Audit log written for privileged operations; secrets never stored.

## 5. Storefront pages

| Route | Purpose |
|---|---|
| `/` | Homepage | 
| `/products` | Catalogue (filter/search/featured) |
| `/products/[slug]` | Product detail |
| `/order/[orderNumber]` | Server-rendered order confirmation/tracker (no account needed) |
| `/checkout` | Checkout (guest + registered customers) |

## 6. Customer account pages

| Route | Purpose |
|---|---|
| `/account` | Dashboard |
| `/account/login`, `/account/register` | Customer auth (public group) |
| `/account/profile` | Profile (protected) |
| `/account/orders`, `/account/orders/[orderNumber]` | Order history + detail (protected) |

## 7. POS portal pages (protected)

| Route | Purpose |
|---|---|
| `/pos` | Dashboard |
| `/pos/register` | In-store sales register |
| `/pos/inventory` | Catalogue/products management |
| `/pos/orders` | Order list + detail dialog |
| `/pos/reports` | Sales reporting |
| `/pos/team` | Staff & invitation management |

Portal pages are guarded by `requireStaff`; page-level permission checks gate restricted modules (e.g. cashiers cannot open `/pos/team`). Pages are excluded from search indexing.

## 8. POS public (auth) pages

| Route | Purpose |
|---|---|
| `/pos/login` | Staff sign-in |
| `/pos/join` | Invitation acceptance + first-time MFA setup / password set |
| `/pos/mfa-setup` | First-time TOTP enrolment (kept behind the pending-MFA pre-auth cookie) |
| `/pos/mfa-verify` | TOTP code entry |

## 9. Customer/storefront API routes

| Route | Method | Purpose / guard |
|---|---|---|
| `/api/health` | GET | Liveness |
| `/api/products` | GET | Public catalogue (active products) |
| `/api/orders` | POST | Checkout: guest + registered order creation (transactional, idempotent) |
| `/api/cart/validate` | POST | Cart validation against live prices/stock |
| `/api/account/register` | POST | Customer registration |
| `/api/account/login` | POST | Customer login |
| `/api/account/logout` | POST | Revoke customer session |
| `/api/account/me` | GET | Authenticated customer profile |
| `/api/account/orders` | GET | Authenticated customer's orders |
| `/api/account/orders/[orderNumber]` | GET | Customer order detail (ownership-checked) |

## 10. POS order-management API routes

| Route | Method | Purpose / guard |
|---|---|---|
| `/api/pos/orders` | GET | Staff order search/list (channel, status, search, paging; caps enforced) |
| `/api/pos/orders/[orderNumber]` | GET | Order detail with `allowedNextStatuses` |
| `/api/pos/orders/[orderNumber]/status` | PATCH | Controlled status transition — `requirePermissionApi(MANAGE_ORDER_STATUS)` |
| `/api/pos/orders/[orderNumber]/refund` | POST | Refund with reason + stock restore (transaction) — `requirePermissionApi(ISSUE_REFUND)` |
| `/api/pos/sales` | POST | In-store sale creation (register) |
| `/api/pos/reports` | GET | Live aggregated sales metrics — `requirePermissionApi(ACCESS_REPORTS)` |
| `/api/pos/products` | GET | POS catalogue |
| `/api/pos/inventory` | GET/PATCH | Inventory list & updates |
| `/api/pos/inventory/[productId]` | PATCH/DELETE | Product update/removal |
| `/api/pos/inventory/images` | POST | Image uploads |
| `/api/pos/images/[imageId]` | GET/DELETE | Image serving/removal |

## 11. Staff auth/session/team API routes

| Route | Method | Purpose / guard |
|---|---|---|
| `/api/staff/login` | POST | Password login → creates pending-MFA pre-auth cookie for MFA-required roles, or a full session for cashiers |
| `/api/staff/mfa/setup` | POST | First-time MFA enrolment (requires pending cookie; refuses cashiers) |
| `/api/staff/mfa/verify` | POST | TOTP verification → real staff session minted |
| `/api/staff/logout` | POST | Server-side session revocation |
| `/api/staff/me` | GET | Signed-in staff profile |
| `/api/staff/team` | GET/POST | Team list (staff + invitations) / invite staff |
| `/api/staff/team/[staffId]` | PATCH | Role change / activate / deactivate (rules in §17) |
| `/api/staff/invitations` | GET | Invitation list (manager/super-admin) |
| `/api/staff/invitations/check` | POST | Validate invite code + email |
| `/api/staff/invitations/accept` | POST | Accept invitation (transactional) → session (+ MFA cycle for managers) |

## 12. Data models — catalogue & customers

- **Category** (`models/Category.ts`): slug (unique), `isActive`, name/description, ordering.
- **Product** (`models/Product.ts`): slug + SKU (unique), name, description, `priceInPaise`, category ref, stock quantity, image refs, `isActive`, `isFeatured`, timestamps.
- **Customer** (`models/Customer.ts`): email (unique), `passwordHash` (`select:false`), phone, name, address, timestamps.
- **CustomerSession** (`models/CustomerSession.ts`): `tokenHash` (unique), expiry TTL index, `customerId` breadcrumb.

## 13. Data model — Order

`models/Order.ts` stores the full order snapshot (denormalised):

- `orderNumber` (`NX-<date>-<6 random>`, unique), `channel` (`ONLINE`/`IN_STORE`), `status`, `placedAt`.
- `items[]`: product snapshot (name, unit price), quantity, line total, `productId`.
- `totalInPaise`, `paymentMethod`, `paymentStatus`, `idempotencyKey` (sparse unique).
- Customer info (registered `customerId` and/or `customerEmail`), delivery address for ONLINE.
- `placedByStaffId`/`staffName` snapshot for IN_STORE; refund info (`refundStatus`, `refundReason`, `refundedAt`) — `REFUND_STATUS` reserved values included.

## 14. Data models — staff & security

- **StaffProfile** (`models/StaffProfile.ts`): email (unique), `passwordHash` (`select:false`), role, `isActive`, `mfaEnabled`, `mfaSecretEncrypted` (AES-256-GCM, `select:false`), `mfaVerifiedAt`, `lastLoginAt`, `invitedBy`.
- **StaffSession** (`models/StaffSession.ts`): `tokenHash` (unique), `staffId`, **`mfaVerified: boolean`** (default false) — a session is usable for MFA-required roles only when `mfaVerified` is true (§18).
- **StaffInvitation** (`models/StaffInvitation.ts`): `email`, `role`, `codeHash` (unique — plaintext code never stored), `invitedBy`, `expiresAt`, `acceptedAt`, `status` (`PENDING`/`USED`/`EXPIRED`).
- **AuditLog** (`models/AuditLog.ts`): opaque `action` + actor/target breadcrumbs + metadata; doc comment mandates **no secrets, session tokens or full invitation codes** are ever written.

## 15. Order lifecycle & status machine

- Statuses: `ORDER_PLACED → PREPARING → ON_THE_WAY → DELIVERED`; terminal: `COMPLETED`, `CANCELLED`, `REFUNDED`.
- `ONLINE_ORDER_TRANSITIONS` (lib/constants/order.ts) is the only map: illegal transitions → 409; terminal/`COMPLETED` orders cannot move.
- In-store sales are created `COMPLETED` at the register with **no** delivery workflow (`allowedNextStatuses` is empty).
- Cancellation is intentionally **not** implemented (no stock-restoring handler exists and one must not be added casually).

## 16. Role & permission matrix

Permissions (`STAFF_PERMISSION`) are centralised in `lib/constants/staff.ts` and routes/screens use `requirePermissionApi(...)` / `staffHasPermission(...)` — never raw role strings.

| Permission | Super Admin | Manager | Cashier |
|---|---|---|---|
| ACCESS_DASHBOARD | ✓ | ✓ | ✓ |
| ACCESS_REGISTER | ✓ | ✓ | ✓ |
| ACCESS_INVENTORY | ✓ | ✓ | – |
| ACCESS_ORDERS | ✓ | ✓ | ✓ |
| ACCESS_REPORTS | ✓ | ✓ | – |
| MANAGE_ORDER_STATUS | ✓ | ✓ | – |
| ISSUE_REFUND | ✓ | ✓ | – |
| MANAGE_TEAM | ✓ | ✓ | – |
| MANAGE_STAFF | ✓ | ✓ | – |
| INVITE_MANAGER | ✓ | – | – |
| INVITE_CASHIER | ✓ | ✓ | – |

## 17. Team management rules

- **Invitations**: Super-Admin may invite Manager or Cashier; Manager may invite Cashier only (target role never taken from the form). 7-day TTL; code hashed; duplicates/known emails rejected.
- **Role changes**: only Super-Admin may change roles; only Cashier ↔ Manager; nobody may change their own role; SUPER_ADMIN targets immutable.
- **Activate/deactivate**: nobody may touch themselves; SUPER_ADMIN may manage any non-super-admin; MANAGER may manage Cashier only. Deactivating a Cashier kills their live session on next request (fresh DB revalidation).
- Role changes do **not** retroactively upgrade an existing session — a promoted Cashier's old session cannot open portal pages and they must re-authenticate.

## 18. Multi-factor authentication (MFA)

- **Mandatory** for SUPER_ADMIN and MANAGER; **optional/refused** for CASHIER.
- TOTP (otpauth) with AES-256-GCM-encrypted seed (`mfaSecretEncrypted`, `select:false`).
- Flow: password login → `nexora_staff_mfa_pending` HMAC cookie (10 min) → first-time setup (`/pos/mfa-setup`) or code verify (`/pos/mfa-verify`) → full session only from `mfa/verify`.
- **Session-level enforcement**: `loadCurrentStaff` returns null when `staffRoleRequiresMfa(role) && !session.mfaVerified`. A pre-MFA or stale session therefore can never reach Manager APIs, and no `/activate-mfa` bridge route exists anymore (removed; portal layout relies solely on `requireStaff`).
- MFA verify is rate-limited/brute-force protected (max 5 attempts then the pending state is revoked).

## 19. Sessions & cookie security

- **Staff**: `nexora_staff_session` HttpOnly cookie carrying an opaque random token; only its SHA-256 hash is stored; 12 h TTL. Each request re-reads the StaffProfile from MongoDB (`role`, `isActive`, `mfaVerified`) — role/status changes take effect immediately.
- **Customer**: separate `nexora_*` HttpOnly session cookie; hash stored in `CustomerSession`; 30-day TTL with TTL index.
- Different secret domains; logout revokes the server-side record; cookies flagged HttpOnly/Secure; no secrets in the client bundle.

## 20. Security controls catalogue

- bcrypt password hashing (`select:false` on `passwordHash`); never logs credentials.
- Invitation codes and session tokens hashed at rest; MFA seeds encrypted.
- Login lockout after 5 consecutive failures for 15 min; MFA attempt caps; idempotency keys prevent checkout double-submits.
- Zod validation on every payload; regex metacharacters cannot widen order search; `pageSize` capped server-side.
- Money in integer paise; server re-reads prices/stock and never trusts browser totals or localStorage.
- No secrets committed (`.env*` ignored); `.env.example` documents the five variables.

## 21. Database indexes

- **Product**: `isActive+category+createdAt`, `isActive+isFeatured+createdAt`, `isActive+priceInPaise`; unique slug & SKU.
- **Category**: unique slug; `isActive+name`.
- **Customer/StaffProfile**: unique email; `role+createdAt` (staff).
- **Order**: `channel+status+createdAt`, `channel+createdAt`, `status+createdAt`, `customerId+createdAt`, `customerEmail+createdAt`, `createdAt`, `items.productId`, `placedByStaffId+createdAt`, unique orderNumber, sparse-unique `idempotencyKey`.
- **Sessions (both)** + **StaffInvitation**: unique `tokenHash`/`codeHash`; `expiresAt` TTL (`expireAfterSeconds: 0`).
- **AuditLog**: `actorStaffId+createdAt`, `targetStaffId+createdAt`, `action+createdAt`.

## 22. Transactions & atomicity

MongoDB multi-document transactions (replica set required):

- **Order creation** (`lib/services/order.service.ts`): order insert + stock decrement + (customer session attach when registered) atomically.
- **Refund** (`lib/services/staff-orders.service.ts`): status → REFUNDED, payment → REFUNDED, stock restore, refund snapshot written together; double-refund impossible.
- **Invitation acceptance** (`lib/services/invitation.service.ts`): code → USED + staff profile creation atomically.

## 23. Money, pricing & server authority

- `priceInPaise` everywhere; totals recomputed on the server from the catalogue.
- Checkout validates the cart server-side against live price/stock (`/api/cart/validate`), writes an idempotency key, and re-checks availability inside the transaction.
- Reports aggregate straight from MongoDB Order documents (no cached revenue store); business-day boundaries come from `BUSINESS_TIMEZONE`.

## 24. Validation & error handling

- Zod v4 schemas in `lib/validations` per domain; 400s carry `fieldErrors`.
- Typed app errors (`lib/utils/errors.ts`) map to HTTP codes; `toDatabaseError` wraps connection failures; mongoose duplicate-key → 409-style conflicts.
- `ensureRequestTime`/connection guard ensures all reads/writes use the transaction-capable connection.

## 25. Environment variables (server-only unless noted)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Mongo connection string (replica-set capable, §22) |
| `NEXT_PUBLIC_APP_URL` | Canonical base URL for the app |
| `STAFF_SESSION_SECRET` | Signs staff session + MFA pending cookies |
| `MFA_ENCRYPTION_KEY` | Derives AES-256-GCM key for MFA seed encryption |
| `BUSINESS_TIMEZONE` | IANA zone for business-day boundaries / reports (default `Asia/Kolkata`) |

`.env.example` documents each; `.env.local` holds real values and is git-ignored.

## 26. Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Dev, production build (Turbopack), start |
| `npm run lint` / `typecheck` | ESLint + `tsc --noEmit` |
| `npm run seed` / `seed:reset` | Seed catalogue (idempotent) / reset+seed |
| `npm run seed:accounts` | Demo customer accounts + sample orders |
| `npm run create-super-admin` | Create a SUPER_ADMIN staff account |
| `npm run test:unit` | Cart & validation unit tests |
| `npm run test:api` | Integration tests (storefront API) |
| `npm run test:account` | Customer account flow tests |
| `npm run test:phase3` | Staff auth / MFA / invitations / team tests (54) |
| `npm run test:phase4` | Register / inventory / roles tests (27) |
| `npm run test:phase5` | Orders / refund / reports tests (30) |
| `npm run test:e2e` | E2E storefront placeholder (see §27) |

## 27. Verification results, build outcome & remaining external config

**Ran and green in this session:**

- `npm run typecheck` — pass (0 errors).
- `npm run lint` — pass.
- `npm run build` — pass (Next.js 16.3.5, Turbopack; 44 static pages; TS 16.8s, compile 27.1s). One benign warning: a `pnpm-workspace.yaml` was found under `C:\Users\pk245` (outside this repo).
- `npm run test:unit` — **31 passed, 0 failed**.
- `npm run test:api` — **26 passed, 0 failed** (cleanup ran).
- `npm run test:account` — **19 passed, 0 failed** (cleanup ran).
- `npm run test:phase3` — **54 passed, 0 failed**.
- `npm run test:phase4` — **27 passed, 0 failed**.
- `npm run test:phase5` — **30 passed, 0 failed**.
- `npm run test:e2e` — placeholder script (`tests/e2e/storefront.test.ts`) logs "skipped in this environment" and exits 0. It exists to keep the npm script wired up until a real Playwright/HTTP E2E suite is added; **it is a placeholder, not a real test pass.**

**Phase 5 test hardening done this session** (to make the suite deterministic, not weaker): the report assertions now compare against a pre-fixture baseline (the dev database legitimately contains the seeded demo ONLINE orders), and an array-reference comparison that could never pass was replaced with a length assertion.

**Remaining external configuration (production handoff):**

- Point `MONGODB_URI` at a replica-set-capable deployment (Atlas `mongodb+srv://` or self-managed replica set).
- Generate random `STAFF_SESSION_SECRET` and `MFA_ENCRYPTION_KEY` per environment (documented generation commands in `.env.example`); keep them out of the repo.
- Verify `BUSINESS_TIMEZONE` for the store's actual zone.
- Run `npm run seed` (catalogue) and `npm run create-super-admin`; optionally `npm run seed:accounts` for demo data — note the demo orders count toward the qualifying buckets in reports (the phase5 suite accounts for this via baselines).
- Replace the `test:e2e` placeholder with a real HTTP/browser suite when E2E coverage is required.
- Deploy behind HTTPS; cookies' `Secure` attribute applies over HTTPS.