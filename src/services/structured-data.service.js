import * as cheerio from 'cheerio';

const SCHEMA_RULESET = {
  Article: { required: ['headline'], recommended: ['image', 'datePublished', 'dateModified', 'author', 'publisher'] },
  NewsArticle: { required: ['headline'], recommended: ['image', 'datePublished', 'dateModified', 'author', 'publisher'] },
  BlogPosting: { required: ['headline'], recommended: ['image', 'datePublished', 'dateModified', 'author', 'publisher'] },
  Product: { required: ['name'], recommended: ['image', 'offers', 'aggregateRating', 'review', 'brand', 'sku'] },
  Offer: { required: ['price', 'priceCurrency'], recommended: ['availability', 'url', 'priceValidUntil'] },
  FAQPage: { required: ['mainEntity'], recommended: [], deprecated: 'FAQ rich results are limited to authoritative government and health sites; keep markup for semantic value, not broad rich-result eligibility.' },
  HowTo: { required: ['name', 'step'], recommended: ['image', 'totalTime', 'supply', 'tool'], deprecated: 'HowTo rich results have been deprecated/removed on desktop; keep markup for semantic value, not rich-result eligibility.' },
  LocalBusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHoursSpecification', 'geo', 'url', 'priceRange'] },
  Hotel: { required: ['name', 'address'], recommended: ['telephone', 'geo', 'url', 'image', 'priceRange', 'amenityFeature'] },
  LodgingBusiness: { required: ['name', 'address'], recommended: ['telephone', 'geo', 'url', 'image', 'priceRange', 'amenityFeature'] },
  Organization: { required: ['name'], recommended: ['url', 'logo', 'sameAs'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  Recipe: { required: ['name', 'image', 'recipeIngredient', 'recipeInstructions'], recommended: ['author', 'datePublished', 'aggregateRating', 'nutrition', 'prepTime', 'cookTime', 'totalTime', 'recipeYield'] },
  Event: { required: ['name', 'startDate', 'location'], recommended: ['endDate', 'eventStatus', 'eventAttendanceMode', 'offers', 'performer', 'image', 'description'] },
  VideoObject: { required: ['name', 'thumbnailUrl', 'uploadDate'], recommended: ['description', 'duration', 'contentUrl', 'embedUrl'] }
};

const DATE_PROPS = new Set(['datePublished', 'dateModified', 'uploadDate', 'startDate', 'endDate', 'priceValidUntil', 'validFrom', 'expires']);
const URL_PROPS = new Set(['url', 'contentUrl', 'embedUrl', 'thumbnailUrl', 'logo', 'image']);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const ABS_URL_PATTERN = /^https?:\/\//i;
const DEPRECATED_PRODUCT_TYPES = {
  Vehicle: 'Vehicle Listing rich result retired June 2025.',
  VehicleListing: 'Vehicle Listing rich result retired June 2025.',
  ClaimReview: 'Claim Review rich result retired June 2025.',
  EstimatedSalary: 'Estimated Salary rich result retired June 2025.',
  LearningVideo: 'Learning Video rich result retired June 2025.',
  Course: 'Course rich result still exists, but the Course Info carousel variant was retired June 2025. Verify the use case.',
  SpecialAnnouncement: 'Special Announcement rich result deprecated July 2025.'
};

export function extractStructuredData(htmlString) {
  const $ = cheerio.load(htmlString || '');
  const result = {
    jsonLd: [],
    jsonLdNodes: [],
    microdata: [],
    openGraph: {},
    twitter: {},
    metaTags: {},
    schemaTypesFound: [],
    jsonLdBlockCount: 0,
    jsonLdNodeCount: 0,
    microdataBlockCount: 0,
    parseErrors: [],
    otherFormatsDetected: [],
    lint: null,
    ecommerceValidation: null
  };

  $('script[type="application/ld+json"]').each((i, el) => {
    const content = $(el).html();
    if (!content) return;

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) result.jsonLd.push(...parsed);
      else result.jsonLd.push(parsed);
      result.jsonLdNodes.push(...flattenJsonLd(parsed));
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

  if ($('[itemscope], [itemtype]').length > 0) result.otherFormatsDetected.push('microdata');
  if ($('[typeof], [vocab], [property]').length > 0) result.otherFormatsDetected.push('rdfa');

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
  result.jsonLdNodeCount = result.jsonLdNodes.length;
  result.microdataBlockCount = result.microdata.length;
  result.otherFormatsDetected = [...new Set(result.otherFormatsDetected)].sort();
  result.lint = lintStructuredData(result);
  result.ecommerceValidation = validateProductMerchantEvidence(result.jsonLd);

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

function flattenJsonLd(parsed) {
  const nodes = [];
  const queue = Array.isArray(parsed) ? parsed : [parsed];

  for (const item of queue) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (Array.isArray(item['@graph'])) {
      for (const graphNode of item['@graph']) {
        if (graphNode && typeof graphNode === 'object' && !Array.isArray(graphNode)) nodes.push(graphNode);
      }
      if (item['@type']) nodes.push(item);
    } else {
      nodes.push(item);
    }
  }

  return nodes;
}

function lintStructuredData(structuredData) {
  const objects = structuredData.jsonLdNodes.map(validateSchemaNode);
  const errors = objects.reduce((sum, item) => sum + item.missingRequired.length + item.sanityIssues.length, 0) + structuredData.parseErrors.length;
  const warnings = objects.reduce((sum, item) => sum + item.missingRecommended.length + item.warnings.length, 0);
  const notes = [];

  if (structuredData.jsonLdNodes.length === 0 && structuredData.parseErrors.length === 0 && structuredData.otherFormatsDetected.length > 0) {
    notes.push(`No JSON-LD found, but ${structuredData.otherFormatsDetected.join(' and ')} markup was detected. Microdata/RDFa validation is not included in this linter.`);
  } else if (structuredData.jsonLdNodes.length === 0 && structuredData.parseErrors.length === 0) {
    notes.push('No JSON-LD structured data found on this page.');
  }

  notes.push('This local linter catches common structured-data issues; use Google Rich Results Test UI as the final eligibility check.');

  return {
    tool: 'schema_lint_js',
    version: '1.0.0',
    objects,
    parseErrors: structuredData.parseErrors,
    otherFormatsDetected: structuredData.otherFormatsDetected,
    summary: {
      objects: objects.length,
      recognized: objects.filter((item) => item.recognized).length,
      errors,
      warnings
    },
    notes
  };
}

function validateSchemaNode(node) {
  const types = getTypes(node);
  const report = {
    type: types.length === 1 ? types[0] : types,
    recognized: false,
    missingRequired: [],
    missingRecommended: [],
    warnings: [],
    sanityIssues: []
  };

  for (const prop of DATE_PROPS) {
    if (typeof node[prop] === 'string' && node[prop].trim() && !ISO_DATE_PATTERN.test(node[prop].trim())) {
      report.sanityIssues.push(`${prop} is not ISO-8601: ${node[prop]}`);
    }
  }

  for (const prop of URL_PROPS) {
    const value = node[prop];
    if (typeof value === 'string' && value.trim() && !ABS_URL_PATTERN.test(value.trim())) {
      report.sanityIssues.push(`${prop} should be an absolute http(s) URL: ${value}`);
    }
  }

  const matched = types.filter((type) => SCHEMA_RULESET[type]);
  if (matched.length === 0) {
    report.warnings.push(types.length === 0 ? 'node has no @type — cannot validate' : `@type ${types.join(', ')} not in linter ruleset — only generic checks applied`);
    return report;
  }

  report.recognized = true;
  for (const type of matched) {
    const rule = SCHEMA_RULESET[type];
    for (const prop of rule.required || []) {
      if (!hasValue(node, prop) && !report.missingRequired.includes(prop)) report.missingRequired.push(prop);
    }
    for (const prop of rule.recommended || []) {
      if (!hasValue(node, prop) && !report.missingRecommended.includes(prop)) report.missingRecommended.push(prop);
    }
    if (rule.deprecated) report.warnings.push(`DEPRECATION: ${rule.deprecated}`);
  }

  return report;
}

function validateProductMerchantEvidence(payload) {
  const findings = [];
  const allTypes = getAllTypes(payload);
  for (const type of allTypes) {
    if (DEPRECATED_PRODUCT_TYPES[type]) {
      findings.push({ severity: 'Critical', rule: 'deprecated-type', message: `@type=${type}: ${DEPRECATED_PRODUCT_TYPES[type]}` });
    }
  }

  const products = findTyped(payload, 'Product');
  if (products.length === 0) {
    return {
      ok: true,
      applicable: false,
      findings,
      summary: summarizeFindings(findings)
    };
  }

  for (const product of products) {
    for (const field of ['name', 'image', 'description', 'offers']) {
      if (!hasValue(product, field)) findings.push({ severity: 'High', rule: `missing-product-${field}`, message: `Product is missing required ${field}.` });
    }

    const offersList = normalizeArray(product.offers).filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    for (const offer of offersList) {
      for (const field of ['price', 'priceCurrency', 'availability']) {
        if (!hasValue(offer, field)) findings.push({ severity: 'High', rule: `missing-offer-${field}`, message: `Offer is missing required ${field}.` });
      }
    }

    const returnPolicy = product.hasMerchantReturnPolicy || offersList.find((offer) => offer.hasMerchantReturnPolicy)?.hasMerchantReturnPolicy;
    if (!returnPolicy) {
      findings.push({ severity: 'High', rule: 'missing-return-policy', message: 'Product or Offer is missing hasMerchantReturnPolicy for merchant-listing eligibility evidence.' });
    } else if (typeof returnPolicy === 'object') {
      for (const field of ['applicableCountry', 'returnPolicyCategory']) {
        if (!hasValue(returnPolicy, field)) findings.push({ severity: 'Medium', rule: `return-policy-${field}`, message: `MerchantReturnPolicy is missing ${field}.` });
      }
    }

    const shipping = product.shippingDetails || offersList.find((offer) => offer.shippingDetails)?.shippingDetails;
    if (!shipping) {
      findings.push({ severity: 'High', rule: 'missing-shipping-details', message: 'Product or Offer is missing shippingDetails for merchant-listing eligibility evidence.' });
    } else if (typeof shipping === 'object') {
      for (const field of ['shippingDestination', 'deliveryTime']) {
        if (!hasValue(shipping, field)) findings.push({ severity: 'Medium', rule: `shipping-${field}`, message: `OfferShippingDetails is missing ${field}.` });
      }
    }

    if (!product.hasMemberProgram) {
      findings.push({ severity: 'Medium', rule: 'missing-member-program', message: 'No MemberProgram or loyalty-tier pricing declared.' });
    }
  }

  if (products.length > 0 && findTyped(payload, 'ProductGroup').length === 0) {
    findings.push({ severity: 'Info', rule: 'no-product-group', message: 'Consider ProductGroup evidence if the product has size or color variants.' });
  }

  return {
    ok: !findings.some((finding) => finding.severity === 'Critical' || finding.severity === 'High'),
    applicable: true,
    findings,
    summary: summarizeFindings(findings)
  };
}

function getTypes(node) {
  const type = node?.['@type'];
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((item) => typeof item === 'string');
  return [];
}

function getAllTypes(value) {
  const types = [];
  if (Array.isArray(value)) {
    for (const item of value) types.push(...getAllTypes(item));
  } else if (value && typeof value === 'object') {
    types.push(...getTypes(value));
    for (const child of Object.values(value)) types.push(...getAllTypes(child));
  }
  return types;
}

function findTyped(value, targetType) {
  const matches = [];
  if (Array.isArray(value)) {
    for (const item of value) matches.push(...findTyped(item, targetType));
  } else if (value && typeof value === 'object') {
    if (getTypes(value).includes(targetType)) matches.push(value);
    for (const child of Object.values(value)) matches.push(...findTyped(child, targetType));
  }
  return matches;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function hasValue(obj, prop) {
  if (!obj || !(prop in obj)) return false;
  const value = obj[prop];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
  return true;
}

function summarizeFindings(findings) {
  return {
    critical: findings.filter((finding) => finding.severity === 'Critical').length,
    high: findings.filter((finding) => finding.severity === 'High').length,
    medium: findings.filter((finding) => finding.severity === 'Medium').length,
    info: findings.filter((finding) => finding.severity === 'Info').length
  };
}
