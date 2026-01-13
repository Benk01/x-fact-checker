// Redis caching layer using Upstash
// TEMPORARILY DISABLED FOR TESTING

import crypto from 'crypto';

// Caching temporarily disabled
function getClient(): null {
  return null;
}

export function isCacheAvailable(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

// Generate cache key from query/URL
function hashKey(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

// Cache TTLs (in seconds)
const TTL = {
  searchResults: 3600,      // 1 hour for search results
  verdict: 86400,           // 24 hours for verdicts
  scrapedContent: 7200,     // 2 hours for scraped content
};

// Search results cache
export async function getCachedSearch(query: string): Promise<unknown | null> {
  const client = getClient();
  if (!client) return null;

  const key = `search:${hashKey(query)}`;
  try {
    const cached = await client.get(key);
    if (cached) {
      console.log(`📦 Cache hit: search "${query.substring(0, 50)}..."`);
    }
    return cached;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function setCachedSearch(query: string, results: unknown): Promise<void> {
  const client = getClient();
  if (!client) return;

  const key = `search:${hashKey(query)}`;
  try {
    await client.setex(key, TTL.searchResults, JSON.stringify(results));
    console.log(`📦 Cached: search "${query.substring(0, 50)}..."`);
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

// Verdict cache (by post URL)
export async function getCachedVerdict(postUrl: string): Promise<unknown | null> {
  const client = getClient();
  if (!client) return null;

  const key = `verdict:${hashKey(postUrl)}`;
  try {
    const cached = await client.get(key);
    if (cached) {
      console.log(`📦 Cache hit: verdict for ${postUrl}`);
    }
    return cached;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function setCachedVerdict(postUrl: string, verdict: unknown): Promise<void> {
  const client = getClient();
  if (!client) return;

  const key = `verdict:${hashKey(postUrl)}`;
  try {
    await client.setex(key, TTL.verdict, JSON.stringify(verdict));
    console.log(`📦 Cached: verdict for ${postUrl}`);
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

// Scraped content cache
export async function getCachedContent(url: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const key = `content:${hashKey(url)}`;
  try {
    const cached = await client.get<string>(key);
    if (cached) {
      console.log(`📦 Cache hit: content ${url}`);
    }
    return cached;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function setCachedContent(url: string, content: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  const key = `content:${hashKey(url)}`;
  try {
    await client.setex(key, TTL.scrapedContent, content);
    console.log(`📦 Cached: content ${url}`);
  } catch (error) {
    console.error('Cache set error:', error);
  }
}
