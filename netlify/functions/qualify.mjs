import { createClient } from '@supabase/supabase-js';

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
    const { session_id, ai_qualified, human_led, partial_answers, mockup_direction_selected, launcher_fallback, fallback_option_selected, artifacts_downloaded, maintenance_inquiry, upsell_clicked, paywall_abandoned, support_escalation } = await req.json();

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const update = {};
    if (ai_qualified !== undefined) update.ai_qualified = ai_qualified;
    if (human_led !== undefined) update.human_led = human_led;
    if (partial_answers) update.partial_answers = partial_answers;
    if (mockup_direction_selected) update.mockup_direction_selected = mockup_direction_selected;
    if (launcher_fallback !== undefined) update.launcher_fallback = launcher_fallback;
    if (fallback_option_selected) update.fallback_option_selected = fallback_option_selected;
    if (artifacts_downloaded !== undefined) update.artifacts_downloaded = artifacts_downloaded;
    if (maintenance_inquiry !== undefined) update.maintenance_inquiry = maintenance_inquiry;
    if (upsell_clicked !== undefined) update.upsell_clicked = upsell_clicked;
    if (paywall_abandoned !== undefined) update.paywall_abandoned = paywall_abandoned;
    if (support_escalation !== undefined) update.support_escalation = support_escalation;

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
  path: '/api/qualify',
};
