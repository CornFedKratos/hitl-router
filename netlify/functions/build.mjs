import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const BUILD_PROMPT = `You are Carl, the Chief Design Officer (CDO) in the HITL-AI-DLC methodology.
You are generating a polished, production-ready website from a selected prototype direction.

CRITICAL RULES:
- Output COMPLETE, self-contained HTML with ALL CSS inline in a <style> tag
- NO external dependencies — no CDN links, no Google Fonts, no external images
- Use system font stacks: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- Must be fully mobile-responsive with media queries
- Include a working contact form with clear labels and a submit button
- Use all business content provided — do not leave placeholders
- The page must render perfectly when saved as an HTML file and opened in any browser
- Include meta viewport tag for mobile
- Add a professional footer with copyright and business info
- Include smooth scroll behavior
- Add subtle CSS transitions on interactive elements
- The page should feel polished and complete — this is a deliverable, not a mockup
- Output ONLY the HTML — no markdown fences, no explanation, no commentary`;

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
    const { selected_prototype, content, prototype_html } = await req.json();

    if (!selected_prototype || !content) {
      return new Response(JSON.stringify({ error: 'selected_prototype and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const styleGuide = {
      A: 'Warm & Trustworthy: Soft white (#FAFAF8), warm neutrals, earthy green (#4A7C59), rounded corners, warm shadows',
      B: 'Clean & Professional: White (#FFFFFF), navy (#1E3A5F), slate (#64748B), sharp corners, structured grid',
      C: 'Bold & Modern: Dark header (#111827), high contrast, large typography, dramatic shadows',
    };

    const userPrompt = `Generate a polished, production-ready website using this design direction:

STYLE: ${styleGuide[selected_prototype] || styleGuide.A}

BUSINESS CONTENT:
- Business name: ${content.business_name || 'Business Name'}
- Tagline: ${content.tagline || 'Your tagline here'}
- Location: ${content.location || ''}
- Services: ${(content.services || []).join(', ') || 'Service 1, Service 2, Service 3'}
- Credibility: ${content.credibility || ''}
- Goal: ${content.goal || 'Generate leads'}
- Phone: ${content.phone || '(555) 555-5555'}
- Email: ${content.email || 'info@example.com'}

${prototype_html ? `REFERENCE PROTOTYPE (expand and polish this):\n${prototype_html.substring(0, 4000)}` : ''}

Make it complete, polished, and professional. Include:
- Hero section with tagline and CTA
- Services section with all services listed
- About/credibility section
- Contact form with name, email, phone, message fields
- Footer with business info and copyright ${new Date().getFullYear()}

Output ONLY the complete HTML file. No explanation.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: BUILD_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let html = response.content[0]?.text || '';

    // Strip markdown fences if present
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

    return new Response(JSON.stringify({ html }), {
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
  path: '/api/build',
};
