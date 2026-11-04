const { lexer } = require('marked');

const findPrDescriptionBlueprintOverride = (body, summaryText) => {
  const expectedSummary = normalizeSummary(summaryText);
  if (!expectedSummary) {
    throw new Error('blueprint-override-summary must not be empty.');
  }

  const tokens = lexer(body || '', { gfm: true });
  let detailsState = null;

  for (const token of tokens) {
    if (token.type === 'html') {
      detailsState = updateDetailsState(detailsState, token.text, expectedSummary, summaryText);
      continue;
    }

    if (detailsState && detailsState.summaryMatches && token.type === 'code' && isJsonFence(token)) {
      if (!token.text.trim()) {
        throw new Error(`Found a "${summaryText}" details block, but it does not contain a non-empty json code block.`);
      }
      return token.text.trim();
    }
  }

  if (detailsState && detailsState.summaryMatches) {
    throw new Error(`Found a "${summaryText}" details block, but it does not contain a non-empty json code block.`);
  }

  return '';
};

const updateDetailsState = (detailsState, html, expectedSummary, summaryText) => {
  let nextState = detailsState;

  if (!nextState && hasDetailsOpenTag(html)) {
    nextState = { summaryMatches: false };
  }

  if (nextState) {
    const summary = extractSummary(html);
    if (summary) {
      nextState.summaryMatches = normalizeSummary(summary) === expectedSummary;
    }

    if (hasDetailsCloseTag(html)) {
      if (nextState.summaryMatches) {
        throw new Error(`Found a "${summaryText}" details block, but it does not contain a non-empty json code block.`);
      }
      nextState = null;
    }
  }

  return nextState;
};

const normalizeSummary = (value) => stripTags(value).toLowerCase();

const stripTags = (value) => String(value || '').replace(/<[^>]+>/g, '').trim();

const hasDetailsOpenTag = (html) => /<details\b[^>]*>/i.test(html);

const hasDetailsCloseTag = (html) => /<\/details>/i.test(html);

const extractSummary = (html) => {
  const match = String(html || '').match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
  return match ? match[1] : '';
};

const isJsonFence = (token) => {
  const language = String(token.lang || '').trim().split(/\s+/)[0].toLowerCase();
  return language === 'json';
};

module.exports = {
  findPrDescriptionBlueprintOverride,
};
