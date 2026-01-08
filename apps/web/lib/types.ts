// TypeScript interfaces for fact-checking system

export interface Claim {
  text: string;
  type: 'statistical' | 'attribution' | 'event' | 'date' | 'other';
  priority: 'high' | 'medium' | 'low';
  searchQuery: string;
  requiresFullSourceRead: boolean;
}

export interface ClaimExtractionResult {
  claims: Claim[];
  overallTone: 'factual' | 'opinion' | 'mixed' | 'humorous';
  postType: 'news' | 'personal' | 'commentary' | 'meme' | 'satire';
}

export interface SourceSnippet {
  title: string;
  url: string;
  snippet: string;
}

export interface DeepSource {
  url: string;
  title: string;
  fullText: string;
  relevantPassages: string[];
  authorityScore: number;
}

export interface SourceGatheringResult {
  snippetSources: SourceSnippet[];
  deepSources: DeepSource[];
}

export interface ClaimAnalysisResult {
  claim: string;
  verdict: 'accurate' | 'misleading' | 'false' | 'unverifiable';
  evidence: string;
}

export interface LogicalFallacy {
  type: string;
  description: string;
  example: string;
}

export interface FactCheckAnalysis {
  claimAnalysis: ClaimAnalysisResult[];
  factualAccuracy: number;
  contextScore: number;
  sourceQuality: number;
  confidence: number;
  verdict: 'Accurate' | 'Mostly Accurate' | 'Misleading' | 'Mostly False' | 'False' | 'Unverifiable';
  summary: string;
  keyIssues: string[];
  reasoning: string;
  logicalFallacies?: LogicalFallacy[];
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  needsHumanReview: boolean;
}

export interface FactCheckResult {
  postUrl: string;
  postContent: string;
  postTimestamp?: string; // ISO 8601 timestamp when the post was created
  claims: Claim[];
  analysis: FactCheckAnalysis;
  sources: {
    snippets: SourceSnippet[];
    deep: DeepSource[];
  };
  validation: ValidationResult;
  timestamp: string; // ISO 8601 timestamp when the analysis was completed
  version: string; // e.g., "v2-evidence-informed"
}
