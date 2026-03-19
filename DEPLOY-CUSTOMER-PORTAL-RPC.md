# Customer portal: fix “Save changes” / permissions

The office app saves portal links with **direct REST** on `customer_portal_access` (no `update_customer_portal_link` RPC required).

## Required: allow REST updates (RLS + grants)

If saves fail with **“no row updated”**, **42501**, or permission errors:

1. **Supabase → SQL Editor** → run **`supabase/migrations/20250340000000_customer_portal_access_rest_writes.sql`**  
   (same as **`scripts/fix-customer-portal-access-rls.sql`**: drops blocking RLS policies, disables RLS on `customer_portal_access`, grants DML to `authenticated`).

```bash
npx supabase db push
```

## Optional legacy RPCs

Older setups used `update_customer_portal_link` / `create_customer_portal_link`. The app **no longer depends** on them for office saves. You can still apply **`20250335000000_customer_portal_create_update_link_rpcs.sql`** if other tooling calls those functions.

## Section price toggles / “updated here only” / missing columns

If per-section or per-proposal visibility won’t save, add the JSONB columns:

1. **Supabase → SQL Editor** → paste and run **`scripts/ensure-portal-section-visibility.sql`**  
   (or apply migration **`20250339000000_ensure_portal_section_visibility_columns.sql`** via `npx supabase db push`).
2. **Project Settings → Restart project** (helps PostgREST refresh).
3. Ensure migration **`20250340000000_customer_portal_access_rest_writes.sql`** has run so REST updates apply.

## Error `23502` — `show_section_prices_portal` on `customer_portal_links`

Some databases mirror portal settings on **`customer_portal_links`** with a NOT NULL column **`show_section_prices_portal`**. Updates that only change a few toggles (and omit section-prices JSON) can leave that column NULL and fail.

1. **App:** saves always send **`show_section_prices`** and **`visibility_by_quote`** where applicable; direct `UPDATE` retries on `23502` with merged JSON.
2. **DB guard:** run migration **`20250338000000_customer_portal_links_section_prices_portal_guard.sql`** (`supabase db push`) so a trigger keeps `show_section_prices_portal` non-null on legacy `customer_portal_links` rows.
