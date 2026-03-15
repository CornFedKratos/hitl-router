import { createClient } from '@supabase/supabase-js';
import { sendNotification } from './notify.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

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
    const body = await req.json();
    const { session_id, partial_answers, source_manual } = body;

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const update = {
      abandoned: true,
      abandoned_at: new Date().toISOString(),
    };

    if (partial_answers && Object.keys(partial_answers).length > 0) {
      update.partial_answers = partial_answers;
    }

    if (source_manual) {
      update.source_manual = source_manual;
    }

    const { error } = await supabase
      .from('sessions')
      .update(update)
      .eq('id', session_id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // HIT-20: Notify Don of abandoned session
    const { data: session } = await supabase
      .from('sessions')
      .select('lead_name, lead_email, problem')
      .eq('id', session_id)
      .single();

    if (session?.lead_email) {
      sendNotification('lead_abandoned', {
        session_id,
        lead_name: session.lead_name,
        lead_email: session.lead_email,
        problem: session.problem,
        partial_answers,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
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
  path: '/api/abandon',
};
