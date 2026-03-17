# How to Deploy the Zoho Sync Fix to Supabase

The Zoho materials sync fix lives in an **Edge Function**. You deploy it from your computer so Supabase runs the new code.

---

## Step 1: Open a terminal in this project

- In **Cursor**: press **Ctrl+`** (backtick) or use the menu **Terminal → New Terminal**.
- You should see a prompt like `PS C:\...\WXpZhy8ekZw9Hhhe8Bvu6h>`.

---

## Step 2: Use Supabase CLI

You don’t need to install anything. Use **npx** so the CLI runs from the project:

- In every command below, type **`npx supabase`** instead of just **`supabase`**.
- Example: `npx supabase login`, `npx supabase link ...`, `npx supabase functions deploy zoho-sync`.

---

## Step 3: Log in to Supabase (one-time)

Run:

```bash
npx supabase login
```

- A browser window will open.
- Sign in with the same account you use for your Supabase project.
- When it says you’re logged in, you can close the tab and go back to the terminal.

---

## Step 4: Link this folder to your Supabase project (one-time)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and open your project.
2. Click **Project Settings** (gear icon) → **General**.
3. Copy the **Reference ID** (short string like `abcdefghijklmnop`).
4. In the terminal, run (replace `YOUR_PROJECT_REF` with that ID):

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

- If it asks for the database password, use the one from your project’s **Database** settings.

---

## Step 5: Deploy the Zoho sync function

In the same terminal, run:

```bash
npx supabase functions deploy zoho-sync
```

- Wait until it says the function was deployed.
- Your app will use the new Zoho sync code the next time someone runs “Sync materials”.

---

## If you don’t want to use the CLI

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → your project.
2. In the left sidebar, open **Edge Functions**.
3. If you see **zoho-sync** in the list, open it and check for an option like **Redeploy** or **Deploy from repo** (if your project is connected to GitHub).
4. If your project is connected to a Git repo that contains this code, Supabase may deploy from there when you push; check **Project Settings → Integrations**.

If you tell me whether you use GitHub and how you usually deploy (e.g. Vercel, Netlify, manual), I can tailor these steps.
