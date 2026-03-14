import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PROTOTYPE_PROMPT = `You are Carl, the Chief Design Officer (CDO) in the HITL-AI-DLC methodology.
You are generating three HTML prototype websites for a Quick Build project.

CRITICAL RULES:
- Each prototype must be COMPLETE, self-contained HTML with ALL CSS inline in a <style> tag
- NO external dependencies — no CDN links, no Google Fonts, no external images
- Use system font stacks: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- Each prototype must be mobile-responsive
- Include a working contact form (action="#" with a visible form)
- Include all business content provided below
- Each file must render perfectly when opened directly in a browser
- Keep total HTML under 8KB per prototype for fast rendering
- Use semantic HTML5 elements

PROTOTYPE A — "Warm & Trustworthy":
- Soft white background (#FAFAF8), warm neutrals, earthy green accents (#4A7C59)
- Large hero section with trust signals prominent
- Contact form above the fold
- Rounded corners, warm shadows
- Best for: home services, inspection, family businesses

PROTOTYPE B — "Clean & Professional":
- White background (#FFFFFF), navy (#1E3A5F) and slate (#64748B) accents
- Structured grid layout, clear service cards with borders
- Information-forward, minimal decoration
- Sharp corners, subtle shadows
- Best for: professional services, B2B

PROTOTYPE C — "Bold & Modern":
- Dark header (#111827), high contrast with white content area
- Large typography, strong visual hierarchy
- Services as feature blocks with colored icon circles
- Mixed radius, dramatic shadows
- Best for: premium positioning, younger audience

OUTPUT FORMAT:
You must return EXACTLY this JSON structure with no other text before or after:
{"prototypeA":"<complete HTML>","prototypeB":"<complete HTML>","prototypeC":"<complete HTML>"}

Escape all quotes and newlines properly in the JSON strings.`;

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
    const { content } = await req.json();

    if (!content || typeof content !== 'object') {
      return new Response(JSON.stringify({ error: 'content object is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentBlock = `
BUSINESS CONTENT TO USE:
- Business name: ${content.business_name || 'Business Name'}
- Tagline: ${content.tagline || 'Your tagline here'}
- Location: ${content.location || ''}
- Services: ${(content.services || []).join(', ') || 'Service 1, Service 2, Service 3'}
- Credibility: ${content.credibility || ''}
- Goal: ${content.goal || 'Generate leads'}
- Phone: ${content.phone || '(555) 555-5555'}
- Email: ${content.email || 'info@example.com'}

Generate all three prototypes now. Remember: output ONLY the JSON object, no markdown fences, no explanation.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: PROTOTYPE_PROMPT,
      messages: [{ role: 'user', content: contentBlock }],
    });

    const text = response.content[0]?.text || '';

    // Extract JSON from response (handle potential markdown fences)
    let jsonStr = text;
    const jsonMatch = text.match(/\{[\s\S]*"prototypeA"[\s\S]*"prototypeB"[\s\S]*"prototypeC"[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let prototypes;
    try {
      prototypes = JSON.parse(jsonStr);
    } catch {
      // If JSON parse fails, try to extract individual prototypes
      const aMatch = text.match(/"prototypeA"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const bMatch = text.match(/"prototypeB"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const cMatch = text.match(/"prototypeC"\s*:\s*"((?:[^"\\]|\\.)*)"/);

      if (aMatch && bMatch && cMatch) {
        prototypes = {
          prototypeA: JSON.parse(`"${aMatch[1]}"`),
          prototypeB: JSON.parse(`"${bMatch[1]}"`),
          prototypeC: JSON.parse(`"${cMatch[1]}"`),
        };
      } else {
        throw new Error('Failed to parse prototype HTML from response');
      }
    }

    return new Response(JSON.stringify(prototypes), {
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
  path: '/api/prototypes',
};
