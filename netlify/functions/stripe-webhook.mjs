import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from './notify.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  let event;
  try {
    if (endpointSecret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } else {
      event = JSON.parse(body);
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const checkoutSession = event.data.object;
    const hitlSessionId = checkoutSession.metadata?.hitl_session_id;

    if (hitlSessionId) {
      const amountTotal = checkoutSession.amount_total || 0;

      // Update session
      const { error } = await supabase
        .from('sessions')
        .update({
          payment_confirmed: true,
          payment_amount: amountTotal,
        })
        .eq('id', hitlSessionId);

      if (error) {
        console.error('Failed to update session after payment:', error.message);
      }

      // Notify Don
      const { data: session } = await supabase
        .from('sessions')
        .select('lead_name, lead_email, problem, engagement_tier')
        .eq('id', hitlSessionId)
        .single();

      if (session) {
        sendNotification('payment_received', {
          session_id: hitlSessionId,
          lead_name: session.lead_name,
          lead_email: session.lead_email,
          problem: session.problem,
          amount: amountTotal,
          tier: session.engagement_tier,
        });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  path: '/api/stripe-webhook',
};
