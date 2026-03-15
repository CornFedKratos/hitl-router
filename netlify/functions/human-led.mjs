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
    const { session_id, name, email, problem, message } = await req.json();

    // Update session with contact form data
    const update = {
      human_led: true,
      ai_qualified: false,
    };

    if (name) update.lead_name = name;
    if (email) update.lead_email = email;
    if (message) update.human_led_message = message;

    // If we have a session, update it
    if (session_id) {
      const { error } = await supabase
        .from('sessions')
        .update(update)
        .eq('id', session_id);

      if (error) {
        console.error('Failed to update session with human-led form:', error.message);
      }
    } else {
      // No session yet — create one with the form data
      const insertRow = {
        ...update,
        problem: problem || null,
        user_type: 'lead',
      };
      if (name) insertRow.lead_name = name;
      if (email) {
        insertRow.lead_email = email;
        insertRow.consent_given = true;
        insertRow.consent_given_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('sessions')
        .insert(insertRow);

      if (error) {
        console.error('Failed to create human-led session:', error.message);
      }
    }

    // HIT-20: Notify Don of human-led request
    sendNotification('human_led', {
      session_id,
      name: name || '',
      email: email || '',
      problem: problem || '',
      message: message || '',
    });

    // HIT-22: Send confirmation to lead
    if (email) {
      sendNotification('phase0_complete_human_led', {
        session_id,
        lead_email: email,
        problem: problem || '',
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
  path: '/api/human-led',
};
