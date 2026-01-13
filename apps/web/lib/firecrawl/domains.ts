// Credibility domain tiers for source ranking

export const CREDIBILITY_DOMAINS = {
  tier1: [
    // Government
    'cdc.gov', 'bls.gov', 'census.gov', 'who.int', 'nih.gov',
    'epa.gov', 'fda.gov', 'data.gov', 'congress.gov', 'usgs.gov',
    'whitehouse.gov', 'state.gov', 'justice.gov', 'treasury.gov',
    // Academic
    'pubmed.ncbi.nlm.nih.gov', 'scholar.google.com', 'jstor.org',
    'nature.com', 'sciencedirect.com', 'thelancet.com', 'nejm.org',
    'arxiv.org', 'pnas.org', 'science.org',
    // Wire services & public broadcasting (highest editorial standards)
    'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org',
    // .edu domains handled separately
  ],
  tier2: [
    // Wire services (other)
    'afp.com',
    // Fact-checkers
    'snopes.com', 'factcheck.org', 'politifact.com',
    'leadstories.com', 'fullfact.org', 'checkyourfact.com',
    // Public broadcasting (other)
    'pbs.org',
  ],
  tier3: [
    // Major US newspapers
    'nytimes.com', 'washingtonpost.com', 'wsj.com', 'usatoday.com', 'latimes.com',
    // Major international
    'theguardian.com', 'telegraph.co.uk', 'economist.com', 'ft.com',
    // Major US networks
    'cnn.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com',
    'foxnews.com', 'msnbc.com',
    // Business/Financial
    'bloomberg.com', 'cnbc.com', 'forbes.com', 'marketwatch.com',
    // News magazines
    'theatlantic.com', 'newyorker.com', 'time.com', 'newsweek.com',
  ],
} as const;

// Social media domains - can be allowed for quote/attribution verification
export const SOCIAL_MEDIA_DOMAINS = [
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
  'snapchat.com', 'linkedin.com', 'threads.com', 'mastodon.social',
  'truthsocial.com', 'gettr.com', 'parler.com', 'gab.com',
];

// Domains to always exclude (never allow even for quotes)
export const BLACKLIST_DOMAINS = [
  // Forums & Discussion (not individual accounts, unreliable for attribution)
  'reddit.com', '4chan.org', '8kun.top', 'voat.co',
  // User-Generated Content
  'medium.com', 'substack.com', 'quora.com', 'answers.yahoo.com',
  // Video Platforms (hard to verify specific content)
  'youtube.com', 'rumble.com', 'bitchute.com', 'dailymotion.com', 'vimeo.com',
  // Blogs
  'blogger.com', 'wordpress.com', 'tumblr.com', 'livejournal.com', 'wix.com',
  // Wikis
  'wikipedia.org', 'fandom.com', 'wikia.com',
];

export type CredibilityTier = 1 | 2 | 3;

export function getCredibilityTier(url: string): CredibilityTier {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');

    // Check .edu domains first (Tier 1)
    if (hostname.endsWith('.edu')) {
      return 1;
    }

    // Check tier 1
    if (CREDIBILITY_DOMAINS.tier1.some(d => hostname.includes(d))) {
      return 1;
    }

    // Check tier 2
    if (CREDIBILITY_DOMAINS.tier2.some(d => hostname.includes(d))) {
      return 2;
    }

    // Check tier 3
    if (CREDIBILITY_DOMAINS.tier3.some(d => hostname.includes(d))) {
      return 3;
    }

    // Default to tier 3 for unknown domains (will be filtered by blacklist separately)
    return 3;
  } catch {
    return 3;
  }
}

/**
 * Check if a URL is from a social media domain.
 */
export function isSocialMedia(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');
    return SOCIAL_MEDIA_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Check if a URL is blacklisted.
 * @param url - The URL to check
 * @param socialMediaOnly - If true, only checks social media domains (for quote verification logic)
 */
export function isBlacklisted(url: string, socialMediaOnly: boolean = false): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');

    if (socialMediaOnly) {
      // Only return true if it's social media (used to check if we should allow it for quotes)
      return SOCIAL_MEDIA_DOMAINS.some(domain => hostname.includes(domain));
    }

    // Check both blacklist and social media
    return BLACKLIST_DOMAINS.some(domain => hostname.includes(domain)) ||
           SOCIAL_MEDIA_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

// Build site filter for search queries
export function buildSiteFilter(): string {
  const allDomains = [
    ...CREDIBILITY_DOMAINS.tier1,
    ...CREDIBILITY_DOMAINS.tier2,
    ...CREDIBILITY_DOMAINS.tier3,
  ];

  // Take a subset to avoid query length issues
  const topDomains = allDomains.slice(0, 20);
  return topDomains.map(d => `site:${d}`).join(' OR ');
}
