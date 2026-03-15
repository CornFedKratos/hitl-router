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
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(JSON.stringify({ error: 'token required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select('id, problem, solution, audience, partial_answers, lead_name, lead_email, user_type, phase, expires_at, engagement_tier')
      .eq('resume_token', token)
      .single();

    if (error || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check expiry
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Session expired', expired: true }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ session }), {
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
  path: '/api/resume',
};
