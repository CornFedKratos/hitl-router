import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from './notify.mjs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 15 * 60 * 1000, // 15 minutes — Opus builds can take a while
});

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── HIT-65: Business category detection (used by non-CDO agents) ──
function detectBusinessCategory(partialAnswers) {
  const text = JSON.stringify(partialAnswers || {}).toLowerCase();
  if (text.includes('inspect') || text.includes('contractor') || text.includes('plumb') || text.includes('hvac') || text.includes('roofing') || text.includes('electric'))
    return 'professional_trades';
  if (text.includes('law') || text.includes('legal') || text.includes('attorney'))
    return 'legal_professional';
  if (text.includes('develop') || text.includes('software') || text.includes('saas') || text.includes('tech'))
    return 'tech_services';
  if (text.includes('restaurant') || text.includes('food') || text.includes('cafe') || text.includes('catering'))
    return 'food_hospitality';
  if (text.includes('health') || text.includes('medical') || text.includes('wellness') || text.includes('therapy') || text.includes('dental'))
    return 'health_wellness';
  if (text.includes('real estate') || text.includes('realtor') || text.includes('property'))
    return 'real_estate';
  return 'professional_services';
}

// ── HIT-79: Narrative brief for ALL agents — the client's voice, not extracted fields ──
function buildNarrativeBrief(ctx) {
  const pa = ctx.partial_answers || {};
  const muse = ctx.muse_answers || {};
  const businessName = (pa.business_name || '').split(/\s*[-–—]\s*/)[0].trim() || 'the client';
  const businessDesc = (pa.business_name || '').includes('-') ? (pa.business_name || '').split(/\s*[-–—]\s*/).slice(1).join(' — ').trim() : '';
  const lines = [];

  lines.push(`Project brief for ${businessName}.${businessDesc ? ` ${businessDesc}.` : ''}\n`);

  // All intake answers — narrative format
  if (pa.audience) lines.push(`Target audience: ${pa.audience}`);
  if (pa.goal) lines.push(`Primary goal: ${pa.goal}`);
  if (pa.feeling) lines.push(`Brand feeling: ${pa.feeling}`);
  if (pa.style) lines.push(`Style preferences: ${pa.style}`);
  if (ctx.problem) lines.push(`Problem: ${ctx.problem}`);
  if (ctx.solution) lines.push(`Solution: ${ctx.solution}`);
  if (pa.success) lines.push(`Success looks like: ${pa.success}`);
  if (pa.client) lines.push(`Project type: ${pa.client}`);
  if (pa.timeline) lines.push(`Timeline: ${pa.timeline}`);
  if (pa.stakeholders) lines.push(`Decision makers: ${pa.stakeholders}`);
  if (pa.existing_systems) lines.push(`Existing systems: ${pa.existing_systems}`);
  if (pa.constraints) lines.push(`Technical constraints: ${pa.constraints}`);

  // Muse design preferences if available
  const hasMuse = muse.inspiration || muse.emotion || muse.avoid || muse.personality;
  if (hasMuse) {
    lines.push('\nDesign preferences:');
    if (muse.inspiration) lines.push(`Sites they admire: ${muse.inspiration}`);
    if (muse.emotion && Array.isArray(muse.emotion)) lines.push(`Want visitors to feel: ${muse.emotion.join(', ')}`);
    if (muse.avoid) lines.push(`Don't want: ${muse.avoid}`);
    if (muse.personality) lines.push(`Brand personality: "${muse.personality}"`);
  }

  // Carl's synthesis if available
  if (ctx.design_intent) {
    lines.push(`\nCreative direction:\n${ctx.design_intent}`);
  }

  // Selected direction
  const directions = (ctx.mockup_results || {}).directions || [];
  const selectedDir = directions.find(d => d.id === ctx.direction);
  if (selectedDir) {
    lines.push(`\nSelected direction: "${selectedDir.name}"`);
    if (selectedDir.framing || selectedDir.vision) lines.push(selectedDir.framing || selectedDir.vision);
  }

  // Contact
  if (ctx.lead_name) lines.push(`\nContact: ${ctx.lead_name}`);
  if (ctx.lead_email) lines.push(`Email: ${ctx.lead_email}`);

  return lines.join('\n');
}

// ── HIT-72/73: Q&A creative brief for CDO — the client's voice ──

const INTAKE_QUESTIONS = {
  business_name: "What's the name of your business and what do you do?",
  audience: "Who are your best customers?",
  goal: "What's the #1 thing you want people to do when they find you online?",
  feeling: "How should your brand feel? Give me three words.",
  style: "Any styles, colors, or looks you love — or definitely want to avoid?",
  problem: "What problem are you trying to solve?",
  solution: "What's the solution you're imagining?",
  success: "What does success look like for this project?",
  client: "Who is this project for?",
  timeline: "What's your timeline?",
  stakeholders: "Who else is involved?",
  existing_systems: "Are there existing systems this needs to connect to?",
  constraints: "Any technical constraints we should know about?",
};

const MUSE_QUESTIONS = {
  inspiration: "Are there any websites, brands, or businesses whose look and feel you admire?",
  emotion: "When someone lands on your site, what's the first thing you want them to feel?",
  avoid: "Is there anything you've seen that you definitely don't want?",
  personality: "If your business were a person, how would you describe them in one sentence?",
};

const THIS_OR_THAT_PAIRS = [
  { a: { label: 'Clean & Minimal', desc: 'Like Stripe or Linear — lots of whitespace, simple, editorial' }, b: { label: 'Warm & Personal', desc: 'Like Mailchimp or Basecamp — friendly, approachable, human' } },
  { a: { label: 'Bold & Dramatic', desc: 'Strong contrast, large type, high energy' }, b: { label: 'Soft & Trustworthy', desc: 'Gentle colors, rounded shapes, professional calm' } },
  { a: { label: 'Photography-led', desc: 'Big images tell the story' }, b: { label: 'Typography-led', desc: 'Words and layout do the heavy lifting' } },
];

function buildCreativeBrief(ctx) {
  const pa = ctx.partial_answers || {};
  const muse = ctx.muse_answers || {};
  const lines = [];

  // Extract just the business name (before any dash/description)
  const businessName = (pa.business_name || '').split(/\s*[-–—]\s*/)[0].trim() || 'the business';
  const businessDesc = (pa.business_name || '').includes('-') ? (pa.business_name || '').split(/\s*[-–—]\s*/).slice(1).join(' — ').trim() : '';

  // Narrative opening — not a form, a briefing
  lines.push(`We're building a website for ${businessName}.${businessDesc ? ` ${businessDesc}.` : ''}`);
  lines.push(`This is a paying client who chose to invest in a custom-built site. The output will be downloaded, deployed, and shown to their customers. It needs to be extraordinary.\n`);

  // Client's own words — organized by topic, not by form field
  if (pa.audience) lines.push(`Their target audience: ${pa.audience}`);
  if (pa.goal) lines.push(`The #1 thing they want visitors to do: ${pa.goal}`);
  if (pa.feeling) lines.push(`How the brand should feel: ${pa.feeling}`);
  if (pa.style) lines.push(`Style preferences: ${pa.style}`);
  if (ctx.problem) lines.push(`The problem they're solving: ${ctx.problem}`);
  if (ctx.solution) lines.push(`Their solution: ${ctx.solution}`);
  if (pa.timeline) lines.push(`Timeline: ${pa.timeline}`);

  // Muse design preferences — narrative, not Q&A
  const hasMuse = muse.inspiration || muse.emotion || muse.avoid || muse.personality ||
    Object.keys(muse).some(k => k.startsWith('this_or_that_'));

  if (hasMuse) {
    lines.push('\nDesign preferences (in the client\'s own words):');

    if (muse.inspiration) lines.push(`Sites they admire: ${muse.inspiration}`);

    for (const [key, val] of Object.entries(muse)) {
      if (key.startsWith('this_or_that_')) {
        const pairIdx = parseInt(key.split('_').pop(), 10);
        const pair = THIS_OR_THAT_PAIRS[pairIdx];
        if (pair && pair[val]) {
          const rejected = val === 'a' ? pair.b : pair.a;
          lines.push(`They prefer "${pair[val].label}" (${pair[val].desc}) over "${rejected.label}"`);
        }
      }
    }

    if (muse.emotion && Array.isArray(muse.emotion) && muse.emotion.length > 0) {
      lines.push(`First impression they want visitors to feel: ${muse.emotion.join(', ')}`);
    }
    if (muse.avoid) lines.push(`What they definitely don't want: ${muse.avoid}`);
    if (muse.personality) lines.push(`If their business were a person: "${muse.personality}"`);
  }

  // Carl's synthesis — the creative direction
  if (ctx.design_intent) {
    lines.push(`\nOur creative director's design direction:\n${ctx.design_intent}`);
  }

  // Selected direction
  const dirId = ctx.direction;
  const directions = (ctx.mockup_results || {}).directions || [];
  const selectedDir = directions.find(d => d.id === dirId);
  if (selectedDir) {
    lines.push(`\nFrom three directions we presented, they selected: "${selectedDir.name}"`);
    if (selectedDir.framing || selectedDir.vision) lines.push(selectedDir.framing || selectedDir.vision);
  }

  // Contact details
  lines.push(`\nContact details to display on the site:`);
  if (ctx.lead_name) lines.push(`Name: ${ctx.lead_name}`);
  if (ctx.lead_email) lines.push(`Email: ${ctx.lead_email}`);

  return lines.join('\n');
}

// ── Agent definitions ──

const AGENTS = [
  { role: 'CPO', name: 'Chief Product Officer', tone: 'warm, strategic',
    task: (tier, ctx) => {
      const brief = buildNarrativeBrief(ctx);
      return `You are the CPO opening the build. Here is everything the client told us:

${brief}

Tier: ${tier}

Write a brief (3-4 sentences) strategic summary confirming what we're building, for whom, and why it matters. Use their actual business name, reference their audience and their specific pain points. Never invent details they didn't provide. End with: "I'm handing this to our CTO to scope the technical approach."`;
    }},
  { role: 'CTO', name: 'Chief Technology Officer', tone: 'precise, technical',
    task: (tier, ctx) => {
      const brief = buildNarrativeBrief(ctx);
      return tier === 'quick_build'
        ? `You are the CTO scoping a Quick Build website. Here is the full client brief:

${brief}

Generate:
1. Technical approach (2-3 sentences — reference the actual business and what they need)
2. Page structure (based on what THIS client needs, not a generic template)
3. Key features to implement (derived from their stated goal and audience)
4. Any flags or risks

End with handoff to CDO: "Handing to our CDO to bring this to life."`
        : `You are the CTO scoping a Launchpad project. Here is the full client brief:

${brief}

Generate:
1. Technical approach (3-4 sentences referencing their specific situation)
2. Feature/epic list (5-8 items specific to THIS project, not generic)
3. Recommended tech stack (justified by their constraints and goals)
4. Complexity assessment and risks

End with handoff to CDO.`;
    }},
  { role: 'CDO', name: 'Chief Design Officer', tone: 'creative, visual',
    task: (tier, ctx) => {
      if (tier !== 'quick_build') {
        const brief = buildNarrativeBrief(ctx);
        return `Here is everything a client told us about their project:

${brief}

Create a design direction for this specific project. Use everything they told you — their personality, their competitors, their audience's pain, their inspiration references. Nothing they said should go unused.

Generate:
1. UI/UX direction narrative — visual style, interaction philosophy, specific to THIS client
2. Key screen descriptions (3-4 screens with content derived from their brief)
3. Design system (colors, typography, component patterns — derived from their emotional brief, not generic)
4. Accessibility considerations

Hand off to CQO.`;
      }

      // Return ONLY the brief — the single-call Opus process adds its own instructions
      return buildCreativeBrief(ctx);
    }},
  { role: 'CQO', name: 'Chief Quality Officer', tone: 'exacting, quality-focused',
    task: (tier, ctx, prev) => {
      const pa = ctx.partial_answers || {};
      const businessName = (pa.business_name || '').split(/\s*[-–—]\s*/)[0].trim();
      return `You are the CQO reviewing the CDO's output.

VALIDATION CHECKLIST — verify the output contains:
${businessName ? `- Business name "${businessName}" appears in the output` : ''}
${pa.audience ? `- Audience "${pa.audience}" is addressed` : ''}
${pa.goal ? `- Primary goal "${pa.goal}" is supported by the design` : ''}
- No placeholder/generic content (e.g., "John Doe", "Lorem ipsum", "Acme Corp", "100% satisfaction")
- No fabricated testimonials or portfolio projects
- All sections populated with real business data
- Contact form is present and functional
- Every contact method from the brief is displayed

CDO output to review:
${(prev || '').substring(0, 12000)}

If the output uses the real business data throughout: "Approved — quality gate passed. Handing to CIO."
If generic/placeholder/fabricated content is found: flag the specific sections. Hand off to CIO.`;
    }},
  { role: 'CIO', name: 'Chief Infrastructure Officer', tone: 'organized, systems-focused',
    task: (tier, ctx) => {
      const brief = buildNarrativeBrief(ctx);
      return tier === 'quick_build'
        ? `You are the CIO packaging the deliverables. Here is the full client brief:

${brief}

Generate a project summary document that references their actual business, audience, and goals throughout. Never use generic language — this document will be delivered to the client.

1. Project Overview — the actual business, what was built, and for whom
2. What Was Delivered — list of deliverables with descriptions
3. Deployment Notes — how to host this HTML file (Netlify, Vercel, any static host)
4. Recommended Next Steps — custom domain, hosting, form handling, analytics, ongoing updates

Format as clean markdown. Hand off to CSO.`
        : `You are the CIO generating the spec package. Here is the full client brief:

${brief}

Generate a comprehensive spec package that reflects everything the client told us. Use their language. Reference their specific situation.

1. PRD — problem, goals, user stories, success metrics (all specific to THIS project)
2. Feature Specifications — each feature with acceptance criteria
3. Glossary — key terms defined
4. Risk Log — identified risks with mitigation strategies
5. Prioritized Roadmap — MVP → v1 → v2

Format as clean markdown. Hand off to CSO.`;
    }},
  { role: 'CSO', name: 'Chief Security Officer', tone: 'measured, risk-aware',
    task: (tier, ctx) => {
      const brief = buildNarrativeBrief(ctx);
      return tier === 'quick_build'
        ? `You are the CSO. Final security and compliance review.

${brief}

Review the deliverables for:
1. Contact form safety (action="#" is acceptable for a static prototype)
2. No third-party scripts or tracking without disclosure
3. No PII collection beyond what's expected (name, email, phone via form)
4. Accessibility — alt text, semantic structure, keyboard navigation

If clear: "Security review passed. No concerns. Build complete."
If flags: note them with recommendations. Then: "Build complete — flagged items noted for review."`
        : `You are the CSO. Security review of the spec package.

${brief}

Check for:
1. Features involving authentication, payments, or PII
2. Compliance-sensitive requirements (HIPAA, GDPR, PCI, etc.)
3. Third-party integration risks
4. Data storage and privacy considerations

Note findings with recommendations. Close: "Security review complete. Build complete."`;
    }},
];

// ── Background function handler ──

export default async (req) => {
  let session_id = null;

  try {
    const body = await req.json();
    session_id = body.session_id;
    if (!session_id) return new Response('session_id required', { status: 400 });

    // Verify payment
    const { data: session, error } = await supabase
      .from('sessions').select('*').eq('id', session_id).single();

    if (error || !session) {
      await supabase.from('sessions').update({
        build_phase: 'failed',
        build_results: { status: 'failed', error: 'Session not found' },
      }).eq('id', session_id);
      return new Response('Session not found', { status: 404 });
    }

    if (!session.payment_confirmed) {
      await supabase.from('sessions').update({
        build_phase: 'failed',
        build_results: { status: 'failed', error: 'Payment not confirmed' },
      }).eq('id', session_id);
      return new Response('Payment not confirmed', { status: 402 });
    }

    // Mark build started
    await supabase.from('sessions').update({
      build_results: null,
      build_engine_used: true,
      build_phase: 'cpo',
    }).eq('id', session_id);

    const tier = session.engagement_tier || 'launchpad';
    const ctx = {
      problem: session.problem || 'Not specified',
      solution: session.solution || 'Not specified',
      audience: session.audience || 'Not specified',
      direction: session.mockup_direction_selected || 'A',
      partial_answers: session.partial_answers || {},
      lead_name: session.lead_name || '',
      lead_email: session.lead_email || '',
      design_intent: session.design_intent || '',
      muse_answers: session.muse_answers || {},
      mockup_results: session.mockup_results || {},
    };

    const outputs = {};

    for (let i = 0; i < AGENTS.length; i++) {
      const agent = AGENTS[i];
      const prevOutput = i > 0 ? outputs[AGENTS[i - 1].role] || '' : '';

      await supabase.from('sessions').update({ build_phase: agent.role.toLowerCase() }).eq('id', session_id);

      const prompt = agent.task(tier, ctx, prevOutput);

      try {
        // ── CDO: Opus for all tiers ──
        if (agent.role === 'CDO' && tier === 'quick_build') {
          await supabase.from('sessions').update({ build_phase: 'cdo_build' }).eq('id', session_id);

          const cdoSystem = `You build websites that make clients emotional. You are an elite designer and front-end developer. Your output is a $25,000 agency-quality, one-of-a-kind website — not a template.`;

          const cdoPrompt = `A paying client invested in a custom website. Here is their complete brief — every answer they gave us, their design preferences, and our creative director's synthesis. Read it deeply. Their voice matters more than any instruction.

${prompt}

Now build their website. One complete HTML file. Make them feel like someone finally understood them.

USE EVERYTHING: The client told you about their competitors, their personality, their audience's pain, their inspiration sites, what they love, what they hate. Nothing they said should go unused. If they named competitors, position against them. If they described their personality, put it in the copy. If they said what their audience has been through, speak directly to that experience. Every answer they gave should be reflected somewhere in the site — in the copy, in the design choices, in the sections you build. The depth of this site should match the depth of what they shared with us.

The quality bar is a $25,000 agency build. Here is what that means in practice:

TYPOGRAPHY: Choose 2-3 Google Fonts with personality that match this specific client — a display/serif for headlines, a clean sans for body, and a mono for labels and accents. Not Inter. Not system fonts. Typography carries the design — weight contrast, letter-spacing, and line-height should all feel intentional. Use clamp() for fluid sizing.

TEXTURE & DEPTH: The site should feel physical, not flat. Choose the techniques that serve THIS client's brief. Some examples to consider (but you are not limited to these): animated grain/noise overlay with keyframe shifting, subtle background patterns with CSS mask, radial gradient glows, layered shadows, backdrop-filter, mix-blend-mode, CSS scroll-snap, animated SVG backgrounds, parallax depth layers. Use what fits. Invent what's missing.

COLOR: Derive your palette from the client's emotional brief — not from a generic category. Use CSS custom properties. Include at least one dark-background section to break the visual rhythm and create contrast. Every color should feel derived from what the client told you.

SECTIONS: This client gave you enough information to build 10+ meaningful sections — not padding, but depth. Think about what serves them: a hero that stops the scroll, a trust stat strip, an empathy section that speaks to their specific pain (using their audience's actual frustrations), their approach/process, their services (with inline SVG icons), how they're different from competitors they named, a philosophy or personality moment that reflects who they told you they are, a contact section with every method displayed, and a footer. Add editorial elements (marquee strips, pull quotes, dark contrast sections) where they serve the narrative. Every section should have its own distinct visual treatment.

INTERACTIONS: Make the site feel alive and considered. Scroll-triggered reveals with staggered timing. Hover states on every interactive element. Beyond that, choose signature interactions that match the client's personality. Some examples (not an exhaustive list): custom cursor with ring follower, magnetic buttons, line-by-line text reveal animations, parallax, animated underlines, gradient text, scroll-linked progress, animated counters, tilt effects, smooth section snapping. You know techniques we haven't listed — use them if they serve the client.

COPY: Write in second person. Every headline should speak to THIS client's specific situation — their pain, their audience, their personality. Use their own language where possible. If they said their business is "the expert who doesn't let anyone know they are the expert until they ask" — that should be in the site somewhere. If their audience has "been burnt by other agencies" — speak directly to that wound. The copy should feel like it was written by someone who read every word of the brief and cared about getting it right.

CONTENT INTEGRITY: Never invent statistics, testimonials, portfolio projects, or content the client didn't provide. If you don't have real data, build something better instead — a credibility statement, a philosophy moment, a direct address to the reader's skepticism. Stats must be real or reframed cleverly. Use inline SVG for all icons.

TECHNICAL: Complete self-contained HTML — all CSS in <style>, all JS in <script>. Import Google Fonts via <link>. Mobile responsive with @media queries. Working contact form (action="#"). Semantic HTML5. No emoji icons.

The minimum is 1,500 lines — but the depth of the client's brief supports 2,000+. Not because length matters, but because this client gave you enough to build something with real substance. Every section should have its own visual personality. Every interaction should feel considered. Every build should feel like a one-of-a-kind creation that could only exist for this specific client.

Output ONLY the raw HTML. No markdown fences. No explanation. No preamble.`;

          // Log the prompt
          await supabase.from('kb_entries').insert({
            session_id, phase: 1, entry_type: 'session', visibility: 'internal',
            author: 'CDO_PROMPT',
            summary: 'CDO Prompt — Single-Call Opus',
            details: `SYSTEM: ${cdoSystem}\n\nUSER:\n${cdoPrompt}`.substring(0, 50000),
          });

          const cdoStream = anthropic.messages.stream({
            model: 'claude-opus-4-20250514',
            max_tokens: 32000,
            system: cdoSystem,
            messages: [{ role: 'user', content: cdoPrompt }],
          });

          const cdoResponse = await cdoStream.finalMessage();

          let cdoOutput = cdoResponse.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('') || '';

          // Strip markdown fences if present
          cdoOutput = cdoOutput.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

          outputs[agent.role] = cdoOutput;

        } else if (agent.role === 'CDO' && tier !== 'quick_build') {
          // CDO launchpad/full_engagement: Opus with streaming, narrative brief
          await supabase.from('sessions').update({ build_phase: 'cdo_design' }).eq('id', session_id);

          const cdoSpecSystem = `You are an elite creative director producing a design direction document. Use everything the client told you. Nothing they said should go unused.`;
          const cdoSpecPrompt = prompt; // Already built by CDO task with narrative brief

          await supabase.from('kb_entries').insert({
            session_id, phase: 1, entry_type: 'session', visibility: 'internal',
            author: 'CDO_PROMPT',
            summary: 'CDO Prompt — Launchpad/Full Engagement (Opus)',
            details: `SYSTEM: ${cdoSpecSystem}\n\nUSER:\n${cdoSpecPrompt}`.substring(0, 50000),
          });

          const cdoSpecStream = anthropic.messages.stream({
            model: 'claude-opus-4-20250514',
            max_tokens: 8000,
            system: cdoSpecSystem,
            messages: [{ role: 'user', content: cdoSpecPrompt }],
          });

          const cdoSpecResponse = await cdoSpecStream.finalMessage();
          outputs[agent.role] = cdoSpecResponse.content[0]?.text || '';

        } else {
          // All other agents: standard Sonnet call
          const systemPrompt = `You are the ${agent.name}. Tone: ${agent.tone}. Be concise and deliver directly.`;

          await supabase.from('kb_entries').insert({
            session_id, phase: 1, entry_type: 'session', visibility: 'internal',
            author: `${agent.role}_PROMPT`,
            summary: `${agent.name} — Prompt Sent`,
            details: `=== SYSTEM PROMPT ===\n${systemPrompt}\n=== END SYSTEM ===\n\n=== USER PROMPT ===\n${prompt}\n=== END USER PROMPT ===`.substring(0, 50000),
          });

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
          });
          outputs[agent.role] = response.content[0]?.text || '';
        }
      } catch (agentErr) {
        outputs[agent.role] = `[${agent.role} error: ${agentErr.message}]`;
      }

      await supabase.from('kb_entries').insert({
        session_id, phase: 1, entry_type: 'session', visibility: 'both',
        author: agent.role,
        summary: `${agent.name} — Build Output`,
        details: (outputs[agent.role] || '').substring(0, 10000),
      });

      // Validate CDO output contains actual business content
      if (agent.role === 'CDO' && tier === 'quick_build') {
        const cdoOutput = outputs.CDO || '';
        const businessName = (ctx.partial_answers?.business_name || '').toLowerCase();
        if (businessName && businessName.length > 2 && !cdoOutput.toLowerCase().includes(businessName.split(/\s*[-–—]\s*/)[0].trim())) {
          console.warn(`CDO output missing business name — output may be generic`);
        }
      }
    }

    await supabase.from('sessions').update({
      build_phase: 'complete',
      build_completed_at: new Date().toISOString(),
      build_results: { status: 'complete', tier, outputs },
    }).eq('id', session_id);

    sendNotification('build_complete', {
      session_id, lead_name: session.lead_name, lead_email: session.lead_email,
      problem: session.problem, tier, payment_amount: session.payment_amount,
    });
    if (session.lead_email) {
      sendNotification('phase0_complete', {
        session_id, lead_email: session.lead_email,
        problem: session.problem, solution: session.solution, audience: session.audience,
      });
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('build-engine failed:', err.message);
    if (session_id) {
      try {
        await supabase.from('sessions').update({
          build_phase: 'failed',
          build_results: { status: 'failed', error: err.message },
        }).eq('id', session_id);
      } catch (writeErr) {
        console.error('Failed to write failure state:', writeErr.message);
      }
    }
    return new Response(err.message, { status: 500 });
  }
};
