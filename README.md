# MONEY.

Track what you spend and what charges you on a schedule. A pie chart by category, a line of spend per day, and a running list of subscriptions. One page, no build step, your data in your own Supabase database.

## Set up (about 10 minutes)

1. **Supabase.** Create a project at supabase.com (or reuse one you already have). In **SQL Editor**, paste the contents of [setup.sql](setup.sql) and click **Run**. Do this once.
2. **A login.** In **Authentication → Users**, click **Add user**, enter your email and a password, and tick **Auto confirm**.
3. **Vercel.** Import this repository at vercel.com → Add New → Project. Framework preset **Other**, no build command, root directory blank.
4. **Two environment variables** on that Vercel screen, both from your Supabase project's **Connect** dialog:
   - `SUPABASE_URL` → your project URL
   - `SUPABASE_PUBLISHABLE_KEY` → the key starting `sb_publishable_`
5. **Deploy.** Open the URL Vercel gives you, click **Sign in**, and add your first expense.

Vercel redeploys on every push to `main`.

## Your budget

Add your **monthly income** (after tax), **total debt** and **savings** with **Add your numbers**. The interest rate and minimum payment on your debt are optional but make the plan sharper. Then press **Create me a budget**. Claude reads those numbers together with your scheduled bills and subscriptions and what you actually spent by category over the last 90 days, and builds a monthly plan:

- **Toward debt**, with the month you'll be debt-free and roughly how much interest you'll pay. That date is worked out on the page from your own numbers.
- **To savings**, building a starter emergency fund first.
- **What to spend in each category**, with a bar showing this month's spending against it. Scheduled bills show the bill instead.
- **What to cut**, naming specific subscriptions and merchants and what each cut saves a month, plus a few rules for the month and one next step.

Nothing is sent until you press the button. The budget is saved to your database, so it shows on every device; when you change your numbers, the page tells you to make a new one. It uses the same `ANTHROPIC_API_KEY` as the coach, and each budget costs a few cents. It is a plan from your own numbers, not financial advice.

If you set MONEY up before budgets existed, run [budget.sql](budget.sql) once in the Supabase SQL editor.

## Your debts

List each card, loan or balance you're paying off with **Add debt**: what's left, its interest rate (APR) and the minimum payment. Set what you'll pay toward debt each month, and choose an order:

- **Highest interest first** (avalanche) pays the least interest overall.
- **Smallest balance first** (snowball) clears whole debts sooner, which keeps you going.

Every payment covers each debt's minimum; whatever is left goes to the debt marked **Focus**, and when one is paid off its money rolls on to the next. The card shows the order to pay them in, the month each one is paid off, your debt-free date and the interest you'll pay, compared with paying only the minimums. It warns you if the monthly amount is below your minimums. Press **Payment** after you pay to bring a balance down. Your budget uses this list instead of the single debt total in your numbers.

If you set MONEY up before debts existed, run [debts.sql](debts.sql) once in the Supabase SQL editor (after budget.sql).

## Bills due soon

A strip under the tiles lists the bills and subscriptions due in the next 7 days, with their total, so a big one like insurance never catches you short. Each bill's next date rolls forward on its schedule (weekly, monthly or yearly) once it passes, so you only enter it once.

## Your coach

A card near the top reads your own recent data and tells you how you are doing: a score out of ten, what is going well, what to change, and one next step. Nothing is sent until you press **Ask the coach**, and the last answer is kept on your device. It runs on Claude through a small Vercel function, so you need one extra environment variable in Vercel: `ANTHROPIC_API_KEY`, created at console.anthropic.com under API keys. Each ask costs about a cent. Without the key, the card simply says the coach is off.

## Run locally

```
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node dev.js
```

Then open http://localhost:8798.

## What's in it

- `index.html` — the page and its styles
- `money.js` — sign-in, loading, charts, add/edit/delete
- `api/budget.mjs` — the Vercel function behind **Create me a budget**
- `quote-of-day.js` — a quote that changes at local midnight
- `api/config.js` — hands the two public Supabase settings to the page
- `setup.sql` — the `transactions`, `subscriptions`, `money_profile` and `debts` tables, locked to each user by row-level security
- `budget.sql` — adds your numbers and budget to a MONEY set up before budgets existed
- `debts.sql` — adds your debts list and payoff plan to a MONEY set up before debts existed

## Add to your iPhone home screen

Open the site in Safari, tap Share, then **Add to Home Screen**. It runs full screen below a black status bar.

## Settings

Theme (system, dark or light), font, time zone and when your day ends are set once in YOU's **Settings** tab (the gear next to the home button opens it) and saved to your account; this app reads them when you sign in and keeps a copy on the device. It keeps its own colour. "Today" follows your time zone and when your day ends, so something logged at 1 AM with "day ends at 3 AM" counts toward the day before. Needs `settings.js` and YOU's `settings.sql`.
