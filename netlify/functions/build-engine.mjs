import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from './notify.mjs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

const AGENTS = [
  { role: 'CPO', name: 'Chief Product Officer', tone: 'warm, strategic',
    task: (tier, ctx) => `You are the CPO opening the build. Summarize Phase 0 and confirm the build plan.\n\nProject: ${ctx.problem}\nSolution: ${ctx.solution}\nAudience: ${ctx.audience}\nDirection: ${ctx.direction}\nTier: ${tier}\n\nWrite a brief (3-4 sentences) strategic summary. End with handoff to CTO.` },
  { role: 'CTO', name: 'Chief Technology Officer', tone: 'precise, technical',
    task: (tier, ctx) => tier === 'quick_build'
      ? `You are the CTO scoping a Quick Build website. Generate:\n1. Technical approach (2-3 sentences)\n2. File structure\n3. Key features\n4. Flags/risks\n\nProject: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}\n\nEnd with handoff to CDO.`
      : `You are the CTO scoping a Launchpad project. Generate:\n1. Technical approach (3-4 sentences)\n2. Feature/epic list (5-8 items)\n3. Tech stack\n4. Complexity + risks\n\nProject: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}\n\nEnd with handoff to CDO.` },
  { role: 'CDO', name: 'Chief Design Officer', tone: 'creative, visual',
    task: (tier, ctx) => tier === 'quick_build'
      ? `You are Carl, the CDO. Generate a complete, self-contained HTML website.\n\nRULES: Complete HTML, ALL CSS inline, NO external deps, system fonts, mobile-responsive, contact form (action="#"), under 10KB, semantic HTML5.\n\nProject: ${ctx.problem}\nAudience: ${ctx.audience}\nDirection: ${ctx.direction}\n\nOutput ONLY the HTML.`
      : `You are the CDO creating a design direction. Generate:\n1. UI/UX direction narrative\n2. Key screen descriptions (3-4)\n3. Design system basics\n4. Accessibility notes\n\nProject: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}\n\nHand off to CQO.` },
  { role: 'CQO', name: 'Chief Quality Officer', tone: 'exacting, quality-focused',
    task: (tier, ctx, prev) => `You are the CQO reviewing CDO output against requirements.\n\nRequirements: Problem: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}\n\nCDO output:\n${(prev || '').substring(0, 2000)}\n\nCheck for gaps, inconsistencies, requirement mismatches. If good: "Approved." If issues: note briefly. Hand off to CIO.` },
  { role: 'CIO', name: 'Chief Infrastructure Officer', tone: 'organized, systems-focused',
    task: (tier, ctx) => tier === 'quick_build'
      ? `You are the CIO. Generate a project summary:\n1. Overview\n2. What Was Built\n3. Deployment Notes\n4. Next Steps\n\nProject: ${ctx.problem} | Audience: ${ctx.audience}\n\nFormat as markdown. Hand off to CSO.`
      : `You are the CIO. Generate the spec package:\n1. PRD\n2. Feature Specs (Gherkin)\n3. Glossary\n4. Risk Log\n5. Roadmap\n\nProject: ${ctx.problem} | Audience: ${ctx.audience} | Direction: ${ctx.direction}\n\nFormat as markdown. Hand off to CSO.` },
  { role: 'CSO', name: 'Chief Security Officer', tone: 'measured, risk-aware',
    task: (tier, ctx) => tier === 'quick_build'
      ? `You are the CSO. Security review of Quick Build HTML.\n\nCheck: forms, third-party scripts, data capture, accessibility.\nProject: ${ctx.problem}\n\nIf clear: "Security review passed. Build complete." If flags: note with recommendations.`
      : `You are the CSO. Security review of Launchpad spec.\n\nCheck: auth, payments, PII, compliance, third-party risks, data storage.\nProject: ${ctx.problem} | Audience: ${ctx.audience}\n\nNote findings. Close: "Security review complete. Build complete."` },
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

export const config = {
  path: '/api/build-engine',
};
