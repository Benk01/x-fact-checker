// Cost tracking for API usage

export interface CostBreakdown {
  claude: number;
  firecrawlSearch: number;
  firecrawlScrape: number;
  total: number;
}

export interface UsageStats {
  claudeInputTokens: number;
  claudeOutputTokens: number;
  searchCount: number;
  scrapeCount: number;
  iterations: number;
  durationMs: number;
}

// Pricing (as of 2025)
const PRICING = {
  // Claude Sonnet 4 pricing per 1M tokens
  claudeInput: 3.00 / 1_000_000,    // $3.00 per 1M input tokens
  claudeOutput: 15.00 / 1_000_000,  // $15.00 per 1M output tokens

  // Firecrawl pricing (credits)
  firecrawlSearch: 0.002,  // ~2 credits per 10 results = ~$0.002 per search
  firecrawlScrape: 0.001,  // ~1 credit per page = ~$0.001 per scrape
};

export class CostTracker {
  private claudeInputTokens = 0;
  private claudeOutputTokens = 0;
  private searchCount = 0;
  private scrapeCount = 0;
  private iterations = 0;
  private startTime = Date.now();
  private maxBudget: number;

  constructor(maxBudgetUsd: number = 0.15) {
    this.maxBudget = maxBudgetUsd;
  }

  addClaudeUsage(inputTokens: number, outputTokens: number): void {
    this.claudeInputTokens += inputTokens;
    this.claudeOutputTokens += outputTokens;
  }

  addSearch(): void {
    this.searchCount++;
  }

  addScrape(count: number = 1): void {
    this.scrapeCount += count;
  }

  incrementIteration(): void {
    this.iterations++;
  }

  getCosts(): CostBreakdown {
    const claude =
      this.claudeInputTokens * PRICING.claudeInput +
      this.claudeOutputTokens * PRICING.claudeOutput;

    const firecrawlSearch = this.searchCount * PRICING.firecrawlSearch;
    const firecrawlScrape = this.scrapeCount * PRICING.firecrawlScrape;

    return {
      claude,
      firecrawlSearch,
      firecrawlScrape,
      total: claude + firecrawlSearch + firecrawlScrape,
    };
  }

  getUsageStats(): UsageStats {
    return {
      claudeInputTokens: this.claudeInputTokens,
      claudeOutputTokens: this.claudeOutputTokens,
      searchCount: this.searchCount,
      scrapeCount: this.scrapeCount,
      iterations: this.iterations,
      durationMs: Date.now() - this.startTime,
    };
  }

  isOverBudget(): boolean {
    return this.getCosts().total >= this.maxBudget;
  }

  getRemainingBudget(): number {
    return Math.max(0, this.maxBudget - this.getCosts().total);
  }

  getFormattedCosts(): string {
    const costs = this.getCosts();
    return `Claude: $${costs.claude.toFixed(4)}, Search: $${costs.firecrawlSearch.toFixed(4)}, Scrape: $${costs.firecrawlScrape.toFixed(4)}, Total: $${costs.total.toFixed(4)}`;
  }
}
