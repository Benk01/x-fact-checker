// Firecrawl API client wrapper with credibility scoring

import FirecrawlApp from '@mendable/firecrawl-js';
import { getCredibilityTier, isBlacklisted, isSocialMedia, type CredibilityTier } from './domains';

// Initialize client lazily
let firecrawlClient: FirecrawlApp | null = null;

function getClient(): FirecrawlApp {
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY is not configured');
  }
  if (!firecrawlClient) {
    firecrawlClient = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  }
  return firecrawlClient;
}

export function isFirecrawlAvailable(): boolean {
  return !!process.env.FIRECRAWL_API_KEY;
}

// Smart extraction settings
const MAX_CONTENT_LENGTH = 2000;  // Reduced from 4000 to lower token usage

/**
 * Extract relevant paragraphs from markdown based on keyword matches.
 * Prioritizes paragraphs containing more keywords.
 */
function extractRelevantContent(markdown: string, keywords: string[]): string {
  // Split into paragraphs
  const paragraphs = markdown.split(/\n\n+/);

  // Score paragraphs by keyword matches
  const scored = paragraphs.map(p => {
    const lowerP = p.toLowerCase();
    const matches = keywords.filter(k => lowerP.includes(k.toLowerCase())).length;
    return { text: p, score: matches };
  });

  // Sort by relevance (highest score first)
  scored.sort((a, b) => b.score - a.score);

  // Take top paragraphs until we hit the limit
  let result = '';
  for (const p of scored) {
    if (p.score === 0) continue; // Skip irrelevant paragraphs
    if (result.length + p.text.length > MAX_CONTENT_LENGTH) break;
    result += p.text + '\n\n';
  }

  // If no relevant paragraphs found, take start of article
  if (!result) {
    result = markdown.substring(0, MAX_CONTENT_LENGTH);
  }

  return result.trim() + (markdown.length > result.length ? '\n\n[...]' : '');
}

export interface SearchResult {
  url: string;
  title: string;
  description: string;
  markdown?: string;
  credibilityTier: CredibilityTier;
  domain: string;
  isSocialMedia?: boolean;
}

export interface SearchOptions {
  limit?: number;
  getFullContent?: boolean;
  forQuoteVerification?: boolean;
}

export async function search(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const client = getClient();
  const { limit = 15, getFullContent = false, forQuoteVerification = false } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔥 FIRECRAWL SEARCH`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Query: "${query}"`);
  console.log(`Options: limit=${limit}, getFullContent=${getFullContent}, forQuoteVerification=${forQuoteVerification}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const searchResult = await client.search(query, {
    limit,
    scrapeOptions: getFullContent ? { formats: ['markdown'] } : undefined,
  });

  // Combine web and news results
  const webResults = searchResult.web || [];
  const newsResults = searchResult.news || [];
  const allResults = [...newsResults, ...webResults];

  console.log(`\nRaw results: ${newsResults.length} news, ${webResults.length} web`);

  if (allResults.length === 0) {
    console.log('❌ No results found');
    console.log(`${'='.repeat(60)}\n`);
    return [];
  }

  const results: SearchResult[] = [];
  let blacklistedCount = 0;

  console.log(`\nProcessing ${allResults.length} results:`);

  for (const item of allResults) {
    const url = 'url' in item ? item.url : '';
    if (!url) continue;

    // Skip blacklisted domains (unless quote verification allows social media)
    const blacklisted = isBlacklisted(url);
    const socialMedia = isSocialMedia(url);

    if (blacklisted && !(forQuoteVerification && socialMedia)) {
      blacklistedCount++;
      console.log(`  ❌ Blacklisted: ${new URL(url).hostname}`);
      continue;
    }

    // Mark social media sources when allowed for quote verification
    const isAllowedSocialMedia = forQuoteVerification && socialMedia;
    if (isAllowedSocialMedia) {
      console.log(`  📱 Social media allowed (quote verification): ${new URL(url).hostname}`);
    }

    const domain = new URL(url).hostname.replace('www.', '');
    const credibilityTier = isAllowedSocialMedia ? 1 : getCredibilityTier(url); // Social media for quotes = primary source (tier 1)
    const title = ('title' in item ? item.title : '') || 'Untitled';

    results.push({
      url,
      title,
      description: ('description' in item ? item.description : '') || '',
      markdown: 'markdown' in item ? (item.markdown as string) : undefined,
      credibilityTier,
      domain,
      isSocialMedia: isAllowedSocialMedia,
    });

    const tierLabel = isAllowedSocialMedia ? 'Primary (social)' : `Tier ${credibilityTier}`;
    console.log(`  ✓ ${tierLabel}: ${domain} - "${title.substring(0, 50)}..."`);
  }

  // Sort by credibility tier (1 first)
  results.sort((a, b) => a.credibilityTier - b.credibilityTier);

  console.log(`\nSummary:`);
  console.log(`  Valid sources: ${results.length}`);
  console.log(`  Blacklisted: ${blacklistedCount}`);
  console.log(`  Tier 1: ${results.filter(r => r.credibilityTier === 1).length}`);
  console.log(`  Tier 2: ${results.filter(r => r.credibilityTier === 2).length}`);
  console.log(`  Tier 3: ${results.filter(r => r.credibilityTier === 3).length}`);
  console.log(`${'='.repeat(60)}\n`);

  return results;
}

export interface ScrapeResult {
  url: string;
  title: string;
  markdown: string;
  credibilityTier: CredibilityTier;
  domain: string;
}

export async function scrapeUrl(url: string, keywords?: string[]): Promise<ScrapeResult | null> {
  const client = getClient();

  console.log(`🔥 Firecrawl scrape: ${url}`);

  try {
    const result = await client.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,  // Skip sidebars, headers, footers to reduce credit usage
      timeout: 10000,         // 10s timeout to avoid slow/huge pages
    });

    // Result is a Document, check for markdown content
    if (!result.markdown) {
      console.log('  Scrape returned no content');
      return null;
    }

    const domain = new URL(url).hostname.replace('www.', '');
    const originalLength = result.markdown.length;

    // Apply smart extraction or truncation
    let markdown: string;
    if (keywords && keywords.length > 0) {
      markdown = extractRelevantContent(result.markdown, keywords);
      console.log(`  Smart extracted: ${originalLength} → ${markdown.length} chars (keywords: ${keywords.slice(0, 5).join(', ')})`);
    } else if (originalLength > MAX_CONTENT_LENGTH) {
      markdown = result.markdown.substring(0, MAX_CONTENT_LENGTH) + '\n\n[...]';
      console.log(`  Truncated: ${originalLength} → ${MAX_CONTENT_LENGTH} chars`);
    } else {
      markdown = result.markdown;
      console.log(`  Content: ${originalLength} chars`);
    }

    return {
      url,
      title: result.metadata?.title || 'Untitled',
      markdown,
      credibilityTier: getCredibilityTier(url),
      domain,
    };
  } catch (error) {
    console.error(`  Scrape error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

export async function scrapeMultiple(urls: string[], keywords?: string[]): Promise<ScrapeResult[]> {
  // Limit to 10 URLs max
  const limitedUrls = urls.slice(0, 10);

  console.log(`🔥 Firecrawl batch scrape: ${limitedUrls.length} URLs`);

  // Scrape in parallel with individual error handling
  const results = await Promise.all(
    limitedUrls.map(url => scrapeUrl(url, keywords).catch(() => null))
  );

  return results.filter((r): r is ScrapeResult => r !== null);
}
