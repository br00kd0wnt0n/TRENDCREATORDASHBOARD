import axios from 'axios';
import { logger } from '../config/database';
import { fetchInstagramRelatedHashtags } from './related-hashtags';

export interface CreatorSearchParams {
  platform: 'instagram' | 'tiktok';
  query: string;
  limit?: number;
  minFollowers?: number;
  regionHint?: string; // e.g., 'IN' or 'west_coast'
}

export interface CreatorDiscoveryParams {
  seeds: string[];
  platforms?: ('instagram' | 'tiktok')[];
  limit?: number;
  minFollowers?: number;
  maxHashtags?: number;
}

export interface CreatorProfile {
  handle: string;
  platform: 'instagram' | 'tiktok';
  displayName?: string;
  followers?: number;
  engagementRate?: number;
  location?: string;
  categories?: string[];
  profileUrl?: string;
  avatarUrl?: string;
  bio?: string;
}

export class CreatorFinderService {
  private token?: string;
  private serpApiKey?: string;

  constructor() {
    this.token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
    this.serpApiKey = process.env.SERPAPI_API_KEY;
  }

  async searchCreators(params: CreatorSearchParams): Promise<CreatorProfile[]> {
    const { platform, query, limit = 10, minFollowers = 0 } = params;

    const results: CreatorProfile[] = [];
    try {
      // 1) Try Apify provider if token present
      if (this.token) {
        let apifyResults: CreatorProfile[] = [];
        if (platform === 'instagram') apifyResults = await this.searchInstagram(query, limit, minFollowers);
        else if (platform === 'tiktok') apifyResults = await this.searchTikTok(query, limit, minFollowers);
        results.push(...apifyResults);
      } else {
        logger.warn('No Apify token present; skipping Apify creator search');
      }

      // 2) Fallback: SerpAPI search if available, fill gaps, then de-dup
      if (results.length < limit && this.serpApiKey) {
        const needed = limit - results.length;
        const serp = await this.searchViaSerpAPI(platform, query, needed);
        // Merge by handle/platform
        const seen = new Set(results.map(r => `${r.platform}:${r.handle.toLowerCase()}`));
        for (const c of serp) {
          const key = `${c.platform}:${c.handle.toLowerCase()}`;
          if (!seen.has(key)) { results.push(c); seen.add(key); }
        }
      }

      // Min followers filter (only applies when we have numbers)
      return results.filter(r => (r.followers ?? minFollowers) >= minFollowers).slice(0, limit);
    } catch (e: any) {
      logger.error('Creator search failed', e?.response?.data || e?.message || e);
      return results.slice(0, limit);
    }
  }

  private async runApifyActor(actor: string, input: any): Promise<any[]> {
    const base = `https://api.apify.com/v2/acts/${actor}`;
    const start = await axios.post(`${base}/runs?token=${this.token}`, input, { headers: { 'Content-Type': 'application/json' }});
    const runId = start.data?.data?.id || start.data?.id || start.data?.data?.id;
    let attempts = 0;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 3000));
      attempts++;
      const statusRes = await axios.get(`${base}/runs/${runId}?token=${this.token}`);
      const status = statusRes.data?.data?.status || statusRes.data?.status;
      if (status === 'SUCCEEDED') break;
      if (['FAILED','ABORTED','TIMED_OUT'].includes(status)) {
        throw new Error(`Apify actor failed: ${status}`);
      }
    }
    const itemsRes = await axios.get(`${base}/runs/${runId}/dataset/items?token=${this.token}`);
    return itemsRes.data || [];
  }

  private async searchInstagram(query: string, limit: number, minFollowers: number): Promise<CreatorProfile[]> {
    // Use a generic Instagram search actor; inputs may vary by actor. This is a best-effort integration.
    // Prefer an actor that supports account search by keyword.
    const actor = 'apify~instagram-scraper';
    const input = {
      search: query,
      resultsType: 'profiles',
      profilesLimit: limit,
      addFollowersCount: true,
    };
    const items = await this.runApifyActor(actor, input);
    return (items as any[])
      .map((it: any) => ({
        handle: it.username || it.handle || '',
        displayName: it.fullName || it.name,
        platform: 'instagram' as const,
        followers: it.followersCount ?? it.followers ?? 0,
        engagementRate: it.engagementRate ?? undefined,
        location: it.location || it.cityName || undefined,
        categories: it.categoryName ? [it.categoryName] : undefined,
        profileUrl: it.url || (it.username ? `https://instagram.com/${it.username}` : undefined),
        avatarUrl: it.profilePicUrl || it.profilePicUrlHd,
        bio: it.biography || undefined,
      }))
      .filter(p => p.handle)
      .filter(p => (p.followers ?? 0) >= minFollowers)
      .slice(0, limit);
  }

  private async searchTikTok(query: string, limit: number, minFollowers: number): Promise<CreatorProfile[]> {
    const actor = 'junglescout~tiktok-scraper'; // a known community actor; may vary
    const input = {
      search: query,
      searchType: 'users',
      maxItems: limit,
      addUserInfo: true,
    };
    const items = await this.runApifyActor(actor, input);
    return (items as any[])
      .map((it: any) => ({
        handle: it.uniqueId || it.username || '',
        displayName: it.nickname || it.fullName,
        platform: 'tiktok' as const,
        followers: it.followers ?? it.stats?.followerCount ?? 0,
        engagementRate: it.engagementRate ?? undefined,
        location: it.region || it.location,
        categories: it.category ? [it.category] : undefined,
        profileUrl: it.uniqueId ? `https://www.tiktok.com/@${it.uniqueId}` : undefined,
        avatarUrl: it.avatarMedium || it.avatarThumb,
        bio: it.signature || it.bio,
      }))
      .filter(p => p.handle)
      .filter(p => (p.followers ?? 0) >= minFollowers)
      .slice(0, limit);
  }

  private async searchViaSerpAPI(platform: 'instagram'|'tiktok', query: string, limit: number): Promise<CreatorProfile[]> {
    try {
      if (!this.serpApiKey) return [];
      const site = platform === 'instagram' ? 'site:instagram.com' : 'site:tiktok.com/@';
      const params = new URLSearchParams({
        engine: 'google',
        q: `${site} ${query}`,
        num: String(Math.min(20, Math.max(5, limit * 3))),
        api_key: this.serpApiKey
      });
      const url = `https://serpapi.com/search.json?${params.toString()}`;
      const res = await axios.get(url, { timeout: 15000 });
      const org = res.data?.organic_results || [];

      const creators: CreatorProfile[] = [];
      for (const r of org) {
        const link: string = r.link || '';
        try {
          const u = new URL(link);
          const host = u.hostname.replace(/^www\./, '');
          const segs = u.pathname.split('/').filter(Boolean);
          if (platform === 'instagram' && host === 'instagram.com' && segs.length >= 1) {
            const first = segs[0].toLowerCase();
            const disallowed = new Set(['p','reel','tv','explore','stories','about','accounts']);
            if (!disallowed.has(first)) {
              const handle = segs[0];
              creators.push({
                handle,
                platform: 'instagram',
                profileUrl: `https://instagram.com/${handle}`,
                displayName: r.title,
                bio: r.snippet
              });
            }
          }
          if (platform === 'tiktok' && host === 'tiktok.com' && segs.length >= 1) {
            if (segs[0].startsWith('@')) {
              const handle = segs[0].slice(1);
              creators.push({
                handle,
                platform: 'tiktok',
                profileUrl: `https://www.tiktok.com/@${handle}`,
                displayName: r.title,
                bio: r.snippet
              });
            }
          }
        } catch {}
        if (creators.length >= limit) break;
      }
      return creators;
    } catch (e) {
      logger.warn('SerpAPI creator fallback failed', e);
      return [];
    }
  }

  async discoverCreators(params: CreatorDiscoveryParams): Promise<CreatorProfile[]> {
    const { seeds, platforms = ['instagram', 'tiktok'], limit = 20, minFollowers = 0, maxHashtags = 8 } = params;

    logger.info(`Discovering creators from seeds: ${seeds.join(', ')}`);

    const creators = new Map<string, CreatorProfile>();

    for (const platform of platforms) {
      try {
        let hashtags = seeds.map(s => s.startsWith('#') ? s : `#${s}`);

        if (platform === 'instagram') {
          const related = await fetchInstagramRelatedHashtags(seeds, maxHashtags);
          hashtags = [...new Set([...hashtags, ...related.map(r => r.hashtag)])].slice(0, maxHashtags);
        }

        logger.info(`${platform}: Pulling recent posts for hashtags: ${hashtags.join(', ')}`);

        if (platform === 'instagram') {
          const posts = await this.getInstagramPostsByHashtags(hashtags);
          for (const post of posts) {
            if (post.owner) {
              const key = `instagram:${post.owner.toLowerCase()}`;
              if (!creators.has(key)) {
                creators.set(key, {
                  handle: post.owner,
                  platform: 'instagram',
                  displayName: post.ownerName,
                  followers: post.ownerFollowers,
                  engagementRate: post.engagementRate,
                  profileUrl: `https://instagram.com/${post.owner}`,
                  avatarUrl: post.ownerAvatar,
                });
              }
            }
          }
        } else if (platform === 'tiktok') {
          const posts = await this.getTikTokPostsByHashtags(hashtags);
          for (const post of posts) {
            if (post.authorHandle) {
              const key = `tiktok:${post.authorHandle.toLowerCase()}`;
              if (!creators.has(key)) {
                creators.set(key, {
                  handle: post.authorHandle,
                  platform: 'tiktok',
                  displayName: post.authorName,
                  followers: post.authorFollowers,
                  profileUrl: `https://www.tiktok.com/@${post.authorHandle}`,
                  avatarUrl: post.authorAvatar,
                });
              }
            }
          }
        }
      } catch (e: any) {
        logger.error(`Failed to discover creators on ${platform}`, e?.message || e);
      }
    }

    const results = Array.from(creators.values())
      .filter(c => (c.followers ?? 0) >= minFollowers)
      .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
      .slice(0, limit);

    logger.info(`Discovered ${results.length} creators from ${seeds.length} seeds across ${platforms.join(', ')}`);
    return results;
  }

  private async getInstagramPostsByHashtags(hashtags: string[]): Promise<any[]> {
    if (!this.token) {
      logger.warn('No Apify token; skipping Instagram post fetch');
      return [];
    }

    const actor = 'apify~instagram-scraper';
    const input = {
      hashtags: hashtags.slice(0, 5),
      resultsLimit: 50,
      resultsType: 'posts',
      addParentData: true,
    };

    try {
      const items = await this.runApifyActor(actor, input);
      return items.map((it: any) => ({
        owner: it.ownerUsername || it.owner,
        ownerName: it.ownerFullName,
        ownerFollowers: it.ownerFollowersCount,
        ownerAvatar: it.ownerProfilePicUrl,
        engagementRate: it.engagementRate,
        likes: it.likesCount,
        comments: it.commentsCount,
      }));
    } catch (e) {
      logger.warn('Instagram posts fetch failed', e);
      return [];
    }
  }

  private async getTikTokPostsByHashtags(hashtags: string[]): Promise<any[]> {
    if (!this.token) {
      logger.warn('No Apify token; skipping TikTok post fetch');
      return [];
    }

    const actor = 'junglescout~tiktok-scraper';
    const input = {
      hashtags: hashtags.slice(0, 5),
      maxItems: 50,
      searchType: 'hashtag',
    };

    try {
      const items = await this.runApifyActor(actor, input);
      return items.map((it: any) => ({
        authorHandle: it.authorMeta?.uniqueId || it.author?.uniqueId,
        authorName: it.authorMeta?.name || it.author?.nickname,
        authorFollowers: it.authorMeta?.fans || it.authorStats?.followerCount,
        authorAvatar: it.authorMeta?.avatar || it.author?.avatarMedium,
        likes: it.diggCount || it.stats?.diggCount,
        comments: it.commentCount || it.stats?.commentCount,
        shares: it.shareCount || it.stats?.shareCount,
      }));
    } catch (e) {
      logger.warn('TikTok posts fetch failed', e);
      return [];
    }
  }
}
