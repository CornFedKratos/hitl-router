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

  // Allow manual trigger via POST /api/nurture as well
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Check if nurture is enabled
  if (process.env.NURTURE_ENABLED === 'false') {
    return new Response(JSON.stringify({ skipped: true, reason: 'NURTURE_ENABLED=false' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Find leads eligible for nurture:
    // - Phase 0 completed (phase >= 1)
    // - lead_status = 'new' (Don hasn't contacted them)
    // - human_led is NOT true
    // - nurture_sent is NOT true
    // - lead_email exists
    // - created_at is between 48-72 hours ago (window to prevent missed sends)
    const now = new Date();
    const hours48ago = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const hours72ago = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

    const { data: leads, error } = await supabase
      .from('sessions')
      .select('id, lead_name, lead_email, problem, resume_token')
      .gte('phase', 1)
      .eq('lead_status', 'new')
      .eq('nurture_sent', false)
      .not('lead_email', 'is', null)
      .or('human_led.is.null,human_led.eq.false')
      .lte('created_at', hours48ago)
      .gte('created_at', hours72ago);

    if (error) {
      console.error('Nurture query failed:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;
    for (const lead of (leads || [])) {
      const success = await sendNotification('nurture', {
        lead_email: lead.lead_email,
        lead_name: lead.lead_name,
        problem: lead.problem,
        resume_token: lead.resume_token,
      });

      if (success) {
        await supabase
          .from('sessions')
          .update({ nurture_sent: true, nurture_sent_at: new Date().toISOString() })
          .eq('id', lead.id);
        sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: (leads || []).length, sent }), {
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

// Netlify scheduled function — runs every hour
export const config = {
  path: '/api/nurture',
  schedule: '@hourly',
};
