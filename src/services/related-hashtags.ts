import axios from 'axios';
import { logger } from '../config/database';

export interface RelatedHashtagResult {
  hashtag: string;
  popularity?: number;
  source?: 'frequent' | 'related' | 'aggregate';
}

export async function fetchInstagramRelatedHashtags(seeds: string[], resultsLimit = 10): Promise<RelatedHashtagResult[]> {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
  if (!token) {
    logger.warn('No Apify token configured; cannot fetch related hashtags');
    return [];
  }

  const actor = 'apify~instagram-hashtag-stats';
  try {
    const input = { hashtags: seeds.slice(0, 10), resultsLimit: Math.max(3, Math.min(20, resultsLimit)) };
    const start = await axios.post(
      `https://api.apify.com/v2/acts/${actor}/runs`,
      input,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
    );

    const runId = start.data?.data?.id || start.data?.id;
    let attempts = 0;
    let status = 'RUNNING';
    while (attempts < 25 && status === 'RUNNING') {
      await new Promise(r => setTimeout(r, 3000));
      attempts++;
      const st = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      status = st.data?.data?.status || st.data?.status;
      if (['SUCCEEDED','FAILED','TIMED_OUT','ABORTED'].includes(status)) break;
    }
    if (status !== 'SUCCEEDED') {
      logger.warn(`Instagram related hashtags run status: ${status}`);
      return [];
    }

    const datasetId = start.data?.data?.defaultDatasetId;
    const itemsRes = await axios.get(`https://api.apify.com/v2/datasets/${datasetId}/items`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
    const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];

    const map = new Map<string, { popularity: number; source: Set<string> }>();
    for (const it of items) {
      const push = (tag: string, source: string, pop?: number) => {
        const h = tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;
        const cur = map.get(h) || { popularity: 0, source: new Set<string>() };
        cur.popularity = Math.max(cur.popularity, typeof pop === 'number' ? pop : 0);
        cur.source.add(source);
        map.set(h, cur);
      };

      if (Array.isArray(it.frequent)) {
        for (const f of it.frequent) {
          if (f?.hash) push(f.hash, 'frequent', f?.info?.postCount || f?.info?.postsCount || 0);
        }
      }
      if (Array.isArray(it.related)) {
        for (const r of it.related) {
          if (r?.hash) push(r.hash, 'related', r?.info?.postCount || r?.info?.postsCount || 0);
        }
      }
    }

    const results: RelatedHashtagResult[] = Array.from(map.entries()).map(([hashtag, val]) => ({
      hashtag,
      popularity: val.popularity || undefined,
      source: (val.source.has('frequent') && val.source.has('related')) ? 'aggregate' : (val.source.has('frequent') ? 'frequent' : 'related')
    }));

    // Filter out generic/platform spammy tags
    const deny = ['#fyp', '#viral', '#follow', '#like', '#insta', '#instagram'];
    return results
      .filter(r => !deny.some(d => r.hashtag.includes(d)))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, resultsLimit);
  } catch (e: any) {
    logger.error('fetchInstagramRelatedHashtags failed', e?.response?.data || e?.message || e);
    return [];
  }
}

