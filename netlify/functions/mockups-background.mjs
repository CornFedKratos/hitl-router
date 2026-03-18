import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── Tier 1: Quick Build — 3 genuinely distinct directions ──

const TIER1_DIRECTION_BRIEFS = [
  { id: 'A', brief: 'Direction A should feel warm, human, and trustworthy. The kind of site that makes you feel safe hiring this person. Think rounded shapes, soft palette, approachable typography.' },
  { id: 'B', brief: 'Direction B should feel sharp, precise, and confident. Apple-inspired restraint. Typography does the heavy lifting. Minimal decoration, maximum clarity.' },
  { id: 'C', brief: 'Direction C should feel bold, modern, and premium. High contrast, dramatic type, unexpected design choices. The kind of site that makes you stop scrolling.' },
];

async function generateTier1(session) {
  const clientBrief = buildClientBrief(session);
  return Promise.all(TIER1_DIRECTION_BRIEFS.map(async (dir) => {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 8192,
        system: `You are an elite web designer building a website prototype for a real client.`,
        messages: [{ role: 'user', content: `${clientBrief}\n\n${dir.brief}\n\nBuild a complete, self-contained HTML prototype (CSS in <style>, no external dependencies, system font stack, responsive, under 8KB). Use the client's actual business name and content — never invent placeholder content. Include a contact form (action="#") and display their contact info.\n\nOutput only the raw HTML.` }],
      });
      // Extract a name and description from the output for the direction card
      const content = response.content[0]?.text || '';
      const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
      return { id: dir.id, name: extractDirectionName(content, dir.id), desc: extractDirectionDesc(content), type: 'html', content };
    } catch (err) {
      return { id: dir.id, name: `Direction ${dir.id}`, desc: '', type: 'html', content: null, error: err.message };
    }
  }));
}

function extractDirectionName(html, fallbackId) {
  // Try to get a meaningful name from the page title or hero
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch && titleMatch[1] && titleMatch[1].length < 60) return titleMatch[1];
  return `Direction ${fallbackId}`;
}

function extractDirectionDesc(html) {
  // Try to get the meta description
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (metaMatch && metaMatch[1]) return metaMatch[1].substring(0, 120);
  return '';
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

// ── Q&A brief for mockup generator — same philosophy as build engine ──

const MOCKUP_INTAKE_QUESTIONS = {
  business_name: "What's the name of your business and what do you do?",
  audience: "Who are your best customers?",
  goal: "What's the #1 thing you want people to do when they find you online?",
  feeling: "How should your brand feel?",
  style: "Any styles, colors, or looks you love — or want to avoid?",
  problem: "What problem are you trying to solve?",
  solution: "What's the solution you're imagining?",
  success: "What does success look like?",
  timeline: "What's your timeline?",
};

function buildClientBrief(session) {
  const pa = session.partial_answers || {};
  const lines = ['A real client told us about their project. Here are their exact answers:\n'];

  for (const [key, question] of Object.entries(MOCKUP_INTAKE_QUESTIONS)) {
    const answer = pa[key] || session[key];
    if (answer) lines.push(`Q: ${question}\nA: ${answer}\n`);
  }

  if (session.lead_name) lines.push(`Contact: ${session.lead_name}`);
  if (session.lead_email) lines.push(`Email: ${session.lead_email}`);

  return lines.join('\n');
}

// Keep old function for tier 2/3 which still use it
function buildContentBlock(session) {
  return buildClientBrief(session);
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
