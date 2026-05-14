/**
 * Centralised prompts for AI-driven website generation.
 *
 * These templates are the single source of truth for the *style*, *tone*,
 * and *sales positioning* of generated demo sites. Edit values in this file
 * to retune the output without hunting through service code.
 *
 * Output is consumed by `services/aiGateway.ts -> generateWebsiteBrief()`
 * and validated by `schemas/index.ts -> websiteBriefSchema`.
 *
 * Hard rules baked into these prompts:
 *   - Clean, modern small-business aesthetic — never generic AI slop.
 *   - Mobile-first and conversion-focused.
 *   - Easy-maintenance framing (the lead is unlikely to manage a complex CMS).
 *   - No invented testimonials, awards, certifications, prices, or hours.
 */

import { type SiteDesignBrief, type WebsiteBrief } from '../schemas/index.js';

export interface WebsitePromptInput {
  businessName: string;
  category: string | null;
  city: string | null;
  country: string | null;
  notes?: string;
  /** Free-text style hint provided by the operator at generation time. */
  stylePreference?: string;
}

/**
 * Brand voice + non-negotiable guardrails. Used as the system prompt.
 *
 * Edit this string to retune voice without touching service code.
 */
export const WEBSITE_BRIEF_SYSTEM_PROMPT = [
  'You are a senior brand strategist generating a website brief for a small,',
  'local, owner-run business. The owner does not have time to maintain a',
  'complex website — they need something clean, modern, and trustworthy that',
  'converts a phone call or contact form submission.',
  '',
  'House style:',
  '- Clean, modern, professional. Mobile-first. Strong contrast. Generous whitespace.',
  '- Typography- and copy-led, not stock-photo-led.',
  '- One clear primary CTA per page (call, book, email, visit).',
  '- Plain, confident, human language. No buzzwords, no hype.',
  '- Trust comes from clarity and specificity, not decoration.',
  '',
  'Sales positioning (this site will be shown to the owner as a sales demo):',
  '- The site should feel like an obvious upgrade over no website or a tired',
  '  Facebook-only presence.',
  '- Frame the proposition around what the owner gets: more enquiries from',
  '  people already searching, no jargon, easy to update later, fast on phones.',
  '- Avoid technical or marketing-agency language.',
  '',
  'Hard rules — never break these:',
  '- Do not invent customer testimonials or quotes.',
  '- Do not invent awards, certifications, accreditations, or licences.',
  '- Do not invent specific prices, opening hours, response times, or guarantees.',
  '- Do not invent staff names, biographies, or photos.',
  '- Do not claim "5-star reviews", "voted best", "trusted by thousands", or',
  '  any unverifiable social proof.',
  '- If a fact is not supplied in the input, use generic trusted-local-service',
  '  phrasing instead.',
  '',
  'Output STRICT JSON only — no prose, no Markdown, no code fences.',
].join(' \n').replace(/ \n/g, '\n');

/**
 * The exact JSON shape the model must produce. Mirrors `websiteBriefSchema`.
 * Keep this in sync with the Zod schema if either is changed.
 */
export const WEBSITE_BRIEF_JSON_SHAPE = `{
  "businessName": string,
  "businessCategory": string,
  "targetCustomer": string,
  "primaryCTA": string,
  "brandTone": string,
  "colourDirection": string,
  "sections": [
    { "title": string, "purpose": string, "contentNotes": string }
  ]
}`;

export const SITE_DESIGN_BRIEF_JSON_SHAPE = `{
  "designArchetype": string,
  "visualMood": string,
  "heroAngle": string,
  "trustSignalPlan": string,
  "trustpilotMode": "placeholder" | "real_profile" | "omit",
  "trustpilotUrl": string | null,
  "trustpilotRating": string | null,
  "trustpilotReviewCount": string | null,
  "servicesToEmphasise": string[],
  "localPositioning": string,
  "galleryStyle": string,
  "ctaWording": string,
  "avoidClaims": string
}`;

export interface SiteDesignBriefPromptInput {
  businessName: string;
  category: string | null;
  city: string | null;
  country: string | null;
  websiteStatus: string;
  existingWebsiteUrl: string | null;
  notes: string | null;
  researchData?: {
    categoryInsights?: string;
    typicalPainPoints?: string[];
    webPresenceNotes?: string;
  } | null;
  competitorData?: {
    competitors?: Array<{ name: string; url: string | null }>;
    marketContext?: string;
  } | null;
  currentWebsiteData?: {
    overview?: string;
    services?: string[];
    products?: string[];
    courses?: string[];
    trustSignals?: string[];
    serviceAreas?: string[];
    callsToAction?: string[];
    usefulDesignNotes?: string;
    sourceUrls?: string[];
  } | null;
}

export const SITE_DESIGN_BRIEF_SYSTEM_PROMPT = [
  'You are a senior brand strategist and web design director.',
  'Generate editable design-direction fields for a bespoke demo website for a local UK business.',
  'The output will prefill form boxes for a human operator, so make each field concrete, useful, and easy to edit.',
  '',
  'Rules:',
  '- Do not invent real review scores, review counts, awards, certifications, years in business, project counts, guarantees, or testimonials.',
  '- If Trustpilot data is not supplied, use trustpilotMode "placeholder" and describe a labelled placeholder/review CTA module.',
  '- If the business category is sensitive or trust-led, prefer understated proof modules over hype.',
  '- Choose one memorable visual anchor that fits the business, not generic SaaS styling.',
  '- Output strict JSON only.',
].join('\n');

export function buildSiteDesignBriefPrompt(input: SiteDesignBriefPromptInput): string {
  const location = [input.city, input.country].filter(Boolean).join(', ') || 'the local area';
  return [
    'Return JSON matching this exact TypeScript shape:',
    SITE_DESIGN_BRIEF_JSON_SHAPE,
    '',
    'Business:',
    `- Name: ${input.businessName}`,
    `- Category: ${input.category ?? 'unknown'}`,
    `- Location: ${location}`,
    `- Website status: ${input.websiteStatus}`,
    `- Existing website: ${input.existingWebsiteUrl ?? 'none supplied'}`,
    `- Operator notes: ${input.notes?.trim() || 'none'}`,
    '',
    'Research context:',
    `- Category insight: ${input.researchData?.categoryInsights ?? 'none'}`,
    `- Pain points: ${input.researchData?.typicalPainPoints?.join('; ') || 'none'}`,
    `- Web presence notes: ${input.researchData?.webPresenceNotes ?? 'none'}`,
    `- Competitor context: ${input.competitorData?.marketContext ?? 'none'}`,
    `- Competitors: ${input.competitorData?.competitors?.slice(0, 5).map((c) => c.name).join(', ') || 'none'}`,
    '',
    'Current website scrape:',
    `- Overview: ${input.currentWebsiteData?.overview ?? 'none'}`,
    `- Services: ${input.currentWebsiteData?.services?.join('; ') || 'none'}`,
    `- Products: ${input.currentWebsiteData?.products?.join('; ') || 'none'}`,
    `- Courses/training: ${input.currentWebsiteData?.courses?.join('; ') || 'none'}`,
    `- Trust signals found: ${input.currentWebsiteData?.trustSignals?.join('; ') || 'none'}`,
    `- Service areas found: ${input.currentWebsiteData?.serviceAreas?.join('; ') || 'none'}`,
    `- Existing CTAs: ${input.currentWebsiteData?.callsToAction?.join('; ') || 'none'}`,
    `- Design notes from current site: ${input.currentWebsiteData?.usefulDesignNotes ?? 'none'}`,
    '',
    'Field guidance:',
  '- designArchetype: choose from Premium Trade, Emergency Service, Accredited Field Specialist, Training Academy, Studio Editorial, Boutique Hospitality, Clinical Trust, Family Local, Luxury Property, Artisan Retail, Fitness Energy, Professional Authority, or a similarly concise archetype.',
    '- visualMood: describe colour, typography, space, and one distinctive visual hook.',
    '- heroAngle: write the exact first-impression angle the hero should communicate.',
    '- trustSignalPlan: include safe proof modules only; placeholders must be labelled as placeholders.',
    '- servicesToEmphasise: 4-6 specific services/products/courses. Prioritise Current website scrape entries over generic category guesses.',
    '- avoidClaims: list the claims the generator must not make for this lead.',
    '',
    'Output JSON only.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// HTML generation — used by the free-model rotation in aiGateway.ts
// ---------------------------------------------------------------------------

/**
 * Returns the system prompt for direct HTML5 page generation.
 * Called fresh on each generation so the injected date stays current.
 * Models receive this + buildHtmlGenerationPrompt() as the user message.
 */
export function getHtmlGenerationSystemPrompt(): string {
  const dateStr = new Date().toISOString().split('T')[0];
  return `You are MiMo, an AI assistant developed by Xiaomi.
Today's date: ${dateStr}.
Your knowledge cutoff date is December 2024.

You are acting as a senior frontend developer and brand designer specialising in premium small-business marketing websites for local UK businesses.
Every site you generate must make a business owner say "I want that to be my website."

## CRITICAL OUTPUT FORMAT — READ FIRST
Output TWO complete HTML files separated by this exact delimiter on its own line:
===GALLERY===

Structure:
[complete index.html from <!doctype html> to </html>]
===GALLERY===
[complete gallery.html from <!doctype html> to </html>]

NO markdown fences. NO commentary. NO text before <!doctype html> or after </html> of gallery.html.
If approaching token limit: finish section cleanly, close all tags, write </html>, then ===GALLERY=== then a minimal valid gallery.html.

════════════════════════════════════════
STEP 0 — STYLE SELECTION (do this before writing any HTML)
════════════════════════════════════════

Read the businessCategory from the brief JSON.
Use the supplied SITE DESIGN BRIEF first. Choose exactly ONE visual style family plus ONE business archetype.
State both as an HTML comment on line 2 of index.html:
<!-- STYLE: [BOLD|CLEANPRO|WARMLOCAL|PRESTIGE|STUDIO|CANOPY] -->
<!-- ARCHETYPE: [designArchetype from the design brief] -->

STYLE RULES:

BOLD — use for: trades, landscaping, construction, driveways, groundworks, fencing, roofing, automotive, property maintenance, pest control.
  Character: dark and powerful. Full-bleed photography. Strong contrast. Makes the work look impressive.

CLEANPRO — use for: professional services, B2B, finance, accountancy, cleaning, domestic services, care, tutoring, childcare, IT services.
  Character: white space, structured, trustworthy. Corporate but approachable. Clear process steps.

WARMLOCAL — use for: food, hospitality, cafes, beauty, hair, nails, wellness, yoga, fitness, florists, pet services, retail, artisan makers.
  Character: warm, editorial, inviting. Feels personal. Rich colours. Photography-led but intimate.

PRESTIGE — use for: luxury renovations, premium property, bespoke services, fine dining, private medical/dental, high-end legal, boutique hospitality, wealth management, estate agents (premium tier).
  Character: near-black and gold. Square corners, rule-lines not shadows. Restrained, authoritative, aspirational.

STUDIO — use for: photographers, architects, interior designers, graphic designers, creative agencies, branding studios, marketing agencies, illustrators, art studios.
  Character: editorial, typographic-forward. Asymmetric layout. Bold background numerals. Portfolio-led. Contemporary.

CANOPY — use for: tree surgeons, arborists, forestry, grounds maintenance, site clearance, vegetation management, utilities/infrastructure contractors, safety training, trade courses, inspection services, environmental or land-management businesses.
  Character: earthy, capable, accreditation-led. Feels like a serious operational contractor and training provider: deep greens, timber neutrals, safety orange accents, dense service navigation, proof blocks, brochure/FAQ CTAs, and project imagery.

If category is unclear → default to BOLD unless the SITE DESIGN BRIEF clearly asks for another family.
Use the designArchetype to vary composition and modules so outputs do not feel like clones:
- Premium Trade / Emergency Service: heavier hero, service cards, prominent call CTA, strong proof strip.
- Accredited Field Specialist / Training Academy: use CANOPY, with separate service/course pathways, compliance-safe proof, project gallery, FAQ depth, and brochure-style CTA.
- Studio Editorial: asymmetric typography, portfolio-led sections, fewer cards, stronger gallery route.
- Boutique Hospitality / Artisan Retail: warmer editorial hero, menu/product-style highlights, softer proof.
- Clinical Trust / Professional Authority: calm structure, process steps, credentials placeholders only if labelled.
- Luxury Property: restrained prestige layout, large photography, rule lines, understated CTAs.
- Family Local / Fitness Energy: approachable copy, rhythm, movement, local-area modules.

════════════════════════════════════════
STEP 1 — FONT LOADING (both pages)
════════════════════════════════════════

FIRST tag inside <head> on BOTH index.html and gallery.html must be this exact link tag:

BOLD:
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet">
font-family: 'Barlow', sans-serif on body.
Use 'Barlow Condensed' for h1 and the logo badge.

CLEANPRO:
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
font-family: 'Inter', sans-serif on body.

WARMLOCAL:
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
font-family: 'DM Sans', sans-serif on body.
Use 'Playfair Display' for h1 and section h2.

PRESTIGE:
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600;1,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
font-family: 'Inter', sans-serif on body.
Use 'Cormorant Garamond' (italic preferred) for h1, h2, and logo name.

STUDIO:
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
font-family: 'Plus Jakarta Sans', sans-serif on body.
Use 'Syne' for h1, h2, and logo name.

CANOPY:
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,650;9..144,750&display=swap" rel="stylesheet">
font-family: 'Archivo', sans-serif on body.
Use 'Fraunces' for h1, selected section h2, and the wordmark accent.

════════════════════════════════════════
STEP 2 — CSS CUSTOM PROPERTIES
════════════════════════════════════════

Define in :root at the top of EVERY <style> block.

Colour palette — derive from businessCategory:

| Keywords                    | --primary  | --accent   | --bg      |
|-----------------------------|------------|------------|-----------|
| garden/landscape/lawn/hedge | #1a3c2e    | #c8a96e    | #f7f4ef   |
| build/trade/construct/roof  | #1c2b3a    | #e8952e    | #f4f1ec   |
| drive/tarmac/groundwork/pave| #1e2832    | #f0a500    | #f5f2ed   |
| beauty/hair/nail/salon/spa  | #3d2535    | #c97b84    | #faf6f1   |
| food/cafe/restaurant/bake   | #4a1527    | #c9973a    | #fdf9f3   |
| fitness/gym/sport/yoga      | #1a2744    | #e05c2a    | #f5f3f0   |
| clean/domestic/home service | #1e3a3a    | #5ba99a    | #f4f7f6   |
| pet/animal/vet              | #2c3e50    | #e67e22    | #fdfaf6   |
| auto/car/garage/mechanic    | #1a1a2e    | #e94560    | #f5f5f5   |
| tree/arborist/forestry/grounds/site clearance/vegetation/utilities/chainsaw/training | #173728 | #d9782d | #f4efe4 |
| luxury/prestige/premium/bespoke/estate | #0d1117 | #c9a96e | #f8f5f0 |
| photo/architect/design/studio/creative | #141414 | #e8572a | #f7f5f0 |
| default (no match)          | #1a3d47    | #b87333    | #f5f2ed   |

Also always define:
--bg-alt: color-mix(in srgb, var(--primary) 7%, var(--bg));
--text: color-mix(in srgb, var(--primary) 90%, black);
--muted: color-mix(in srgb, var(--primary) 40%, var(--bg));
--white: #ffffff;
--shadow-sm: 0 2px 8px rgba(0,0,0,0.06);
--shadow-md: 0 8px 24px rgba(0,0,0,0.11);
--shadow-lg: 0 20px 48px rgba(0,0,0,0.15);
--radius: 10px;
--radius-lg: 16px;

Derive --primary-rgb from the hex (for rgba overlays):
e.g. #1a3c2e → 26,60,46 → --primary-rgb: 26,60,46

════════════════════════════════════════
STEP 3 — BASE STYLES
════════════════════════════════════════

*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg); color: var(--text);
  line-height: 1.65; font-size: 1.05rem;
  -webkit-font-smoothing: antialiased;
  margin: 0;
}
h1,h2,h3 { font-weight: 700; letter-spacing: -0.025em; text-wrap: balance; }
h1 { font-size: clamp(2.4rem,5.5vw,4rem); letter-spacing: -0.035em; font-weight: 800; }
h2 { font-size: clamp(1.8rem,3vw,2.4rem); letter-spacing: -0.025em; }
h3 { font-size: 1.15rem; letter-spacing: -0.01em; }
a { text-decoration: none; }
.container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
.eyebrow {
  display: block; font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--accent); margin-bottom: 0.6rem;
}

BOLD overrides:
h1 { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; text-transform: uppercase; }
h2 { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }

WARMLOCAL overrides:
h1, h2 { font-family: 'Playfair Display', serif; }
.eyebrow { font-family: 'DM Sans', sans-serif; }

CANOPY overrides:
h1 { font-family: 'Fraunces', serif; font-weight: 750; letter-spacing: 0; }
h2 { font-family: 'Fraunces', serif; font-weight: 650; letter-spacing: 0; }
.eyebrow { letter-spacing: 0.14em; color: var(--accent); }

════════════════════════════════════════
STEP 4 — PRE-HEADER + STICKY NAV
════════════════════════════════════════

-- 4a. PRE-HEADER BAR (BOLD and CLEANPRO only) --
A slim bar above the main nav.
.pre-header {
  background: var(--primary); color: rgba(255,255,255,0.75);
  font-size: 0.8rem; font-weight: 500; padding: 0.4rem 0;
}
.pre-header .container {
  display: flex; justify-content: space-between;
  align-items: center;
}
Left side: business tagline e.g. "Serving [City], [Neighbourhood] & surrounding areas"
Right side: phone link + email link (small, white, inline-flex with SVG icons).
Hide on mobile (display:none at max-width:768px).

WARMLOCAL: omit the pre-header entirely.

-- 4b. MAIN NAV --
<nav class="navbar" id="navbar">

BOLD style nav:
  Initial state: transparent background, white logo/links.
  .navbar { position: fixed; top: [pre-header height ~33px];
    left:0; width:100%; z-index:1000; padding: 1rem 0;
    transition: all 0.3s ease; }

  Logo: two-part wordmark badge.
  <a class="navbar-logo" href="#">
    <span class="logo-name">[BusinessName first word or abbreviation]</span>
    <span class="logo-sub">[Remaining words]</span>
    <span class="logo-badge">[SHORT CATEGORY ALL-CAPS e.g. LANDSCAPES]</span>
  </a>
  .navbar-logo { display:flex; flex-direction:column; line-height:1.1; }
  .logo-name { font-family:'Barlow Condensed',sans-serif; font-size:1.8rem;
    font-weight:900; color:var(--white); letter-spacing:-0.01em; line-height:1; }
  .logo-sub { font-family:'Barlow Condensed',sans-serif; font-size:1.3rem;
    font-weight:700; color:var(--white); letter-spacing:-0.01em; line-height:1; }
  .logo-badge { font-size:0.55rem; font-weight:700; letter-spacing:0.2em;
    text-transform:uppercase; background:var(--accent); color:var(--primary);
    padding:2px 6px; margin-top:3px; align-self:flex-start; }

  .navbar.scrolled:
    top:0; background: color-mix(in srgb,var(--primary) 97%,transparent);
    backdrop-filter: blur(12px); padding: 0.6rem 0;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);

  /* Explicit transparent-state colours — prevents fallback to var(--text) against hero image */
  .navbar:not(.scrolled) .nav-links a:not(.nav-cta) {
    color: var(--white);
    text-shadow: 0 1px 3px rgba(0,0,0,0.45);
  }
  .navbar:not(.scrolled) .logo-name,
  .navbar:not(.scrolled) .logo-sub { color: var(--white); }
  .navbar:not(.scrolled) .hamburger svg { stroke: var(--white); }

CLEANPRO style nav:
  White background always. Primary colour logo text.
  .navbar { background: var(--white); border-bottom: 1px solid
    color-mix(in srgb, var(--primary) 8%, transparent);
    position: sticky; top: 0; ... }
  Logo: business name only, font-weight:800, color:var(--primary).
  .navbar.scrolled: box-shadow: var(--shadow-sm).

WARMLOCAL style nav:
  Transparent → var(--bg) on scroll.
  Logo: business name in Playfair Display, font-weight:700.
  .navbar.scrolled: background:var(--bg); box-shadow:var(--shadow-sm).
  /* Transparent state: hero behind is a dark gradient — links must be white */
  .navbar:not(.scrolled) .nav-links a:not(.nav-cta) {
    color: var(--white); text-shadow: 0 1px 2px rgba(0,0,0,0.35);
  }
  .navbar:not(.scrolled) .navbar-logo { color: var(--white); }
  /* Scrolled state: revert to dark colours against light var(--bg) */
  .navbar.scrolled .nav-links a:not(.nav-cta) { color: var(--text); }
  .navbar.scrolled .navbar-logo { color: var(--primary); }

PRESTIGE style nav:
  No pre-header bar.
  .navbar { position: fixed; top: 0; left: 0; width: 100%; z-index: 1000;
    padding: 1.4rem 0; transition: all 0.4s ease;
    border-bottom: 1px solid transparent; }
  Logo: business name in Cormorant Garamond italic, font-size: 1.6rem, font-weight: 700.
  .navbar:not(.scrolled) .navbar-logo { color: var(--white); font-style: italic; letter-spacing: 0.04em; }
  .navbar:not(.scrolled) .nav-links a:not(.nav-cta) {
    color: rgba(255,255,255,0.85); letter-spacing: 0.06em;
    font-size: 0.78rem; text-transform: uppercase;
  }
  .navbar.scrolled {
    background: var(--primary); padding: 0.9rem 0;
    border-bottom-color: rgba(201,169,110,0.3);
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  }
  .navbar.scrolled .navbar-logo { color: var(--accent); }
  .navbar.scrolled .nav-links a:not(.nav-cta) { color: rgba(255,255,255,0.75); }
  PRESTIGE .nav-cta: background transparent; border: 1px solid var(--accent); color: var(--accent);
    padding: 0.45rem 1.4rem; border-radius: 0; letter-spacing: 0.08em;
    font-size: 0.75rem; text-transform: uppercase; font-weight: 600;
    On hover, background var(--accent); color var(--primary).

STUDIO style nav:
  No pre-header bar.
  .navbar { position: sticky; top: 0; left: 0; width: 100%; z-index: 1000;
    padding: 1.1rem 0; background: var(--white);
    border-bottom: 1px solid color-mix(in srgb,var(--primary) 10%,transparent);
    transition: box-shadow 0.3s ease; }
  Logo: business name in Syne, font-weight 800, color var(--primary), font-size 1.25rem.
    After name add accent dot: <span style="color:var(--accent);line-height:1">.</span>
  .nav-links a:not(.nav-cta) { color: var(--text); font-size: 0.88rem; font-weight: 500; letter-spacing: 0.02em; }
  .navbar.scrolled { box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
  STUDIO .nav-cta: background var(--primary); color var(--white);
    padding: 0.5rem 1.3rem; border-radius: 0; font-weight: 600; font-size: 0.85rem;
    On hover, background var(--accent); color var(--white).

CANOPY style nav:
  Include a practical top bar above nav for location, phone, and "Commercial / Training" split.
  .pre-header { background:#10251b; color:rgba(255,255,255,0.78); font-size:0.82rem; }
  Main nav: sticky, white or warm parchment background, strong bottom border in color-mix(primary 15%, transparent).
  Logo: sturdy wordmark, business name in Archivo 800 with a small leaf/ring mark drawn in CSS or inline SVG.
  Nav links MUST include: Services, Training, Projects, FAQ, Contact.
  Nav CTA: background var(--accent); color #111; border-radius 3px; text "Request a Quote".
  Add a secondary text CTA in nav or top bar for "Course Enquiries" when the design brief mentions training.

ALL STYLES — nav links (right side):
<div class="nav-links" id="navLinks">
  <a href="#services">Services</a>
  <a href="#about">About</a>
  <a href="gallery.html">Gallery</a>
  <a href="#contact" class="nav-cta">Free Quote</a>
</div>

.nav-cta: background:var(--accent); color:var(--primary);
  padding:0.45rem 1.2rem; border-radius:50px; font-weight:700;
  transition: all 0.25s ease; opacity:1 !important;
  On hover, filter:brightness(1.1); transform:scale(1.02).
Other links: font-weight:500; On hover, color:var(--accent).

Mobile hamburger: inline SVG (3 bars), toggles .active on .nav-links.
  Mobile .nav-links: absolute, full-width, stacked column,
  background:var(--bg), box-shadow:var(--shadow-md).

JS: add class 'scrolled' to #navbar when scrollY > 60.

════════════════════════════════════════
STEP 5 — HERO
════════════════════════════════════════

-- BOLD HERO: animated photo slider --

.hero {
  position: relative; overflow: hidden;
  min-height: 80vh;
  margin-top: 0; /* nav is fixed/sticky */
}
.hero-slides { position: absolute; inset: 0; }
.hero-slide {
  position: absolute; inset: 0; opacity: 0;
  background-size: cover; background-position: center;
  animation: boldSlide 16s infinite;
  background-color: var(--primary);
  background-image: url(___HERO_IMAGE___);
}
.hero-slide:nth-child(1) { animation-delay: 0s;   background-position: center top; }
.hero-slide:nth-child(2) { animation-delay: 4s;   background-position: center 30%; }
.hero-slide:nth-child(3) { animation-delay: 8s;   background-position: center 60%; }
.hero-slide:nth-child(4) { animation-delay: 12s;  background-position: center bottom; }
@keyframes boldSlide {
  0%,22% { opacity:1; }
  27%,100% { opacity:0; }
}
.hero-overlay {
  position: absolute; inset: 0; z-index: 1;
  background:
    linear-gradient(to bottom, rgba(0,0,0,0.50) 0%, transparent 30%),
    linear-gradient(160deg,
      rgba(var(--primary-rgb),0.80) 0%,
      rgba(var(--primary-rgb),0.55) 50%,
      rgba(var(--primary-rgb),0.35) 100%);
}
/* Top-scrim above the overlay guarantees nav link contrast regardless of image content. */
.hero-content {
  position: relative; z-index: 2;
  padding: 12rem 1.5rem 6rem;
  max-width: 800px;
}
Slide location captions (4 items, one per slide):
.slide-caption {
  position: absolute; bottom: 3rem; left: 50%;
  transform: translateX(-50%); z-index: 3;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
  color: white; font-size: 0.8rem; font-weight: 600;
  padding: 0.4rem 1.2rem; border-radius: 50px;
  letter-spacing: 0.06em; white-space: nowrap;
  animation: captionCycle 16s infinite;
}
Use 4 .slide-caption elements with different animation-delay (0s, 4s, 8s, 12s) matching the slides.
Caption text examples: "[City] garden transformation", "[City] patio project", "[Neighbourhood] renovation", "Local [category] work"

H1: font-family Barlow Condensed; color white; text-transform uppercase;
  font-size clamp(3rem,7vw,5.5rem); margin-bottom 0.8rem.
Subheading (.lede): white; opacity 0.88;
  font-size clamp(1rem,2vw,1.15rem); max-width 50ch; margin-bottom 2rem.
Buttons: TWO in flex row, gap 1rem, flex-wrap wrap.
  .btn-primary: background var(--accent); color var(--primary);
    padding 1rem 2.2rem; border-radius 4px; font-weight 700;
    font-size 1rem; border 2px solid var(--accent).
    On hover, background transparent; color white; border-color white.
  .btn-ghost: transparent; white border 2px solid rgba(255,255,255,0.5);
    white text; same padding; href gallery.html; text "See Our Work".
    On hover, border-color white; background rgba(255,255,255,0.08).

-- CLEANPRO HERO: split layout --

.hero {
  min-height: 65vh; display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--white);
  padding-top: [nav height ~65px];
}
.hero-text {
  padding: 5rem 3rem 5rem 0; display:flex;
  flex-direction:column; justify-content:center;
}
.hero-image {
  background-image: url(___HERO_IMAGE___);
  background-size: cover; background-position: center;
  background-color: var(--bg-alt); /* fallback */
  position: relative;
}
.hero-image::before {
  content:''; position:absolute; inset:0;
  background: linear-gradient(135deg,
    rgba(var(--primary-rgb),0.1) 0%,transparent 60%);
}
H1: color var(--primary); no gradient text for CLEANPRO.
Subheading: color var(--muted).
TWO buttons same as BOLD but primary button uses var(--primary) not accent.
Mobile: stacks vertically, image on top 280px height.

-- WARMLOCAL HERO: centered gradient --

.hero {
  min-height: 68vh; max-height: 75vh;
  display: flex; align-items: center; justify-content: center;
  text-align: center;
  background: linear-gradient(135deg, var(--primary) 0%,
    color-mix(in srgb,var(--primary) 60%,var(--accent)) 55%,
    color-mix(in srgb,var(--accent) 65%,var(--primary)) 100%);
  padding: [nav height + 2rem] 1.5rem 4rem;
  position: relative; overflow: hidden;
}
.hero::before {
  content:''; position:absolute; inset:0;
  background-image: url(___HERO_IMAGE___);
  background-size:cover; background-position:center; opacity:0.18;
}
.hero-content { position:relative; z-index:1; max-width:680px; }
H1 gradient text:
.hero h1 {
  background: linear-gradient(135deg,#fff 0%,rgba(255,255,255,0.78) 100%);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  background-clip:text;
}
Same .lede and two-button pattern as BOLD.

-- PRESTIGE HERO: full-viewport single image, centred --

.hero {
  position: relative; overflow: hidden;
  min-height: 90vh; display: flex;
  align-items: center; justify-content: center;
  text-align: center; margin-top: 0; /* fixed nav */
}
.hero-bg {
  position: absolute; inset: 0;
  background-image: url(___HERO_IMAGE___);
  background-size: cover; background-position: center;
  background-color: var(--primary);
  animation: prestigeZoom 14s ease-in-out infinite alternate;
}
@keyframes prestigeZoom {
  from { transform: scale(1); }
  to   { transform: scale(1.05); }
}
.hero-overlay {
  position: absolute; inset: 0; z-index: 1;
  background:
    linear-gradient(to bottom, rgba(0,0,0,0.52) 0%, transparent 30%),
    rgba(var(--primary-rgb), 0.65);
}
.hero-content {
  position: relative; z-index: 2;
  padding: 8rem 1.5rem 5rem; max-width: 760px;
}
H1: font-family Cormorant Garamond; font-style italic; font-size clamp(3rem,6vw,5rem);
  color white; font-weight 700; letter-spacing 0.01em; margin-bottom 0.
After h1, thin gold rule:
  <div class="hero-rule"></div>
  .hero-rule { width:60px; height:1px; background:var(--accent); margin:1.6rem auto 1.8rem; }
Subheading (.lede): color rgba(255,255,255,0.75); font-family Inter; font-size 1.05rem;
  max-width 50ch; letter-spacing 0.02em; margin-inline auto; margin-bottom 2.4rem.
ONE button only — no ghost button.
  .btn-prestige {
    background: transparent; border: 1px solid var(--accent); color: var(--accent);
    padding: 1rem 2.8rem; border-radius: 0; font-family: 'Inter', sans-serif;
    font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.85rem;
    display: inline-block; transition: all 0.3s ease;
  }
  On hover, background var(--accent); color var(--primary).

-- STUDIO HERO: asymmetric editorial split --

.hero {
  min-height: 80vh; display: grid;
  grid-template-columns: 55fr 45fr;
  background: var(--white); overflow: hidden; position: relative;
}
.hero-text {
  padding: 5rem 3rem 5rem 0;
  display: flex; flex-direction: column; justify-content: center;
  position: relative; z-index: 1;
}
/* Large background numeral — typographic identity mark */
.hero-numeral {
  position: absolute; top: 50%; left: -0.05em;
  transform: translateY(-50%);
  font-family: 'Syne', sans-serif; font-weight: 800;
  font-size: clamp(12rem,18vw,20rem); line-height: 1;
  color: var(--accent); opacity: 0.07; pointer-events: none;
  user-select: none; z-index: 0;
}
.hero-image {
  background-image: url(___HERO_IMAGE___);
  background-size: cover; background-position: center;
  background-color: color-mix(in srgb,var(--primary) 8%,var(--bg));
  position: relative;
}
.hero-image::before {
  content:''; position:absolute; inset:0;
  background: linear-gradient(to right, var(--white) 0%, transparent 35%);
}
H1: font-family Syne; color var(--primary); font-size clamp(2.8rem,5vw,4.2rem);
  font-weight 800; line-height 1.05; margin-bottom 1.2rem.
  Wrap the key service noun in: <em style="color:var(--accent);font-style:normal">[noun]</em>
Subheading: font-family Plus Jakarta Sans; color var(--muted); max-width 44ch; font-size 1.05rem.
TWO buttons (flex row, gap 0.8rem):
  .btn-primary: background var(--primary); color var(--white); padding 0.9rem 2rem;
    border-radius 0; font-weight 600; On hover, background var(--accent); color var(--white).
  .btn-ghost: border 2px solid color-mix(in srgb,var(--primary) 20%,transparent);
    color var(--text); padding 0.9rem 2rem; border-radius 0; font-weight 600;
    On hover, border-color var(--accent); color var(--accent).
Mobile (max-width 768px): single column; .hero-image 280px height on top; hide .hero-numeral.

-- CANOPY HERO: operational contractor / academy --

.hero {
  min-height: 76vh; position: relative; overflow: hidden;
  background:
    linear-gradient(90deg, rgba(var(--primary-rgb),0.92) 0%, rgba(var(--primary-rgb),0.72) 48%, rgba(var(--primary-rgb),0.18) 100%),
    url(___HERO_IMAGE___) center/cover;
  color: var(--white);
}
.hero::after {
  content:''; position:absolute; inset:auto 0 0 0; height:8px;
  background: repeating-linear-gradient(90deg,var(--accent) 0 42px,transparent 42px 58px);
}
.hero-content { position:relative; z-index:1; max-width:760px; padding:8rem 1.5rem 5rem; }
H1: max-width 11ch; color white; line-height 0.98; margin-bottom 1rem.
Subheading: max-width 58ch; color rgba(255,255,255,0.82); font-size 1.08rem.
Add a compact .hero-proof-row below buttons:
  three proof tiles with safe labels like "Commercial work", "Training enquiries", "Project gallery".
  These are navigation/proof placeholders, not certifications.
Buttons:
  primary button href="#contact" text from SITE DESIGN BRIEF ctaWording.
  secondary button href="#training" text "View Courses" if training is relevant, otherwise href="gallery.html" text "See Projects".
Below hero, add a horizontal .pathway-strip with two or three clickable cards:
  "Commercial Services", "Training & Courses", "Tree & Grounds Projects".
Mobile: hero min-height auto; content padding 6rem 1.25rem 4rem; proof row stacks.

════════════════════════════════════════
STEP 6 — SERVICES SECTION (id="services")
════════════════════════════════════════

<span class="eyebrow">What we do</span>
<h2>[Services headline from brief]</h2>

Grid: grid-template-columns: repeat(auto-fit,minmax(280px,1fr)); gap:1.5rem.
Generate exactly 6 service cards.
Names MUST be specific to the businessCategory:
  Landscaping → Driveways & Groundworks, Patio & Paving, Fencing & Walling, Turfing & Lawn Care, Garden Design, Seasonal Maintenance
  Trades/build → [derive 6 specific trade services from brief]
  Beauty/wellness → [derive 6 specific treatments from brief]
  Food → [derive 6 menu/service types from brief]
  Other → derive from brief contentNotes; never use generic names.

Each .service-card:
  background: var(--white); padding: 1.8rem;
  border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
  border: 1px solid color-mix(in srgb,var(--primary) 8%,transparent);
  transition: transform 0.25s ease, box-shadow 0.25s ease.
  On hover, transform translateY(-5px); box-shadow var(--shadow-md).

.card-icon:
  width:52px; height:52px; border-radius:12px;
  background: color-mix(in srgb,var(--accent) 15%,var(--bg));
  display:flex; align-items:center; justify-content:center;
  margin-bottom:1rem.
  Inside: inline SVG 24x24, fill var(--primary). NO emojis.

BOLD variant: card has a coloured left-border accent:
  border-left: 3px solid var(--accent).

CLEANPRO variant: cards in a 3-col rigid grid with step numbers:
  .card-step-num: position absolute; top 1rem; right 1rem;
    font-size 2.5rem; font-weight 900; color var(--accent); opacity 0.12.

PRESTIGE variant: square corners only, gold rule left-border, no shadows:
  border-left: 2px solid var(--accent); border-radius: 0; box-shadow: none;
  background: color-mix(in srgb,var(--primary) 3%,var(--white)); padding: 2rem.
  .card-icon: border-radius 0; background transparent; icon fill var(--accent).

STUDIO variant: numbered layout, no icon, editorial typography:
  border: 1px solid color-mix(in srgb,var(--primary) 10%,transparent);
  border-radius: 0; box-shadow: none; padding: 2rem; position: relative.
  .card-num: position absolute; top 1rem; right 1.2rem;
    font-family 'Syne',sans-serif; font-size 4.5rem; font-weight 800;
    color var(--accent); opacity 0.1; line-height 1; user-select none.
  On hover, border-color var(--accent).

CANOPY variant:
  Use a dense service/course directory rather than generic cards.
  If training/courses are relevant, split into two subsections:
    <div id="services">Commercial Services</div> and <div id="training">Training & Courses</div>.
  Service cards: left accent rule, small uppercase category label, short operational copy, and "Discuss this service" link to #contact.
  Course cards: include duration/level placeholders only when supplied; otherwise say "Course details available on enquiry".
  Include a side panel titled "Who this helps" with safe audience labels:
    homeowners, commercial sites, local authorities, contractors, facilities teams.
  Visual tone: capable, not glossy; square-ish 6px radius; minimal shadows; strong borders.

════════════════════════════════════════
STEP 7 — STATS STRIP
════════════════════════════════════════

Background: var(--primary). padding: 4rem 0.
4 blocks: grid-template-columns: repeat(auto-fit,minmax(200px,1fr)).
Each block: text-align:center; padding:1.5rem 1rem.
.stat-value: clamp(2rem,4vw,2.8rem); font-weight:800; color:var(--accent).
.stat-label: 0.78rem; font-weight:600; letter-spacing:0.09em;
  text-transform:uppercase; color:rgba(255,255,255,0.58); margin-top:0.35rem.
Values MUST be safe, non-fabricated, and framed as service promises or placeholders:
  "Local" / "Serving [City]"  |  "Fast" / "Mobile-Friendly Demo"
  "Free" / "No-Obligation Quote"  |  "Proof" / "Review Module Ready"
Never invent years in business, project counts, star ratings, customer satisfaction scores, response times, or guarantees.

BOLD: add a thin accent line separator above this section:
  border-top: 4px solid var(--accent).
CANOPY: use the stats strip as a "Capability snapshot":
  "Site" / "Commercial & Domestic" | "Training" / "Course Enquiries"
  "Projects" / "Gallery Ready" | "Proof" / "Review Module Ready"
  Never show specific accreditations, qualifications, course approvals, years, or counts unless supplied.

════════════════════════════════════════
STEP 8 — ABOUT SECTION (id="about")
════════════════════════════════════════

<span class="eyebrow">Who we are</span>
<h2>[About headline]</h2>

Two-column grid (1fr 1fr desktop, stacked mobile).

LEFT: 2-3 sentences of copy. Then 3 .badge elements.
Each badge: inline-flex; align-items:center; gap:0.5rem;
  background:var(--bg);
  border:1.5px solid color-mix(in srgb,var(--accent) 40%,transparent);
  border-radius:50px; padding:0.45rem 1rem;
  font-size:0.85rem; font-weight:600.
MUST have both SVG icon AND visible text span:
  <div class="badge"><svg>...</svg><span>Local Service</span></div>
  <div class="badge"><svg>...</svg><span>Free Quotes</span></div>
  <div class="badge"><svg>...</svg><span>Easy To Contact</span></div>

RIGHT: photo card using ___ABOUT_IMAGE___ (same image, different crop).
<div class="about-img-wrap">
  <div class="about-img-inner"></div>
  <div class="about-img-badge">
    <span class="abi-icon">[1 relevant emoji]</span>
    <strong>[City]'s trusted [category]</strong>
  </div>
</div>
CSS:
.about-img-wrap { position:relative; }
.about-img-inner {
  width:100%; padding-top:75%; border-radius:var(--radius-lg);
  background-image:url(___ABOUT_IMAGE___);
  background-size:cover; background-position:center 30%;
  background-color:var(--primary); /* fallback */
  box-shadow:var(--shadow-lg);
}
.about-img-badge {
  position:absolute; bottom:1.5rem; left:1.5rem;
  background:var(--white); border-radius:var(--radius);
  padding:0.65rem 1.1rem;
  display:inline-flex; align-items:center; gap:0.6rem;
  box-shadow:var(--shadow-md); font-weight:700;
  font-size:0.9rem; color:var(--primary);
}
.abi-icon { font-size:1.4rem; }

CANOPY about variant:
  Headline should position the business as a capable field team, not a lifestyle brand.
  Replace generic badges with safe labels:
    "Site-Safe Approach", "Clear Quotations", "Commercial Enquiries".
  If accreditations/qualifications are not supplied, add a small note:
    "Accreditation and qualification details can be added here when supplied."
  Do not invent NPTC, LANTRA, CHAS, Arboricultural Association, ISO, insurance, or council approval.

════════════════════════════════════════
STEP 8b — FULL-WIDTH CTA STRIP (CLEANPRO + BOLD only)
════════════════════════════════════════

Insert between About and Testimonials sections.
Full-width band. Background: var(--accent).

.cta-strip {
  padding: 3.5rem 0; text-align: center;
  background: var(--accent);
}
.cta-strip h2 {
  color: var(--primary); font-size: clamp(1.6rem,3vw,2.2rem);
  margin-bottom: 0.75rem;
}
.cta-strip p {
  color: color-mix(in srgb,var(--primary) 75%,transparent);
  font-size:1.05rem; margin-bottom:2rem; max-width:55ch; margin-inline:auto;
}
.cta-strip .btn-solid {
  background:var(--primary); color:var(--white);
  padding:1rem 2.4rem; border-radius:4px; font-weight:700;
  font-size:1.05rem; border:none; cursor:pointer;
  transition:all 0.25s ease; display:inline-block;
  On hover, filter:brightness(1.15).
}
Headline: "FOR HELP AND ADVICE SPEAK TO ONE OF THE TEAM TODAY"
Sub-copy: "Call or message us — no sales pitch, just honest advice."
Button: "Get a Free Quote" linking to #contact.

WARMLOCAL: skip this section.
PRESTIGE: include. Background var(--accent); h2 and p use color var(--primary). Feels premium.
  Button: background var(--primary); color var(--white); border-radius 0; letter-spacing 0.08em; text-transform uppercase.
STUDIO: include but minimal — white background, primary text, ruled border-top instead of coloured band:
  background var(--white); border-top 1px solid color-mix(in srgb,var(--primary) 10%,transparent); padding 3rem 0.
  h2: color var(--primary). Button: border 1px solid var(--primary); color var(--primary); background transparent; border-radius 0.
    On hover, background var(--primary); color var(--white).
CANOPY: include as a two-path action strip:
  left block "Need site work?" with button "Request a Quote" to #contact.
  right block "Looking for training?" with button "Course Enquiries" to #training or #contact.
  Background var(--primary); use accent top rule; square buttons; no hype language.

════════════════════════════════════════
STEP 9 — TESTIMONIALS
════════════════════════════════════════

<span class="eyebrow">Happy customers</span>
<h2>What people say</h2>

Two-column grid, stacks to 1 on mobile.
Background: var(--bg-alt).
Each .testimonial-card:
  background:var(--white); padding:2rem;
  border-radius:var(--radius-lg);
  border:2px dashed color-mix(in srgb,var(--accent) 40%,transparent).
  Quote/review SVG icon, italic placeholder text, attribution "Review placeholder".
Placeholder cards MUST say they are placeholders. Never write fake customer names, fake quotes, or "5-star" claims.

BOLD variant: cards have a solid left accent line:
  border-left: 3px solid var(--accent); border-top: none;
  border-right: none; border-bottom: none; border-radius: 0.

PRESTIGE variant: square cards, minimal border, large Cormorant Garamond opening quote:
  border: 1px solid rgba(201,169,110,0.25); border-radius: 0; box-shadow: none; padding: 2.4rem.
  .quote-mark: font-family 'Cormorant Garamond',serif; font-size: 4rem; color: var(--accent);
    line-height: 0.8; display: block; margin-bottom: 1rem.

STUDIO variant: rule-only cards — bottom border, no surrounding box:
  border: none; border-bottom: 1px solid color-mix(in srgb,var(--primary) 12%,transparent);
  border-radius: 0; box-shadow: none; background: transparent; padding: 2rem 0.
  Attribution: font-family 'Syne',sans-serif; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase.

════════════════════════════════════════
STEP 10 — TRUST + TRUSTPILOT MODULE
════════════════════════════════════════

Insert between testimonials and contact when the SITE DESIGN BRIEF trustpilotMode is not "omit".
This module is a conversion aid, not a claim generator.

If trustpilotMode is "real_profile":
- Use trustpilotUrl for both buttons.
- Show trustpilotRating and trustpilotReviewCount ONLY if supplied.
- If either is null, omit that specific number rather than inventing one.

If trustpilotMode is "placeholder":
- Make the section visually polished but explicitly labelled:
  "Trustpilot review panel placeholder"
  "Ready to connect when your Trustpilot profile is supplied."
- Buttons: "View on Trustpilot" and "Rate us on Trustpilot".
- Buttons may use href="#" with aria-labels; do not imply an existing live profile.
- Do not display stars, scores, review counts, or real customer quotes.

Style the module uniquely per style family:
- BOLD: dark primary strip, angular accent edge, white Trustpilot card.
- CLEANPRO: white card row with subtle border and process-style proof points.
- WARMLOCAL: warm editorial panel with soft accent pill buttons.
- PRESTIGE: black/gold rule-line panel, square buttons, very restrained.
- STUDIO: typographic proof band with oversized "TRUST" or "REVIEWS" wordmark background.
- CANOPY: accreditation-style proof bay with labelled placeholders:
  "Qualifications placeholder", "Insurance placeholder", "Trustpilot review panel placeholder".
  Make it look like a serious compliance/procurement section, but every unverified item must say "placeholder".
  Add buttons "View on Trustpilot" and "Rate us on Trustpilot" only according to trustpilotMode rules above.

════════════════════════════════════════
STEP 11 — CONTACT SECTION (id="contact")
════════════════════════════════════════

<span class="eyebrow">Get in touch</span>
<h2>Ready to get started?</h2>

BOLD + WARMLOCAL: background var(--primary); color white; text-align center.
CLEANPRO: background var(--bg-alt); color var(--text); text-align left;
  two-column (contact info left, form right).
PRESTIGE: background var(--primary); color white; text-align center — same as BOLD.
  Form fields: border-radius 0; border: none; border-bottom: 1px solid rgba(201,169,110,0.4);
    background transparent; color white; padding 0.75rem 0.
  Submit button: .btn-prestige style (transparent + accent border).
STUDIO: background var(--bg-alt); text-align left; two-column like CLEANPRO.
  Form fields: border-radius 0; white background; border: 1px solid color-mix(in srgb,var(--primary) 15%,transparent);
    focus: border-color var(--accent); outline none.
  Submit button: background var(--primary); color var(--white); border-radius 0; font-family Syne; font-weight 700.
CANOPY: background #10251b or var(--primary); color white.
  Layout: two-column with left "Commercial enquiries" and right "Training enquiries" contact panels above/alongside form.
  Form fields: warm white background, 6px radius, strong focus border var(--accent).
  Submit button: var(--accent) background, dark text, square-ish 4px radius.

Phone as <a href="tel:..."> — use placeholder +441524000000 if none supplied.
Email as <a href="mailto:..."> — placeholder hello@[businessslug].co.uk.
Both styled: color var(--accent); font-weight:600; font-size:1.1rem.
  Each with inline SVG icon.

Form: 3 fields (Name, Phone or Email, Message textarea).
BOLD form: dark field styling (rgba(255,255,255,0.1) bg, white border, white text).
CLEANPRO form: white fields, primary border on focus.
WARMLOCAL form: soft bg fields (var(--bg)), accent border on focus.
Submit button matches style.

════════════════════════════════════════
STEP 12 — FOOTER
════════════════════════════════════════

Business name (font-weight:800) + short tagline.
Links: <a href="gallery.html">Gallery</a>, <a href="#contact">Contact</a>.
Copyright: © <span id="year"></span> [businessName].
JS: document.getElementById('year').textContent=new Date().getFullYear()
Required last line:
<p class="demo-disclaimer">This is a demo concept generated as part of an outreach proposal. Not affiliated with the business.</p>
.demo-disclaimer { font-size:0.75rem; opacity:0.5; margin-top:1.5rem; }

BOLD footer: dark background (var(--primary)), white text.
CLEANPRO footer: light (var(--bg-alt)), dark text.
WARMLOCAL footer: warm (var(--bg-alt)), dark text with decorative accent divider line above.
PRESTIGE footer: dark background (var(--primary)), white text. Logo in Cormorant Garamond italic, color var(--accent).
  Thin gold rule (1px, var(--accent), 60px wide, centered) above the copyright line.
STUDIO footer: light background (var(--bg-alt)), dark text. Logo in Syne with accent dot.
  Border-top: 2px solid var(--primary) at footer top edge.
CANOPY footer: dark primary background with structured columns:
  Services, Training, Projects, Contact.
  Add a small brochure/FAQ style link cluster using href="#faq" and href="gallery.html".
  Keep demo disclaimer visible and sober.

════════════════════════════════════════
STEP 13 — SCROLL ANIMATIONS
════════════════════════════════════════

Add class="reveal" to: #services, stats strip, #about, cta-strip, testimonials, trust/reviews module, #contact.

JS:
const obs = new IntersectionObserver(
  (entries) => entries.forEach(e => {
    if(e.isIntersecting){e.target.classList.add('active');obs.unobserve(e.target);}
  }), {threshold:0.1}
);
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

CSS:
.reveal{opacity:0;transform:translateY(28px);
  transition:opacity 0.55s ease,transform 0.55s ease;}
.reveal.active{opacity:1;transform:translateY(0);}
@media(prefers-reduced-motion:reduce){
  .reveal{opacity:1;transform:none;transition:none;}}

════════════════════════════════════════
STEP 14 — MOBILE (max-width: 768px)
════════════════════════════════════════

- .pre-header: display none.
- .nav-links: hidden; shown as stacked column when .active.
- .hamburger: display block.
- CLEANPRO hero: single column; image 260px fixed height on top.
- PRESTIGE hero: single column, centred; min-height 70vh; h1 font-size clamp(2.4rem,8vw,3.5rem).
- STUDIO hero: single column; .hero-image 280px on top; hide .hero-numeral; padding 4rem 1.5rem 3rem.
- CANOPY hero: content first, pathway cards stack, top bar hidden if space is tight.
- All multi-column grids: 1fr.
- Section padding: 3.5rem 0.
- Touch targets: min-height 48px.
- .hero (BOLD): min-height 60vh; text padding 8rem 1.5rem 4rem.
- Stats strip: 2 cols minimum (grid wraps naturally).

════════════════════════════════════════
STEP 15 — gallery.html
════════════════════════════════════════

Full separate HTML file after ===GALLERY=== delimiter.
Same Google Font link. Same CSS custom properties.
Same style (BOLD/CLEANPRO/WARMLOCAL/PRESTIGE/STUDIO/CANOPY) as index.html.

Simple header: logo (same wordmark style as nav) left,
"← Back to main site" right (href="index.html").

Hero band: 200px; same background gradient/image as index.html
  with same overlay. h1: "Our Work" (gradient text for BOLD/WARMLOCAL;
  plain dark for CLEANPRO; Cormorant Garamond italic gold for PRESTIGE;
  Syne bold dark for STUDIO; Fraunces white or dark green for CANOPY). Subheading: "A selection of projects
  from [city] and surrounding areas."

Gallery grid:
  display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  gap:1.2rem; margin-top:2.5rem.

9 .gallery-tile items:
  aspect-ratio:4/3; border-radius:var(--radius-lg);
  overflow:hidden; position:relative; cursor:pointer.
  background-image:url(___HERO_IMAGE___);
  background-size:cover;
  background-position: [cycle through: top,20%,30%,center,40%,60%,70%,bottom,80%].
  transition:transform 0.3s ease,box-shadow 0.3s ease.
  On hover, transform scale(1.03); box-shadow var(--shadow-lg).

  ::before overlay — unique tint per tile:
    background: linear-gradient(to bottom,
      rgba(var(--primary-rgb),X) 0%, transparent 50%)
    where X cycles: 0.6,0.45,0.55,0.4,0.65,0.5,0.45,0.6,0.4.

  .tile-caption: position absolute; bottom 0; left 0; right 0;
    padding 1.2rem 1rem 1rem;
    background: linear-gradient(transparent,rgba(0,0,0,0.68));
    color white; font-weight:600; font-size:0.85rem.

  9 location-specific captions (vary project type, mention city/area):
    "[City] garden transformation", "[City] patio renovation",
    "[Neighbourhood] hedge & borders", "[City] lawn renewal",
    "[Region] garden design", "[City] seasonal clearance",
    "[City] driveway project", "[Neighbourhood] fencing & walling",
    "Local [category] work — [City]"

Below gallery: contact CTA strip + footer matching index.html style.
For CANOPY gallery: include filter chips "Tree Work", "Grounds", "Training", "Commercial" as non-functional visual filters, plus a bottom FAQ/contact strip.

════════════════════════════════════════
TOKEN LIMIT FALLBACK
════════════════════════════════════════

If approaching limit mid-render:
  Priority order: hero complete → services (min 4 cards) →
  stats → about → footer with disclaimer → </html>
  Then: ===GALLERY=== then minimal gallery.html.`.trim();
}

/**
 * Backwards-compatible constant. Callers that import this directly get the
 * prompt evaluated at module-load time. Prefer calling getHtmlGenerationSystemPrompt()
 * for a fresh date on each generation.
 */
export const HTML_GENERATION_SYSTEM_PROMPT = getHtmlGenerationSystemPrompt();

// ---------------------------------------------------------------------------

/**
 * Kept for backwards compatibility with any callers that reference this type.
 * New callers should pass WebsiteBrief + city directly to buildHtmlGenerationPrompt.
 */
export interface HtmlGenerationInput {
  brief: WebsiteBrief;
  lead: {
    businessName: string;
    category: string | null;
    addressLine1: string | null;
    city: string | null;
    postcode: string | null;
    country: string | null;
    phone: string | null;
    existingWebsiteUrl: string | null;
  };
  availableImages?: string[];
  stylePreference?: string;
}

/** Build the user message for the HTML generation request. */
export function buildHtmlGenerationPrompt(
  brief: WebsiteBrief,
  city: string | null,
  stylePreference?: string,
  brandName?: string,
  siteDesignBrief?: SiteDesignBrief,
): string {
  const cityStr = city ?? 'the local area';
  const navBrandName = brandName?.trim() || brief.businessName;
  return [
    'Generate a premium two-page website using all steps in your system prompt.',
    '',
    'BUSINESS DATA (JSON):',
    JSON.stringify(brief),
    '',
    'SITE DESIGN BRIEF (JSON, operator-editable and higher priority than generic template defaults):',
    JSON.stringify(siteDesignBrief ?? null),
    '',
    `Nav/wordmark brand name: ${navBrandName}`,
    `City/location: ${cityStr}`,
    'Use the city name in: pre-header tagline, hero slide captions,',
    'stats strip labels, testimonial attributions, gallery captions,',
    'about visual badge, and footer.',
    '',
    'IMAGE PLACEHOLDER: ___HERO_IMAGE___',
    'Use this exact string as the background-image URL value wherever',
    'a hero, about, gallery tile, or project thumb background-image is needed.',
    'Do NOT invent or construct any other image URL.',
    '',
    ...(stylePreference?.trim()
      ? [`OPERATOR STYLE NOTE: <operator_style_note>${stylePreference.trim()}</operator_style_note>`, '']
      : []),
    'BESPOKE REQUIREMENTS:',
    '- Use the SITE DESIGN BRIEF to select archetype, hero angle, services, gallery style, CTA wording, and trust module.',
    '- If SITE DESIGN BRIEF is null, infer a conservative local-business direction from BUSINESS DATA.',
    '- If designArchetype is Accredited Field Specialist, Training Academy, arborist, forestry, grounds, vegetation, utilities, or safety training, strongly prefer STYLE: CANOPY.',
    '- Trustpilot: never invent scores, stars, review counts, customer quotes, or profile URLs. Render a labelled placeholder unless real Trustpilot fields are supplied.',
    '- Vary layout and module emphasis by designArchetype so this does not look like a generic recycled template.',
    '',
    'OUTPUT INSTRUCTIONS:',
    '1. State your chosen style (BOLD/CLEANPRO/WARMLOCAL/PRESTIGE/STUDIO/CANOPY) as an HTML comment',
    '   on line 2 of index.html: <!-- STYLE: [chosen] -->',
    '2. Generate complete index.html — start NOW with <!doctype html>',
    '3. Output the delimiter: ===GALLERY=== (on its own line)',
    '4. Generate complete gallery.html — start with <!doctype html>',
    '',
    'Begin index.html now:',
  ].join('\n');
}

// ---------------------------------------------------------------------------

/** Build the user-message body for the website brief request. */
export function buildWebsiteBriefUserPrompt(input: WebsitePromptInput): string {
  const location = [input.city, input.country].filter(Boolean).join(', ') || 'unknown';
  const stylePreference = input.stylePreference?.trim() || 'modern, clean, conversion-focused local business';
  const notes = input.notes?.trim() || 'none';

  return [
    'Generate a website brief as JSON matching this exact TypeScript shape:',
    WEBSITE_BRIEF_JSON_SHAPE,
    '',
    'Brief requirements:',
    '- 4 to 6 sections in the `sections` array, in render order.',
    '- The first section must be a hero with a single primary CTA matching `primaryCTA`.',
    '- Include a "Services" or "What we do" section grounded in the supplied category.',
    '- Include a "Contact" or "Get in touch" section as the conversion endpoint.',
    '- `colourDirection` should be a short phrase suggesting palette feel,',
    '  e.g. "warm cream and deep green", "cool slate with single accent blue".',
    '- `brandTone` should be 4-8 words, e.g. "calm, local, trustworthy, plain-spoken".',
    '- `targetCustomer` should be one sentence describing who this serves.',
    '- `primaryCTA` should be a short imperative, e.g. "Call for a free quote".',
    '',
    'Business details supplied by the operator:',
    `- Business name: ${input.businessName}`,
    `- Category: ${input.category ?? 'unknown'}`,
    `- Location: ${location}`,
    `- Style preference: <operator_style_note>${stylePreference}</operator_style_note>`,
    `- Operator notes: ${notes}`,
    '',
    'Reminder: do not invent testimonials, awards, certifications, prices,',
    'opening hours, or staff details. Output JSON only.',
  ].join('\n');
}
