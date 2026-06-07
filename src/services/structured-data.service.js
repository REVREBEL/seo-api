import * as cheerio from 'cheerio';

export function extractStructuredData(htmlString) {
  const $ = cheerio.load(htmlString || '');
  const result = {
    jsonLd: [],
    microdata: [],
    openGraph: {},
    twitter: {},
    metaTags: {},
    schemaTypesFound: [],
    jsonLdBlockCount: 0,
    microdataBlockCount: 0,
    parseErrors: []
  };

  $('script[type="application/ld+json"]').each((i, el) => {
    const content = $(el).html();
    if (!content) return;

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) result.jsonLd.push(...parsed);
      else result.jsonLd.push(parsed);
    } catch (error) {
      result.parseErrors.push({ source: 'jsonLd', index: i, message: error.message });
    }
  });

  $('meta').each((_, el) => {
    const property = $(el).attr('property');
    const name = $(el).attr('name');
    const content = $(el).attr('content');

    if (!content) return;
    if (property && property.startsWith('og:')) result.openGraph[property] = content;
    else if (name && name.startsWith('twitter:')) result.twitter[name] = content;
    else if (name) result.metaTags[name] = content;
  });

  $('[itemscope]').each((_, el) => {
    const itemtype = $(el).attr('itemtype');
    if (!itemtype) return;

    const item = { '@type': itemtype };
    $(el).find('[itemprop]').each((_, childEl) => {
      const propName = $(childEl).attr('itemprop');
      if (!propName) return;

      const propValue =
        $(childEl).attr('content') ||
        $(childEl).attr('href') ||
        $(childEl).attr('src') ||
        $(childEl).text().trim();

      if (item[propName]) {
        if (!Array.isArray(item[propName])) item[propName] = [item[propName]];
        item[propName].push(propValue);
      } else {
        item[propName] = propValue;
      }
    });
    result.microdata.push(item);
  });

  const schemaTypes = new Set();
  for (const block of result.jsonLd) collectSchemaTypes(block, schemaTypes);
  for (const block of result.microdata) collectSchemaTypes(block, schemaTypes);

  result.schemaTypesFound = [...schemaTypes].sort();
  result.jsonLdBlockCount = result.jsonLd.length;
  result.microdataBlockCount = result.microdata.length;

  return result;
}

export function collectSchemaTypes(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found;

  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, found);
    return found;
  }

  const typeValue = value['@type'];
  if (typeof typeValue === 'string') found.add(typeValue);
  if (Array.isArray(typeValue)) {
    for (const item of typeValue) {
      if (typeof item === 'string') found.add(item);
    }
  }

  for (const child of Object.values(value)) collectSchemaTypes(child, found);
  return found;
}
