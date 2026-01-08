'use client';

import { useState } from 'react';

interface AnalysisResult {
  postUrl: string;
  postContent: string;
  postTimestamp?: string;
  claims?: Array<{
    text: string;
    type: string;
    priority: string;
    searchQuery: string;
    requiresFullSourceRead: boolean;
  }>;
  analysis: {
    claimAnalysis?: Array<{
      claim: string;
      verdict: string;
      evidence: string;
    }>;
    factualAccuracy: number;
    contextScore: number;
    sourceQuality: number;
    confidence: number;
    verdict: string;
    summary: string;
    keyIssues: string[];
    reasoning?: string;
    logicalFallacies?: Array<{
      type: string;
      description: string;
      example: string;
    }>;
  };
  sources: {
    snippets?: Array<{
      title: string;
      url: string;
      snippet: string;
    }>;
    deep?: Array<{
      url: string;
      title: string;
      authorityScore: number;
    }>;
  } | Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  validation?: {
    isValid: boolean;
    needsHumanReview: boolean;
    issues: string[];
    warnings: string[];
  };
  metadata?: {
    version: string;
    claimsExtracted?: number;
    performance?: {
      totalDurationMs: number;
    };
  };
  timestamp: string;
}

export default function Home() {
  const [postUrl, setPostUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/fact-check-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fact-check post');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getVerdictColor = (verdict: string) => {
    const colors: Record<string, string> = {
      'Accurate': 'text-green-600 bg-green-50',
      'Mostly Accurate': 'text-green-600 bg-green-50',
      'Misleading': 'text-yellow-600 bg-yellow-50',
      'Mostly False': 'text-red-600 bg-red-50',
      'False': 'text-red-600 bg-red-50',
      'Unverifiable': 'text-gray-600 bg-gray-50',
    };
    return colors[verdict] || 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            X Fact-Checker
            <span className="ml-3 text-sm font-semibold px-3 py-1 bg-blue-600 text-white rounded-full">V2</span>
          </h1>
          <p className="text-lg text-gray-600">
            Evidence-Informed AI Fact-Checking for X (Twitter) posts
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Multi-Stage Pipeline: Claim Extraction → Source Gathering → Evidence-Based Analysis → Validation
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paste X Post URL
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://x.com/username/status/123456789"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !postUrl}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Analyzing...' : 'Fact-Check'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
            {/* Post Content */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-900">Post Content</h2>
                {result.postTimestamp && (
                  <span className="text-xs text-gray-500">
                    Posted: {new Date(result.postTimestamp).toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                {result.postContent}
              </p>
            </div>

            {/* Verdict */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Verdict</h2>
              <div className={`inline-block px-4 py-2 rounded-full font-semibold ${getVerdictColor(result.analysis.verdict)}`}>
                {result.analysis.verdict}
              </div>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-600 mb-1">Factual Accuracy</div>
                <div className="text-3xl font-bold text-blue-600">{result.analysis.factualAccuracy}/10</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-600 mb-1">Context Score</div>
                <div className="text-3xl font-bold text-purple-600">{result.analysis.contextScore}/10</div>
              </div>
            </div>

            {/* Confidence */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-gray-600 mb-2">Confidence Level</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-500 h-3 rounded-full transition-all"
                    style={{ width: `${result.analysis.confidence}%` }}
                  />
                </div>
                <span className="text-xl font-semibold text-gray-700">{result.analysis.confidence}%</span>
              </div>
            </div>

            {/* Summary */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Analysis Summary</h2>
              <p className="text-gray-700">{result.analysis.summary}</p>
            </div>

            {/* Key Issues */}
            {result.analysis.keyIssues && result.analysis.keyIssues.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Key Issues</h2>
                <ul className="space-y-2">
                  {result.analysis.keyIssues.map((issue, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-red-500 mt-1">⚠️</span>
                      <span className="text-gray-700">{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Logical Fallacies */}
            {result.analysis.logicalFallacies && result.analysis.logicalFallacies.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Logical Fallacies Detected</h2>
                <div className="space-y-3">
                  {result.analysis.logicalFallacies.map((fallacy, index) => (
                    <div key={index} className="border-l-4 border-orange-500 bg-orange-50 p-4 rounded">
                      <div className="font-semibold text-orange-900 mb-1">{fallacy.type}</div>
                      <p className="text-sm text-gray-700 mb-2">{fallacy.description}</p>
                      <div className="text-xs text-gray-600 bg-white p-2 rounded border border-orange-200">
                        <span className="font-medium">Example: </span>
                        <span className="italic">&quot;{fallacy.example}&quot;</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Claims Extracted (V2 only) */}
            {result.claims && result.claims.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Claims Extracted ({result.claims.length})
                </h2>
                <div className="space-y-2">
                  {result.claims.map((claim, index) => (
                    <div key={index} className="border-l-4 border-blue-500 bg-blue-50 p-3 rounded">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                          claim.priority === 'high' ? 'bg-red-200 text-red-800' :
                          claim.priority === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                          'bg-gray-200 text-gray-800'
                        }`}>
                          {claim.priority.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-600">{claim.type}</span>
                        {claim.requiresFullSourceRead && (
                          <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded">📖 Full Read</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">{claim.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-Claim Analysis (V2 only) */}
            {result.analysis.claimAnalysis && result.analysis.claimAnalysis.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Per-Claim Analysis</h2>
                <div className="space-y-3">
                  {result.analysis.claimAnalysis.map((ca, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-medium text-gray-800 flex-1">{ca.claim}</p>
                        <span className={`ml-3 px-3 py-1 rounded-full text-xs font-semibold ${
                          ca.verdict === 'accurate' ? 'bg-green-100 text-green-800' :
                          ca.verdict === 'misleading' ? 'bg-yellow-100 text-yellow-800' :
                          ca.verdict === 'false' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {ca.verdict}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{ca.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sources */}
            {result.sources && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">Sources</h2>
                  <div className="bg-indigo-50 px-4 py-2 rounded-lg">
                    <span className="text-sm font-medium text-gray-600">Source Quality: </span>
                    <span className="text-xl font-bold text-indigo-600">{result.analysis.sourceQuality}/10</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {/* V2 format with snippets and deep sources */}
                  {!Array.isArray(result.sources) && result.sources.snippets && (
                    <>
                      {result.sources.deep && result.sources.deep.length > 0 && (
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold text-purple-700 mb-2">📖 Full Articles Read</h3>
                          {result.sources.deep.map((source, index) => (
                            <div key={index} className="border-l-4 border-purple-500 bg-purple-50 rounded-lg p-4 mb-2">
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-700 hover:text-purple-900 font-medium"
                              >
                                {source.title}
                              </a>
                              <div className="text-xs text-purple-600 mt-1">
                                Authority Score: {source.authorityScore}/10
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {result.sources.snippets.map((source, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {source.title}
                          </a>
                          <p className="text-sm text-gray-600 mt-1">{source.snippet}</p>
                        </div>
                      ))}
                    </>
                  )}
                  {/* V1 format - array of sources */}
                  {Array.isArray(result.sources) && result.sources.map((source, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {source.title}
                      </a>
                      <p className="text-sm text-gray-600 mt-1">{source.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chain-of-Thought Reasoning (V2 only) */}
            {result.analysis.reasoning && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Chain-of-Thought Reasoning</h2>
                <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700">
                  {result.analysis.reasoning}
                </div>
              </div>
            )}

            {/* Validation (V2 only) */}
            {result.validation && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">Validation Status</h3>
                <div className="space-y-1 text-sm">
                  <div>Valid: {result.validation.isValid ? '✅ Yes' : '❌ No'}</div>
                  <div>Needs Human Review: {result.validation.needsHumanReview ? '⚠️ Yes' : '✅ No'}</div>
                  {result.validation.warnings.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium text-yellow-800">Warnings:</div>
                      <ul className="list-disc list-inside text-yellow-700">
                        {result.validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.validation.issues.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium text-red-800">Issues:</div>
                      <ul className="list-disc list-inside text-red-700">
                        {result.validation.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div className="text-sm text-gray-500 text-right">
              Analysis completed: {new Date(result.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
