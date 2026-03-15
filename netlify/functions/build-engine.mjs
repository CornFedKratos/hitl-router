import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from './notify.mjs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── Agent chain definition ──

const AGENTS = [
  {
    role: 'CPO',
    name: 'Chief Product Officer',
    tone: 'warm, strategic',
    task: (tier, ctx) => `You are the CPO opening the build. Summarize what was captured in Phase 0 and confirm the build plan.

Project context:
- Problem: ${ctx.problem}
- Solution: ${ctx.solution}
- Audience: ${ctx.audience}
- Selected direction: ${ctx.direction}
- Tier: ${tier}

Write a brief (3-4 sentences) strategic summary confirming what we're building and why. End with a handoff to the CTO: "I'm handing this to our CTO to scope the technical approach."`,
  },
  {
    role: 'CTO',
    name: 'Chief Technology Officer',
    tone: 'precise, technical',
    task: (tier, ctx) => tier === 'quick_build'
      ? `You are the CTO scoping a Quick Build website. Based on the project context, generate:
1. Technical approach (2-3 sentences)
2. File structure (list the components of the single HTML file)
3. Key features to implement
4. Any flags or risks

Project: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}

Be concise and specific. End with: "Here's exactly what you're getting." Then hand off to CDO: "Handing to our CDO to bring this to life."`
      : `You are the CTO scoping a Launchpad project. Generate:
1. Technical approach summary (3-4 sentences)
2. Feature/epic list (5-8 items with brief descriptions)
3. Recommended tech stack
4. Complexity assessment and risks

Project: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}

Be specific to this project. End with handoff to CDO.`,
  },
  {
    role: 'CDO',
    name: 'Chief Design Officer',
    tone: 'creative, visual',
    task: (tier, ctx) => tier === 'quick_build'
      ? `You are Carl, the CDO. Generate a complete, self-contained HTML website for this project.

CRITICAL RULES:
- Complete HTML with ALL CSS in a <style> tag
- NO external dependencies (no CDN, no Google Fonts, no images)
- System font stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- Mobile-responsive
- Working contact form (action="#")
- Keep under 10KB
- Semantic HTML5

Project: ${ctx.problem}
Audience: ${ctx.audience}
Direction style: ${ctx.direction}

Output ONLY the HTML — no explanation, no markdown fences.`
      : `You are the CDO creating a design direction for this Launchpad project. Generate:
1. UI/UX direction narrative (visual style, interaction philosophy)
2. Key screen descriptions (3-4 screens with layout and content)
3. Design system basics (colors, typography, component patterns)
4. Accessibility considerations

Project: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}

Hand off to CQO when done.`,
  },
  {
    role: 'CQO',
    name: 'Chief Quality Officer',
    tone: 'exacting, quality-focused',
    task: (tier, ctx, prevOutput) => `You are the CQO reviewing the CDO's output against Phase 0 requirements.

Requirements:
- Problem: ${ctx.problem}
- Audience: ${ctx.audience}
- Direction: ${ctx.direction}

CDO output to review:
${prevOutput.substring(0, 2000)}

Check for:
1. Missing content or features from the requirements
2. Design inconsistencies
3. Requirement mismatches

If everything looks good: "Approved — quality gate passed. Handing to CIO."
If issues found: note them briefly (the CDO has already delivered — this is a review note, not a revision request). Then hand off to CIO.`,
  },
  {
    role: 'CIO',
    name: 'Chief Infrastructure Officer',
    tone: 'organized, systems-focused',
    task: (tier, ctx) => tier === 'quick_build'
      ? `You are the CIO packaging the deliverables. Generate a project summary document for this Quick Build:

1. Project Overview (problem, solution, audience)
2. What Was Built (deliverables list)
3. Deployment Notes (how to host this HTML file)
4. Recommended Next Steps (domain, hosting, analytics, form handling)

Project: ${ctx.problem} | Audience: ${ctx.audience}

Format as clean markdown. Hand off to CSO.`
      : `You are the CIO generating the spec package for this Launchpad project:

1. PRD (Product Requirements Document) — problem, goals, user stories, success metrics
2. Feature Specifications — each feature with acceptance criteria in Gherkin format
3. Glossary — key terms defined
4. Risk Log — identified risks with mitigation strategies
5. Prioritized Roadmap — MVP → v1 → v2

Project: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}

Format as clean markdown. Hand off to CSO.`,
  },
  {
    role: 'CSO',
    name: 'Chief Security Officer',
    tone: 'measured, risk-aware',
    task: (tier, ctx) => tier === 'quick_build'
      ? `You are the CSO doing a final security and compliance review of a Quick Build HTML website.

Check for:
1. Any embedded forms — are they safe? (action="#" is fine)
2. Any third-party scripts or resources
3. Any data capture that needs disclosure
4. Any accessibility concerns

Project: ${ctx.problem}

If clear: "Security review passed. No concerns. Build complete."
If flags: note them briefly with recommendations. Then: "Build complete — flagged items noted for Don's review."`
      : `You are the CSO reviewing a Launchpad spec package for security and compliance.

Check for:
1. Features involving authentication, payments, or PII
2. Compliance-sensitive requirements (HIPAA, GDPR, PCI, etc.)
3. Third-party integration risks
4. Data storage and privacy considerations

Project: ${ctx.problem} | Audience: ${ctx.audience}

Note any findings with recommendations. Close with: "Security review complete. Build complete."`,
  },
];

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

  try {
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify payment
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', session_id)
      .single();

    if (error || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!session.payment_confirmed) {
      return new Response(JSON.stringify({ error: 'Payment not confirmed' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tier = session.engagement_tier || 'launchpad';
    const ctx = {
      problem: session.problem || 'Not specified',
      solution: session.solution || 'Not specified',
      audience: session.audience || 'Not specified',
      direction: session.mockup_direction_selected || 'A',
    };

    // Mark build started
    await supabase.from('sessions').update({
      build_engine_used: true,
      build_phase: 'cpo',
    }).eq('id', session_id);

    // Stream the agent chain
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const outputs = {};

        try {
          for (let i = 0; i < AGENTS.length; i++) {
            const agent = AGENTS[i];
            const prevOutput = i > 0 ? outputs[AGENTS[i - 1].role] || '' : '';

            // Send handoff event
            const handoff = JSON.stringify({
              type: 'handoff',
              role: agent.role,
              name: agent.name,
              step: i + 1,
              total: AGENTS.length,
            });
            controller.enqueue(encoder.encode(`data: ${handoff}\n\n`));

            // Update build phase
            await supabase.from('sessions').update({
              build_phase: agent.role.toLowerCase(),
            }).eq('id', session_id);

            // Run agent
            const prompt = agent.task(tier, ctx, prevOutput);
            let agentOutput = '';

            try {
              const stream = anthropic.messages.stream({
                model: 'claude-sonnet-4-20250514',
                max_tokens: agent.role === 'CDO' ? 12000 : 4096,
                system: `You are the ${agent.name} in the HITL-AI-DLC methodology. Your tone is ${agent.tone}. You are part of an automated build chain — be concise and deliver your output directly.`,
                messages: [{ role: 'user', content: prompt }],
              });

              for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                  agentOutput += event.delta.text;
                  const chunk = JSON.stringify({
                    type: 'text',
                    role: agent.role,
                    text: event.delta.text,
                  });
                  controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                }
              }
            } catch (agentErr) {
              const errMsg = JSON.stringify({
                type: 'agent_error',
                role: agent.role,
                error: agentErr.message,
              });
              controller.enqueue(encoder.encode(`data: ${errMsg}\n\n`));
              agentOutput = `[${agent.role} encountered an error: ${agentErr.message}]`;
            }

            outputs[agent.role] = agentOutput;

            // Store agent output as KB entry
            await supabase.from('kb_entries').insert({
              session_id,
              phase: 1,
              entry_type: 'session',
              visibility: 'both',
              author: agent.role,
              summary: `${agent.name} — Build Output`,
              details: agentOutput.substring(0, 10000),
            });
          }

          // Build complete
          await supabase.from('sessions').update({
            build_phase: 'complete',
            build_completed_at: new Date().toISOString(),
          }).eq('id', session_id);

          // Send completion event with artifact data
          const done = JSON.stringify({
            type: 'done',
            outputs: {
              cpo: outputs.CPO?.substring(0, 500) || '',
              cto: outputs.CTO || '',
              cdo: outputs.CDO || '',
              cqo: outputs.CQO || '',
              cio: outputs.CIO || '',
              cso: outputs.CSO || '',
            },
            tier,
          });
          controller.enqueue(encoder.encode(`data: ${done}\n\n`));

          // Notify Don
          sendNotification('build_complete', {
            session_id,
            lead_name: session.lead_name,
            lead_email: session.lead_email,
            problem: session.problem,
            tier,
            payment_amount: session.payment_amount,
          });

          // Send artifact email to lead
          if (session.lead_email) {
            sendNotification('phase0_complete', {
              session_id,
              lead_email: session.lead_email,
              problem: session.problem,
              solution: session.solution,
              audience: session.audience,
            });
          }

        } catch (err) {
          const errMsg = JSON.stringify({ type: 'error', error: err.message });
          controller.enqueue(encoder.encode(`data: ${errMsg}\n\n`));
        }

        controller.close();
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/build-engine',
};
