import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SKILLS } from './skills.mjs';

// ── Environment ──

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── Role metadata ──

const ROLE_NAMES = {
  CPO: 'Chief Product Officer',
  CTO: 'Chief Technology Officer',
  CQO: 'Chief Quality Officer',
  CDO: 'Chief Design Officer',
  CCO: 'Chief Communication Officer',
  CIO: 'Chief Infrastructure Officer',
  CSO: 'Chief Security Officer',
};

// ── Intent detection ──

const INTENT_PATTERNS = [
  { role: 'CSO', patterns: ['security', 'threat model', 'secrets', 'pii', 'auth review', 'payments', 'compliance', 'vulnerability'] },
  { role: 'CIO', patterns: ['deploy', 'release', 'ci/cd', 'environment', 'rollback', 'production is down', 'version tag', 'promotion'] },
  { role: 'CCO', patterns: ['client update', 'stakeholder', 'demo prep', 'hard conversation', 'delay', 'client communication'] },
  { role: 'CDO', patterns: ['design', 'mockup', 'feel right', 'emotional', 'accessibility', 'design system', 'visual'] },
  { role: 'CQO', patterns: ['test', 'quality', 'coverage', 'ratchet', 'failing', 'slop', 'definition of done'] },
  { role: 'CTO', patterns: ['architecture', 'annotation', 'collision', 'stack decision', 'merge protocol', 'technical debt'] },
];

function detectRole(message, session) {
  // If Quick Build mode is active, CDO owns the conversation
  if (session?.quickbuild) return 'CDO';

  const msgLower = message.toLowerCase();

  for (const { role, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => msgLower.includes(p))) {
      return role;
    }
  }

  // Default: CPO for Phase 0 and general project discussion
  return 'CPO';
}

// ── System prompt builder ──

function buildSystemPrompt(role, session) {
  const skillContent = SKILLS[role];
  if (!skillContent) return `You are the ${ROLE_NAMES[role]} in the HITL-AI-DLC methodology.`;

  const phase0Instructions = role === 'CPO' ? `

IMPORTANT — Phase 0 Completion Protocol:
You are operating through a web interface. The orchestrator is in Phase 0 — Intake & Feasibility.
Your job is to help them clarify their project idea, assess feasibility, and reach a Go/No-Go decision.

Guide the conversation naturally:
1. Understand what they want to build (the problem, solution, and audience)
2. When you have enough information, produce the Idea Compression (Problem / Solution / Who cares)
3. Produce the full Feasibility Assessment
4. Make a clear GO / CONDITIONAL GO / STOP recommendation
5. Ask the orchestrator to confirm the Go decision

QUICK BUILD DETECTION:
After the orchestrator confirms the Go decision, evaluate whether this is a Quick Build project.
A project qualifies for Quick Build when 3 or more of these are true:
- Deliverable is a website, landing page, or single-page tool
- Timeline is days or "as soon as possible"
- No mention of user accounts, logins, or roles
- No payments or financial transactions
- No external API integrations
- Audience is local or regional
- Goal is lead generation, credibility, or information display

If Quick Build is detected:
1. Write your normal Go decision confirmation
2. Then add a handoff message: "This looks like a great fit for a Quick Build — [brief reason]. This is a job for our Chief Design Officer. Let me grab Carl."
3. Append this JSON block at the end on its own line:
QUICKBUILD_READY:{"business_name":"...","tagline":"...","location":"...","services":["..."],"credibility":"...","goal":"...","phone":"","email":"","problem":"...","solution":"...","audience":"...","tier":1,"client_engagement":false,"security_scope":false}
Fill in ALL fields from the conversation. Services should be an array. Leave phone/email empty if not provided.

If Quick Build is NOT detected (complex project), use the standard completion:
PHASE0_COMPLETE:{"phase0_complete":true,"problem":"...","solution":"...","audience":"...","tier":${session?.tier || 1},"client_engagement":${session?.client_engagement || false},"security_scope":${session?.security_scope || false}}

Do NOT append either block until the orchestrator has explicitly confirmed the Go decision.
Do NOT mention these JSON blocks to the orchestrator — they are for system use only.` : '';

  // CDO in Quick Build mode gets a special identity
  const cdoQuickBuildInstructions = (role === 'CDO' && session?.quickbuild) ? `

QUICK BUILD MODE — You are Carl, the Chief Design Officer.
You have just received a handoff from the CPO. You have read the entire conversation.

Your identity in Quick Build mode:
- You speak with warmth and design intuition
- You lead with what you HEARD emotionally from the conversation — not just facts
- You understand that the orchestrator's brand should feel like a handshake, not a logo
- You respond to all design feedback and refinement requests
- You are the owner of this conversation from now on

When responding to the orchestrator's first message after handoff, or to feedback about prototypes:
- Acknowledge what they said
- Offer specific design guidance
- Be direct but warm

Project content for this Quick Build:
${JSON.stringify(session?.quickbuild_content || {}, null, 2)}` : '';

  const userTypeFraming = session?.user_type === 'lead'
    ? `\n\nIMPORTANT — User context:
This visitor is exploring S3 Technology for the first time. They may not know what HITL-AI-DLC is.
- Use a warm, explanatory tone — define methodology terms when you first use them
- Frame Phase 0 as "helping them figure out if their idea is buildable" not as a methodology step
- Keep jargon minimal — say "project plan" not "execution brief", "feasibility check" not "Phase 0 gate"
- If they seem confused, offer to explain how the process works before diving in`
    : session?.user_type === 'orchestrator'
    ? `\n\nIMPORTANT — User context:
This is an orchestrator — they know HITL-AI-DLC and came here to start a project.
- Be concise and direct — skip methodology explanations
- Use standard AI-DLC terminology (phases, tiers, roles)
- Move efficiently through Phase 0 — they know the drill`
    : '';

  return `You are the ${ROLE_NAMES[role]} in the HITL-AI-DLC methodology.

${skillContent}

You are operating through a web interface called the HITL-AI-DLC Agent Router.
The orchestrator may be new to the methodology — be helpful, clear, and specific.
${userTypeFraming}
Project context:
- Problem: ${session?.problem || 'not yet defined'}
- Solution: ${session?.solution || 'not yet defined'}
- Audience: ${session?.audience || 'not yet defined'}
- Tier: ${session?.tier || 1}
- Phase: ${session?.phase || 0}
${phase0Instructions}${cdoQuickBuildInstructions}`;
}

// ── Session management ──

async function createSession(userType) {
  const row = {};
  if (userType === 'orchestrator' || userType === 'lead') {
    row.user_type = userType;
  }

  const { data, error } = await supabase
    .from('sessions')
    .insert(row)
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return data.id;
}

async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw new Error(`Session not found: ${error.message}`);
  return data;
}

async function getSessionMessages(sessionId) {
  const { data, error } = await supabase
    .from('session_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return data || [];
}

async function storeMessage(sessionId, role, content, agentRole) {
  const row = { session_id: sessionId, role, content };
  if (agentRole) row.agent_role = agentRole;

  const { error } = await supabase.from('session_messages').insert(row);
  if (error) console.error('Failed to store message:', error.message);
}

async function completePhase0(sessionId, metadata) {
  // Update session with extracted fields
  const { error: updateError } = await supabase
    .from('sessions')
    .update({
      problem: metadata.problem,
      solution: metadata.solution,
      audience: metadata.audience,
      tier: metadata.tier,
      client_engagement: metadata.client_engagement,
      security_scope: metadata.security_scope,
      go_decision: true,
      phase: 1,
    })
    .eq('id', sessionId);

  if (updateError) console.error('Failed to update session:', updateError.message);

  // Write intake KB entry
  await supabase.from('kb_entries').insert({
    session_id: sessionId,
    phase: 0,
    entry_type: 'intake',
    visibility: 'both',
    author: 'CPO',
    summary: `Project Intake — ${metadata.problem}`,
    details: `Problem: ${metadata.problem}\nSolution: ${metadata.solution}\nAudience: ${metadata.audience}\nTier: ${metadata.tier}\nClient engagement: ${metadata.client_engagement}\nSecurity scope: ${metadata.security_scope}`,
  });

  // Write feasibility KB entry
  await supabase.from('kb_entries').insert({
    session_id: sessionId,
    phase: 0,
    entry_type: 'feasibility',
    visibility: 'both',
    author: 'CPO',
    summary: 'Feasibility Assessment — Go Decision Confirmed',
    details: `Go decision confirmed by orchestrator.\nProblem: ${metadata.problem}\nSolution: ${metadata.solution}\nAudience: ${metadata.audience}`,
  });
}

// ── Netlify function handler ──

export default async (req) => {
  // CORS headers
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
    const body = await req.json();
    const { message } = body;
    let { session_id: sessionId, quickbuild: clientQuickbuild, quickbuild_content: clientQbContent, user_type: userType } = body;

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Create or fetch session
    let session;
    if (!sessionId) {
      sessionId = await createSession(userType);
      session = await getSession(sessionId);
    } else {
      session = await getSession(sessionId);
    }

    // Overlay client-side Quick Build state onto session for prompt building
    if (clientQuickbuild) {
      session.quickbuild = true;
      session.quickbuild_content = clientQbContent || {};
    }

    // 2. Store user message
    await storeMessage(sessionId, 'user', message);

    // 3. Get conversation history
    const messages = await getSessionMessages(sessionId);

    // 4. Detect intent → role
    const detectedRole = detectRole(message, session);

    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt(detectedRole, session);

    // 6. Build message array for Anthropic
    const anthropicMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    // 7. Stream response from Anthropic
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    // 8. Create streaming response
    const encoder = new TextEncoder();
    let fullResponse = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send session metadata first
          const meta = JSON.stringify({
            type: 'meta',
            session_id: sessionId,
            detected_role: detectedRole,
            phase: session.phase,
          });
          controller.enqueue(encoder.encode(`data: ${meta}\n\n`));

          // Stream text chunks
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const text = event.delta.text;
              fullResponse += text;

              const chunk = JSON.stringify({ type: 'text', text });
              controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
            }
          }

          // 9. Check for signals in the full response
          let phase0Complete = false;
          let phase0Metadata = null;
          let quickbuildReady = false;
          let quickbuildContent = null;
          let cleanResponse = fullResponse;

          // Check for QUICKBUILD_READY first (takes priority)
          const qbMatch = fullResponse.match(/QUICKBUILD_READY:(\{.*\})/);
          if (qbMatch) {
            try {
              quickbuildContent = JSON.parse(qbMatch[1]);
              quickbuildReady = true;
              phase0Complete = true;
              cleanResponse = fullResponse.replace(/\n?QUICKBUILD_READY:\{.*\}/, '').trim();
              // Extract phase0 metadata from quickbuild content
              phase0Metadata = {
                problem: quickbuildContent.problem,
                solution: quickbuildContent.solution,
                audience: quickbuildContent.audience,
                tier: quickbuildContent.tier || 1,
                client_engagement: quickbuildContent.client_engagement || false,
                security_scope: quickbuildContent.security_scope || false,
              };
            } catch {
              // Invalid JSON — fall through to PHASE0_COMPLETE check
            }
          }

          // Check for standard PHASE0_COMPLETE
          if (!quickbuildReady) {
            const phase0Match = fullResponse.match(/PHASE0_COMPLETE:(\{.*\})/);
            if (phase0Match) {
              try {
                phase0Metadata = JSON.parse(phase0Match[1]);
                phase0Complete = true;
                cleanResponse = fullResponse.replace(/\n?PHASE0_COMPLETE:\{.*\}/, '').trim();
              } catch {
                // Invalid JSON — ignore
              }
            }
          }

          // 10. Store agent response (clean version without JSON blocks)
          await storeMessage(sessionId, 'agent', cleanResponse, detectedRole);

          // 11. Handle Phase 0 completion
          if (phase0Complete && phase0Metadata) {
            await completePhase0(sessionId, phase0Metadata);
          }

          // 12. Send completion event
          const donePayload = {
            type: 'done',
            session_id: sessionId,
            detected_role: detectedRole,
            phase: phase0Complete ? 1 : session.phase,
            phase0_complete: phase0Complete,
            go_decision: phase0Complete ? true : session.go_decision,
          };

          // Add Quick Build data to the done event
          if (quickbuildReady && quickbuildContent) {
            donePayload.quickbuild_ready = true;
            donePayload.quickbuild_content = quickbuildContent;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(donePayload)}\n\n`));
          controller.close();
        } catch (err) {
          const errorMsg = JSON.stringify({ type: 'error', error: err.message });
          controller.enqueue(encoder.encode(`data: ${errorMsg}\n\n`));
          controller.close();
        }
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
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/chat',
};
