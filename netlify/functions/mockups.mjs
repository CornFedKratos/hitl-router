import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── Tier 1: Quick Build — 3 separate API calls, one per style direction ──

const TIER1_BASE = `You are generating a single complete HTML website prototype.

CRITICAL RULES:
- COMPLETE, self-contained HTML with ALL CSS inline in a <style> tag
- NO external dependencies — no CDN links, no Google Fonts, no external images
- Use system font stacks: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- Mobile-responsive with a viewport meta tag
- Include a working contact form (action="#" with visible form fields)
- Include all business content provided
- Renders perfectly when opened directly in a browser
- Keep total HTML under 8KB
- Use semantic HTML5

OUTPUT: Return ONLY the raw HTML. No markdown fences, no explanation, no wrapping.`;

const TIER1_DIRECTIONS = [
  {
    id: 'A',
    name: 'Warm & Trustworthy',
    desc: 'Soft, approachable, family-friendly',
    prompt: `STYLE DIRECTION: "Warm & Trustworthy"
- Soft white background (#FAFAF8), warm neutrals, earthy green accents (#4A7C59)
- Large hero section with trust signals prominent
- Contact form above the fold
- Rounded corners, warm shadows
- Best for: home services, inspection, family businesses`,
  },
  {
    id: 'B',
    name: 'Clean & Professional',
    desc: 'Structured, information-forward',
    prompt: `STYLE DIRECTION: "Clean & Professional"
- White background (#FFFFFF), navy (#1E3A5F) and slate (#64748B) accents
- Structured grid layout, clear service cards with borders
- Information-forward, minimal decoration
- Sharp corners, subtle shadows
- Best for: professional services, B2B`,
  },
  {
    id: 'C',
    name: 'Bold & Modern',
    desc: 'High contrast, premium feel',
    prompt: `STYLE DIRECTION: "Bold & Modern"
- Dark header (#111827), high contrast with white content area
- Large typography, strong visual hierarchy
- Services as feature blocks with colored icon circles
- Mixed radius, dramatic shadows
- Best for: premium positioning, younger audience`,
  },
];

async function generateTier1(session) {
  const contentBlock = buildContentBlock(session);

  const results = await Promise.all(
    TIER1_DIRECTIONS.map(async (dir) => {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          system: `${TIER1_BASE}\n\n${dir.prompt}`,
          messages: [{ role: 'user', content: contentBlock }],
        });
        return {
          id: dir.id,
          name: dir.name,
          desc: dir.desc,
          type: 'html',
          content: response.content[0]?.text || '',
        };
      } catch (err) {
        return { id: dir.id, name: dir.name, desc: dir.desc, type: 'html', content: null, error: err.message };
      }
    })
  );

  return results;
}

// ── Tier 2: Launchpad — one API call, JSON array of 3 concept cards ──

const TIER2_PROMPT = `You are the Chief Product Officer in the HITL-AI-DLC methodology.
You are generating 3 concept direction cards for a Launchpad-tier project.

Each direction should offer a distinct strategic approach to solving the client's problem.
Use the session content to ground each direction in the client's actual situation.

DIRECTION APPROACHES (use these as starting points, adapt to the project):
- Direction A: "Automate First" — lead with automation and efficiency
- Direction B: "People-Centered" — lead with user experience and human workflows
- Direction C: "Data-Led" — lead with analytics, insights, and measurement

For each direction, provide:
- name: a short direction name (3-5 words)
- framing: a one-paragraph statement explaining this approach for THIS project (2-3 sentences, specific to their problem/audience)
- features: array of 4-5 key features this direction would prioritize
- approach: one sentence on how implementation would start

OUTPUT: Return ONLY this JSON array, no markdown fences, no explanation:
[{"name":"...","framing":"...","features":["..."],"approach":"..."},{"name":"...","framing":"...","features":["..."],"approach":"..."},{"name":"...","framing":"...","features":["..."],"approach":"..."}]`;

async function generateTier2(session) {
  const contentBlock = buildContentBlock(session);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: TIER2_PROMPT,
      messages: [{ role: 'user', content: contentBlock }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const directions = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    return directions.map((d, i) => ({
      id: ['A', 'B', 'C'][i],
      name: d.name,
      type: 'card',
      framing: d.framing,
      features: d.features,
      approach: d.approach,
    }));
  } catch (err) {
    return [
      { id: 'A', name: 'Direction A', type: 'card', error: err.message },
      { id: 'B', name: 'Direction B', type: 'card', error: err.message },
      { id: 'C', name: 'Direction C', type: 'card', error: err.message },
    ];
  }
}

// ── Tier 3: Full Engagement — one API call, JSON array of 3 vision cards ──

const TIER3_PROMPT = `You are the Chief Product Officer in the HITL-AI-DLC methodology.
You are generating 3 vision-level strategic direction cards for a Full Engagement project.

Each direction should represent a fundamentally different strategic bet.
These are not wireframes — they are partnership approaches.

DIRECTION APPROACHES (adapt to the project):
- Direction A: "Build Fast & Iterate" — MVP-first, ship early, learn from real usage
- Direction B: "Platform First" — invest upfront in architecture, scale from day one
- Direction C: "Human-Led with AI Assist" — human team drives, AI augments where proven

For each direction, provide:
- name: a partnership approach name (3-5 words)
- vision: a vision statement derived from session content (2-3 sentences, aspirational but grounded)
- pillars: array of exactly 3 strategic pillars
- roadmap: implied roadmap shape — one sentence each for MVP, Scale, and Evolve phases

OUTPUT: Return ONLY this JSON array, no markdown fences, no explanation:
[{"name":"...","vision":"...","pillars":["..."],"roadmap":{"mvp":"...","scale":"...","evolve":"..."}},...]`;

async function generateTier3(session) {
  const contentBlock = buildContentBlock(session);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: TIER3_PROMPT,
      messages: [{ role: 'user', content: contentBlock }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const directions = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    return directions.map((d, i) => ({
      id: ['A', 'B', 'C'][i],
      name: d.name,
      type: 'vision',
      vision: d.vision,
      pillars: d.pillars,
      roadmap: d.roadmap,
    }));
  } catch (err) {
    return [
      { id: 'A', name: 'Direction A', type: 'vision', error: err.message },
      { id: 'B', name: 'Direction B', type: 'vision', error: err.message },
      { id: 'C', name: 'Direction C', type: 'vision', error: err.message },
    ];
  }
}

// ── Shared ──

function buildContentBlock(session) {
  return `PROJECT CONTEXT:
- Problem: ${session.problem || 'Not specified'}
- Solution: ${session.solution || 'Not specified'}
- Audience: ${session.audience || 'Not specified'}
- Engagement tier: ${session.engagement_tier || 'Not classified'}
- Tier signals: ${(session.tier_signals || []).join(', ') || 'None'}

SESSION DATA:
${session.partial_answers ? Object.entries(session.partial_answers).map(([k, v]) => `- ${k}: ${v}`).join('\n') : 'No additional answers available.'}

Generate the directions now based on this specific project.`;
}

// ── Handler ──

export default async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch session
    const { data: session, error: fetchErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', session_id)
      .single();

    if (fetchErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tier = session.engagement_tier || 'launchpad';
    let directions;

    if (tier === 'quick_build') {
      directions = await generateTier1(session);
    } else if (tier === 'full_engagement') {
      directions = await generateTier3(session);
    } else {
      directions = await generateTier2(session);
    }

    // Write mockup_tier to session
    await supabase.from('sessions').update({ mockup_tier: tier }).eq('id', session_id);

    // Include CALENDLY_URL for Tier 3
    const calendlyUrl = process.env.CALENDLY_URL || null;

    return new Response(JSON.stringify({
      tier,
      directions,
      calendly_url: tier === 'full_engagement' ? calendlyUrl : null,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/mockups',
};
