# SLN Festival Fund Manager

A mobile-friendly financial management app for SLN Urbana Owners Welfare Association's Ganesh Festival. It uses React, TypeScript, Vite, Supabase Auth, and Supabase PostgreSQL.

## Production prerequisites

- Node.js 20 or later
- A Supabase project
- A Supabase Auth user with a matching `public.profiles` record

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set the public browser configuration values:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

   Use only the Supabase URL and anon/publishable key. Never add a Supabase service-role key, database password, or user password to a Vite environment file.

3. In the Supabase SQL Editor, apply migrations in order from `supabase/migrations/`.

4. Start development:

   ```bash
   npm run dev
   ```

## Verification and production build

```bash
npm install
npm run lint
npm run build
```

The production-ready static files are created in `dist/`. Deploy that directory to a static host such as GitHub Pages, Netlify, or Cloudflare Pages, and configure the same two `VITE_` variables in the host's build environment.

Build command: `npm run build`  
Publish directory: `dist`

## Supabase security

- All application access is authenticated through Supabase Auth.
- Row Level Security policies are created in the migrations.
- Financial records are immutable; they must be voided instead of deleted.
- The repository ignores `.env` and all `.env.*` files except `.env.example`.

## Database migrations

Apply the migrations in lexical order:

1. `20260911000000_ganesh_fund.sql` — schema, RLS, seed festival, categories, and flats.
2. `20260911000001_floorwise_flats.sql` — floor-wise flat renumbering for existing data.
3. `20260911000002_seed_resident_names.sql` — resident-name import from the supplied owners sheets.
4. `20260911000003_sln_receipt_numbers.sql` — changes receipts to `SLN-YYYY-0001` format.
5. `20260913000000_add_donation_type.sql` — adds the donation type field.
6. `20260913000001_add_festival_expense_categories.sql` — adds Groceries, Cook, Sweets, and Pujari categories.
7. `20260913000002_prevent_duplicate_donations.sql` — prevents duplicate active donation types for a flat.

Existing Supabase projects should run only migrations not already applied.
