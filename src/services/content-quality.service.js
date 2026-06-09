const FILLER_PHRASES = [
  "it's important to note that",
  "in this article, we'll explore",
  'in this article we will explore',
  "in today's fast-paced world",
  "in today's digital age",
  "in today's competitive landscape",
  'needless to say',
  'at the end of the day',
  'when it comes to',
  'when all is said and done',
  'in the realm of',
  'in the world of',
  'the bottom line is',
  'without further ado',
  'first and foremost',
  'last but not least',
  "for what it's worth",
  'it goes without saying',
  'as we all know',
  'the truth is that',
  'the fact of the matter is',
  'more often than not',
  "let's dive in",
  "let's dive into",
  "let's take a closer look",
  "let's take a deeper look"
];

const AI_PATTERNS = [
  'delve into',
  'delve deeper into',
  'in the ever-evolving',
  'ever-evolving landscape',
  'ever-changing landscape',
  'in the dynamic landscape',
  'navigating the',
  'navigate the complexities',
  'tapestry of',
  'rich tapestry',
  'intricate tapestry',
  'embark on a journey',
  'embarking on this',
  'a testament to',
  'a beacon of',
  'the cornerstone of',
  'a cornerstone of',
  'at the heart of',
  'at its core',
  'in essence,',
  'in conclusion,',
  'ultimately,',
  'moreover,',
  'furthermore,',
  "however, it's worth noting",
  "it's worth noting that",
  'by leveraging',
  'leverage the power of',
  'leveraging the power of',
  'harness the power of',
  'unlock the potential',
  'unlock the full potential',
  'the realm of possibilities',
  'open up a world of',
  'a world of possibilities',
  'elevate your',
  'transform your',
  'revolutionize the way',
  'game-changer',
  'game-changing',
  'cutting-edge',
  'state-of-the-art',
  'in summary,',
  'to summarize,',
  'to put it simply,',
  'in a nutshell,'
];

const TOKEN_PATTERN = /[A-Za-z][A-Za-z'-]*/g;
const NUMBER_PATTERN = /\b\d+(?:[.,]\d+)?(?:%|st|nd|rd|th)?\b/g;
const ENTITY_PATTERN = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;

export function analyzeContentQuality(text) {
  const source = String(text || '');
  if (!source.trim()) {
    return {
      fillerScore: 0,
      aiPatternScore: 0,
      informationDensity: 0,
      repetitionScore: 0,
      overallQuality: 0,
      flags: ['empty-input'],
      matches: { filler: [], aiPatterns: [] },
      tokens: 0,
      uniqueTokens: 0
    };
  }

  const tokens = (source.match(TOKEN_PATTERN) || []).map((token) => token.toLowerCase());
  const tokenCount = tokens.length;
  const uniqueTokens = new Set(tokens).size;
  const fillerHits = countPhraseHits(source, FILLER_PHRASES);
  const aiPatternHits = countPhraseHits(source, AI_PATTERNS);

  const entityCount = (source.match(ENTITY_PATTERN) || []).length;
  const numberCount = (source.match(NUMBER_PATTERN) || []).length;
  const densityPer100 = ((entityCount + numberCount) * 100) / Math.max(1, tokenCount);
  const informationDensity = Math.min(1, densityPer100 / 10);

  const repetition = repetitionRatio(tokens);
  const repetitionScore = Math.round(repetition * 100);
  const scale = Math.max(1, tokenCount / 1000);
  const fillerScore = Math.min(100, Math.round((fillerHits.length / scale) * 25));
  const aiPatternScore = Math.min(100, Math.round((aiPatternHits.length / scale) * 15));

  const flags = [];
  if (fillerScore >= 50) flags.push('filler');
  if (aiPatternScore >= 40) flags.push('ai-patterns');
  if (informationDensity < 0.2) flags.push('low-density');
  if (repetitionScore >= 30) flags.push('repetitive');
  if (tokenCount < 300) flags.push('thin-content');

  const overall =
    (100 - fillerScore) * 0.25 +
    (100 - aiPatternScore) * 0.25 +
    informationDensity * 100 * 0.25 +
    (100 - repetitionScore) * 0.15 +
    Math.min(100, tokenCount / 10) * 0.1;

  return {
    fillerScore,
    aiPatternScore,
    informationDensity: Number(informationDensity.toFixed(3)),
    repetitionScore,
    overallQuality: Math.round(overall),
    flags,
    matches: {
      filler: fillerHits,
      aiPatterns: aiPatternHits
    },
    tokens: tokenCount,
    uniqueTokens
  };
}

function countPhraseHits(text, patterns) {
  const lowered = text.toLowerCase();
  return patterns.filter((pattern) => lowered.includes(pattern));
}

function repetitionRatio(tokens) {
  if (tokens.length < 4) return 0;
  const counts = new Map();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const bigram = `${tokens[index]} ${tokens[index + 1]}`;
    counts.set(bigram, (counts.get(bigram) || 0) + 1);
  }
  const repeated = [...counts.values()].filter((count) => count > 1).length;
  return repeated / Math.max(1, counts.size);
}
