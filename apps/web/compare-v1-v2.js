// Compare V1 and V2 fact-checking endpoints
async function testEndpoint(postUrl, version) {
  const endpoint = version === 'v1' ? '/api/fact-check' : '/api/fact-check-v2';
  const startTime = Date.now();

  try {
    const response = await fetch(`http://localhost:3001${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postUrl }),
    });

    const totalTime = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error,
        time: totalTime,
      };
    }

    const result = await response.json();
    return {
      success: true,
      result,
      time: totalTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      time: Date.now() - startTime,
    };
  }
}

async function compareVersions(postUrl) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 V1 vs V2 COMPARISON TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📌 URL: ${postUrl}\n`);

  console.log('Testing V1 endpoint...');
  const v1Result = await testEndpoint(postUrl, 'v1');

  console.log('Testing V2 endpoint...');
  const v2Result = await testEndpoint(postUrl, 'v2');

  if (!v1Result.success) {
    console.log('\n❌ V1 FAILED:', v1Result.error);
  }

  if (!v2Result.success) {
    console.log('\n❌ V2 FAILED:', v2Result.error);
  }

  if (!v1Result.success || !v2Result.success) {
    process.exit(1);
  }

  const v1 = v1Result.result;
  const v2 = v2Result.result;

  console.log('\n📝 POST CONTENT:');
  console.log(`"${v1.postContent}"\n`);

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                           ANALYSIS COMPARISON                      ');
  console.log('═══════════════════════════════════════════════════════════════════');

  console.log('\n🎯 VERDICT:');
  console.log(`  V1: ${v1.analysis.verdict}`);
  console.log(`  V2: ${v2.analysis.verdict}`);
  console.log(`  ${v1.analysis.verdict === v2.analysis.verdict ? '✅ SAME' : '⚠️  DIFFERENT'}`);

  console.log('\n📊 SCORES:');
  console.log('  Factual Accuracy:');
  console.log(`    V1: ${v1.analysis.factualAccuracy}/10`);
  console.log(`    V2: ${v2.analysis.factualAccuracy}/10`);
  console.log(`    Difference: ${(v2.analysis.factualAccuracy - v1.analysis.factualAccuracy > 0 ? '+' : '')}${v2.analysis.factualAccuracy - v1.analysis.factualAccuracy}`);

  console.log('  Context Score:');
  console.log(`    V1: ${v1.analysis.contextScore}/10`);
  console.log(`    V2: ${v2.analysis.contextScore}/10`);
  console.log(`    Difference: ${(v2.analysis.contextScore - v1.analysis.contextScore > 0 ? '+' : '')}${v2.analysis.contextScore - v1.analysis.contextScore}`);

  console.log('  Source Quality:');
  console.log(`    V1: ${v1.analysis.sourceQuality}/10`);
  console.log(`    V2: ${v2.analysis.sourceQuality}/10`);
  console.log(`    Difference: ${(v2.analysis.sourceQuality - v1.analysis.sourceQuality > 0 ? '+' : '')}${v2.analysis.sourceQuality - v1.analysis.sourceQuality}`);

  console.log('  Confidence:');
  console.log(`    V1: ${v1.analysis.confidence}%`);
  console.log(`    V2: ${v2.analysis.confidence}%`);
  console.log(`    Difference: ${(v2.analysis.confidence - v1.analysis.confidence > 0 ? '+' : '')}${v2.analysis.confidence - v1.analysis.confidence}%`);

  console.log('\n💭 SUMMARY:');
  console.log(`  V1: ${v1.analysis.summary}`);
  console.log(`  V2: ${v2.analysis.summary}`);

  console.log('\n📚 SOURCE ANALYSIS:');
  console.log(`  V1 Sources: ${v1.sources.length} snippets`);
  console.log(`  V2 Snippets: ${v2.sources.snippets.length}`);
  console.log(`  V2 Full Articles: ${v2.sources.deep.length}`);
  console.log(`  V2 Total: ${v2.sources.snippets.length + v2.sources.deep.length}`);

  if (v2.sources.deep.length > 0) {
    console.log('\n  V2 Deep Sources:');
    v2.sources.deep.forEach(source => {
      console.log(`    - ${source.title} (Authority: ${source.authorityScore}/10)`);
    });
  }

  console.log('\n🔍 V2 UNIQUE FEATURES:');
  console.log(`  Claims Extracted: ${v2.claims.length}`);
  v2.claims.forEach((claim, i) => {
    console.log(`    ${i + 1}. [${claim.priority.toUpperCase()}] ${claim.text}`);
  });

  console.log('\n📊 V2 Per-Claim Analysis:');
  v2.analysis.claimAnalysis.forEach((ca, i) => {
    console.log(`  ${i + 1}. "${ca.claim}"`);
    console.log(`     Verdict: ${ca.verdict}`);
  });

  if (v2.analysis.keyIssues && v2.analysis.keyIssues.length > 0) {
    console.log('\n⚠️  V2 Key Issues:');
    v2.analysis.keyIssues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue}`);
    });
  }

  console.log('\n🔬 V2 Chain-of-Thought Reasoning:');
  console.log(`  ${v2.analysis.reasoning}`);

  console.log('\n🔍 V2 VALIDATION:');
  console.log(`  Valid: ${v2.validation.isValid ? '✅' : '❌'}`);
  console.log(`  Needs Human Review: ${v2.validation.needsHumanReview ? '⚠️  YES' : '✅ NO'}`);
  if (v2.validation.issues.length > 0) {
    console.log('  Issues:', v2.validation.issues);
  }
  if (v2.validation.warnings.length > 0) {
    console.log('  Warnings:', v2.validation.warnings);
  }

  console.log('\n⏱️  PERFORMANCE:');
  console.log(`  V1 Total Time: ${v1Result.time}ms`);
  console.log(`  V2 Total Time: ${v2Result.time}ms`);
  console.log(`  Difference: ${v2Result.time - v1Result.time > 0 ? '+' : ''}${v2Result.time - v1Result.time}ms (${((v2Result.time / v1Result.time - 1) * 100).toFixed(1)}%)`);

  if (v2.metadata && v2.metadata.performance) {
    console.log('\n  V2 Performance Breakdown:');
    console.log(`    Scrape: ${v2.metadata.performance.scrapeDurationMs}ms`);
    console.log(`    Claim Extraction: ${v2.metadata.performance.claimExtractionMs}ms`);
    console.log(`    Source Gathering: ${v2.metadata.performance.sourceGatheringMs}ms`);
    console.log(`    Analysis: ${v2.metadata.performance.analysisMs}ms`);
    console.log(`    Validation: ${v2.metadata.performance.validationMs}ms`);
  }

  console.log('\n💰 COST:');
  if (v1.metadata && v1.metadata.cost) {
    console.log(`  V1: $${v1.metadata.cost.total.toFixed(4)}`);
  }
  if (v2.metadata && v2.metadata.costs) {
    console.log(`  V2: $${v2.metadata.costs.total.toFixed(4)}`);
    if (v1.metadata && v1.metadata.cost) {
      const costDiff = v2.metadata.costs.total - v1.metadata.cost.total;
      console.log(`  Difference: ${costDiff > 0 ? '+' : ''}$${costDiff.toFixed(4)} (${((v2.metadata.costs.total / v1.metadata.cost.total - 1) * 100).toFixed(1)}%)`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                              SUMMARY                              ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const improvements = [];
  const regressions = [];

  if (v2.analysis.factualAccuracy > v1.analysis.factualAccuracy) {
    improvements.push(`Factual accuracy improved by ${v2.analysis.factualAccuracy - v1.analysis.factualAccuracy} points`);
  } else if (v2.analysis.factualAccuracy < v1.analysis.factualAccuracy) {
    regressions.push(`Factual accuracy decreased by ${v1.analysis.factualAccuracy - v2.analysis.factualAccuracy} points`);
  }

  if (v2.analysis.contextScore > v1.analysis.contextScore) {
    improvements.push(`Context score improved by ${v2.analysis.contextScore - v1.analysis.contextScore} points`);
  } else if (v2.analysis.contextScore < v1.analysis.contextScore) {
    regressions.push(`Context score decreased by ${v1.analysis.contextScore - v2.analysis.contextScore} points`);
  }

  if (v2.sources.deep.length > 0) {
    improvements.push(`V2 read ${v2.sources.deep.length} full article(s) for deeper analysis`);
  }

  if (v2.claims.length > 0) {
    improvements.push(`V2 extracted ${v2.claims.length} individual claim(s)`);
  }

  if (v2.analysis.reasoning) {
    improvements.push('V2 provides chain-of-thought reasoning');
  }

  console.log('\n✅ IMPROVEMENTS:');
  if (improvements.length > 0) {
    improvements.forEach((imp, i) => console.log(`  ${i + 1}. ${imp}`));
  } else {
    console.log('  None detected');
  }

  if (regressions.length > 0) {
    console.log('\n⚠️  POTENTIAL REGRESSIONS:');
    regressions.forEach((reg, i) => console.log(`  ${i + 1}. ${reg}`));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

const postUrl = process.argv[2];

if (!postUrl) {
  console.log('Usage: node compare-v1-v2.js <X_POST_URL>');
  console.log('Example: node compare-v1-v2.js https://x.com/username/status/123456789');
  process.exit(1);
}

compareVersions(postUrl);
