// Create me a budget. The browser sends your income, debt, savings, bills, subscriptions and recent spending;
// Claude turns them into a monthly plan. Runs on Vercel so the API key never reaches the browser. Only answers signed-in users.
import Anthropic from '@anthropic-ai/sdk';

// The page's own categories, plus the two lines a budget sets aside. The page compares each one with this month's spending.
const CATEGORIES = ['Housing', 'Bills & utilities', 'Groceries', 'Food & drink', 'Transport', 'Health', 'Subscriptions', 'Shopping', 'Entertainment', 'Travel', 'Other', 'Debt payment', 'Savings'];
const KINDS = ['need', 'want', 'debt', 'savings'];

const ROLE = `You are a practical, honest budgeting coach. Build a monthly budget for one person from their own numbers: take-home income, debt, savings, scheduled bills and subscriptions, and what they actually spent in each category recently. The goal is to pay off the debt, save more, and cut spending on things they don't need, in a plan they can actually keep.

How to build it:
- Split the whole monthly income across the categories, so the allocations add up to the income. If their fixed costs and minimum debt payment are more than their income, allocate what they can, say so plainly in the headline, and make closing that gap the next step.
- Keep scheduled bills and housing at their real cost. Base everyday categories (groceries, transport, health) on what they spent recently, trimmed only where that is realistic.
- Pay at least the minimum debt payment when one is given. If their savings are less than about one month of essential costs, build that starter emergency fund first with a modest monthly amount, then send everything else you can toward the debt. Once the starter fund exists, favour the debt, especially at a high interest rate.
- Cut wants, not needs: shopping, eating out, entertainment, and subscriptions they could cancel or pause. Name the specific subscriptions and merchants from their data, with how much each cut saves a month.
- Use whole currency amounts. Use only the data given; never invent bills, debts or income.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'allocations', 'emergency_fund_target', 'cuts', 'rules', 'next_step'],
  properties: {
    headline: { type: 'string', description: 'One or two plain sentences: what this budget does for them, with the key numbers.' },
    allocations: {
      type: 'array', description: 'The monthly plan, one line per category used. Include a "Debt payment" line when they have debt and a "Savings" line. The amounts add up to the monthly income.',
      items: {
        type: 'object', additionalProperties: false, required: ['category', 'kind', 'amount', 'note'],
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          kind: { type: 'string', enum: KINDS, description: 'need: essential; want: discretionary; debt: the debt payment line; savings: the savings line.' },
          amount: { type: 'number', description: 'Monthly amount, whole currency units.' },
          note: { type: 'string', description: 'Under 12 words: what this covers or what changes, citing their data.' }
        }
      }
    },
    emergency_fund_target: { type: 'number', description: 'The savings balance to build before saving less and paying more toward debt: about one month of essential costs.' },
    cuts: {
      type: 'array', description: 'One to five specific cuts, biggest saving first.',
      items: {
        type: 'object', additionalProperties: false, required: ['what', 'save_per_month', 'why'],
        properties: {
          what: { type: 'string', description: 'The cut, as an instruction naming the subscription, merchant or category.' },
          save_per_month: { type: 'number', description: 'Whole currency units saved each month.' },
          why: { type: 'string', description: 'The evidence in their data, one short sentence.' }
        }
      }
    },
    rules: { type: 'array', items: { type: 'string' }, description: 'Two to four short spending rules to follow this month, each one sentence.' },
    next_step: { type: 'string', description: 'The single thing to do today to start this budget.' }
  }
};

async function verifyUser(request) {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const auth = request.headers.authorization || '';
  if (!url || !key || !auth.startsWith('Bearer ')) return false;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: auth } });
  return r.ok;
}

const amount = v => Math.max(0, Math.round(Number(v) || 0));

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).end(JSON.stringify({ error: 'Method not allowed.' })); }
  if (!process.env.ANTHROPIC_API_KEY) return response.status(503).end(JSON.stringify({ error: 'Set ANTHROPIC_API_KEY in Vercel to turn on budgets.' }));
  if (!(await verifyUser(request))) return response.status(401).end(JSON.stringify({ error: 'Sign in to create a budget.' }));

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  const summary = typeof body.summary === 'string' ? body.summary.slice(0, 40000) : '';
  if (!summary.trim()) return response.status(400).end(JSON.stringify({ error: 'Add your monthly income first.' }));

  // An organization-level key must name a workspace; a key created inside a workspace does not.
  const workspace = (process.env.ANTHROPIC_WORKSPACE_ID || '').trim();
  const client = new Anthropic(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {});
  try {
    const result = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `${ROLE}\n\nWrite in second person, plainly, no exclamation marks, no emoji. This is a budgeting plan from their own numbers, not regulated financial advice.`,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `Today is ${new Date().toISOString().slice(0, 10)}. Here are my numbers:\n\n${summary}` }]
    });
    if (result.stop_reason === 'refusal') return response.status(422).end(JSON.stringify({ error: 'A budget could not be made from this. Try again later.' }));
    if (result.stop_reason === 'max_tokens') return response.status(502).end(JSON.stringify({ error: 'The budget came back incomplete. Try again.' }));
    const text = result.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const plan = JSON.parse(text);
    // Keep the shape the page expects, whatever comes back.
    const out = {
      headline: String(plan.headline || ''),
      allocations: (plan.allocations || []).filter(a => CATEGORIES.includes(a.category) && KINDS.includes(a.kind)).slice(0, 16)
        .map(a => ({ category: a.category, kind: a.kind, amount: amount(a.amount), note: String(a.note || '') })),
      emergency_fund_target: amount(plan.emergency_fund_target),
      cuts: (plan.cuts || []).slice(0, 5).map(c => ({ what: String(c.what || ''), save_per_month: amount(c.save_per_month), why: String(c.why || '') })),
      rules: (plan.rules || []).slice(0, 4).map(String),
      next_step: String(plan.next_step || ''),
      at: new Date().toISOString()
    };
    if (!out.allocations.length) return response.status(502).end(JSON.stringify({ error: 'The budget came back empty. Try again.' }));
    return response.status(200).end(JSON.stringify(out));
  } catch (error) {
    console.error('budget error', error?.status, error?.message);
    const status = error?.status === 429 ? 429 : error?.status === 401 ? 401 : 502;
    const detail = (error?.message || String(error)).slice(0, 300);
    const msg = status === 429 ? 'Budgets are busy. Try again in a minute.' : status === 401 ? 'The ANTHROPIC_API_KEY in Vercel was rejected. Check the key and redeploy.' : `A budget could not be made: ${detail}`;
    return response.status(status).end(JSON.stringify({ error: msg }));
  }
}
