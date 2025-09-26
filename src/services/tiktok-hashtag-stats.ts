import axios from 'axios';
import { logger } from '../config/database';

export interface TikTokHashtagStatsSummary {
  hashtag: string;
  totalViews?: number | null;
  videosSampled: number;
  creatorsSampled: number;
  sumPlaysSampled: number;
  avgPlaysSampled?: number;
  topCreators?: Array<{
    handle: string;
    followers?: number;
    videos?: number;
    totalLikes?: number;
  }>;
}

export async function fetchTikTokHashtagStatsClockworks(hashtags: string[], resultsPerPage = 20): Promise<{ summaries: TikTokHashtagStatsSummary[], items: any[] }>{
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
  if (!token) {
    logger.warn('No Apify token configured; cannot fetch TikTok hashtag stats');
    return { summaries: [], items: [] };
  }

  const actor = process.env.TIKTOK_HASHTAG_STATS_ACTOR || 'clockworks~tiktok-hashtag-scraper';

  try {
    const input = {
      hashtags,
      resultsPerPage,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadSubtitles: false,
      shouldDownloadVideos: false
    };

    const start = await axios.post(
      `https://api.apify.com/v2/acts/${actor}/runs`,
      { input },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const runId = start.data?.data?.id || start.data?.id;

    // Poll for completion
    let attempts = 0; let status = 'RUNNING';
    while (attempts < 30 && status === 'RUNNING') {
      await new Promise(r => setTimeout(r, 3000)); attempts++;
      const st = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      status = st.data?.data?.status || st.data?.status;
      if (['SUCCEEDED','FAILED','TIMED_OUT','ABORTED'].includes(status)) break;
    }
    if (status !== 'SUCCEEDED') {
      logger.warn(`TikTok hashtag stats actor status: ${status}`);
      return { summaries: [], items: [] };
    }

    const datasetId = start.data?.data?.defaultDatasetId;
    const itemsRes = await axios.get(`https://api.apify.com/v2/datasets/${datasetId}/items`, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
    const items: any[] = Array.isArray(itemsRes.data) ? itemsRes.data : [];

    // Group by hashtag if multiple provided
    const byHashtag = new Map<string, any[]>();
    for (const it of items) {
      // Try to infer the hashtag associated with this item
      const tag = (it?.hashtag || it?.hashtagName || it?.queryHashtag || it?.searchHashtag || it?.challengeName || '').toString().replace(/^#/, '').toLowerCase();
      const key = hashtags.length === 1 ? hashtags[0].toLowerCase().replace(/^#/, '') : (tag || 'unknown');
      if (!byHashtag.has(key)) byHashtag.set(key, []);
      byHashtag.get(key)!.push(it);
    }

    const summaries: TikTokHashtagStatsSummary[] = [];
    for (const [tag, arr] of byHashtag.entries()) {
      // Aggregate
      let sumPlays = 0; const creators = new Map<string, { followers?: number; videos: number; totalLikes: number }>();
      let totalViewsFromActor: number | null | undefined = null;
      for (const it of arr) {
        const plays = (it.playCount ?? it.play_count ?? it.stats?.playCount ?? it.stats?.play_count);
        if (typeof plays === 'number') sumPlays += plays;

        const creatorId = (it.author?.uniqueId || it.author?.id || it.author?.nickname || it.user?.uniqueId || it.user?.id);
        if (creatorId) {
          const keyCreator = String(creatorId).toLowerCase();
          const prev = creators.get(keyCreator) || { followers: undefined, videos: 0, totalLikes: 0 };
          prev.videos += 1;
          const likes = (it.diggCount ?? it.digg_count ?? it.stats?.diggCount ?? it.stats?.digg_count ?? 0);
          prev.totalLikes += (typeof likes === 'number' ? likes : 0);
          const followers = (it.author?.followerCount ?? it.author?.stats?.followerCount ?? it.user?.followerCount);
          if (typeof followers === 'number') prev.followers = Math.max(prev.followers || 0, followers);
          creators.set(keyCreator, prev);
        }

        // Try to capture actor-provided total hashtag views if present
        const hv = (it.hashtagTotalViews ?? it.totalViews ?? it.hashtag?.viewCount ?? it.challenge?.viewCount);
        if (typeof hv === 'number') totalViewsFromActor = Math.max(totalViewsFromActor || 0, hv);
      }

      const topCreators = Array.from(creators.entries())
        .map(([handle, agg]) => ({ handle, followers: agg.followers, videos: agg.videos, totalLikes: agg.totalLikes }))
        .sort((a, b) => (b.followers || 0) - (a.followers || 0))
        .slice(0, 10);

      summaries.push({
        hashtag: `#${tag}`,
        totalViews: totalViewsFromActor ?? null,
        videosSampled: arr.length,
        creatorsSampled: creators.size,
        sumPlaysSampled: sumPlays,
        avgPlaysSampled: arr.length ? Math.round(sumPlays / arr.length) : undefined,
        topCreators
      });
    }

    return { summaries, items };
  } catch (e: any) {
    logger.error('fetchTikTokHashtagStatsClockworks failed', e?.response?.data || e?.message || e);
    return { summaries: [], items: [] };
  }
}

