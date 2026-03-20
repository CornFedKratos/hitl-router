import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// HIT-90: Fresh client per request
function createAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const EXTRACTION_PROMPT = `Read this document and extract the following fields if present.
Return ONLY a JSON object with these fields. If a field cannot be determined from the document, set it to null.
Never invent information not present in the document.

Fields to extract:
- business_name: the name of the business or project
- business_description: what the business does (1-2 sentences)
- audience: who the target audience is
- goal: the primary goal or desired outcome
- feeling: brand feeling or tone (if mentioned)
- style_notes: any visual/design preferences or constraints
- problem: the core problem being solved
- solution: the proposed or desired solution
- timeline: any timeline or deadline mentioned
- stakeholders: who is involved in decision-making
- existing_systems: any existing tools, platforms, or systems mentioned
- budget_signals: any budget, investment, or cost mentions (note them, don't interpret)

Also evaluate:
- tier_signal: based on the project scope, classify as one of: "quick_build" (simple website/landing page), "launchpad" (multi-feature product or process), "full_engagement" (enterprise/platform level)

Return format:
{
  "extracted": { ...fields above... },
  "confidence": { ...each field as "found", "inferred", or "missing"... },
  "tier_signal": "quick_build|launchpad|full_engagement"
}`;

async function extractText(buffer, filename) {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'txt' || ext === 'md') {
    return new TextDecoder().decode(buffer);
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.default.extractRawText({ buffer });
    return result.value;
  }

  if (ext === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(Buffer.from(buffer));
    return result.text;
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

export default async (req) => {
  const anthropic = createAnthropicClient(); // HIT-90
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const sessionId = formData.get('session_id');

    if (!file || !file.name) {
      return new Response(JSON.stringify({ error: 'File is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate file type
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['txt', 'md', 'docx', 'pdf'].includes(ext)) {
      return new Response(JSON.stringify({
        error: `Unsupported file type: .${ext}. Please upload .txt, .md, .docx, or .pdf`,
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({
        error: 'File too large. Maximum size is 10MB.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract text from file
    const buffer = await file.arrayBuffer();
    let text;
    try {
      text = await extractText(buffer, file.name);
    } catch (parseErr) {
      return new Response(JSON.stringify({
        error: `Could not read file: ${parseErr.message}. Try a different format.`,
        fallback: true,
      }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!text || text.trim().length < 20) {
      return new Response(JSON.stringify({
        error: 'Document appears empty or too short to extract meaningful content.',
        fallback: true,
      }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send to Anthropic for extraction
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: `DOCUMENT CONTENT:\n\n${text.substring(0, 15000)}` }],
    });

    const responseText = response.content[0]?.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({
        error: 'Could not extract structured data from document.',
        fallback: true,
      }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = JSON.parse(jsonMatch[0]);
    const extracted = result.extracted || {};
    const confidence = result.confidence || {};
    const tierSignal = result.tier_signal || 'launchpad';

    // Count missing fields
    const requiredFields = ['audience', 'goal', 'problem', 'timeline'];
    const missingCount = requiredFields.filter(f => !extracted[f] || confidence[f] === 'missing').length;

    // Write extraction metadata to session if we have one
    if (sessionId) {
      await supabase.from('sessions').update({
        rfp_uploaded: true,
        rfp_filename: file.name,
        rfp_extracted_fields: confidence,
      }).eq('id', sessionId);
    }

    return new Response(JSON.stringify({
      extracted,
      confidence,
      tier_signal: tierSignal,
      missing_count: missingCount,
      filename: file.name,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, fallback: true }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/parse-rfp',
};
