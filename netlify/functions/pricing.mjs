import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── Pricing config — all values in cents ──
const PRICING_CONFIG = {
  multiplier: 4,
  tier1Floor: 25000,     // $250
  tier1Ceiling: 150000,  // $1,500
  tier2Floor: 150000,    // $1,500
  tier2Ceiling: 500000,  // $5,000
  hourlyRate: 22500,    // $225/hr
  agencyBenchmarks: {
    quick_build: { low: 350000, high: 800000 },       // $3,500–$8,000
    launchpad: { low: 1500000, high: 3500000 },        // $15,000–$35,000
    full_engagement: { low: 7500000, high: 25000000 }, // $75,000–$250,000
  },
  // Sonnet 4 pricing per 1M tokens (in cents)
  modelRates: {
    input: 300,   // $3/1M input tokens
    output: 1500, // $15/1M output tokens
  },
};

const AGENT_TOKEN_ESTIMATES = {
  cpo: { input: 2000, output: 800 },
  cto: { input: 3000, output: 1200 },
  cdo: { input: 4000, output: 8000 },
  cqo: { input: 5000, output: 600 },
  cio: { input: 4000, output: 3000 },
  cso: { input: 3000, output: 400 },
};

function calculatePricing(tier) {
  const config = PRICING_CONFIG;
  const rates = config.modelRates;

  // Sum token costs across all agents
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const agent of Object.values(AGENT_TOKEN_ESTIMATES)) {
    totalInputTokens += agent.input;
    totalOutputTokens += agent.output;
  }

  // Tier 2 adds additional generation passes
  const tierMultiplier = tier === 'launchpad' ? 1.8 : 1.0;
  totalInputTokens = Math.ceil(totalInputTokens * tierMultiplier);
  totalOutputTokens = Math.ceil(totalOutputTokens * tierMultiplier);

  // Calculate raw API cost in cents
  const inputCost = (totalInputTokens / 1000000) * rates.input;
  const outputCost = (totalOutputTokens / 1000000) * rates.output;
  const estimatedApiCostCents = Math.ceil((inputCost + outputCost) * 100); // Convert to integer cents

  // AI build price = API cost × multiplier, rounded up to nearest $5
  let aiBuildPriceCents = Math.ceil((estimatedApiCostCents * config.multiplier) / 500) * 500;

  // Apply floor and ceiling
  const floor = tier === 'quick_build' ? config.tier1Floor : config.tier2Floor;
  const ceiling = tier === 'quick_build' ? config.tier1Ceiling : config.tier2Ceiling;
  const exceedsCeiling = aiBuildPriceCents > ceiling;
  aiBuildPriceCents = Math.max(floor, Math.min(ceiling, aiBuildPriceCents));

  // Human build estimate
  const humanHours = tier === 'quick_build' ? 20 : 80;
  const humanBuildPriceCents = humanHours * config.hourlyRate;

  // Agency benchmarks
  const benchmarks = config.agencyBenchmarks[tier] || config.agencyBenchmarks.launchpad;

  // Savings percentage
  const savingsPercentage = Math.round(((benchmarks.low - aiBuildPriceCents) / benchmarks.low) * 100);

  return {
    estimated_api_cost_cents: estimatedApiCostCents,
    ai_build_price_cents: aiBuildPriceCents,
    human_build_hours_estimate: humanHours,
    human_build_price_cents: humanBuildPriceCents,
    agency_low_estimate_cents: benchmarks.low,
    agency_high_estimate_cents: benchmarks.high,
    savings_percentage: savingsPercentage,
    exceeds_ceiling: exceedsCeiling,
  };
}

function formatPrice(cents) {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

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
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: session, error } = await supabase
      .from('sessions')
      .select('engagement_tier')
      .eq('id', session_id)
      .single();

    if (error || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tier = session.engagement_tier || 'launchpad';
    const pricing = calculatePricing(tier);

    // Write pricing to session
    await supabase.from('sessions').update({
      estimated_api_cost_cents: pricing.estimated_api_cost_cents,
      ai_build_price_cents: pricing.ai_build_price_cents,
      human_build_hours_estimate: pricing.human_build_hours_estimate,
      human_build_price_cents: pricing.human_build_price_cents,
      agency_low_estimate_cents: pricing.agency_low_estimate_cents,
      agency_high_estimate_cents: pricing.agency_high_estimate_cents,
      savings_percentage: pricing.savings_percentage,
      payment_required: true,
    }).eq('id', session_id);

    return new Response(JSON.stringify({
      tier,
      pricing: {
        ...pricing,
        ai_build_display: formatPrice(pricing.ai_build_price_cents),
        human_build_display: formatPrice(pricing.human_build_price_cents),
        agency_low_display: formatPrice(pricing.agency_low_estimate_cents),
        agency_high_display: formatPrice(pricing.agency_high_estimate_cents),
      },
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
  path: '/api/pricing',
};
