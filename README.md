# መሠረተ ሕይወት ሰንበት ትምህርት ቤት — የአባልነትና የወርሃዊ ክፍያ አስተዳደር ሥርዓት
**Meserete Hiwot Sunday School — Membership & Monthly Payment Management System**

A production-oriented web app that replaces the paper records: members log in with their phone number, pick the months they want to pay, upload a payment screenshot; finance administrators verify it (or record cash / mobile-banking payments directly); the administrator gets full reports with Amharic PDF and Excel export. The whole UI is Amharic and the whole payment domain runs on the **Ethiopian calendar** (via `abushakir`, starting from 2019 ዓ.ም.).

> **No Chapa in this version.** Payments are: (A) member screenshot → staff verifies, (B) cash recorded by staff, (C) mobile banking recorded by staff.

---

## Contents
1. [Technology stack](#1-technology-stack)
2. [Quick start (local)](#2-quick-start-local)
3. [Environment variables](#3-environment-variables-env)
4. [Neon database setup](#4-neon-database-setup)
5. [Migrations, seed data, first administrator](#5-migrations-seed-data-first-administrator)
6. [Deploy to Netlify (step by step)](#6-deploy-to-netlify-step-by-step)
7. [File storage for screenshots](#7-file-storage-for-payment-screenshots)
8. [Who uses which URL](#8-who-uses-which-url)
9. [Day-to-day usage guide](#9-day-to-day-usage-guide)
10. [How the money logic works](#10-how-the-money-logic-works)
11. [Ethiopian calendar](#11-ethiopian-calendar)
12. [Security](#12-security)
13. [Tests](#13-tests)
14. [Project structure](#14-project-structure)
15. [Moving off Netlify later](#15-moving-off-netlify-later--future-chapa)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Technology stack
| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite, React Router (no UI framework, no charts) |
| Backend | Node.js + Express 5 + TypeScript, packaged as **one Netlify Function** (`netlify/functions/api.ts`) |
| Database | **Neon PostgreSQL** via `pg`; plain-SQL migrations (`migrations/`) |
| Auth | Phone + password, **bcrypt** hashes, signed `httpOnly` session cookie (JWT/HS256 via `jose`) |
| Files | **Netlify Blobs** (screenshots + logo); local disk in development |
| Calendar | **`abushakir`** (Ethiopian calendar) behind one module: `shared/calendar/` |
| Reports | `exceljs` (.xlsx) and `pdfkit` (.pdf) with an **embedded Noto Sans Ethiopic** font |
| Tests | Vitest — calendar unit tests + end-to-end API tests against real PostgreSQL |

## 2. Quick start (local)
**Requirements:** Node.js **20 or newer** (`node -v`), npm, and a PostgreSQL database (a free Neon project is the easiest — see §4).

```bash
# 1. unzip, then inside the folder:
npm install

# 2. create your env file and fill it in (see §3)
cp .env.example .env

# 3. create tables, load initial configuration, create the main administrator
npm run migrate
npm run seed
npm run create-admin -- --phone 0911223344 --name "ዋና አስተዳዳሪ"
#    ↑ prints a generated password ONCE. Save it. You will be asked to change it on first login.

# 4. start (API on :8888 + web on :5173)
npm run dev
```
Open **http://localhost:5173/admin** and log in. (Local file uploads go to `.data/uploads`.)

Production build / run on any Node host: `npm run build` then `npm start` (serves `dist/` + API on `$PORT`).

## 3. Environment variables (`.env`)
Never commit `.env` (it is in `.gitignore`). On Netlify you enter these in the dashboard instead (§6).

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | **Yes** | Neon connection string. Use the **pooled** one (host contains `-pooler`), ends with `?sslmode=require`. |
| `DATABASE_URL_UNPOOLED` | No | Neon *direct* string, used only by `npm run migrate` / `seed` / `create-admin` if set. Falls back to `DATABASE_URL`. |
| `AUTH_SECRET` | **Yes** | Random string ≥ 32 chars that signs login sessions. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. **Changing it logs everyone out.** |
| `SESSION_HOURS` | No | Login lifetime in hours (default `12`). |
| `STORAGE_DRIVER` | No | `netlify` or `local`. Chosen automatically (`netlify` on Netlify, `local` otherwise). |
| `LOCAL_UPLOAD_DIR` | No | Folder for the local driver (default `.data/uploads`). |
| `MAX_UPLOAD_MB` | No | Max screenshot size (default `4`; Netlify Functions accept ≈ 6 MB per request, so keep ≤ 4). Phones' big screenshots are auto-shrunk in the browser. |
| `PORT` | No | Local API port (default `8888`). |

## 4. Neon database setup
1. Go to <https://neon.tech> → sign up → **Create project** (any name, pick the region closest to Ethiopia, e.g. Frankfurt).
2. On the project dashboard click **Connect**. Copy:
   * the **pooled** connection string → `DATABASE_URL`
   * (optional) turn the *Connection pooling* toggle off and copy the **direct** string → `DATABASE_URL_UNPOOLED`
3. Paste them into `.env` (local) and, later, Netlify's environment variables.
4. Nothing else to do — the app creates its tables through migrations (§5). Neon includes the `pg_trgm` extension used for fast name search.

## 5. Migrations, seed data, first administrator
```bash
npm run migrate        # applies migrations/*.sql in order, safe to repeat
npm run seed           # official starting data, safe to repeat (never overwrites)
npm run create-admin -- --phone 0911223344 --name "ሙሉ ስም"            # generates a password, printed once
npm run create-admin -- --phone 0911223344 --name "ሙሉ ስም" --password "MyStrong#Pass1"   # or choose your own
```
Running `create-admin` again with the same phone **resets** that administrator's password (use it if the admin is locked out).

**What `seed` creates** (from `seed/initial-data.json` — edit the file *before* seeding, or change everything later in the admin screens):
* Organization: መሠረተ ሕይወት ሰንበት ትምህርት ቤት
* Payment categories: ተማሪ = 15 ብር, ሰራተኛ = 30 ብር (effective from 2019 መስከረም)
* 7 service departments and 3 member types
* The Ethiopian payment periods (13 months/year) from 2019 until next year

> ⚠️ **Please check `seed/initial-data.json`.** The brief said "use the seven provided departments / the currently defined member types" but the list itself was not in the files I received, so I seeded **placeholder names** (e.g. ትምህርት እና ሥልጠና ክፍል, መዝሙር እና ሥነ ጥበብ ክፍል …). Replace them with your real ones in that file before running `npm run seed`, or just rename/add/disable them later from **ቅንብር** in the admin panel. Nothing is hard-coded in the source.

Production starts **clean**: no fake members, no fake payments. For *development only* there is `npm run seed:dev` (10 demo members; it refuses to run against `neon.tech` or `NODE_ENV=production`).

## 6. Deploy to Netlify (step by step)
1. **Put the code on GitHub** (or GitLab/Bitbucket): create an empty repo, then in the project folder
   `git init && git add . && git commit -m "first version" && git branch -M main && git remote add origin <repo-url> && git push -u origin main`
   (`.env` is ignored, so no secrets are uploaded.)
2. In Netlify: **Add new site → Import an existing project** → pick the repo.
3. Build settings are read from `netlify.toml` — leave them as detected:
   *Build command* `npm run build` · *Publish directory* `dist` · *Functions* `netlify/functions`.
4. **Site configuration → Environment variables** → add `DATABASE_URL`, `AUTH_SECRET` (and optionally `DATABASE_URL_UNPOOLED`, `MAX_UPLOAD_MB`). Do **not** add `STORAGE_DRIVER` (Netlify is detected automatically).
5. Click **Deploy site**. When it finishes, rename the site to get the address you want: **Site configuration → Change site name → `mhpayment`** → `https://mhpayment.netlify.app`.
6. **Run the database setup once from your own computer** (Netlify only hosts the app; the DB commands run where `.env` points at the same Neon DB):
   ```bash
   npm run migrate && npm run seed && npm run create-admin -- --phone 09XXXXXXXX --name "ሙሉ ስም"
   ```
7. Open `https://mhpayment.netlify.app/admin`, log in, change the password, then create finance administrators from **የገንዘብ ያዦች**.

Every `git push` redeploys automatically. Netlify serves the React app for `/`, `/admin`, `/finance`, and rewrites `/api/*` to the function (`netlify.toml`).

## 7. File storage for payment screenshots
* Screenshots and the logo are **never stored in PostgreSQL** — only the key, type, size and SHA-256 are (`payment_proofs`).
* On Netlify they go to **Netlify Blobs** (`uploads` store): private, no extra account, no extra environment variables.
* Only the member who uploaded a proof and staff can open it (`GET /api/payments/:id/proof` checks ownership server-side).
* Uploads are validated by **file content** (magic bytes), not by file name: only JPG, PNG, WebP and PDF are accepted; executables are rejected whatever their extension. Max size = `MAX_UPLOAD_MB`.
* The browser shrinks large phone screenshots (≈1800 px JPEG) before uploading, so they are fast on mobile data and fit Netlify's ~6 MB request limit.
* To use S3/R2/Supabase instead, implement the 3 methods (`put/get/delete`) of `FileStorage` in `server/lib/storage.ts`.

## 8. Who uses which URL
| URL | Who | What |
|---|---|---|
| `/` | **Members** | Phone + password → *የእኔ ክፍያ*, *ክፍያ ይፈጽሙ*, *የክፍያ ታሪክ*, change password |
| `/finance` | **Finance administrators** (የገንዘብ ያዥ) | Register members, record cash/mobile-banking, review screenshots, reports, exports |
| `/admin` | **Main administrator** | Everything above **plus** payment amounts (የክፍያ ቅንብር), departments, member types, organization & logo, finance accounts, audit history, void a verified payment |

These are routes of **one** app. Each login page only accepts its own role, and the **API enforces permissions on the server** — hiding a link is never the protection. Members can only ever see their own data.

## 9. Day-to-day usage guide
**Registering a member** (`አባላት → ＋ አዲስ አባል`): enter name, phone, member type, department, payment category, registration date → the system creates the **member ID (MH000001 …)**, the login account, a **one-time initial password**, and the payment months. Press **📋 የመግቢያ መረጃውን ቅዳ** and paste it to the member/Telegram. The member must choose a new password at first login (**እባክዎ የይለፍ ቃልዎን ይቀይሩ።**).
**Member list for Telegram:** `አባላት → PDF አውርድ / Excel አውርድ` → *የተመዘገቡ አባላት ዝርዝር* (ተ.ቁ, የአባል መለያ, ሙሉ ስም, ስልክ ቁጥር, የአባልነት አይነት, የክፍያ ምድብ, ክፍል). Passwords are intentionally **not** in the file (they are hashed and shown only once at registration).
**Forgot password:** member tells the finance admin → open the member → **🔑 አዲስ የይለፍ ቃል** → give the new one-time password. (No SMS/e-mail gateway exists yet; the hook point is documented in `server/routes/auth.ts`.)
**Screenshot payments:** `ማረጋገጫዎች` (red badge = waiting) → open → check the image → **✓ አረጋግጥ** or **✕ አልተቀበልኩም** (a reason is required; the member sees it and can resubmit). After approving, the next waiting payment opens automatically.
**Cash / mobile banking:** open the member → tick months → choose ጥሬ ገንዘብ or ሞባይል ባንክ → **ክፍያውን አረጋግጥ**. A reference like `MH-PAY-000001` is generated. Mobile banking can carry an optional proof image and an amount that must equal the selected months.
**"Who has not paid ጥቅምት?"** `ሪፖርት`, choose ዓመት + ወር + ሁኔታ = አልተከፈለም (or use `የክፍያ ሁኔታ`). Add ክፍል / ምድብ / አይነት / ዘዴ / ቀን ክልል / search — **all filters combine**, and **Excel አውርድ / PDF አውርድ export exactly what is filtered**.
**Changing prices:** admin → `ቅንብር → የክፍያ ቅንብር → መጠን ቀይር` (ተማሪ 15 → 20, choose the first month it applies to). Old months stay 15.
**Confirmation document:** after verification the member (history page) or staff (payment page) can download **የክፍያ ማረጋገጫ** (PDF) with the Ethiopian payment date and the reference number.

## 10. How the money logic works
* **Obligation** (`payment_obligations`) = what a member owes for one Ethiopian month. **Transaction** (`payment_transactions`) = what was actually paid. They are linked by `payment_transaction_items`, so **one payment can cover many months**.
* Status per month: `UNPAID → PENDING → PAID`, or `REJECTED` (back to payable, with the reason). Shown as አልተከፈለም / በማረጋገጥ ላይ / ተከፍሏል / አልተቀበለም. Nothing becomes PAID before staff approves.
* **Price history:** each obligation stores the amount valid for its month. A price change (`payment_rules`, effective from a month) re-prices **only still-open months from that month on**; PAID/PENDING/past months are never touched. The member's category can also change (open months from the current month are re-priced).
* **Obligation creation:** at registration, from the registration month to the end of the current Ethiopian year; when a new Ethiopian year begins, the next year's months are created automatically (once, on the first dashboard visit). ጳጉሜን is **not billed by default**; tick the option in `ቅንብር → የድርጅት መረጃ` to bill it.
* **Duplicate protection:** approvals/recordings run in one DB transaction with row locks, re-check that months are still open, and a **unique partial index** guarantees an obligation can belong to only one live transaction. Two staff clicking at once → one succeeds, the other sees **ይህ ወር ቀድሞ ተከፍሏል።** (covered by a test).
* **Totals** always come from the database (verified transactions), never from the browser. Deactivated members' unpaid months are excluded from "expected".
* An admin can **void** a verified payment (months become unpaid again, the record stays, audit-logged).

## 11. Ethiopian calendar
* All conversions go through `shared/calendar/ethiopian.ts` → **`abushakir`**. No hand-written formulas, no hard-coded year offsets or New-Year days.
* An instant is interpreted in **`Africa/Addis_Ababa`** (via `Intl`), so a payment at 23:59 EAT belongs to that Ethiopian day, not the UTC day.
* Every period/payment stores the Ethiopian year/month/day (`payment_periods`, `payment_transactions.ethiopian_*`) **and** the real timestamp (`timestamptz`); periods also store `period_start`/`period_end`.
* 13 months, 30-day months, ጳጉሜን 5/6 days (leap years) all come from the library. Unique constraint: **(member, year, month)**.
* The current year is derived from the clock; `2019` exists only as the configurable **start year** (`system_start_year` setting).
* Ethiopian date ranges in reports (`ከቀን / እስከ ቀን`) are converted on the server into timestamp ranges. The date range applies to the **payment date** or the **payment month** (your choice in the report filter).

## 12. Security
bcrypt password hashing (no plain text anywhere) · initial passwords are random, shown once, and force a change · phone numbers normalized (`0911…`, `+251911…`, `251911…` are the same account; duplicates impossible) · session cookie `httpOnly`, `Secure`, `SameSite=Lax`, re-validated against the DB on every request (disabling a user or changing a password takes effect immediately) · 5 wrong passwords → 15-minute lock · same-origin check on all state-changing requests · role checks on every API route; members are scoped to their own `member_id` · uploads validated by content · audit log of registrations, edits, payments, approvals/rejections, price/department/settings changes, staff creation, password resets · SQL is fully parameterized.

## 13. Tests
```bash
npm test                      # 14 Ethiopian-calendar tests (no database needed)
# + 15 end-to-end API tests against a REAL PostgreSQL (use a scratch database — it creates test members):
TEST_DATABASE_URL=postgresql://user:pass@host/scratchdb npm test
```
Calendar tests cover: 2019 start, New Year, month boundaries, ጳጉሜን (5 and 6 days), leap years, Ethiopian⇄Gregorian round trips for every day of 2019–2022 and 800 consecutive days back, midnight and near-boundary payments, historical/current/future periods. API tests cover login/portals, forced password change, registration, duplicate phones, screenshot → pending → approve/reject, cash & mobile banking, concurrent double payment, price history, privacy between members, filters, real `.xlsx`/`.pdf` exports, audit, settings and logo.

## 14. Project structure
```
migrations/001_init.sql     database schema          seed/initial-data.json   official starting data
scripts/                    migrate · seed · seed-dev · create-admin · embed-fonts
shared/calendar/            ethiopian.ts · payment-period.ts   (the ONLY calendar code)
shared/labels.ts            Amharic labels for status/method codes
server/
  app.ts · dev.ts           Express app · plain-Node entry
  lib/                      auth · phone · storage · audit · errors · embedded fonts
  services/                 members · obligations · payments · reports · exports · settings · periods
  routes/                   auth · config · members · payments · reports
netlify/functions/api.ts    serverless entry (serverless-http)
src/                        React app (pages/, ui.tsx, api.ts, styles.css)
assets/fonts/               Noto Sans Ethiopic (SIL OFL) used in PDFs
tests/                      calendar + API end-to-end
```

## 15. Moving off Netlify later / future Chapa
* The API is a normal Express app: `npm run build && npm start` runs everything on any Node 20+ host (Render, Railway, VPS) with the same env vars; set `STORAGE_DRIVER=local` (persistent disk) or implement S3 in `server/lib/storage.ts`.
* Chapa can be added as a new payment `method` + webhook route that calls the same `recordStaffPayment`-style transaction logic; no Chapa code or references exist today.

## 16. Troubleshooting
| Symptom | Fix |
|---|---|
| `DATABASE_URL አልተቀመጠም` | `.env` missing/empty (local) or variable not set in Netlify. |
| Can't log in as admin on a new DB | Run `npm run create-admin -- --phone … --name …`. |
| Everyone suddenly logged out | `AUTH_SECRET` changed. |
| Screenshot upload fails on mobile | File > `MAX_UPLOAD_MB` after compression, or not JPG/PNG/WebP/PDF. |
| Amharic shows as boxes in a PDF | Don't replace the fonts in `assets/fonts` with ones lacking Ethiopic; then run `npm run fonts`. |
| 404 on refresh of `/admin/members` | Make sure `netlify.toml` is deployed (it contains the SPA redirect). |
| `column … does not exist` after an update | Run `npm run migrate`. |
