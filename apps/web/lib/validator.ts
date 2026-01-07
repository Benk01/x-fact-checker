// Validation and quality control for fact-check results

import type { FactCheckAnalysis, ValidationResult, SourceSnippet, DeepSource } from './types';

export function validateAnalysis(
  analysis: FactCheckAnalysis,
  sources: { snippets: SourceSnippet[], deep: DeepSource[] }
): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // 1. Verdict-Score Consistency Check
  const { verdict, factualAccuracy, contextScore, confidence } = analysis;

  if (verdict === 'Accurate' && factualAccuracy < 8) {
    issues.push(`Verdict is "Accurate" but factualAccuracy is only ${factualAccuracy}/10 (should be >= 8)`);
  }

  if (verdict === 'False' && factualAccuracy > 3) {
    issues.push(`Verdict is "False" but factualAccuracy is ${factualAccuracy}/10 (should be <= 3)`);
  }

  if (verdict === 'Mostly Accurate' && (factualAccuracy < 7 || factualAccuracy > 9)) {
    warnings.push(`Verdict is "Mostly Accurate" but factualAccuracy is ${factualAccuracy}/10 (typically 7-9)`);
  }

  if (verdict === 'Misleading' && contextScore > 6) {
    warnings.push(`Verdict is "Misleading" but contextScore is ${contextScore}/10 (typically <= 6 for misleading content)`);
  }

  // 2. Confidence Calibration
  if (confidence < 60 && (verdict === 'Accurate' || verdict === 'False')) {
    warnings.push(`Low confidence (${confidence}%) with strong verdict "${verdict}" - may need human review`);
  }

  if (confidence > 90 && sources.snippets.length + sources.deep.length < 2) {
    warnings.push(`High confidence (${confidence}%) with few sources (${sources.snippets.length + sources.deep.length}) - may be overconfident`);
  }

  // 3. Source Citation Validation
  const allSourceUrls = [
    ...sources.snippets.map(s => s.url),
    ...sources.deep.map(s => s.url),
  ];

  // Check if summary or reasoning mentions URLs that aren't in sources
  const mentionedUrls = extractUrls(analysis.summary + ' ' + analysis.reasoning);
  const hallucinatedUrls = mentionedUrls.filter(url => !allSourceUrls.some(sourceUrl => sourceUrl.includes(url)));

  if (hallucinatedUrls.length > 0) {
    issues.push(`Analysis cites URLs not in provided sources: ${hallucinatedUrls.join(', ')}`);
  }

  // 4. Completeness Checks
  if (verdict !== 'Accurate' && analysis.keyIssues.length === 0) {
    warnings.push(`Verdict is "${verdict}" but no key issues listed`);
  }

  if (analysis.keyIssues.some(issue => issue.length < 20)) {
    warnings.push('Some key issues are too vague (< 20 characters) - should be specific');
  }

  if (!analysis.reasoning || analysis.reasoning.length < 50) {
    issues.push('Reasoning is missing or too short - should explain scoring decisions');
  }

  if (analysis.claimAnalysis.length === 0 && sources.snippets.length + sources.deep.length > 0) {
    warnings.push('No claim analysis provided despite having sources');
  }

  // 5. Determine if human review needed
  const needsHumanReview =
    confidence < 70 ||
    (factualAccuracy >= 4 && factualAccuracy <= 6) ||
    verdict === 'Unverifiable' ||
    issues.length > 0 ||
    (sources.snippets.length + sources.deep.length < 2 && verdict !== 'Unverifiable');

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    needsHumanReview,
  };
}

function extractUrls(text: string): string[] {
  // Extract URLs from text (simple pattern matching)
  const urlPattern = /https?:\/\/[^\s]+/g;
  const matches = text.match(urlPattern) || [];
  return matches.map(url => {
    // Clean up URL (remove trailing punctuation)
    return url.replace(/[.,;:!?)]+$/, '');
  });
}
