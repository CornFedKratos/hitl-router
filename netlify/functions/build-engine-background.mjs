import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from './notify.mjs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ttvhafsvfhsanyucmcuw.supabase.co',
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

// ── HIT-65: Business category detection ──
function detectBusinessCategory(partialAnswers) {
  const text = JSON.stringify(partialAnswers || {}).toLowerCase();
  if (text.includes('inspect') || text.includes('contractor') || text.includes('plumb') || text.includes('hvac') || text.includes('roofing') || text.includes('electric'))
    return 'professional_trades';
  if (text.includes('law') || text.includes('legal') || text.includes('attorney'))
    return 'legal_professional';
  if (text.includes('develop') || text.includes('software') || text.includes('saas') || text.includes('tech'))
    return 'tech_services';
  if (text.includes('restaurant') || text.includes('food') || text.includes('cafe') || text.includes('catering'))
    return 'food_hospitality';
  if (text.includes('health') || text.includes('medical') || text.includes('wellness') || text.includes('therapy') || text.includes('dental'))
    return 'health_wellness';
  if (text.includes('real estate') || text.includes('realtor') || text.includes('property'))
    return 'real_estate';
  return 'professional_services';
}

// ── HIT-67: Full design systems per business category ──
const DESIGN_SYSTEMS = {
  tech_services: {
    emotionalTarget: 'Precision. Confidence. Gets things done without drama.',
    tokens: {
      brand: '#0f172a', brandMid: '#1e293b',
      accent: '#3b82f6', accentHover: '#2563eb',
      surface: '#ffffff', surfaceAlt: '#f8fafc', surfaceCard: '#ffffff',
      text: '#0f172a', textSecondary: '#475569', textMuted: '#94a3b8',
      border: '#e2e8f0', borderStrong: '#cbd5e1',
      shadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
      shadowHover: '0 4px 6px rgba(0,0,0,0.07), 0 12px 32px rgba(0,0,0,0.12)',
      radius: '8px', radiusLarge: '16px',
    },
    typography: {
      import: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      heroSize: 'clamp(3rem, 7vw, 5.5rem)', heroWeight: '800',
      heroLetterSpacing: '-0.03em', heroLineHeight: '1.0',
      h2Size: 'clamp(2rem, 4vw, 3rem)', h2Weight: '700',
      bodySize: '1.1rem', bodyWeight: '400', bodyLineHeight: '1.7',
    },
    hero: {
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
      textColor: '#ffffff', accentColor: '#3b82f6', minHeight: '92vh',
      pattern: 'subtle dot grid at 3% white opacity over gradient',
    },
    cards: { style: 'border-left: 3px solid accent, numbered label (01, 02, 03) top-left', avoid: 'emoji icons, gradient card backgrounds' },
    avoid: ['warm colors — not a trades or hospitality category', 'rounded hero sections', 'stock photo placeholders', 'centered text in cards', 'any purple or teal accent', 'generic blue (#2563eb) — use the specific accent token'],
  },
  professional_trades: {
    emotionalTarget: 'Trust. Family. Reliability. They have been here before you and they will be here after.',
    tokens: {
      brand: '#1a3a2e', brandMid: '#2d5a47',
      accent: '#c8a96e', accentHover: '#b8935a',
      surface: '#faf9f7', surfaceAlt: '#f4f0eb', surfaceCard: '#ffffff',
      text: '#1a1a1a', textSecondary: '#5a5a5a', textMuted: '#8a8a8a',
      border: '#e8e0d4', borderStrong: '#d4c9b8',
      shadow: '0 2px 12px rgba(26,58,46,0.08)',
      shadowHover: '0 8px 32px rgba(26,58,46,0.16)',
      radius: '10px', radiusLarge: '18px',
    },
    typography: {
      import: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600&display=swap",
      heroFamily: "'Playfair Display', Georgia, serif",
      bodyFamily: "'Inter', -apple-system, sans-serif",
      fontFamily: "'Inter', -apple-system, sans-serif",
      heroSize: 'clamp(3rem, 6vw, 5rem)', heroWeight: '800',
      heroLetterSpacing: '-0.02em', heroLineHeight: '1.1',
      h2Size: 'clamp(1.8rem, 3.5vw, 2.5rem)', h2Weight: '700',
      bodySize: '1.1rem', bodyWeight: '400', bodyLineHeight: '1.7',
    },
    hero: {
      background: 'layered: deep forest green (#1a3a2e) with subtle cross/plus pattern at 4% white opacity',
      textColor: '#ffffff', accentColor: '#c8a96e', minHeight: '90vh',
    },
    cards: { style: 'border-top: 3px solid brand, warm shadow, generous padding', avoid: 'flat cold cards, tech-style minimal design' },
    avoid: ['cold blues or grays', 'tech-style flat design', 'emoji icons', 'anything that looks like a software product', 'thin lightweight typography — this category demands weight and presence'],
  },
  legal_professional: {
    emotionalTarget: 'Authority. Discretion. Absolute competence. The adult in the room.',
    tokens: {
      brand: '#1a1f3d', brandMid: '#2a3050',
      accent: '#b8976a', accentHover: '#a6834f',
      surface: '#ffffff', surfaceAlt: '#f7f6f4', surfaceCard: '#ffffff',
      text: '#1a1a1a', textSecondary: '#4a4a4a', textMuted: '#7a7a7a',
      border: '#e4e0da', borderStrong: '#ccc5b8',
      shadow: '0 2px 8px rgba(26,31,61,0.06)',
      shadowHover: '0 6px 24px rgba(26,31,61,0.12)',
      radius: '6px', radiusLarge: '12px',
    },
    typography: {
      import: "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600&display=swap",
      heroFamily: "'DM Serif Display', Georgia, serif",
      bodyFamily: "'Inter', -apple-system, sans-serif",
      fontFamily: "'Inter', -apple-system, sans-serif",
      heroSize: 'clamp(2.8rem, 5.5vw, 4.5rem)', heroWeight: '400',
      heroLetterSpacing: '-0.01em', heroLineHeight: '1.15',
      h2Size: 'clamp(1.6rem, 3vw, 2.2rem)', h2Weight: '600',
      bodySize: '1.05rem', bodyWeight: '400', bodyLineHeight: '1.75',
    },
    hero: {
      background: 'deep navy (#1a1f3d) with very subtle diagonal pinstripe at 2% white opacity',
      textColor: '#ffffff', accentColor: '#b8976a', minHeight: '88vh',
    },
    cards: { style: 'clean border, minimal shadow, serif number or icon, generous whitespace', avoid: 'bright colors, playful elements, anything casual' },
    avoid: ['bright saturated colors', 'playful or casual design elements', 'rounded corners larger than 8px', 'emoji or icon fonts', 'anything that undermines gravity'],
  },
  food_hospitality: {
    emotionalTarget: 'Warmth. Appetite. Come in, sit down, you are welcome here.',
    tokens: {
      brand: '#2c1810', brandMid: '#4a2c1c',
      accent: '#d4633a', accentHover: '#c04e28',
      surface: '#fdf8f3', surfaceAlt: '#f5ebe0', surfaceCard: '#ffffff',
      text: '#2c1810', textSecondary: '#6b4c3b', textMuted: '#9a8072',
      border: '#e8ddd2', borderStrong: '#d4c4b0',
      shadow: '0 2px 16px rgba(44,24,16,0.08)',
      shadowHover: '0 8px 32px rgba(44,24,16,0.14)',
      radius: '12px', radiusLarge: '20px',
    },
    typography: {
      import: "https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700;800&family=Inter:wght@400;500;600&display=swap",
      heroFamily: "'Fraunces', Georgia, serif",
      bodyFamily: "'Inter', -apple-system, sans-serif",
      fontFamily: "'Inter', -apple-system, sans-serif",
      heroSize: 'clamp(3rem, 6vw, 5rem)', heroWeight: '700',
      heroLetterSpacing: '-0.02em', heroLineHeight: '1.1',
      h2Size: 'clamp(1.8rem, 3.5vw, 2.5rem)', h2Weight: '700',
      bodySize: '1.1rem', bodyWeight: '400', bodyLineHeight: '1.7',
    },
    hero: {
      background: 'warm dark brown (#2c1810) with subtle linen/paper texture at 5% opacity',
      textColor: '#ffffff', accentColor: '#d4633a', minHeight: '90vh',
    },
    cards: { style: 'warm shadow, rounded corners 12px, slight warm background tint on hover', avoid: 'cold corporate cards, sharp edges, tech aesthetic' },
    avoid: ['cold blues or grays', 'corporate flat design', 'sharp geometric patterns', 'small thin typography', 'anything that feels clinical'],
  },
  health_wellness: {
    emotionalTarget: 'Calm. Safety. You are in capable hands. Breathe.',
    tokens: {
      brand: '#1a4a4a', brandMid: '#2a6060',
      accent: '#4aa89a', accentHover: '#3d9488',
      surface: '#ffffff', surfaceAlt: '#f0f7f6', surfaceCard: '#ffffff',
      text: '#1a2e2e', textSecondary: '#4a6565', textMuted: '#7a9999',
      border: '#d8e8e6', borderStrong: '#b8d4d0',
      shadow: '0 2px 12px rgba(26,74,74,0.06)',
      shadowHover: '0 6px 24px rgba(26,74,74,0.10)',
      radius: '12px', radiusLarge: '20px',
    },
    typography: {
      import: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      fontFamily: "'Inter', -apple-system, sans-serif",
      heroSize: 'clamp(2.5rem, 5vw, 4rem)', heroWeight: '700',
      heroLetterSpacing: '-0.02em', heroLineHeight: '1.15',
      h2Size: 'clamp(1.6rem, 3vw, 2.2rem)', h2Weight: '600',
      bodySize: '1.1rem', bodyWeight: '400', bodyLineHeight: '1.8',
    },
    hero: {
      background: 'deep teal (#1a4a4a) with very soft radial gradient lighter at center',
      textColor: '#ffffff', accentColor: '#4aa89a', minHeight: '88vh',
    },
    cards: { style: 'soft shadow, generous radius, calming spacing, no hard edges', avoid: 'sharp angles, aggressive colors, dense layouts' },
    avoid: ['aggressive or urgent design language', 'sharp corners or hard edges', 'saturated reds or oranges', 'dense information layout', 'anything that raises heart rate instead of lowering it'],
  },
  professional_services: {
    emotionalTarget: 'Competence. Clarity. We understand your problem and we solve it.',
    tokens: {
      brand: '#1e293b', brandMid: '#334155',
      accent: '#6366f1', accentHover: '#4f46e5',
      surface: '#ffffff', surfaceAlt: '#f8fafc', surfaceCard: '#ffffff',
      text: '#1e293b', textSecondary: '#475569', textMuted: '#94a3b8',
      border: '#e2e8f0', borderStrong: '#cbd5e1',
      shadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)',
      shadowHover: '0 4px 6px rgba(0,0,0,0.07), 0 10px 28px rgba(0,0,0,0.10)',
      radius: '8px', radiusLarge: '16px',
    },
    typography: {
      import: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      heroSize: 'clamp(2.8rem, 6vw, 4.5rem)', heroWeight: '800',
      heroLetterSpacing: '-0.03em', heroLineHeight: '1.05',
      h2Size: 'clamp(1.8rem, 3.5vw, 2.5rem)', h2Weight: '700',
      bodySize: '1.05rem', bodyWeight: '400', bodyLineHeight: '1.7',
    },
    hero: {
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)',
      textColor: '#ffffff', accentColor: '#6366f1', minHeight: '90vh',
      pattern: 'subtle grid pattern at 3% white opacity',
    },
    cards: { style: 'clean border or left accent, numbered label, professional spacing', avoid: 'playful elements, warm colors unless brand dictates' },
    avoid: ['playful or casual design elements', 'warm earthy tones unless brand-specific', 'emoji or decorative icons', 'generic blue (#2563eb)'],
  },
  real_estate: {
    emotionalTarget: 'Aspiration. Premium. Your future starts here.',
    tokens: {
      brand: '#1a1a2e', brandMid: '#2a2a40',
      accent: '#c9a84c', accentHover: '#b8952e',
      surface: '#ffffff', surfaceAlt: '#f8f7f5', surfaceCard: '#ffffff',
      text: '#1a1a1a', textSecondary: '#4a4a4a', textMuted: '#8a8a8a',
      border: '#e8e4dc', borderStrong: '#d4cec2',
      shadow: '0 2px 12px rgba(26,26,46,0.06)',
      shadowHover: '0 8px 32px rgba(26,26,46,0.12)',
      radius: '8px', radiusLarge: '16px',
    },
    typography: {
      import: "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap",
      heroFamily: "'DM Serif Display', Georgia, serif",
      bodyFamily: "'Inter', -apple-system, sans-serif",
      fontFamily: "'Inter', -apple-system, sans-serif",
      heroSize: 'clamp(3rem, 6vw, 5rem)', heroWeight: '400',
      heroLetterSpacing: '-0.01em', heroLineHeight: '1.1',
      h2Size: 'clamp(1.8rem, 3.5vw, 2.5rem)', h2Weight: '600',
      bodySize: '1.05rem', bodyWeight: '400', bodyLineHeight: '1.7',
    },
    hero: {
      background: 'deep dark (#1a1a2e) with subtle diagonal line pattern at 2% white opacity',
      textColor: '#ffffff', accentColor: '#c9a84c', minHeight: '92vh',
    },
    cards: { style: 'clean, premium shadow, gold accent details', avoid: 'casual elements, bright primary colors' },
    avoid: ['casual or playful design', 'bright primary colors', 'tech-style flat design', 'anything that undermines premium feel'],
  },
};

// ── HIT-68: Section specs per category ──
const SECTION_SPECS = {
  tech_services: [
    { id: 'hero', purpose: 'Stop the scroll. Communicate expertise and speed in under 5 seconds.',
      layout: 'Full-width dark hero, left-aligned content, 92vh minimum. NOT centered.',
      headline: { strategy: 'Lead with the outcome the client gets, not what you do. "Shipped in 2 weeks." not "Full-stack Developer."', pattern: 'Short. Punchy. 4-6 words max. High contrast on dark.', accent: 'Highlight the differentiating phrase in accent color using a <span>' },
      subhead: 'One sentence. What you do, who for, and the proof that you deliver.',
      cta: 'Action-oriented. "Start your project" or "Let\'s build it." Never "Contact me."',
      visualDetail: 'Subtle dot grid or diagonal line pattern at 3-4% white opacity over dark background' },
    { id: 'proof', purpose: 'Kill the "can you actually deliver?" objection before they think it.',
      layout: '3-4 stat blocks in a row, clean and minimal. Numbers front and center.',
      copy: 'Real numbers from session data only. Timeline, project count, delivery rate. Never "100%" or made-up round numbers.',
      visualDetail: 'Thin top border in accent color on each stat block' },
    { id: 'services', purpose: 'Make the scope of what they can hire you for crystal clear.',
      layout: '3-column card grid. Each card: numbered label (01, 02, 03), title, 2-sentence description, one specific outcome.',
      copy: { strategy: 'Write from the client\'s perspective — "You get X" not "I do Y"', cardTitle: 'Short. Specific. "2-Week Web App" not "Web Applications"', description: 'What they get + one proof point or differentiator' },
      visualDetail: 'Left border in accent color, or numbered label in brand color top-left',
      forbidden: 'Emoji icons. Generic descriptions. Identical card structures.' },
    { id: 'work', purpose: 'Show don\'t tell. 2-3 project examples that prove delivery.',
      layout: 'Card grid with project name, one-line description, tech stack tags, and timeline/outcome.',
      copy: 'Use session data project examples if available. If not, plausible examples matching business type.',
      visualDetail: 'Dark card background for contrast against light section' },
    { id: 'contact', purpose: 'Remove every barrier between interest and action.',
      layout: 'Split: left side has "why contact" copy, right side has form + direct contact methods.',
      copy: 'Left copy answers: "What happens when I reach out?" — response time, process, no-pressure language.',
      form: 'Name, email, project description, timeline dropdown. Submit button full-width.',
      directContact: 'All available methods from session data: email, phone, text. Make them clickable.',
      forbidden: 'Contact form alone with no other options. Generic "Get in touch" headline.' },
  ],
  professional_trades: [
    { id: 'hero', purpose: 'Make them feel safe. This person has done this a thousand times.',
      layout: 'Full-width dark hero with warm tones, left-aligned or slightly centered. 90vh minimum.',
      headline: { strategy: 'Lead with trust and longevity. "20 years protecting families" not "Home Inspector."', pattern: 'Serif headline, 4-8 words, warm gold accent on the differentiating phrase.', accent: 'Accent the trust phrase — the years, the family, the guarantee — in warm gold' },
      subhead: 'One sentence. Licensed, experienced, local. The three things that matter.',
      cta: 'Direct and warm. "Schedule Your Inspection" or "Get a Free Quote." Not "Submit."',
      visualDetail: 'Subtle cross/plus pattern at 4% white opacity on dark forest green' },
    { id: 'credentials', purpose: 'Prove they are licensed, insured, and have done this before.',
      layout: '3-4 credential badges or stat blocks. License numbers, years in business, areas served.',
      copy: 'Real credentials from session data. License numbers, certifications, years. No generic "certified professional."',
      visualDetail: 'Warm background (surfaceAlt), trust-forward layout' },
    { id: 'services', purpose: 'Show every service they offer — clients need to know the full scope.',
      layout: 'Card grid with brand-colored top border. Each card: service name, 2-sentence description, what the client gets.',
      copy: { strategy: 'Write like a neighbor explaining what they do — warm, clear, no jargon.', cardTitle: 'Specific service name — "Pre-Purchase Inspection" not "Inspection Services"', description: 'What happens during this service + what the client walks away with' },
      visualDetail: 'Brand-colored top border on each card, warm shadow',
      forbidden: 'Cold corporate language. Emoji icons. Vague "and more" descriptions.' },
    { id: 'serviceArea', purpose: 'Make it clear where they work — local businesses live and die by geography.',
      layout: 'Text block or simple list of towns/counties/states served.',
      copy: 'List actual service areas from session data. "Serving Marion, Cedar Rapids, and all of Linn County."',
      visualDetail: 'Clean section with subtle background' },
    { id: 'contact', purpose: 'Make calling or emailing as easy as possible. Trades clients call — they do not fill out forms.',
      layout: 'Split or stacked: phone number large and tappable, email, form as backup.',
      copy: 'Lead with "Call or text anytime" energy. The phone number should be the largest element.',
      form: 'Name, phone, email, property address, service needed dropdown.',
      directContact: 'Phone number huge and tappable (tel: link). Email clickable. Physical address if available.',
      forbidden: 'Form-only contact. Hiding the phone number. "We will get back to you" without a timeframe.' },
  ],
  // Other categories use a sensible default derived from professional_services
};

// ── HIT-68: Copy direction system ──
const COPY_DIRECTION = `COPY DIRECTION — Follow these rules for every word you write:

Voice: Write in second person ("you get", "your project", "your clients") — never third person.

Headlines: Outcome-first. The result the client gets, not what you do.
  YES: "Shipped in 2 weeks. No exceptions."
  NO: "Professional Full-Stack Development"

Subheads: One sentence. Specific. Includes a proof point or qualifier.
  YES: "Web apps and e-commerce for small businesses that need to launch fast, not perfect."
  NO: "I build modern web applications for clients."

Service descriptions: 2 sentences. First = what you get. Second = what makes it different.
  YES: "A complete web app from design to deployment, in 14 days. I've done it 40+ times."
  NO: "Custom web applications with modern frameworks and best practices."

CTAs: Active verb + specific outcome.
  YES: "Start your project →"
  NO: "Submit" or "Send Message"

Stats: Real numbers only. If you do not have them, use a credibility statement instead.
  YES: "23 projects delivered in 2024"
  NO: "100% Satisfaction" or "S-M Project Focus"

Tone: Confident but not arrogant. The copy should sound like someone who is very good at what they do and does not need to prove it with adjectives.`;

// ── HIT-69: Muse intake → design overrides ──
function museToDesignOverrides(museAnswers, categoryTokens) {
  if (!museAnswers || typeof museAnswers !== 'object') return {};
  const overrides = {};

  // Pair A: Clean/Minimal vs Warm/Personal
  if (museAnswers.styleA === 'clean_minimal') {
    overrides.heroLayout = 'left-aligned, generous whitespace, minimal decoration';
    overrides.sectionDensity = 'low — let content breathe, more whitespace between elements';
    overrides.cardStyle = 'border only, no background fill, maximum negative space';
  } else if (museAnswers.styleA === 'warm_personal') {
    overrides.heroLayout = 'centered or slightly left, warmer background, more textural';
    overrides.sectionDensity = 'medium — warmer and more inviting, content closer together';
    overrides.cardStyle = 'soft shadow, subtle warm background tint';
  }

  // Pair B: Bold/Confident vs Calm/Trustworthy
  if (museAnswers.styleB === 'bold_confident') {
    overrides.heroWeight = '900';
    overrides.heroSize = 'clamp(3.5rem, 8vw, 6.5rem)';
    overrides.accentUsage = 'aggressive — use accent color on headlines, CTAs, and key phrases';
  } else if (museAnswers.styleB === 'calm_trustworthy') {
    overrides.heroWeight = '700';
    overrides.heroSize = 'clamp(2.8rem, 5vw, 4.5rem)';
    overrides.accentUsage = 'restrained — accent on CTAs only, let the content build trust quietly';
  }

  // Pair C: Photo-forward vs Type-forward
  if (museAnswers.styleC === 'type_forward') {
    overrides.heroBackground = 'dark solid or subtle pattern — no image placeholders, typography IS the design';
    overrides.visualHierarchy = 'typography-led — make the type exceptional, it carries the entire visual weight';
  } else if (museAnswers.styleC === 'photo_forward') {
    overrides.heroBackground = 'full-bleed dark overlay with reserved space for future photography';
    overrides.visualHierarchy = 'image-supported — imagery leads where available, text complements';
  }

  return overrides;
}

const EMOTION_TO_COPY_TONE = {
  trust: 'Write with authority and specificity. Every claim backed by a proof point. No hyperbole.',
  excitement: 'More energy in the copy. Short punchy sentences. Forward momentum. The reader should feel like something is about to happen.',
  relief: 'Speak to the pain first. "You\'ve been looking for someone who..." Lead with empathy before solution.',
  safety: 'Credentials front and center. Licensed, insured, experienced — say it early and say it clearly.',
  confidence: 'Declarative statements. No hedging. "We deliver in 2 weeks" not "We aim to deliver..."',
  warmth: 'Personal, approachable voice. First person where natural. The person behind the business comes through.',
  professionalism: 'Clean, precise language. No personality puns or casual slang. Every word earns its place.',
};

const INSPIRATION_SIGNALS = {
  apple: 'Maximum whitespace. Typography as the primary design element. One focal point per section. Nothing decorative — everything earns its place.',
  stripe: 'Dark hero with subtle gradient. Precise technical copy. Card-based information architecture. Feels engineered.',
  airbnb: 'Photography-led. Warm and welcoming. Trust signals prominent. Community language. Rounded, friendly.',
  nike: 'Bold. High contrast. Motion and energy. Minimal text, maximum impact. The hero should hit you.',
  squarespace: 'Editorial. Magazine-like layouts. Strong image/type relationship. Elegant restraint.',
  notion: 'Clean, functional, typography-first. Systematic spacing. Nothing gratuitous. Feels organized.',
  linear: 'Dark mode aesthetic. Subtle gradients and glows. Precise, developer-focused. Purple-shifted.',
};

function parseInspirationSignals(inspirationText) {
  if (!inspirationText) return null;
  const signals = [];
  const lower = inspirationText.toLowerCase();
  for (const [brand, signal] of Object.entries(INSPIRATION_SIGNALS)) {
    if (lower.includes(brand)) signals.push(signal);
  }
  return signals.length ? signals.join(' ') : null;
}

// ── HIT-66: Few-shot reference HTML for quality anchoring ──
const REFERENCE_EXAMPLES = {
  professional_trades: `<!-- REFERENCE: Professional Trades Hero + Card — match or exceed this standard -->
<style>
  :root {
    --brand: #1a3a2e;
    --brand-light: #e8f0ec;
    --accent: #c8a96e;
    --text: #1a1a1a;
    --text-muted: #5a5a5a;
    --bg: #faf9f7;
  }
  .hero {
    min-height: 90vh;
    display: flex; align-items: center;
    background:
      linear-gradient(135deg, rgba(26,58,46,0.97) 0%, rgba(26,58,46,0.85) 100%),
      url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    padding: 80px 24px;
  }
  .hero h1 {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(2.8rem, 6vw, 5rem); font-weight: 800;
    letter-spacing: -0.03em; line-height: 1.05;
    color: #ffffff; margin-bottom: 24px;
  }
  .hero h1 span { color: var(--accent); }
  .hero p {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 1.25rem; color: rgba(255,255,255,0.82);
    max-width: 560px; line-height: 1.6; margin-bottom: 40px;
  }
  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 18px 36px; background: var(--accent); color: #1a1a1a;
    font-weight: 700; font-size: 1rem; letter-spacing: 0.01em;
    border-radius: 6px; text-decoration: none; border: none; cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: 0 4px 20px rgba(200,169,110,0.3);
  }
  .btn-primary:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 32px rgba(200,169,110,0.45);
  }
  .service-card {
    background: #ffffff; border-radius: 12px;
    padding: 40px 32px; border-top: 3px solid var(--brand);
    box-shadow: 0 2px 24px rgba(0,0,0,0.06);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
  }
  .service-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.12);
  }
  .service-number {
    font-size: 0.75rem; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--brand); margin-bottom: 16px;
  }
  .service-card h3 {
    font-size: 1.35rem; font-weight: 700;
    letter-spacing: -0.01em; color: var(--text); margin-bottom: 12px;
  }
  .service-card p { color: var(--text-muted); line-height: 1.6; }
</style>
<section class="hero">
  <div>
    <h1>The inspection<br><span>families trust</span><br>most.</h1>
    <p>20+ years protecting Marion families from costly surprises. Licensed in Iowa, Illinois, and Wisconsin.</p>
    <a href="#contact" class="btn-primary">Schedule Your Inspection →</a>
  </div>
</section>
<div class="service-card">
  <div class="service-number">01</div>
  <h3>Pre-Purchase Inspection</h3>
  <p>Know exactly what you're buying before you sign. We find the problems other inspectors miss — and we explain every one in plain language.</p>
</div>`,

  tech_services: `<!-- REFERENCE: Tech Services Hero + Card — match or exceed this standard -->
<style>
  :root {
    --brand: #0f172a;
    --accent: #3b82f6;
    --text: #0f172a;
    --text-muted: #94a3b8;
    --bg: #ffffff;
  }
  .hero {
    min-height: 92vh;
    display: flex; align-items: center;
    background:
      linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%),
      url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='1' fill='rgba(255,255,255,0.03)'/%3E%3C/svg%3E");
    padding: 80px 24px;
  }
  .hero-inner { max-width: 720px; }
  .hero h1 {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: clamp(3rem, 7vw, 5.5rem); font-weight: 800;
    letter-spacing: -0.03em; line-height: 1.0;
    color: #ffffff; margin-bottom: 24px;
  }
  .hero h1 span { color: var(--accent); }
  .hero p {
    font-size: 1.2rem; color: rgba(255,255,255,0.7);
    max-width: 540px; line-height: 1.65; margin-bottom: 40px;
  }
  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 16px 32px; background: var(--accent); color: #ffffff;
    font-weight: 600; font-size: 0.95rem; letter-spacing: 0.01em;
    border-radius: 8px; text-decoration: none; border: none; cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: 0 4px 16px rgba(59,130,246,0.3);
  }
  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(59,130,246,0.4);
  }
  .service-card {
    background: #ffffff; border-radius: 8px;
    padding: 36px 28px; border-left: 3px solid var(--accent);
    box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .service-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 6px rgba(0,0,0,0.07), 0 12px 32px rgba(0,0,0,0.12);
  }
  .service-number {
    font-size: 0.7rem; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 14px;
    font-family: 'Inter', monospace;
  }
  .service-card h3 {
    font-size: 1.25rem; font-weight: 700;
    letter-spacing: -0.01em; color: var(--text); margin-bottom: 10px;
  }
  .service-card p { color: var(--text-muted); line-height: 1.6; font-size: 0.95rem; }
</style>
<section class="hero">
  <div class="hero-inner">
    <h1>Shipped in<br><span>2 weeks.</span><br>No exceptions.</h1>
    <p>Full-stack web apps for small businesses that need to launch fast, not perfect. 40+ projects delivered.</p>
    <a href="#contact" class="btn-primary">Start your project →</a>
  </div>
</section>
<div class="service-card">
  <div class="service-number">01</div>
  <h3>2-Week Web App</h3>
  <p>From first call to deployed product in 14 days. You get a working app, not a prototype. Built 40+ of these.</p>
</div>`,
};

// ── HIT-69: Build Muse override prompt block ──
function buildMuseOverrideBlock(museAnswers, category) {
  if (!museAnswers || typeof museAnswers !== 'object') return '';
  const ds = DESIGN_SYSTEMS[category] || DESIGN_SYSTEMS.professional_services;
  const overrides = museToDesignOverrides(museAnswers, ds.tokens);
  const lines = [];

  if (Object.keys(overrides).length > 0) {
    lines.push('=== MUSE DESIGN OVERRIDES (from client intake — these override category defaults) ===');
    for (const [key, val] of Object.entries(overrides)) {
      lines.push(`${key}: ${val}`);
    }
    lines.push('=== END MUSE OVERRIDES ===');
  }

  // Emotion → copy tone
  if (museAnswers.emotions && Array.isArray(museAnswers.emotions)) {
    const tones = museAnswers.emotions
      .map(e => EMOTION_TO_COPY_TONE[e])
      .filter(Boolean);
    if (tones.length) {
      lines.push(`\nCOPY TONE (derived from client emotional intent):\n${tones.join('\n')}`);
    }
  }

  // Inspiration signals
  const signals = parseInspirationSignals(museAnswers.inspiration);
  if (signals) {
    lines.push(`\nINSPIRATION SIGNALS (the client referenced these — apply their design patterns):\n${signals}`);
  }

  // What to avoid — hard rules
  if (museAnswers.avoid) {
    lines.push(`\nADDITIONAL CLIENT AVOIDANCES (from intake — treat as hard rules, never violate):\n${museAnswers.avoid}`);
  }

  // Brand personality → voice override
  if (museAnswers.personality) {
    lines.push(`\nBRAND VOICE (the client described their business as): "${museAnswers.personality}"\nWrite all copy as if this describes the person behind the site. If they said "like a trusted neighbor" — write warmly and personally. If they said "like a surgeon" — write with precision and authority. This is not a suggestion. This is the voice.`);
  }

  return lines.join('\n');
}

// ── Build design system prompt block ──
function buildDesignSystemBlock(category) {
  const ds = DESIGN_SYSTEMS[category] || DESIGN_SYSTEMS.professional_services;
  const t = ds.tokens;
  const ty = ds.typography;
  return `=== DESIGN SYSTEM: ${category.toUpperCase()} ===
Emotional target: ${ds.emotionalTarget}

TOKENS (use these exactly — do not invent alternatives):
Brand: ${t.brand} | Brand Mid: ${t.brandMid}
Accent: ${t.accent} | Accent Hover: ${t.accentHover}
Surface: ${t.surface} | Surface Alt: ${t.surfaceAlt} | Surface Card: ${t.surfaceCard}
Text: ${t.text} | Text Secondary: ${t.textSecondary} | Text Muted: ${t.textMuted}
Border: ${t.border} | Border Strong: ${t.borderStrong}
Shadow: ${t.shadow}
Shadow Hover: ${t.shadowHover}
Radius: ${t.radius} | Radius Large: ${t.radiusLarge}

TYPOGRAPHY:
Font Import: ${ty.import}
${ty.heroFamily ? `Hero Font: ${ty.heroFamily}` : ''}
Body Font: ${ty.fontFamily}
Hero: ${ty.heroSize}, weight ${ty.heroWeight}, letter-spacing ${ty.heroLetterSpacing}, line-height ${ty.heroLineHeight}
H2: ${ty.h2Size}, weight ${ty.h2Weight}
Body: ${ty.bodySize}, weight ${ty.bodyWeight}, line-height ${ty.bodyLineHeight}

HERO:
Background: ${ds.hero.background}
Text Color: ${ds.hero.textColor} | Accent: ${ds.hero.accentColor}
Min Height: ${ds.hero.minHeight}
${ds.hero.pattern ? `Pattern: ${ds.hero.pattern}` : ''}

CARDS: ${ds.cards.style}
Card Avoid: ${ds.cards.avoid}

CATEGORY AVOIDANCES (never do these for ${category}):
${ds.avoid.map(a => `- ${a}`).join('\n')}
=== END DESIGN SYSTEM ===`;
}

// ── Build section spec prompt block ──
function buildSectionSpecBlock(category) {
  const specs = SECTION_SPECS[category] || SECTION_SPECS.tech_services;
  const lines = ['=== SECTION SPECIFICATIONS (build exactly these sections in this order) ==='];
  for (const sec of specs) {
    lines.push(`\n--- SECTION: ${sec.id.toUpperCase()} ---`);
    lines.push(`Purpose: ${sec.purpose}`);
    lines.push(`Layout: ${sec.layout}`);
    if (sec.headline) {
      lines.push(`Headline strategy: ${sec.headline.strategy}`);
      lines.push(`Headline pattern: ${sec.headline.pattern}`);
      if (sec.headline.accent) lines.push(`Headline accent: ${sec.headline.accent}`);
    }
    if (sec.subhead) lines.push(`Subhead: ${sec.subhead}`);
    if (sec.cta) lines.push(`CTA: ${sec.cta}`);
    if (sec.copy && typeof sec.copy === 'string') lines.push(`Copy: ${sec.copy}`);
    if (sec.copy && typeof sec.copy === 'object') {
      lines.push(`Copy strategy: ${sec.copy.strategy}`);
      if (sec.copy.cardTitle) lines.push(`Card title: ${sec.copy.cardTitle}`);
      if (sec.copy.description) lines.push(`Description: ${sec.copy.description}`);
    }
    if (sec.form) lines.push(`Form: ${sec.form}`);
    if (sec.directContact) lines.push(`Direct contact: ${sec.directContact}`);
    if (sec.visualDetail) lines.push(`Visual detail: ${sec.visualDetail}`);
    if (sec.forbidden) lines.push(`FORBIDDEN in this section: ${sec.forbidden}`);
  }
  lines.push('\n=== END SECTION SPECIFICATIONS ===');
  return lines.join('\n');
}

// ── Build session content block for all agents ──
function buildSessionContent(ctx) {
  const pa = ctx.partial_answers || {};
  const lines = ['=== BUSINESS CONTENT (use this, never invent placeholder content) ==='];

  // Design path fields
  if (pa.business_name) lines.push(`Business Name: ${pa.business_name}`);
  if (pa.audience) lines.push(`Audience: ${pa.audience}`);
  if (pa.goal) lines.push(`Primary Goal: ${pa.goal}`);
  if (pa.feeling) lines.push(`Brand Feeling: ${pa.feeling}`);
  if (pa.style) lines.push(`Style Notes: ${pa.style}`);

  // Tech path fields
  if (ctx.problem) lines.push(`Problem: ${ctx.problem}`);
  if (ctx.solution) lines.push(`Solution: ${ctx.solution}`);
  if (ctx.audience && !pa.audience) lines.push(`Audience: ${ctx.audience}`);

  // Shared fields
  if (pa.timeline) lines.push(`Timeline: ${pa.timeline}`);
  if (pa.stakeholders) lines.push(`Stakeholders: ${pa.stakeholders}`);
  if (pa.existing_systems) lines.push(`Existing Systems: ${pa.existing_systems}`);
  if (pa.client) lines.push(`Project Type: ${pa.client}`);
  if (pa.constraints) lines.push(`Constraints: ${pa.constraints}`);

  // Contact info
  if (ctx.lead_email) lines.push(`Email: ${ctx.lead_email}`);
  if (ctx.lead_name) lines.push(`Contact Name: ${ctx.lead_name}`);

  lines.push(`Selected Direction: ${ctx.direction}`);
  lines.push('=== END BUSINESS CONTENT ===');

  return lines.join('\n');
}

// ── HIT-72: Full creative brief — pass EVERYTHING the client told us ──
function buildCreativeBrief(ctx) {
  const pa = ctx.partial_answers || {};
  const muse = ctx.muse_answers || {};
  const blocks = [];

  // 1. Every popup answer — the client's words, verbatim
  const answerEntries = Object.entries(pa).filter(([k, v]) => v && !k.startsWith('_'));
  if (answerEntries.length > 0) {
    blocks.push('=== WHAT THE CLIENT TOLD US (their exact words from intake) ===');
    for (const [key, val] of answerEntries) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      blocks.push(`${label}: ${val}`);
    }
    blocks.push('=== END CLIENT INTAKE ===');
  }

  // 2. Full Muse intake — inspiration, preferences, emotions, avoidances, personality
  const museEntries = Object.entries(muse).filter(([k, v]) => v && (typeof v === 'string' ? v.trim() : true));
  if (museEntries.length > 0) {
    blocks.push('\n=== DESIGN PREFERENCES (from the Muse intake — the client\'s creative voice) ===');
    if (muse.inspiration) blocks.push(`Inspiration & references they admire: ${muse.inspiration}`);

    // This or That — resolve picks back to full labels and descriptions
    const THIS_OR_THAT_PAIRS = [
      { a: { label: 'Clean & Minimal', desc: 'Like Stripe or Linear — lots of whitespace, simple, editorial' }, b: { label: 'Warm & Personal', desc: 'Like Mailchimp or Basecamp — friendly, approachable, human' } },
      { a: { label: 'Bold & Dramatic', desc: 'Strong contrast, large type, high energy' }, b: { label: 'Soft & Trustworthy', desc: 'Gentle colors, rounded shapes, professional calm' } },
      { a: { label: 'Photography-led', desc: 'Big images tell the story' }, b: { label: 'Typography-led', desc: 'Words and layout do the heavy lifting' } },
    ];
    for (const [key, val] of museEntries) {
      if (key.startsWith('this_or_that_')) {
        const pairIdx = parseInt(key.split('_').pop(), 10);
        const pair = THIS_OR_THAT_PAIRS[pairIdx];
        if (pair && pair[val]) {
          blocks.push(`Style preference: "${pair[val].label}" — ${pair[val].desc}`);
        }
      }
    }

    if (muse.emotion && Array.isArray(muse.emotion) && muse.emotion.length > 0) {
      blocks.push(`When someone lands on their site, they want them to feel: ${muse.emotion.join(', ')}`);
    }
    if (muse.avoid) blocks.push(`What they definitely DON'T want: ${muse.avoid}`);
    if (muse.personality) blocks.push(`If their business were a person: "${muse.personality}"`);
    blocks.push('=== END DESIGN PREFERENCES ===');
  }

  // 3. Carl's design intent synthesis — the creative brief distilled
  if (ctx.design_intent) {
    blocks.push(`\n=== CARL'S CREATIVE DIRECTION (synthesized from the client's answers — this is your primary brief) ===\n${ctx.design_intent}\n=== END CREATIVE DIRECTION ===`);
  }

  // 4. Selected direction — full name and description, not just "A"
  const dirId = ctx.direction;
  const mockupResults = ctx.mockup_results || {};
  const directions = mockupResults.directions || [];
  const selectedDir = directions.find(d => d.id === dirId);
  if (selectedDir) {
    blocks.push(`\nSelected Direction: "${selectedDir.name}"\nDirection brief: ${selectedDir.framing || selectedDir.vision || ''}`);
    if (selectedDir.approach) blocks.push(`Approach: ${selectedDir.approach}`);
    if (selectedDir.features) blocks.push(`Key features: ${Array.isArray(selectedDir.features) ? selectedDir.features.join(', ') : selectedDir.features}`);
  } else if (dirId) {
    blocks.push(`\nSelected Direction: ${dirId}`);
  }

  // 5. Contact & business details — factual only
  const contactLines = [];
  if (ctx.lead_name) contactLines.push(`Name: ${ctx.lead_name}`);
  if (ctx.lead_email) contactLines.push(`Email: ${ctx.lead_email}`);
  if (pa.business_name) contactLines.push(`Business: ${pa.business_name}`);
  if (contactLines.length > 0) {
    blocks.push(`\n=== CONTACT DETAILS ===\n${contactLines.join('\n')}\n=== END CONTACT ===`);
  }

  return blocks.join('\n');
}

const AGENTS = [
  { role: 'CPO', name: 'Chief Product Officer', tone: 'warm, strategic',
    task: (tier, ctx) => {
      const content = buildSessionContent(ctx);
      return `You are the CPO opening the build. Summarize what this lead told us and confirm the build plan.

${content}

Tier: ${tier}

Write a brief (3-4 sentences) strategic summary confirming what we're building, for whom, and why it matters. Reference the actual business name and audience. End with: "I'm handing this to our CTO to scope the technical approach."`;
    }},
  { role: 'CTO', name: 'Chief Technology Officer', tone: 'precise, technical',
    task: (tier, ctx) => {
      const content = buildSessionContent(ctx);
      return tier === 'quick_build'
        ? `You are the CTO scoping a Quick Build website.

${content}

Generate:
1. Technical approach (2-3 sentences — reference the actual business and what they need)
2. Page structure (hero, services, about, contact form — populated with their real content)
3. Key features to implement (based on their stated goal and audience)
4. Any flags or risks

End with handoff to CDO: "Handing to our CDO to bring this to life."`
        : `You are the CTO scoping a Launchpad project.

${content}

Generate:
1. Technical approach (3-4 sentences)
2. Feature/epic list (5-8 items specific to this project)
3. Recommended tech stack
4. Complexity assessment and risks

End with handoff to CDO.`;
    }},
  { role: 'CDO', name: 'Chief Design Officer', tone: 'creative, visual',
    task: (tier, ctx) => {
      const pa = ctx.partial_answers || {};
      const category = detectBusinessCategory(pa);

      if (tier !== 'quick_build') {
        const content = buildSessionContent(ctx);
        return `You are the CDO creating a design direction for this specific project.

${content}

Generate:
1. UI/UX direction narrative — visual style, interaction philosophy, specific to this project
2. Key screen descriptions (3-4 screens with layout and content from the data above)
3. Design system basics (colors, typography, component patterns)
4. Accessibility considerations

Hand off to CQO.`;
      }

      // ── HIT-72: Creative-first CDO prompt ──
      const creativeBrief = buildCreativeBrief(ctx);

      return `You are a world-class web designer and front-end developer. A real client went through a detailed intake process to tell you exactly what they want. Your job is to read their brief deeply and build something that feels like it was made specifically for them — something they'll show off to everyone they know.

You have complete creative freedom. Choose your own typefaces (Google Fonts). Choose your own color palette. Decide which sections this client needs and in what order. Make every decision a designer would make — not a template would make.

Read every word of this brief. The client's voice is the most important thing in it.

${creativeBrief}

COPY RULES:
- Write in second person ("you get", "your project") — never third person
- Headlines are outcome-first: the result the client gets, not what you do
- Service descriptions: 2 sentences. What they get + what makes it different
- CTAs: active verb + specific outcome ("Start your project →" not "Submit")
- Confident but not arrogant. The copy should sound like someone who is very good at what they do.

THE ONLY HARD CONSTRAINTS:
- Use the client's actual content. Never invent placeholder businesses, names, or stats.
- If you don't have real numbers, use specific credibility statements — never "100%" or fabricated round numbers.
- Never fabricate portfolio projects. Use session data or omit the section entirely.
- No emoji icons anywhere.
- Include scroll-reveal animations (IntersectionObserver) and meaningful hover states on all interactive elements.
- Complete, self-contained HTML — all CSS in <style>, all JS in <script>.
- Import your chosen Google Font via <link> in <head>.
- Mobile-responsive with viewport meta tag and @media queries.
- Working contact form with action="#".
- Include ALL available contact methods from the brief (email, phone, etc.) — not just a form.

Everything else — typeface, palette, layout, section count, section order, spacing, visual details, animations, unexpected design moments — is your call. Make it extraordinary. Make the client feel like someone finally understood them.

Output ONLY the complete HTML. No markdown. No explanation.`;
    }},
  { role: 'CQO', name: 'Chief Quality Officer', tone: 'exacting, quality-focused',
    task: (tier, ctx, prev) => {
      const pa = ctx.partial_answers || {};
      const businessName = pa.business_name || ctx.problem || 'the business';
      return `You are the CQO reviewing the CDO's output.

VALIDATION CHECKLIST — verify the output contains:
${pa.business_name ? `- Business name "${pa.business_name}" appears in the HTML` : ''}
${pa.audience ? `- Audience "${pa.audience}" is addressed` : ''}
${pa.goal ? `- Primary goal "${pa.goal}" is supported by the design` : ''}
- Contact form is present and functional
- No placeholder/generic content (e.g., "John Doe", "Lorem ipsum", "Acme Corp")
- All sections populated with real business data

CDO output to review:
${(prev || '').substring(0, 3000)}

If the output uses the real business data throughout: "Approved — quality gate passed. Handing to CIO."
If generic/placeholder content is found: flag the specific sections that need real data. Hand off to CIO.`;
    }},
  { role: 'CIO', name: 'Chief Infrastructure Officer', tone: 'organized, systems-focused',
    task: (tier, ctx) => {
      const content = buildSessionContent(ctx);
      return tier === 'quick_build'
        ? `You are the CIO packaging the deliverables for this project.

${content}

Generate a project summary document:
1. Project Overview — the actual business, what was built, and for whom
2. What Was Delivered — list of deliverables with descriptions
3. Deployment Notes — how to host this HTML file (Netlify, Vercel, any static host)
4. Recommended Next Steps — custom domain, hosting, form handling, analytics, ongoing updates

Format as clean markdown. Reference the actual business name throughout. Hand off to CSO.`
        : `You are the CIO generating the spec package.

${content}

Generate:
1. PRD — problem, goals, user stories, success metrics (all specific to this project)
2. Feature Specifications — each feature with acceptance criteria in Gherkin format
3. Glossary — key terms defined
4. Risk Log — identified risks with mitigation strategies
5. Prioritized Roadmap — MVP → v1 → v2

Format as clean markdown. Hand off to CSO.`;
    }},
  { role: 'CSO', name: 'Chief Security Officer', tone: 'measured, risk-aware',
    task: (tier, ctx) => {
      const content = buildSessionContent(ctx);
      return tier === 'quick_build'
        ? `You are the CSO. Final security and compliance review.

${content}

Review the deliverables for:
1. Contact form safety (action="#" is acceptable for a static prototype)
2. No third-party scripts or tracking without disclosure
3. No PII collection beyond what's expected (name, email, phone via form)
4. Accessibility — alt text, semantic structure, keyboard navigation

If clear: "Security review passed. No concerns. Build complete."
If flags: note them with recommendations. Then: "Build complete — flagged items noted for review."`
        : `You are the CSO. Security review of the spec package.

${content}

Check for:
1. Features involving authentication, payments, or PII
2. Compliance-sensitive requirements (HIPAA, GDPR, PCI, etc.)
3. Third-party integration risks
4. Data storage and privacy considerations

Note findings with recommendations. Close: "Security review complete. Build complete."`;
    }},
];

// Background function — Netlify auto-returns 202, function runs up to 300s.

export default async (req) => {
  let session_id = null;

  try {
    const body = await req.json();
    session_id = body.session_id;
    if (!session_id) return new Response('session_id required', { status: 400 });

    // Verify payment
    const { data: session, error } = await supabase
      .from('sessions').select('*').eq('id', session_id).single();

    if (error || !session) {
      await supabase.from('sessions').update({
        build_phase: 'failed',
        build_results: { status: 'failed', error: 'Session not found' },
      }).eq('id', session_id);
      return new Response('Session not found', { status: 404 });
    }

    if (!session.payment_confirmed) {
      await supabase.from('sessions').update({
        build_phase: 'failed',
        build_results: { status: 'failed', error: 'Payment not confirmed' },
      }).eq('id', session_id);
      return new Response('Payment not confirmed', { status: 402 });
    }

    // Mark build started
    await supabase.from('sessions').update({
      build_results: null,
      build_engine_used: true,
      build_phase: 'cpo',
    }).eq('id', session_id);

    const tier = session.engagement_tier || 'launchpad';
    const ctx = {
      problem: session.problem || 'Not specified',
      solution: session.solution || 'Not specified',
      audience: session.audience || 'Not specified',
      direction: session.mockup_direction_selected || 'A',
      partial_answers: session.partial_answers || {},
      lead_name: session.lead_name || '',
      lead_email: session.lead_email || '',
      design_intent: session.design_intent || '',
      muse_answers: session.muse_answers || {},
      mockup_results: session.mockup_results || {},
    };

    const outputs = {};

    for (let i = 0; i < AGENTS.length; i++) {
      const agent = AGENTS[i];
      const prevOutput = i > 0 ? outputs[AGENTS[i - 1].role] || '' : '';

      await supabase.from('sessions').update({ build_phase: agent.role.toLowerCase() }).eq('id', session_id);

      const prompt = agent.task(tier, ctx, prevOutput);
      const systemPrompt = agent.role === 'CDO'
        ? `You are a world-class creative director and front-end developer. You build websites that make clients emotional — not templates that check boxes. Take your time. Build something extraordinary.`
        : `You are the ${agent.name}. Tone: ${agent.tone}. Be concise and deliver directly.`;

      // HIT-72: Log the exact prompt sent to each agent — no more guessing
      await supabase.from('kb_entries').insert({
        session_id, phase: 1, entry_type: 'session', visibility: 'internal',
        author: `${agent.role}_PROMPT`,
        summary: `${agent.name} — Prompt Sent`,
        details: `=== SYSTEM PROMPT ===\n${systemPrompt}\n=== END SYSTEM ===\n\n=== USER PROMPT ===\n${prompt}\n=== END USER PROMPT ===`.substring(0, 50000),
      });

      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: agent.role === 'CDO' ? 16000 : 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        });
        outputs[agent.role] = response.content[0]?.text || '';
      } catch (agentErr) {
        outputs[agent.role] = `[${agent.role} error: ${agentErr.message}]`;
      }

      await supabase.from('kb_entries').insert({
        session_id, phase: 1, entry_type: 'session', visibility: 'both',
        author: agent.role,
        summary: `${agent.name} — Build Output`,
        details: (outputs[agent.role] || '').substring(0, 10000),
      });

      // HIT-60: Validate CDO output contains actual business content
      if (agent.role === 'CDO' && tier === 'quick_build') {
        const cdoOutput = outputs.CDO || '';
        const businessName = (ctx.partial_answers?.business_name || '').toLowerCase();
        if (businessName && businessName.length > 2 && !cdoOutput.toLowerCase().includes(businessName)) {
          console.warn(`CDO output missing business name "${businessName}" — output may be generic`);
        }
      }
    }

    await supabase.from('sessions').update({
      build_phase: 'complete',
      build_completed_at: new Date().toISOString(),
      build_results: { status: 'complete', tier, outputs },
    }).eq('id', session_id);

    sendNotification('build_complete', {
      session_id, lead_name: session.lead_name, lead_email: session.lead_email,
      problem: session.problem, tier, payment_amount: session.payment_amount,
    });
    if (session.lead_email) {
      sendNotification('phase0_complete', {
        session_id, lead_email: session.lead_email,
        problem: session.problem, solution: session.solution, audience: session.audience,
      });
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('build-engine failed:', err.message);
    if (session_id) {
      try {
        await supabase.from('sessions').update({
          build_phase: 'failed',
          build_results: { status: 'failed', error: err.message },
        }).eq('id', session_id);
      } catch (writeErr) {
        console.error('Failed to write failure state:', writeErr.message);
      }
    }
    return new Response(err.message, { status: 500 });
  }
};

// No config.path — background functions use their filename as the route.
