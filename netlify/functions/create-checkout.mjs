import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

const SITE_URL = process.env.SITE_URL || 'https://hitl-aidlc.s3technology.io';

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
    const { session_id, tier } = await req.json();

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch session pricing
    const { data: session, error } = await supabase
      .from('sessions')
      .select('ai_build_price_cents, lead_email, lead_name, problem')
      .eq('id', session_id)
      .single();

    if (error || !session || !session.ai_build_price_cents) {
      return new Response(JSON.stringify({ error: 'Session pricing not calculated' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine Stripe price ID from env var
    const priceId = tier === 'quick_build'
      ? process.env.STRIPE_PRICE_TIER1
      : process.env.STRIPE_PRICE_TIER2;

    // Create Stripe Checkout session
    const checkoutConfig = {
      mode: 'payment',
      ui_mode: 'embedded',
      return_url: `${SITE_URL}?payment_success=true&session_id=${session_id}`,
      metadata: {
        hitl_session_id: session_id,
        tier: tier || 'launchpad',
      },
    };

    if (priceId) {
      // Use pre-configured Stripe Price
      checkoutConfig.line_items = [{ price: priceId, quantity: 1 }];
    } else {
      // Dynamic pricing — create a price on the fly
      checkoutConfig.line_items = [{
        price_data: {
          currency: 'usd',
          unit_amount: session.ai_build_price_cents,
          product_data: {
            name: tier === 'quick_build' ? 'Quick Build — Website Package' : 'Launchpad — Spec Package',
            description: session.problem ? `Project: ${session.problem.substring(0, 100)}` : 'HITL-AI-DLC Build',
          },
        },
        quantity: 1,
      }];
    }

    if (session.lead_email) {
      checkoutConfig.customer_email = session.lead_email;
    }

    const checkoutSession = await stripe.checkout.sessions.create(checkoutConfig);

    // Store Stripe session ID
    await supabase.from('sessions').update({
      stripe_session_id: checkoutSession.id,
    }).eq('id', session_id);

    return new Response(JSON.stringify({
      clientSecret: checkoutSession.client_secret,
      sessionId: checkoutSession.id,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/create-checkout',
};
