import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from './notify.mjs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── Build session content block for all agents ──
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
      const content = buildSessionContent(ctx);
      const pa = ctx.partial_answers || {};
      return tier === 'quick_build'
        ? `You are Carl, the CDO. Generate a complete, self-contained HTML website for this SPECIFIC business.

CRITICAL — CONTENT RULES:
- Use ONLY the business information provided below
- Do NOT invent placeholder businesses, names, services, or content
- Every section must be populated with the REAL business data
- The business name, services, location, and contact info must appear exactly as provided
- If a field is not provided, omit that section — do not fill it with generic placeholder text

TECHNICAL RULES:
- Complete, self-contained HTML with ALL CSS in a <style> tag
- NO external dependencies (no CDN, no Google Fonts, no external images)
- System font stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- Mobile-responsive with viewport meta tag
- Working contact form with action="#" and visible fields (name, email/phone, message)
- Keep total HTML under 12KB
- Semantic HTML5

${content}

REQUIRED SECTIONS (populate with the real data above):
1. Hero — business name${pa.feeling ? ', reflecting the "' + pa.feeling + '" brand feeling' : ''}
2. Services — list each service the business offers (from the data above)
3. About / Credibility — why customers should trust this business
4. Contact — form + any provided phone/email
5. Footer — business name, location if provided

Selected visual direction: ${ctx.direction}

Output ONLY the complete HTML. No markdown fences. No explanation.`
        : `You are the CDO creating a design direction for this specific project.

${content}

Generate:
1. UI/UX direction narrative — visual style, interaction philosophy, specific to this project
2. Key screen descriptions (3-4 screens with layout and content from the data above)
3. Design system basics (colors, typography, component patterns)
4. Accessibility considerations

Hand off to CQO.`;
    }},
  { role: 'CQO', name: 'Chief Quality Officer', tone: 'exacting, quality-focused',
    task: (tier, ctx, prev) => {
      const pa = ctx.partial_answers || {};
      const businessName = pa.business_name || ctx.problem || 'the business';
      return `You are the CQO reviewing the CDO's output.

VALIDATION CHECKLIST — verify the output contains:
${pa.business_name ? `- Business name "${pa.business_name}" appears in the HTML` : ''}
${pa.audience ? `- Audience "${pa.audience}" is addressed` : ''}
${pa.goal ? `- Primary goal "${pa.goal}" is supported by the design` : ''}
- Contact form is present and functional
- No placeholder/generic content (e.g., "John Doe", "Lorem ipsum", "Acme Corp")
- All sections populated with real business data

CDO output to review:
${(prev || '').substring(0, 3000)}

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

// Background function — Netlify auto-returns 202, function runs up to 300s.

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
    };

    const outputs = {};

    for (let i = 0; i < AGENTS.length; i++) {
      const agent = AGENTS[i];
      const prevOutput = i > 0 ? outputs[AGENTS[i - 1].role] || '' : '';

      await supabase.from('sessions').update({ build_phase: agent.role.toLowerCase() }).eq('id', session_id);

      const prompt = agent.task(tier, ctx, prevOutput);

      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: agent.role === 'CDO' ? 12000 : 4096,
          system: `You are the ${agent.name}. Tone: ${agent.tone}. Be concise and deliver directly.`,
          messages: [{ role: 'user', content: prompt }],
        });
        outputs[agent.role] = response.content[0]?.text || '';
      } catch (agentErr) {
        outputs[agent.role] = `[${agent.role} error: ${agentErr.message}]`;
      }

      await supabase.from('kb_entries').insert({
        session_id, phase: 1, entry_type: 'session', visibility: 'both',
        author: agent.role,
        summary: `${agent.name} — Build Output`,
        details: (outputs[agent.role] || '').substring(0, 10000),
      });

      // HIT-60: Validate CDO output contains actual business content
      if (agent.role === 'CDO' && tier === 'quick_build') {
        const cdoOutput = outputs.CDO || '';
        const businessName = (ctx.partial_answers?.business_name || '').toLowerCase();
        if (businessName && businessName.length > 2 && !cdoOutput.toLowerCase().includes(businessName)) {
          console.warn(`CDO output missing business name "${businessName}" — output may be generic`);
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

// No config.path — background functions use their filename as the route.
