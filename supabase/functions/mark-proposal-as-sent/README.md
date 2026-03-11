# mark-proposal-as-sent

Edge Function used by the "Mark as Sent" button. Called automatically when direct
PostgREST updates fail (e.g. due to RLS or a stale schema cache).

Uses the **service role key** (available automatically in Edge Functions) which bypasses
Row Level Security so the updates always go through.

## Prerequisites

The `quotes` table must have these columns:
- `sent_at` (timestamptz) - when the proposal was sent
- `sent_by` (uuid) - references user_profiles(id)
- `locked_for_editing` (boolean, optional) - future use

The RPC function `mark_proposal_as_sent` must exist in the database.

**If you see "column does not exist" errors:**
Run `scripts/setup-mark-as-sent.sql` in Supabase SQL Editor to add the required columns and RPC.

## Deploy

```bash
supabase functions deploy mark-proposal-as-sent
```

No extra secrets or config needed — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are injected automatically by Supabase.

## Usage

```typescript
const { data, error } = await supabase.functions.invoke('mark-proposal-as-sent', {
  body: { quote_id: quoteId, user_id: userId }
});
```

## Returns

Success:
```json
{ "ok": true, "quote_id": "..." }
```

Error:
```json
{ "ok": false, "error": "...", "hint": "..." }
```
