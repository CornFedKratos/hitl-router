import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── Tier 1: Quick Build — 3 separate API calls ──

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
  { id: 'A', name: 'Warm & Trustworthy', desc: 'Soft, approachable, family-friendly',
    prompt: `STYLE DIRECTION: "Warm & Trustworthy"\n- Soft white background (#FAFAF8), warm neutrals, earthy green accents (#4A7C59)\n- Large hero section with trust signals prominent\n- Contact form above the fold\n- Rounded corners, warm shadows\n- Best for: home services, inspection, family businesses` },
  { id: 'B', name: 'Clean & Professional', desc: 'Structured, information-forward',
    prompt: `STYLE DIRECTION: "Clean & Professional"\n- White background (#FFFFFF), navy (#1E3A5F) and slate (#64748B) accents\n- Structured grid layout, clear service cards with borders\n- Information-forward, minimal decoration\n- Sharp corners, subtle shadows\n- Best for: professional services, B2B` },
  { id: 'C', name: 'Bold & Modern', desc: 'High contrast, premium feel',
    prompt: `STYLE DIRECTION: "Bold & Modern"\n- Dark header (#111827), high contrast with white content area\n- Large typography, strong visual hierarchy\n- Services as feature blocks with colored icon circles\n- Mixed radius, dramatic shadows\n- Best for: premium positioning, younger audience` },
];

async function generateTier1(session) {
  const contentBlock = buildContentBlock(session);
  return Promise.all(TIER1_DIRECTIONS.map(async (dir) => {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 8192,
        system: `${TIER1_BASE}\n\n${dir.prompt}`,
        messages: [{ role: 'user', content: contentBlock }],
      });
      return { id: dir.id, name: dir.name, desc: dir.desc, type: 'html', content: response.content[0]?.text || '' };
    } catch (err) {
      return { id: dir.id, name: dir.name, desc: dir.desc, type: 'html', content: null, error: err.message };
    }
  }));
}

// ── Tier 2: Launchpad ──

const TIER2_PROMPT = `You are the Chief Product Officer in the HITL-AI-DLC methodology.
Generate 3 concept direction cards for a Launchpad-tier project. Each offers a distinct strategic approach.

DIRECTION APPROACHES: "Automate First" / "People-Centered" / "Data-Led"

For each: name (3-5 words), framing (2-3 sentences specific to project), features (4-5 items), approach (1 sentence).

OUTPUT: Return ONLY this JSON array:
[{"name":"...","framing":"...","features":["..."],"approach":"..."},...]`;

async function generateTier2(session) {
  const contentBlock = buildContentBlock(session);
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4096, system: TIER2_PROMPT,
      messages: [{ role: 'user', content: contentBlock }],
    });
    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const directions = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return directions.map((d, i) => ({ id: ['A', 'B', 'C'][i], name: d.name, type: 'card', framing: d.framing, features: d.features, approach: d.approach }));
  } catch (err) {
    return [{ id: 'A', name: 'Direction A', type: 'card', error: err.message }, { id: 'B', name: 'Direction B', type: 'card', error: err.message }, { id: 'C', name: 'Direction C', type: 'card', error: err.message }];
  }
}

// ── Tier 3: Full Engagement ──

const TIER3_PROMPT = `You are the Chief Product Officer. Generate 3 vision-level strategic direction cards for a Full Engagement project.

APPROACHES: "Build Fast & Iterate" / "Platform First" / "Human-Led with AI Assist"

For each: name (3-5 words), vision (2-3 sentences), pillars (3 items), roadmap (mvp/scale/evolve — 1 sentence each).

OUTPUT: Return ONLY this JSON array:
[{"name":"...","vision":"...","pillars":["..."],"roadmap":{"mvp":"...","scale":"...","evolve":"..."}},...]`;

async function generateTier3(session) {
  const contentBlock = buildContentBlock(session);
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4096, system: TIER3_PROMPT,
      messages: [{ role: 'user', content: contentBlock }],
    });
    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const directions = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return directions.map((d, i) => ({ id: ['A', 'B', 'C'][i], name: d.name, type: 'vision', vision: d.vision, pillars: d.pillars, roadmap: d.roadmap }));
  } catch (err) {
    return [{ id: 'A', name: 'Direction A', type: 'vision', error: err.message }, { id: 'B', name: 'Direction B', type: 'vision', error: err.message }, { id: 'C', name: 'Direction C', type: 'vision', error: err.message }];
  }
}

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

// ── Background function handler ──
// Netlify auto-returns 202 for background functions.
// The function continues running for up to 300s (configured in netlify.toml).

export default async (req) => {
  let sessionId = null;

  try {
    const body = await req.json();
    sessionId = body.session_id;

    if (!sessionId) return new Response('session_id required', { status: 400 });

    // Clear previous results, increment retry count if re-triggering
    const { data: existing } = await supabase
      .from('sessions').select('mockup_results, mockup_retry_count').eq('id', sessionId).single();

    const isRetry = existing?.mockup_results !== null && existing?.mockup_results !== undefined;
    const updateData = { mockup_results: null };
    if (isRetry) {
      updateData.mockup_retry_count = (existing.mockup_retry_count || 0) + 1;
    }
    await supabase.from('sessions').update(updateData).eq('id', sessionId);

    // Fetch full session
    const { data: session, error } = await supabase
      .from('sessions').select('*').eq('id', sessionId).single();

    if (error || !session) {
      await supabase.from('sessions').update({
        mockup_results: { status: 'failed', error: 'Session not found' },
      }).eq('id', sessionId);
      return new Response('Session not found', { status: 404 });
    }

    const tier = session.engagement_tier || 'launchpad';
    let directions;

    if (tier === 'quick_build') directions = await generateTier1(session);
    else if (tier === 'full_engagement') directions = await generateTier3(session);
    else directions = await generateTier2(session);

    const calendlyUrl = process.env.CALENDLY_URL || null;

    // Write results to Supabase
    await supabase.from('sessions').update({
      mockup_tier: tier,
      mockup_results: {
        status: 'complete',
        tier,
        directions,
        calendly_url: tier === 'full_engagement' ? calendlyUrl : null,
      },
    }).eq('id', sessionId);

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('mockups failed:', err.message);
    if (sessionId) {
      try {
        await supabase.from('sessions').update({
          mockup_results: { status: 'failed', error: err.message },
        }).eq('id', sessionId);
      } catch (writeErr) {
        console.error('Failed to write failure state:', writeErr.message);
      }
    }
    return new Response(err.message, { status: 500 });
  }
};

// No config.path — background functions use their filename as the route.
// Accessible at /.netlify/functions/mockups-background
// Redirected from /api/mockups-background via netlify.toml redirect rule.
