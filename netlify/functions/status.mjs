import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

export default async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session');
  const token = url.searchParams.get('token');
  const isPublic = url.searchParams.get('public') === 'true';

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'session required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Validate access — token must match session ID (orchestrator owns it)
    if (!isPublic && token !== sessionId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch session
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .select('id, problem, solution, audience, phase, go_decision, active_roles, engagement_tier, tier_confidence, created_at, expires_at')
      .eq('id', sessionId)
      .single();

    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For public view, return condensed data only
    if (isPublic) {
      return new Response(JSON.stringify({
        session: {
          phase: session.phase,
          go_decision: session.go_decision,
          engagement_tier: session.engagement_tier,
          created_at: session.created_at,
        },
        public: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch KB entry count by phase
    const { data: kbEntries, error: kbErr } = await supabase
      .from('kb_entries')
      .select('phase')
      .eq('session_id', sessionId);

    const kbByPhase = {};
    (kbEntries || []).forEach(e => {
      kbByPhase[e.phase] = (kbByPhase[e.phase] || 0) + 1;
    });

    return new Response(JSON.stringify({
      session: {
        ...session,
        kb_count: (kbEntries || []).length,
        kb_by_phase: kbByPhase,
        status: session.expires_at && new Date(session.expires_at) < new Date() ? 'expired' : 'active',
      },
      public: false,
      synced_at: new Date().toISOString(),
    }), {
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
  path: '/api/status',
};
