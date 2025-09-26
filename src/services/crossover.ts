import { logger } from '../config/database';

export interface TrendLike {
  hashtag?: string;
  platform?: string;
  category?: string;
  aiInsights?: string;
  confidence?: number;
  scrapedAt?: string | Date;
}

export interface ScoredTrend extends TrendLike {
  crossoverScore: number;
  signals: {
    westCoast: number;
    indiaAffinity: number;
    memeability: number;
    platformWeight: number;
    clarity: number;
    recency: number;
  };
}

const WEST_COAST = [
  'cali','california','los angeles','la','hollywood','bay area','sf','san francisco','oakland','silicon valley','venice','santa monica','malibu','beverly hills','weho'
];

const INDIA_AFFINITY = [
  'bollywood','kollywood','tollywood','cricket','ipl','desi','punjabi','hindi','tamil','telugu','mumbai','delhi','bangalore','hyderabad','reels','meme','dance','garba','bhangra','viral','trend'
];

const MEMEABILITY = ['meme','remix','capcut','template','challenge','edit','sound','audio','loop','duet','stitch','reel','reels','short','shorts'];

// Prime Video alignment terms
const OTT_STREAMING = ['prime','prime video','primevideo','binge','episode','series','season','trailer','teaser','streaming','ott'];
const ENTERTAINMENT = ['celebrity','actor','actress','director','film','movie','cinema','hollywood','oscar','sundance'];

// Generic/low-signal or spammy terms to downrank
const GENERIC_COMMERCE = ['sale','sales','discount','promo','promocode','coupon','deal','deals','blackfriday','cybermonday','megasale'];
const GENERIC_COMMON = ['hello','thanks','thankyou','everyone','special','great','blessings','pray','prayer','faith'];
const ARABIC_COUPON_HINT = ['كود','كوبون','خصم','نون'];

const CATEGORY_WEIGHTS: Record<string, number> = {
  dance: 1.0,
  music: 0.9,
  comedy: 0.85,
  tech: 0.7,
  sports: 0.75,
  fashion: 0.7,
  beauty: 0.65,
  general: 0.6
};

function containsAny(text: string, terms: string[]): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (t.includes(term)) score += 1;
  }
  return Math.min(1, score / Math.max(3, terms.length / 4));
}

function clarityScore(hashtag?: string): number {
  if (!hashtag) return 0.5;
  const h = hashtag.replace('#','');
  if (h.length < 3) return 0.3;
  if (h.length > 24) return 0.5;
  const alnum = (h.match(/[a-z0-9]/gi) || []).length;
  const ratio = alnum / h.length;
  return Math.max(0, Math.min(1, 0.4 + 0.6 * ratio));
}

function recencyScore(scrapedAt?: string | Date): number {
  if (!scrapedAt) return 0.6;
  const t = new Date(scrapedAt).getTime();
  const now = Date.now();
  const ageHrs = (now - t) / 36e5;
  if (ageHrs <= 24) return 1.0;
  if (ageHrs <= 7*24) return 0.8;
  if (ageHrs <= 30*24) return 0.6;
  return 0.4;
}

function platformWeight(p?: string): number {
  if (!p) return 0.7;
  const v = p.toLowerCase();
  if (v.includes('instagram')) return 1.0;
  if (v.includes('tiktok')) return 0.95;
  return 0.7;
}

export function scoreTrend(t: TrendLike): ScoredTrend {
  const text = `${t.hashtag || ''} ${t.aiInsights || ''}`.toLowerCase();
  const wc = containsAny(text, WEST_COAST);
  const inAff = containsAny(text, INDIA_AFFINITY);
  const meme = containsAny(text, MEMEABILITY);
  const catW = CATEGORY_WEIGHTS[(t.category || 'general').toLowerCase()] ?? CATEGORY_WEIGHTS.general;
  const plat = platformWeight(t.platform);
  const clar = clarityScore(t.hashtag);
  const rec = recencyScore(t.scrapedAt);
  const conf = t.confidence ?? 0.6;

  // Bonuses aligned to Prime Video crossover
  const ott = containsAny(text, OTT_STREAMING);
  const ent = containsAny(text, ENTERTAINMENT);

  // Penalties for generic/spammy content and off-market coupon terms
  const hasGenericCommerce = containsAny(text, GENERIC_COMMERCE);
  const hasGenericCommon = containsAny(text, GENERIC_COMMON);
  const hasArabicCoupon = containsAny(text, ARABIC_COUPON_HINT);

  // Year penalty: hashtags like #halloween2016
  let yearPenalty = 0;
  const yearMatch = (t.hashtag || '').match(/(20\d{2})/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    const current = new Date().getFullYear();
    if (y <= current - 3) yearPenalty = 0.3; // older than ~2 years
  }

  // Weighted blend (tunable)
  let score = (
    0.24 * wc +
    0.2  * inAff +
    0.14 * meme +
    0.14 * catW +
    0.1  * plat +
    0.08 * clar +
    0.08 * rec +
    0.06 * ott +
    0.06 * ent
  ) * (0.6 + 0.4 * conf);

  // Apply penalties (down to a floor)
  const penalty = 0.25 * hasGenericCommerce + 0.15 * hasGenericCommon + 0.2 * hasArabicCoupon + yearPenalty;
  score = Math.max(0, score - penalty);

  return {
    ...t,
    crossoverScore: Math.max(0, Math.min(1, score)),
    signals: {
      westCoast: wc,
      indiaAffinity: inAff,
      memeability: meme,
      platformWeight: plat,
      clarity: clar,
      recency: rec
    }
  };
}

export function scoreTrends(list: TrendLike[]): ScoredTrend[] {
  try {
    return list.map(scoreTrend).sort((a,b) => b.crossoverScore - a.crossoverScore);
  } catch (e) {
    logger.error('Crossover scoring failed', e);
    return list.map(t => ({ ...t, crossoverScore: t.confidence ?? 0.5, signals: { westCoast:0, indiaAffinity:0, memeability:0, platformWeight:platformWeight(t.platform), clarity: clarityScore(t.hashtag), recency: recencyScore(t.scrapedAt) } }));
  }
}
