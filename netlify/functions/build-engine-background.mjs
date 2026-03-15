import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from './notify.mjs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── HIT-65: Business category detection ──
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

const CATEGORY_DESIGN_HINTS = {
  professional_trades: 'Warm neutrals, deep navy or forest green accent. Trust-forward, clean, family-owned warmth. Solid readable typography, confident not flashy.',
  legal_professional: 'Deep navy, charcoal, subtle gold accents. Premium and minimal. Refined serif or clean sans-serif, generous whitespace.',
  tech_services: 'Cool neutrals, precise accent color. Clean modern layout. Geometric typography, product-forward.',
  food_hospitality: 'Warm saturated colors, appetite-appealing palette. Inviting photography-forward design. Friendly approachable typography.',
  health_wellness: 'Calming blues, soft greens, clean whites. Reassuring and professional. Open spacing, soothing visual rhythm.',
  real_estate: 'Deep blue or charcoal with warm accents. Premium feel with property showcase focus. Strong typography hierarchy.',
  professional_services: 'Clean palette derived from brand feeling. Professional without being generic. Clear information hierarchy.',
};

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
      const category = detectBusinessCategory(pa);
      const categoryHint = CATEGORY_DESIGN_HINTS[category] || CATEGORY_DESIGN_HINTS.professional_services;
      return tier === 'quick_build'
        ? `You are Carl, the CDO. Generate a complete, self-contained HTML website for this SPECIFIC business.

QUALITY STANDARD:
You are producing a site that must feel like a $1,000 custom build, not a free template.
Before generating, ask yourself:
- Would a design-conscious client be proud to show this to their peers?
- Does every section have a reason to exist beyond "most sites have this"?
- Does the visual language reflect the business category and emotional intent?
- Are the stats/numbers real and meaningful, or placeholder-shaped?
- Does the hero say something specific, or could it apply to any business?
If the answer to any is no — revise until yes.

CONTENT RULES:
- Use ONLY the business information provided below
- Do NOT invent placeholder businesses, names, services, or content
- Every section must be populated with the REAL business data
- If a field is not provided, omit that section — do not use generic placeholders

DESIGN EXCELLENCE:

Typography:
- Font weight contrast: 700-800 for hero headline, 600 for section headings, 400-500 for body
- Hero headline: font-size clamp(2.5rem, 6vw, 5rem), letter-spacing -0.02em, line-height 1.1
- Body text: 1.1rem minimum, line-height 1.6-1.7
- Never smaller than 1rem for readability

Color:
- Derive palette from business category and emotional intent — NEVER default to generic blue (#2563eb)
- Business category detected: ${category}
- Category design hint: ${categoryHint}
- Use CSS custom properties for the full color system (--primary, --accent, --bg, --text, --muted)

Spacing:
- Hero: minimum 85vh, vertically centered content, generous padding
- Sections: 80-100px vertical padding on desktop, 48-64px on mobile
- Cards: 32-40px internal padding
- Visual breathing room between all elements

Visual Personality:
- Hero headline must be SPECIFIC to this business — not "Professional [Service] for [Audience]"
- Stats must use REAL numbers from session data, not placeholders
- Service descriptions sound written for this client, not copied from a template
- One unexpected design detail that makes the site feel considered, not assembled

Scroll Animations (REQUIRED):
Include this IntersectionObserver pattern — every section must animate in on scroll:

<script>
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
</script>

Add class="reveal" to every section. CSS:
.reveal { opacity: 0; transform: translateY(32px); transition: opacity 0.7s ease, transform 0.7s ease; }
.reveal.visible { opacity: 1; transform: translateY(0); }

Micro-interactions:
- Buttons: transform scale(1.03) + box-shadow lift on hover, 0.2s transition
- Cards: subtle translateY(-4px) + shadow deepen on hover
- Links: underline slide-in animation on hover

FORBIDDEN:
- Bootstrap-style identical grid cards
- Flat single-color hero backgrounds (use layered gradients or subtle texture)
- Static elements with zero hover or scroll interaction
- Generic icon fonts or emoji as service icons
- Uniform spacing with no visual rhythm
- "About" sections with stock photo placeholder text
- Footer that's just centered text on a dark background

TECHNICAL RULES:
- Complete, self-contained HTML with ALL CSS in a <style> tag and JS in a <script> tag
- NO external dependencies (no CDN, no Google Fonts, no external images)
- System font stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- Mobile-responsive with viewport meta tag
- Working contact form with action="#" and visible fields (name, email/phone, message)
- Keep total HTML under 15KB
- Semantic HTML5

${content}
${ctx.design_intent ? `
=== DESIGN INTENT (from client interview — this is your creative brief, treat it as the client speaking directly) ===
${ctx.design_intent}
=== END DESIGN INTENT ===
This is not supplementary context. This is the brief. Every visual decision — palette, weight, spacing, personality — flows from what the client described above.
` : ''}
REQUIRED SECTIONS (populate with the real data above):
1. Hero — business name, specific headline about THIS business${pa.feeling ? ', reflecting the "' + pa.feeling + '" feeling' : ''}, layered gradient or textured background (not flat color), prominent CTA
2. Services — list EVERY service from the data, each with a real description
3. About / Credibility — real stats and credentials from session data, trust signals
4. Contact — form with name/email/phone/message fields + any provided contact info displayed
5. Footer — business name, location, contact info, simple nav links

SELF-REVIEW BEFORE OUTPUT:
[ ] Hero headline is specific to this business — not generic
[ ] Color palette reflects business category (${category}) and emotional intent
[ ] Stats/numbers are real from session data or replaced with credibility statements
[ ] Service descriptions sound written for this client
[ ] At least one design detail makes this site feel considered
[ ] Contact section includes all available contact methods
[ ] The site would make the client proud to show their best customer
[ ] IntersectionObserver scroll reveals are present on all sections

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
      design_intent: session.design_intent || '',
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
          max_tokens: agent.role === 'CDO' ? 16000 : 4096,
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
