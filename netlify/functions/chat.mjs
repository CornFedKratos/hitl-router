import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SKILLS } from './skills.mjs';
import { sendNotification } from './notify.mjs';

// ── Environment ──

// HIT-90: Fresh client per request to prevent connection state issues
function createAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

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

// HIT-43: Support signal patterns for CPO detection
const SUPPORT_SIGNALS = ['isn\'t working', 'isnt working', 'broken', 'error', 'bug', 'failing', 'my app', 'our platform', 'production', 'how do i fix', 'not working', 'crash', 'exception', 'stack trace', 'debug'];

function detectRole(message, session) {
  // If Quick Build mode is active, CDO owns the conversation
  if (session?.quickbuild) return 'CDO';

  // HIT-44: Design path — Carl (CDO) leads the entire conversation
  if (session?.need_type === 'design') return 'CDO';

  // HIT-43/44: Support path always routes to CTO
  if (session?.user_type === 'support' || session?.need_type === 'technology_support') return 'CTO';

  const msgLower = message.toLowerCase();

  // HIT-43: Detect support intent in free-form chat (first message only)
  if (session?.phase === 0 && !session?.problem) {
    if (SUPPORT_SIGNALS.some(s => msgLower.includes(s))) {
      return 'CTO';
    }
  }

  for (const { role, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => msgLower.includes(p))) {
      return role;
    }
  }

  // Default: CPO for Phase 0 and general project discussion
  return 'CPO';
}

// ── Engagement tier signal detection (HIT-27) ──

const TIER_SIGNALS = {
  quick_build: [
    { id: 'single_deliverable', patterns: ['website', 'landing page', 'single page', 'one page', 'brochure site', 'portfolio'] },
    { id: 'short_timeline', patterns: ['asap', 'as soon as possible', 'few weeks', 'this week', 'end of month', 'rush', 'days', 'right away', 'immediately'] },
    { id: 'no_auth', patterns: ['no login', 'no accounts', 'no sign up', 'no authentication', 'no user accounts'] },
    { id: 'no_payments', patterns: ['no payments', 'no billing', 'no e-commerce', 'no transactions', 'no checkout'] },
    { id: 'local_audience', patterns: ['local', 'neighborhood', 'my town', 'my city', 'regional', 'small community', 'marion', 'iowa', 'county', 'small town'] },
    { id: 'lead_gen_goal', patterns: ['lead gen', 'credibility', 'online presence', 'business card', 'get found', 'google search', 'seo', 'contact form', 'customer inquiries', 'web presence'] },
    { id: 'solo_operator', patterns: ['just me', 'solo', 'one person', 'i am the', 'my own', 'solopreneur', 'freelance'] },
  ],
  launchpad: [
    { id: 'multiple_stakeholders', patterns: ['board', 'cto', 'ceo', 'we need approval', 'multiple decision', 'getting buy-in', 'our executive', 'executive team', 'committee', 'department head'] },
    { id: 'existing_systems', patterns: ['connects to our', 'integrate with our', 'existing system', 'our current database', 'our platform', 'migrate from', 'legacy system', 'connect to our', 'salesforce', 'erp', 'crm'] },
    { id: 'compliance', patterns: ['compliance', 'hipaa', 'gdpr', 'regulation', 'audit', 'security requirements', 'pci', 'sox'] },
    { id: 'buy_in_needed', patterns: ['buy-in', 'approval', 'executive', 'sign off', 'budget approval', 'stakeholder alignment'] },
    { id: 'ai_integration', patterns: ['ai', 'machine learning', 'automation', 'chatbot', 'nlp', 'model', 'intelligent'] },
    { id: 'medium_timeline', patterns: ['months', 'quarter', 'q1', 'q2', 'q3', 'q4', 'next quarter', 'few months', '3 months', '6 months'] },
    { id: 'process_level', patterns: ['workflow', 'process', 'pipeline', 'operations', 'internal tool', 'dashboard', 'reporting'] },
    { id: 'regulated_industry', patterns: ['healthcare', 'finance', 'legal', 'logistics', 'manufacturing', 'insurance', 'banking', 'pharma', 'government'] },
  ],
  full_engagement: [
    { id: 'enterprise_context', patterns: ['enterprise', 'large organization', 'corporation', 'fortune 500', 'global', 'thousands of users', 'multi-national'] },
    { id: 'platform_level', patterns: ['platform', 'multiple products', 'multiple user types', 'marketplace', 'ecosystem', 'suite of tools', 'multi-tenant'] },
    { id: 'long_timeline', patterns: ['ongoing', 'long-term', 'partnership', 'year', 'multi-year', 'roadmap', 'phases', 'multi-phase'] },
    { id: 'custom_infra', patterns: ['custom infrastructure', 'data science', 'ml pipeline', 'custom hosting', 'kubernetes', 'microservices', 'distributed'] },
    { id: 'prior_failures', patterns: ['tried before', 'failed', 'previous vendor', 'rebuilt', 'rewrite', 'started over', 'burned'] },
    { id: 'partner_language', patterns: ['partner', 'not a vendor', 'strategic', 'long-term relationship', 'trusted advisor', 'embedded team'] },
    { id: 'large_budget', patterns: ['investment', 'significant budget', 'enterprise budget', 'funded', 'series', 'raise', 'capital'] },
  ],
};

function detectEngagementTier(text) {
  const lower = text.toLowerCase();
  const results = {};

  for (const [tier, signals] of Object.entries(TIER_SIGNALS)) {
    const matched = [];
    for (const signal of signals) {
      if (signal.patterns.some(p => lower.includes(p))) {
        matched.push(signal.id);
      }
    }
    results[tier] = matched;
  }

  // Score: count matched signals per tier
  const scores = {
    quick_build: results.quick_build.length,
    launchpad: results.launchpad.length,
    full_engagement: results.full_engagement.length,
  };

  // Determine tier — highest score with 3+ signals wins
  let tier = 'launchpad'; // default
  let confidence = 1;
  let signals = results.launchpad;

  if (scores.full_engagement >= 3) {
    tier = 'full_engagement';
    confidence = scores.full_engagement >= 5 ? 3 : 2;
    signals = results.full_engagement;
  } else if (scores.quick_build >= 3) {
    tier = 'quick_build';
    confidence = scores.quick_build >= 5 ? 3 : 2;
    signals = results.quick_build;
  } else if (scores.launchpad >= 3) {
    tier = 'launchpad';
    confidence = scores.launchpad >= 5 ? 3 : 2;
    signals = results.launchpad;
  }
  // If nothing hits 3, default to launchpad with low confidence

  return { tier, confidence, signals };
}

// ── System prompt builder ──

function buildSystemPrompt(role, session) {
  const skillContent = SKILLS[role];
  if (!skillContent) return `You are the ${ROLE_NAMES[role]} in the HITL-AI-DLC methodology.`;

  const phase0Instructions = role === 'CPO' ? `

IMPORTANT — Phase 0 Completion Protocol:
You are operating through a web interface. The orchestrator is in Phase 0 — Intake & Feasibility.

CRITICAL — READ THIS FIRST: If the user's first message contains structured answers (multiple labeled fields like "Business name:", "Problem:", "Audience:", "Timeline:", etc.), they have ALREADY completed a structured intake questionnaire. Their answers are complete. DO NOT re-ask ANY of those questions. DO NOT ask clarifying versions of questions they already answered. Read their answers, acknowledge what they told you in a brief summary (2-3 sentences max), then proceed DIRECTLY to Idea Compression + Feasibility Assessment + Go/No-Go recommendation. The only reason to ask a follow-up is if critical information is genuinely missing — not to reconfirm.

If the user has NOT provided structured answers, guide the conversation naturally:
1. Understand what they want to build (the problem, solution, and audience)
2. When you have enough information, produce the Idea Compression (Problem / Solution / Who cares)
3. Produce the full Feasibility Assessment
4. Make a clear GO / CONDITIONAL GO / STOP recommendation
5. Ask the orchestrator to confirm the Go decision

ENGAGEMENT TIER CLASSIFICATION:
After the orchestrator confirms the Go decision, classify the engagement tier based on signals from the conversation.

TIER 1 — Quick Build (3+ signals):
- Single deliverable (website, landing page, single tool)
- Short timeline (days, weeks, ASAP)
- No authentication, payments, or integrations
- Local or small audience
- Lead gen or credibility goal
- Solo operator, no other stakeholders
- Small or unstated budget

TIER 2 — Launchpad (3+ signals):
- Multiple stakeholders (team, board, CTO, "we")
- Existing systems to integrate with
- Compliance, security, or industry requirements
- Internal buy-in or approval needed
- AI integration or automation is core
- Medium timeline (months, quarters)
- Process-level problem (workflows, dashboards, internal tools)
- Regulated industry (healthcare, finance, legal, logistics)

TIER 3 — Full Engagement (3+ signals):
- Enterprise or large organization context
- Platform-level thinking (multiple products, user types)
- Long timeline or ongoing partnership language
- Custom infrastructure, data science, or ML
- Prior failed attempts or vendor relationships
- "We need a partner, not a vendor" language
- Large or investment-framed budget

When mixed signals, default to Tier 2 (over-qualify, never under-qualify).

COMPLETION SIGNALS:
After Go decision confirmation, append the appropriate signal block.

If Tier 1 (Quick Build) is detected:
1. Write your Go decision confirmation
2. Add a handoff: "This looks like a great fit for a Quick Build — [brief reason]. This is a job for our Chief Design Officer. Let me grab Carl."
3. Append on its own line:
QUICKBUILD_READY:{"business_name":"...","tagline":"...","location":"...","services":["..."],"credibility":"...","goal":"...","phone":"","email":"","problem":"...","solution":"...","audience":"...","tier":1,"client_engagement":false,"security_scope":false}
Fill in ALL fields. Services as array. Leave phone/email empty if not provided.

If Tier 2 or Tier 3 (not Quick Build):
PHASE0_COMPLETE:{"phase0_complete":true,"problem":"...","solution":"...","audience":"...","tier":${session?.tier || 1},"client_engagement":${session?.client_engagement || false},"security_scope":${session?.security_scope || false}}

ALWAYS also append this tier classification block on its own line (after either QUICKBUILD_READY or PHASE0_COMPLETE):
ENGAGEMENT_TIER:{"tier":"quick_build|launchpad|full_engagement","confidence":1-3,"signals":["signal_id_1","signal_id_2"]}
- tier: one of quick_build, launchpad, full_engagement
- confidence: 1=inferred, 2=likely, 3=confirmed by strong signals
- signals: array of signal IDs you detected (e.g. "multiple_stakeholders", "short_timeline", "enterprise_context")

Do NOT append any signal blocks until the orchestrator has explicitly confirmed the Go decision.
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

  // HIT-44: Carl (CDO) design path framing
  // HIT-93: Build popup context for Carl's system prompt
  const popupContext = session?.partial_answers ? Object.entries(session.partial_answers)
    .filter(([k, v]) => v && !k.startsWith('_'))
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n') : '';

  const designPathFraming = session?.need_type === 'design' ? `

IMPORTANT — You are Carl, the Chief Design Officer.
You are a user psychologist disguised as a designer. You see what clients can only dream about and capture what they feel.

${popupContext ? `
THE CLIENT HAS ALREADY COMPLETED A STRUCTURED INTAKE. Here is everything they told us:

${popupContext}

These answers are COMPLETE. DO NOT re-ask any of them. DO NOT ask clarifying versions. DO NOT paraphrase them back as questions. They are facts — use them.

Your first message should warmly acknowledge what stood out to you from their answers (2-3 sentences max), then immediately begin your creative discovery questions.
` : `
This visitor needs a website, brand, or online presence. They are NOT technical. Start by understanding what they need.
`}

YOU ARE THE MUSE. Your job is creative discovery — understanding the things a form can never capture. You must collect these data points through natural conversation before you can synthesize a design direction:

1. INSPIRATION — What sites, brands, or businesses do they admire? What specifically about them?
2. DESIGN DIRECTION — Do they lean toward clean/minimal or warm/personal? Bold or soft? Photo-led or type-led? Ask naturally, not as a multiple choice.
3. EMOTIONAL INTENT — When someone lands on their site, what should they feel in the first 5 seconds?
4. AVOIDANCES — What do they never want their site to look or feel like?
5. PERSONALITY — If their business were a person, who would they be? This is your most important question.
6. DIFFERENTIATOR — What makes them different from their competitors?
7. COMPETITORS — Who are they competing against?

Ask these naturally across 3-5 conversational turns. Not as a checklist — as a creative director who is genuinely curious. Ask follow-up questions when their answer is interesting. One question per message, maybe two if they flow naturally together.

Examples of genuinely great questions (use as inspiration, not a script):
- "What's the one thing your best clients always say about working with you?"
- "When you imagine someone finding your site through Google — who is that person and what are they worried about?"
- "Is there a site — even in a completely different industry — that makes you feel the way you want your clients to feel?"
- "What do you never want someone to think after seeing your site?"

WHEN YOU HAVE ENOUGH: When you've captured all 7 data points (or the client signals they're ready to move on), synthesize everything into a design direction paragraph. Write it as instructions to yourself — specific, actionable, no fluff. Then append this signal on its own line:

MUSE_COMPLETE:{"inspiration":"...","emotion":["..."],"avoid":"...","personality":"...","differentiator":"...","competitors":"...","design_pairs":{"warm_vs_clean":"...","bold_vs_soft":"...","photo_vs_type":"..."}}

Fill in ALL fields from what you learned. This JSON is for system use — do not mention it to the client.

After the MUSE_COMPLETE signal, proceed to Idea Compression + Feasibility Assessment + Go/No-Go as normal.

RULES:
- Never re-ask what the popup already captured
- Never mention "orchestrator", "execution agent", HITL-AI-DLC, or Figma
- Never reference tools or capabilities that don't exist in this platform
- Speak like a creative director who is genuinely invested in this client's success
- 3-5 discovery turns max — be efficient, every question must earn its place
- You own this conversation from start to finish` : '';

  const userTypeFraming = session?.user_type === 'support' || session?.need_type === 'technology_support'
    ? `\n\nIMPORTANT — Support context:
You are the CTO helping someone with an existing project problem. This is NOT a new project intake.
- You've seen this problem before. You know which way it goes. You are not interested in learning that lesson again.
- Be direct, precise, and technical. Diagnose first, then recommend.
- Ask targeted questions: "What's the error?", "When did it start?", "What changed recently?"
- If the problem needs deeper analysis, suggest: "This would be a good one to open in Claude Code for a hands-on look."
- If you can't resolve it or it needs human judgment, offer to escalate: "Let me connect you with Don — he can take a deeper look at this."
- Do NOT run Phase 0 intake. Do NOT generate mockups. Do NOT mention pricing or paywall.
- Keep it focused: diagnose, advise, resolve or escalate.`
    : session?.user_type === 'lead'
    ? `\n\nIMPORTANT — User context:
This visitor is exploring your services for the first time. They may not know what HITL-AI-DLC is. Never refer to yourself or the team as "S3 Technology" — this is the client's project, not yours. Use "we" or "our team" when referring to who will build their project.
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

FORMATTING RULE: Start every response with a **bold one-sentence summary** of what you're about to communicate. This sentence should stand alone as a complete summary — the rest of your response adds detail. Example: "**Your project is a strong fit for a Quick Build — here's why.**"
${designPathFraming}${userTypeFraming}
Project context:
- Problem: ${session?.problem || 'not yet defined'}
- Solution: ${session?.solution || 'not yet defined'}
- Audience: ${session?.audience || 'not yet defined'}
- Tier: ${session?.tier || 1}
- Phase: ${session?.phase || 0}
${phase0Instructions}${cdoQuickBuildInstructions}`;
}

// ── Session management ──

async function createSession(opts = {}) {
  const row = {};
  if (opts.userType === 'orchestrator' || opts.userType === 'lead' || opts.userType === 'support') {
    row.user_type = opts.userType;
  }
  // HIT-44: Write need_type
  if (opts.need_type) row.need_type = opts.need_type;
  // Lead capture fields (HIT-17)
  if (opts.lead_email && opts.consent_given) {
    row.lead_name = opts.lead_name || null;
    row.lead_email = opts.lead_email;
    row.consent_given = true;
    row.consent_given_at = new Date().toISOString();
    // HIT-21: Generate resume token
    row.resume_token = crypto.randomUUID();
  }
  // Source attribution (HIT-36)
  if (opts.source_utm_source) row.source_utm_source = opts.source_utm_source;
  if (opts.source_utm_medium) row.source_utm_medium = opts.source_utm_medium;
  if (opts.source_utm_campaign) row.source_utm_campaign = opts.source_utm_campaign;
  if (opts.source_referrer) row.source_referrer = opts.source_referrer;

  const { data, error } = await supabase
    .from('sessions')
    .insert(row)
    .select('id, resume_token')
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);

  // HIT-20: Notify Don of new lead + HIT-21: Send resume link to lead
  if (opts.lead_email && opts.consent_given) {
    sendNotification('lead_captured', {
      session_id: data.id,
      lead_name: opts.lead_name,
      lead_email: opts.lead_email,
    });
    sendNotification('resume_link', {
      lead_email: opts.lead_email,
      lead_name: opts.lead_name,
      resume_token: data.resume_token,
    });
  }

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

async function completePhase0(sessionId, metadata, tierData) {
  // Update session with extracted fields
  const update = {
    problem: metadata.problem,
    solution: metadata.solution,
    audience: metadata.audience,
    tier: metadata.tier,
    client_engagement: metadata.client_engagement,
    security_scope: metadata.security_scope,
    go_decision: true,
    phase: 1,
  };

  // HIT-27: Write engagement tier classification
  if (tierData) {
    update.engagement_tier = tierData.tier;
    update.tier_confidence = tierData.confidence;
    update.tier_signals = tierData.signals;
  }

  const { error: updateError } = await supabase
    .from('sessions')
    .update(update)
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
    details: `Problem: ${metadata.problem}\nSolution: ${metadata.solution}\nAudience: ${metadata.audience}\nTier: ${metadata.tier}\nClient engagement: ${metadata.client_engagement}\nSecurity scope: ${metadata.security_scope}${tierData ? `\nEngagement tier: ${tierData.tier} (confidence: ${tierData.confidence})\nSignals: ${tierData.signals.join(', ')}` : ''}`,
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

  // HIT-22: Send confirmation email to lead
  const { data: session } = await supabase
    .from('sessions')
    .select('lead_email, human_led')
    .eq('id', sessionId)
    .single();

  if (session?.lead_email) {
    const emailType = session.human_led ? 'phase0_complete_human_led' : 'phase0_complete';
    sendNotification(emailType, {
      session_id: sessionId,
      lead_email: session.lead_email,
      problem: metadata.problem,
      solution: metadata.solution,
      audience: metadata.audience,
    });
  }
}

// ── Netlify function handler ──

export default async (req) => {
  const anthropic = createAnthropicClient(); // HIT-90: Fresh client per request

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
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
    let { session_id: sessionId, quickbuild: clientQuickbuild, quickbuild_content: clientQbContent, user_type: userType,
      lead_name, lead_email, consent_given, need_type,
      source_utm_source, source_utm_medium, source_utm_campaign, source_referrer } = body;

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Create or fetch session
    let session;
    if (!sessionId) {
      sessionId = await createSession({
        userType, lead_name, lead_email, consent_given, need_type,
        source_utm_source, source_utm_medium, source_utm_campaign, source_referrer,
      });
      session = await getSession(sessionId);
    } else {
      session = await getSession(sessionId);
    }

    // Update source_manual if provided (HIT-36 — collected at end of popup flow)
    const { source_manual, ai_qualified } = body;
    const sessionUpdates = {};
    if (source_manual) sessionUpdates.source_manual = source_manual;
    if (ai_qualified !== undefined) {
      sessionUpdates.ai_qualified = ai_qualified;
      sessionUpdates.human_led = !ai_qualified;
    }
    if (Object.keys(sessionUpdates).length > 0 && sessionId) {
      await supabase.from('sessions').update(sessionUpdates).eq('id', sessionId);
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

          // Log chat interaction for diagnosis
          if (sessionId) {
            const userMsg = anthropicMessages.filter(m => m.role === 'user').pop()?.content || '';
            supabase.from('kb_entries').insert({
              session_id: sessionId, phase: 0, entry_type: 'session', visibility: 'internal',
              author: 'CHAT_LOG',
              summary: `Chat: ${detectedRole} turn`,
              details: `SYSTEM:\n${systemPrompt.substring(0, 3000)}\n\nUSER:\n${(typeof userMsg === 'string' ? userMsg : JSON.stringify(userMsg)).substring(0, 2000)}\n\nASSISTANT:\n${fullResponse.substring(0, 5000)}`,
            }).then(() => {}).catch(() => {});
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

          // 9b. Check for ENGAGEMENT_TIER signal (HIT-27)
          let tierData = null;
          const tierMatch = cleanResponse.match(/\n?ENGAGEMENT_TIER:(\{.*\})/);
          if (tierMatch) {
            try {
              tierData = JSON.parse(tierMatch[1]);
              cleanResponse = cleanResponse.replace(/\n?ENGAGEMENT_TIER:\{.*\}/, '').trim();
            } catch {
              // Invalid JSON — fall back to deterministic detection
            }
          }

          // Deterministic tier detection as fallback (runs on full message text)
          if (!tierData && phase0Complete) {
            tierData = detectEngagementTier(fullResponse);
          }

          // 9c. HIT-93: Check for MUSE_COMPLETE signal
          let museData = null;
          const museMatch = cleanResponse.match(/\n?MUSE_COMPLETE:(\{[\s\S]*?\})/);
          if (museMatch) {
            try {
              museData = JSON.parse(museMatch[1]);
              cleanResponse = cleanResponse.replace(/\n?MUSE_COMPLETE:\{[\s\S]*?\}/, '').trim();

              // Store muse_answers and design_intent
              const designIntentText = cleanResponse; // The synthesis paragraph before the signal
              await supabase.from('sessions').update({
                muse_answers: museData,
                design_intent: designIntentText.substring(0, 5000),
              }).eq('id', sessionId);
            } catch {
              // Invalid JSON — ignore
            }
          }

          // 10. Store agent response (clean version without JSON blocks)
          await storeMessage(sessionId, 'agent', cleanResponse, detectedRole);

          // 11. Handle Phase 0 completion
          if (phase0Complete && phase0Metadata) {
            await completePhase0(sessionId, phase0Metadata, tierData);
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

          // Include tier data in done event for frontend routing
          if (tierData) {
            donePayload.engagement_tier = tierData.tier;
            donePayload.tier_confidence = tierData.confidence;
            donePayload.tier_signals = tierData.signals;
          }

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
