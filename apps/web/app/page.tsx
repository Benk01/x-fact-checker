'use client';

import { useState } from 'react';

interface AnalysisResult {
  postUrl: string;
  postContent: string;
  analysis: {
    factualAccuracy: number;
    contextScore: number;
    sourceQuality: number;
    confidence: number;
    verdict: string;
    summary: string;
    keyIssues: string[];
  };
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
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
      const response = await fetch('/api/fact-check', {
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
          </h1>
          <p className="text-lg text-gray-600">
            AI-powered fact-checking for X (Twitter) posts
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Proof of Concept - Testing Core Functionality
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
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Post Content</h2>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-600 mb-1">Factual Accuracy</div>
                <div className="text-3xl font-bold text-blue-600">{result.analysis.factualAccuracy}/10</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-600 mb-1">Context Score</div>
                <div className="text-3xl font-bold text-purple-600">{result.analysis.contextScore}/10</div>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-600 mb-1">Source Quality</div>
                <div className="text-3xl font-bold text-indigo-600">{result.analysis.sourceQuality}/10</div>
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

            {/* Sources */}
            {result.sources && result.sources.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Sources</h2>
                <div className="space-y-3">
                  {result.sources.map((source, index) => (
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
