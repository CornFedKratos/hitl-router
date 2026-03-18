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

// ── Build session content block for non-CDO agents (CPO, CTO, CIO, CSO) ──
function buildSessionContent(ctx) {
  const pa = ctx.partial_answers || {};
  const lines = ['=== BUSINESS CONTENT (use this, never invent placeholder content) ==='];

  // Design path fields
  if (pa.business_name) lines.push(`Business Name: ${pa.business_name}`);
  if (pa.audience) lines.push(`Audience: ${pa.audience}`);
  if (pa.goal) lines.push(`Primary Goal: ${pa.goal}`);
  if (pa.feeling) lines.push(`Brand Feeling: ${pa.feeling}`);
  if (pa.style) lines.push(`Style Notes: ${pa.style}`);

  // Tech path fields
  if (ctx.problem) lines.push(`Problem: ${ctx.problem}`);
  if (ctx.solution) lines.push(`Solution: ${ctx.solution}`);
  if (ctx.audience && !pa.audience) lines.push(`Audience: ${ctx.audience}`);

  // Shared fields
  if (pa.timeline) lines.push(`Timeline: ${pa.timeline}`);
  if (pa.stakeholders) lines.push(`Stakeholders: ${pa.stakeholders}`);
  if (pa.existing_systems) lines.push(`Existing Systems: ${pa.existing_systems}`);
  if (pa.client) lines.push(`Project Type: ${pa.client}`);
  if (pa.constraints) lines.push(`Constraints: ${pa.constraints}`);

  // Contact info
  if (ctx.lead_email) lines.push(`Email: ${ctx.lead_email}`);
  if (ctx.lead_name) lines.push(`Contact Name: ${ctx.lead_name}`);

  lines.push(`Selected Direction: ${ctx.direction}`);
  lines.push('=== END BUSINESS CONTENT ===');

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
      const content = buildSessionContent(ctx);
      return `You are the CPO opening the build. Summarize what this lead told us and confirm the build plan.

${content}

Tier: ${tier}

Write a brief (3-4 sentences) strategic summary confirming what we're building, for whom, and why it matters. Reference the actual business name and audience. End with: "I'm handing this to our CTO to scope the technical approach."`;
    }},
  { role: 'CTO', name: 'Chief Technology Officer', tone: 'precise, technical',
    task: (tier, ctx) => {
      const content = buildSessionContent(ctx);
      return tier === 'quick_build'
        ? `You are the CTO scoping a Quick Build website.

${content}

Generate:
1. Technical approach (2-3 sentences — reference the actual business and what they need)
2. Page structure (hero, services, about, contact form — populated with their real content)
3. Key features to implement (based on their stated goal and audience)
4. Any flags or risks

End with handoff to CDO: "Handing to our CDO to bring this to life."`
        : `You are the CTO scoping a Launchpad project.

${content}

Generate:
1. Technical approach (3-4 sentences)
2. Feature/epic list (5-8 items specific to this project)
3. Recommended tech stack
4. Complexity assessment and risks

End with handoff to CDO.`;
    }},
  { role: 'CDO', name: 'Chief Design Officer', tone: 'creative, visual',
    task: (tier, ctx) => {
      if (tier !== 'quick_build') {
        const content = buildSessionContent(ctx);
        return `You are the CDO creating a design direction for this specific project.

${content}

Generate:
1. UI/UX direction narrative — visual style, interaction philosophy, specific to this project
2. Key screen descriptions (3-4 screens with layout and content from the data above)
3. Design system basics (colors, typography, component patterns)
4. Accessibility considerations

Hand off to CQO.`;
      }

      // Return ONLY the brief — the two-step Opus process adds its own instructions
      return buildCreativeBrief(ctx);
    }},
  { role: 'CQO', name: 'Chief Quality Officer', tone: 'exacting, quality-focused',
    task: (tier, ctx, prev) => {
      const pa = ctx.partial_answers || {};
      return `You are the CQO reviewing the CDO's output.

VALIDATION CHECKLIST — verify the output contains:
${pa.business_name ? `- Business name "${pa.business_name}" appears in the HTML` : ''}
${pa.audience ? `- Audience "${pa.audience}" is addressed` : ''}
${pa.goal ? `- Primary goal "${pa.goal}" is supported by the design` : ''}
- Contact form is present and functional
- No placeholder/generic content (e.g., "John Doe", "Lorem ipsum", "Acme Corp")
- All sections populated with real business data

CDO output to review:
${(prev || '').substring(0, 8000)}

If the output uses the real business data throughout: "Approved — quality gate passed. Handing to CIO."
If generic/placeholder content is found: flag the specific sections that need real data. Hand off to CIO.`;
    }},
  { role: 'CIO', name: 'Chief Infrastructure Officer', tone: 'organized, systems-focused',
    task: (tier, ctx) => {
      const content = buildSessionContent(ctx);
      return tier === 'quick_build'
        ? `You are the CIO packaging the deliverables for this project.

${content}

Generate a project summary document:
1. Project Overview — the actual business, what was built, and for whom
2. What Was Delivered — list of deliverables with descriptions
3. Deployment Notes — how to host this HTML file (Netlify, Vercel, any static host)
4. Recommended Next Steps — custom domain, hosting, form handling, analytics, ongoing updates

Format as clean markdown. Reference the actual business name throughout. Hand off to CSO.`
        : `You are the CIO generating the spec package.

${content}

Generate:
1. PRD — problem, goals, user stories, success metrics (all specific to this project)
2. Feature Specifications — each feature with acceptance criteria in Gherkin format
3. Glossary — key terms defined
4. Risk Log — identified risks with mitigation strategies
5. Prioritized Roadmap — MVP → v1 → v2

Format as clean markdown. Hand off to CSO.`;
    }},
  { role: 'CSO', name: 'Chief Security Officer', tone: 'measured, risk-aware',
    task: (tier, ctx) => {
      const content = buildSessionContent(ctx);
      return tier === 'quick_build'
        ? `You are the CSO. Final security and compliance review.

${content}

Review the deliverables for:
1. Contact form safety (action="#" is acceptable for a static prototype)
2. No third-party scripts or tracking without disclosure
3. No PII collection beyond what's expected (name, email, phone via form)
4. Accessibility — alt text, semantic structure, keyboard navigation

If clear: "Security review passed. No concerns. Build complete."
If flags: note them with recommendations. Then: "Build complete — flagged items noted for review."`
        : `You are the CSO. Security review of the spec package.

${content}

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
        // ── CDO: Single-call Opus — rich brief + quality reference ──
        if (agent.role === 'CDO' && tier === 'quick_build') {
          await supabase.from('sessions').update({ build_phase: 'cdo_build' }).eq('id', session_id);

          const cdoSystem = `You build websites that make clients emotional. You are an elite designer and front-end developer. Your output is a $25,000 agency-quality, one-of-a-kind website — not a template. You write 1500+ lines of considered, craft-level HTML/CSS/JS.`;

          const cdoPrompt = `A paying client invested in a custom website. Here is their complete brief — every answer they gave us, their design preferences, and our creative director's synthesis. Read it deeply. Their voice matters more than any instruction.

${prompt}

Now build their website. One complete HTML file. Make them feel like someone finally understood them.

The quality bar is a $25,000 agency build. Here is what that means in practice:

TYPOGRAPHY: Choose 2-3 Google Fonts with personality that match this specific client. Not Inter. Not system fonts. Typography carries the design — weight contrast, letter-spacing, and line-height should all feel intentional. Use clamp() for fluid sizing.

TEXTURE & DEPTH: The site should feel physical, not flat. Choose the techniques that serve THIS client's brief. Some examples to consider (but you are not limited to these): animated grain/noise overlay, subtle background patterns with CSS mask, radial gradient glows, layered shadows, backdrop-filter, mix-blend-mode, CSS scroll-snap, animated SVG backgrounds, parallax depth layers. Use what fits. Invent what's missing.

COLOR: Derive your palette from the client's emotional brief — not from a generic category. Use CSS custom properties. Consider whether a dark-background section somewhere would create visual rhythm. Every color should feel derived from what the client told you.

SECTIONS: Build as many sections as this client needs — at least 8, each with its own visual treatment. Think about what actually serves them: a hero that stops the scroll, trust signals, empathy that speaks to their specific pain, their process, their services (with inline SVG icons, not emoji or text abbreviations), a moment of personality or philosophy, contact with every method displayed, and a footer. Add editorial elements (marquee, pull quotes, stat strips) where they serve the narrative.

INTERACTIONS: Make the site feel alive and considered. Scroll-triggered reveals with staggered timing. Hover states on every interactive element. Beyond that, choose signature interactions that match the client's personality. Some examples (not an exhaustive list): custom cursor with follower, magnetic buttons, text reveal animations, parallax, animated underlines, gradient text, scroll-linked progress, animated counters, tilt effects, smooth section snapping. You know techniques we haven't listed — use them if they serve the client.

COPY: Write in second person. Every headline should speak to THIS client's specific situation — their pain, their audience, their personality. The copy should feel written by someone who deeply understood the brief. Reference their actual words where possible.

CONTENT INTEGRITY: Never invent statistics, testimonials, portfolio projects, or content the client didn't provide. If you don't have real data, build something better instead. Stats must be real or reframed as credibility statements. Use inline SVG for all icons.

TECHNICAL: Complete self-contained HTML — all CSS in <style>, all JS in <script>. Import Google Fonts via <link>. Mobile responsive with @media queries. Working contact form (action="#"). Semantic HTML5. No emoji icons.

This should be 1500+ lines. Not because length matters — because craft at this level requires depth. Every section should have its own visual personality. Every interaction should feel considered. Every build should feel like a one-of-a-kind creation for this specific client.

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
