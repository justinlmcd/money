// Your coach. The browser sends a summary of your own data; Claude reads it and says how you're doing.
// Runs on Vercel so the API key never reaches the browser. Only answers signed-in users.
import Anthropic from '@anthropic-ai/sdk';

const APP = 'money';

const ROLES = {
  wired: `You are a calm, honest coach reading someone's body-weight log. They log weight by hand and take progress photos. Judge consistency of logging first, then the direction of the trend against whatever goal they state. Weight moves day to day from water and food; only call a change real when the weekly averages move. Never comment on appearance or suggest extreme dieting.`,
  money: `You are a calm, honest money coach reading someone's spending log and subscription list. Judge spending against their own recent pattern, not against an imagined budget. Point at specific categories, merchants, days or subscriptions by name. Prefer a small number of concrete, cancel-this or cap-that suggestions over general advice.`,
  gym: `You are a calm, honest strength coach reading someone's training log. Each exercise has a sets × reps target and an increment; they are following progressive overload. Judge training frequency and consistency first, then whether lifts are moving up, stalling, or going backwards. Name exercises. Suggest specific next-session changes (add weight, hold weight, add a set, rest, swap). Do not prescribe medical advice.`,
  meal: `You are a calm, honest nutrition coach reading someone's food diary against their own calorie and macro goals. Judge logging consistency first, then adherence to the calorie goal, then protein. Name specific foods, meals or days. Do not give medical advice, do not diagnose, and never suggest eating below 1200 kcal a day.`,
  write: `You are a calm, honest reflective coach reading someone's daily journal: a 1-10 rating of each day and what they wrote. Look for patterns in what makes good days good and bad days bad, recurring frustrations, and whether they are keeping the habit. Quote their own words back sparingly. Be warm, not saccharine. If the writing suggests crisis or self-harm, say gently that this is beyond what a journal coach can help with and name a crisis line for their country if one is obvious, otherwise a general one.`
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'score', 'doing_well', 'improve', 'next_step'],
  properties: {
    headline: { type: 'string', description: 'One sentence, plain and specific, on how they are doing right now.' },
    score: { type: 'integer', description: 'Overall score from 1 (poor) to 10 (excellent), judged on consistency and direction.' },
    doing_well: { type: 'array', items: { type: 'string' }, description: 'One to three specific things going right, each one short sentence citing their data.' },
    improve: {
      type: 'array', description: 'One to three changes to make.',
      items: { type: 'object', additionalProperties: false, required: ['what', 'why'], properties: { what: { type: 'string', description: 'The change, as an instruction.' }, why: { type: 'string', description: 'The evidence in their data, one short sentence.' } } }
    },
    next_step: { type: 'string', description: 'The single thing to do today or at the next session.' }
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

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).end(JSON.stringify({ error: 'Method not allowed.' })); }
  if (!process.env.ANTHROPIC_API_KEY) return response.status(503).end(JSON.stringify({ error: 'Set ANTHROPIC_API_KEY in Vercel to turn on the coach.' }));
  if (!(await verifyUser(request))) return response.status(401).end(JSON.stringify({ error: 'Sign in to ask the coach.' }));

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  const summary = typeof body.summary === 'string' ? body.summary.slice(0, 40000) : '';
  if (!summary.trim()) return response.status(400).end(JSON.stringify({ error: 'Nothing to coach on yet. Log a few days first.' }));
  const role = ROLES[APP] || ROLES.money;

  // An organization-level key must name a workspace; a key created inside a workspace does not.
  const workspace = (process.env.ANTHROPIC_WORKSPACE_ID || '').trim();
  const client = new Anthropic(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {});
  try {
    const result = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2048,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `${role}\n\nRules: Use only the data given; do not invent numbers. Write in second person, plainly, no exclamation marks, no emoji. Each item one or two short sentences. If there are fewer than three days of data, say so in the headline and keep suggestions to logging consistently.`,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `Today is ${new Date().toISOString().slice(0, 10)}. Here is my data:\n\n${summary}` }]
    });
    if (result.stop_reason === 'refusal') return response.status(422).end(JSON.stringify({ error: 'The coach could not read this. Try again later.' }));
    const text = result.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const note = JSON.parse(text);
    note.score = Math.max(1, Math.min(10, Math.round(Number(note.score) || 5)));
    note.doing_well = (note.doing_well || []).slice(0, 3); note.improve = (note.improve || []).slice(0, 3);
    return response.status(200).end(JSON.stringify({ ...note, at: new Date().toISOString() }));
  } catch (error) {
    console.error('coach error', error?.status, error?.message);
    const status = error?.status === 429 ? 429 : error?.status === 401 ? 401 : 502;
    const detail = (error?.message || String(error)).slice(0, 300);
    const msg = status === 429 ? 'The coach is busy. Try again in a minute.' : status === 401 ? 'The ANTHROPIC_API_KEY in Vercel was rejected. Check the key and redeploy.' : `The coach could not answer: ${detail}`;
    return response.status(status).end(JSON.stringify({ error: msg }));
  }
}
