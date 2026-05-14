/**
 * Lead enrichment service.
 *
 * Resolves a Google Business Profile / Google Maps URL into structured business
 * data using either:
 *   - Google Places API (Place Details endpoint), preferred when available, OR
 *   - SerpAPI Google Maps engine, as a fallback.
 *
 * If neither key is configured, returns a clearly-labelled mock payload so the
 * MVP can be exercised end-to-end during local development.
 *
 * Endpoint references are documented in PROJECT_NOTES.md. Both providers are
 * called via plain fetch with no SDK dependency. Error handling is defensive —
 * any HTTP / parse failure is converted into a thrown EnrichmentError that the
 * worker logs and surfaces to the lead's last_error field.
 */
import { env, flags } from '../lib/env.js';

export type WebsiteStatus =
  | 'unknown'
  | 'none_found'
  | 'has_site'
  | 'bad_site'
  | 'social_only';

export interface EnrichmentResult {
  source: 'google_places' | 'serpapi' | 'mock';
  raw: unknown;
  extracted: {
    googlePlaceId: string | null;
    businessName: string | null;
    category: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postcode: string | null;
    country: string | null;
    phone: string | null;
    existingWebsiteUrl: string | null;
    websiteStatus: WebsiteStatus;
  };
}

export class EnrichmentError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

/** Heuristic — treat known social-only domains as social_only. */
const SOCIAL_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
];

export function classifyWebsite(websiteUrl: string | null | undefined): WebsiteStatus {
  if (!websiteUrl) return 'none_found';
  try {
    const u = new URL(websiteUrl);
    const host = u.hostname.replace(/^www\./, '');
    if (SOCIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return 'social_only';
    return 'has_site';
  } catch {
    return 'bad_site';
  }
}

const GENERIC_CATEGORIES = new Set([
  'establishment',
  'point of interest',
  'point_of_interest',
]);

const GOOGLE_PLACE_TYPE_LABELS: Record<string, string> = {
  accounting: 'accountancy',
  airport: 'airport service',
  amusement_park: 'amusement park',
  aquarium: 'aquarium',
  art_gallery: 'art gallery',
  atm: 'cash machine',
  bakery: 'bakery',
  bank: 'bank',
  bar: 'bar',
  beauty_salon: 'beauty salon',
  bicycle_store: 'bicycle shop',
  book_store: 'book shop',
  bowling_alley: 'bowling alley',
  cafe: 'cafe',
  campground: 'camping site',
  car_dealer: 'car dealership',
  car_rental: 'car rental',
  car_repair: 'garage',
  car_wash: 'car wash',
  cemetery: 'cemetery',
  church: 'church',
  city_hall: 'council office',
  clothing_store: 'clothing shop',
  convenience_store: 'convenience store',
  courthouse: 'court',
  dentist: 'dentist',
  department_store: 'department store',
  doctor: 'doctor',
  drugstore: 'pharmacy',
  electrician: 'electrician',
  electronics_store: 'electronics shop',
  embassy: 'embassy',
  florist: 'florist',
  funeral_home: 'funeral director',
  furniture_store: 'furniture shop',
  gas_station: 'petrol station',
  gym: 'gym',
  hair_care: 'hair salon',
  hardware_store: 'hardware shop',
  hindu_temple: 'temple',
  home_goods_store: 'home goods shop',
  hospital: 'hospital',
  insurance_agency: 'insurance agency',
  jewelry_store: 'jeweller',
  laundry: 'laundry',
  lawyer: 'solicitor',
  library: 'library',
  liquor_store: 'off licence',
  local_government_office: 'local government office',
  locksmith: 'locksmith',
  lodging: 'hotel',
  meal_delivery: 'food delivery',
  meal_takeaway: 'takeaway',
  mosque: 'mosque',
  movie_theater: 'cinema',
  moving_company: 'removals company',
  museum: 'museum',
  night_club: 'nightclub',
  painter: 'painter and decorator',
  park: 'park',
  parking: 'parking',
  pet_store: 'pet shop',
  pharmacy: 'pharmacy',
  physiotherapist: 'physiotherapist',
  plumber: 'plumber',
  police: 'police station',
  post_office: 'post office',
  primary_school: 'primary school',
  real_estate_agency: 'estate agent',
  restaurant: 'restaurant',
  roofing_contractor: 'roofing contractor',
  school: 'school',
  secondary_school: 'secondary school',
  shoe_store: 'shoe shop',
  spa: 'spa',
  stadium: 'stadium',
  storage: 'storage facility',
  store: 'shop',
  supermarket: 'supermarket',
  synagogue: 'synagogue',
  tourist_attraction: 'tourist attraction',
  travel_agency: 'travel agency',
  university: 'university',
  veterinary_care: 'veterinary practice',
  zoo: 'zoo',
};

export function isGenericCategory(category: string | null | undefined): boolean {
  if (!category) return true;
  return GENERIC_CATEGORIES.has(category.trim().toLowerCase());
}

function normaliseCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  const cleaned = category.trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
  if (isGenericCategory(cleaned)) return null;
  return cleaned || null;
}

function categoryFromGoogleTypes(types: string[] | null | undefined): string | null {
  for (const type of types ?? []) {
    if (GENERIC_CATEGORIES.has(type)) continue;
    const mapped = GOOGLE_PLACE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
    const normalised = normaliseCategory(mapped);
    if (normalised) return normalised;
  }
  return null;
}

/** Try to extract a Google Place ID from a maps URL — best-effort only. */
export function tryExtractPlaceId(url: string): string | null {
  const match =
    url.match(/!1s([^!]+)/) ||
    url.match(/[?&]cid=([\d]+)/) ||
    url.match(/\/place\/[^/]+\/([^/?#]+)/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

/** Extract the business name slug from a /maps/place/Business+Name/ URL. */
function extractBusinessName(url: string): string | null {
  const match = url.match(/\/maps\/place\/([^/@?#]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() || null;
}

/** Extract lat/lng from a maps URL @lat,lng anchor. */
function extractCoords(url: string): { lat: string; lng: string } | null {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return null;
  return { lat: match[1], lng: match[2] };
}

async function googlePlacesLookup(profileUrl: string): Promise<EnrichmentResult | null> {
  if (!flags.hasGooglePlaces) return null;

  // Use the business name from the URL path as the text query — far more
  // reliable than passing the full URL, which Places API cannot parse.
  // Add a coordinate-based location bias when the URL contains @lat,lng.
  const businessName = extractBusinessName(profileUrl);
  const coords = extractCoords(profileUrl);
  const input = businessName ?? profileUrl;

  let findUrl =
    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json' +
    `?input=${encodeURIComponent(input)}` +
    '&inputtype=textquery' +
    '&fields=place_id,name,formatted_address' +
    `&key=${encodeURIComponent(env.GOOGLE_PLACES_API_KEY)}`;

  if (coords) {
    // 10 km radius bias around the map centre — narrows results to the right area.
    findUrl += `&locationbias=circle:10000@${coords.lat},${coords.lng}`;
  }

  const findRes = await fetch(findUrl);
  if (!findRes.ok) {
    throw new EnrichmentError(`Google Places find failed: HTTP ${findRes.status}`);
  }
  const findJson = (await findRes.json()) as {
    status: string;
    candidates?: Array<{ place_id?: string; name?: string; formatted_address?: string }>;
  };
  const placeId = findJson.candidates?.[0]?.place_id;
  if (!placeId) {
    throw new EnrichmentError(
      `Google Places returned no candidates for "${input}" (status=${findJson.status}). ` +
        'Edit the lead manually and fill in businessName and category, then generate the site.',
    );
  }

  // Place Details
  // See: https://developers.google.com/maps/documentation/places/web-service/details
  const detailUrl =
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(placeId)}` +
    '&fields=place_id,name,types,formatted_address,address_component,international_phone_number,website,url' +
    `&key=${encodeURIComponent(env.GOOGLE_PLACES_API_KEY)}`;

  const detailRes = await fetch(detailUrl);
  if (!detailRes.ok) {
    throw new EnrichmentError(`Google Places details failed: HTTP ${detailRes.status}`);
  }
  type AddressComponent = { long_name: string; short_name: string; types: string[] };
  const detailJson = (await detailRes.json()) as {
    status: string;
    result?: {
      place_id?: string;
      name?: string;
      types?: string[];
      formatted_address?: string;
      address_components?: AddressComponent[];
      international_phone_number?: string;
      website?: string;
      url?: string;
    };
  };

  const r = detailJson.result ?? {};
  const components = r.address_components ?? [];
  const find = (t: string): string | null => components.find((c) => c.types.includes(t))?.long_name ?? null;

  const streetNumber = find('street_number');
  const route = find('route');
  const addressLine1 =
    streetNumber && route ? `${streetNumber} ${route}` : route ?? null;
  const city = find('postal_town') ?? find('locality') ?? find('administrative_area_level_2');
  const postcode = find('postal_code');
  const country = find('country');

  return {
    source: 'google_places',
    raw: detailJson,
    extracted: {
      googlePlaceId: r.place_id ?? placeId,
      businessName: r.name ?? null,
      category: categoryFromGoogleTypes(r.types),
      addressLine1,
      addressLine2: null,
      city,
      postcode,
      country,
      phone: r.international_phone_number ?? null,
      existingWebsiteUrl: r.website ?? null,
      websiteStatus: classifyWebsite(r.website ?? null),
    },
  };
}

async function serpApiLookup(profileUrl: string): Promise<EnrichmentResult | null> {
  if (!flags.hasSerpApi) return null;
  // Use the business name from the URL path when available — more reliable than
  // the raw URL as a query string. Include coordinates for a tighter local match.
  const businessName = extractBusinessName(profileUrl);
  const coords = extractCoords(profileUrl);
  const q = businessName ?? profileUrl;

  let url =
    'https://serpapi.com/search.json' +
    '?engine=google_maps' +
    `&q=${encodeURIComponent(q)}` +
    `&api_key=${encodeURIComponent(env.SERPAPI_API_KEY)}`;

  if (coords) {
    url += `&ll=@${coords.lat},${coords.lng},14z`;
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new EnrichmentError(`SerpAPI request failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    place_results?: {
      data_id?: string;
      title?: string;
      type?: string;
      address?: string;
      phone?: string;
      website?: string;
      gps_coordinates?: { latitude?: number; longitude?: number };
    };
    local_results?: Array<{
      data_id?: string;
      title?: string;
      type?: string;
      address?: string;
      phone?: string;
      website?: string;
    }>;
  };

  const r = json.place_results ?? json.local_results?.[0];
  if (!r) {
    throw new EnrichmentError('SerpAPI returned no place results');
  }
  // Address parsing is heuristic — SerpAPI returns a single formatted string.
  const addrParts = (r.address ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const addressLine1 = addrParts[0] ?? null;
  const city = addrParts[addrParts.length - 3] ?? null;
  const postcode = addrParts[addrParts.length - 2] ?? null;
  const country = addrParts[addrParts.length - 1] ?? null;

  return {
    source: 'serpapi',
    raw: json,
    extracted: {
      googlePlaceId: r.data_id ?? null,
      businessName: r.title ?? null,
      category: normaliseCategory(r.type),
      addressLine1,
      addressLine2: null,
      city,
      postcode,
      country,
      phone: r.phone ?? null,
      existingWebsiteUrl: r.website ?? null,
      websiteStatus: classifyWebsite(r.website ?? null),
    },
  };
}

function mockLookup(profileUrl: string): EnrichmentResult {
  const placeId = tryExtractPlaceId(profileUrl);
  return {
    source: 'mock',
    raw: { mock: true, profileUrl, note: 'No Google Places / SerpAPI key configured. This is a labelled mock result for local development.' },
    extracted: {
      googlePlaceId: placeId,
      businessName: 'Sample Local Business (mock)',
      category: 'local service',
      addressLine1: '1 Example Street',
      addressLine2: null,
      city: 'Sampletown',
      postcode: 'SA1 1AA',
      country: 'GB',
      phone: '+44 20 0000 0000',
      existingWebsiteUrl: null,
      websiteStatus: 'none_found',
    },
  };
}

export async function enrichLeadFromUrl(profileUrl: string): Promise<EnrichmentResult> {
  // Prefer Google Places when available, else SerpAPI, else mock.
  if (flags.hasGooglePlaces) {
    const r = await googlePlacesLookup(profileUrl);
    if (r) return r;
  }
  if (flags.hasSerpApi) {
    const r = await serpApiLookup(profileUrl);
    if (r) return r;
  }
  return mockLookup(profileUrl);
}
