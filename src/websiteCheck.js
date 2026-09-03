const axios = require('axios');
const cheerio = require('cheerio');

const PARKED_KEYWORDS = [
  'domain for sale',
  'buy this domain',
  'parked domain',
  'godaddy parked',
  'hugedomains',
  'sedo',
  'dan.com',
  'under construction',
  'domain expired',
  'renew this domain',
  'this domain is available'
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IGNORE_EMAILS_LIKE = [
  'sentry.io',
  'wixpress.com',
  'example.com',
  'domain.com',
  'wordpress.com',
  'png',
  'jpg',
  'webp',
  'gif',
  'bootstrap',
  'jquery',
  'cloudflare.com',
  'googleapis.com',
  'schema.org'
];

function isValidEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (lower.length > 80 || lower.length < 5) return false;
  for (const ign of IGNORE_EMAILS_LIKE) {
    if (lower.includes(ign)) return false;
  }
  return true;
}

function extractEmailsFromHtml(html, $) {
  const emails = new Set();

  if ($) {
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const cleanMailto = href.replace(/^mailto:/i, '').split('?')[0].trim();
      if (isValidEmail(cleanMailto)) {
        emails.add(cleanMailto.toLowerCase());
      }
    });
  }

  const textMatches = (html || '').match(EMAIL_REGEX) || [];
  for (const match of textMatches) {
    if (isValidEmail(match)) {
      emails.add(match.toLowerCase());
    }
  }

  return Array.from(emails);
}

function extractCleanText($) {
  $('script, style, noscript, svg, img, iframe, nav, footer').remove();
  const bodyText = $('body').text() || '';
  return bodyText.replace(/\s+/g, ' ').trim().slice(0, 3500);
}

function isParkedOrDead(title, bodyText) {
  const combined = `${title} ${bodyText}`.toLowerCase();
  return PARKED_KEYWORDS.some((kw) => combined.includes(kw));
}

/**
 * Checks a website URL with snappy fast timeouts (< 3.5s).
 */
async function checkWebsite(rawUrl, fallbackDirectEmail = null) {
  if (fallbackDirectEmail && isValidEmail(fallbackDirectEmail)) {
    return {
      live: true,
      reason: 'direct_email_found',
      text: '',
      email: fallbackDirectEmail.toLowerCase().trim(),
      url: rawUrl || '',
    };
  }

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { live: false, reason: 'no_website', text: '', email: null, url: '' };
  }

  let formattedUrl = rawUrl.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  const client = axios.create({
    timeout: 3500, // Snappy fast timeout
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    maxRedirects: 3,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  let response;
  try {
    response = await client.get(formattedUrl);
  } catch (err) {
    return { live: false, reason: 'unreachable', text: '', email: null, url: formattedUrl };
  }

  const html = response.data;
  if (typeof html !== 'string') {
    return { live: false, reason: 'non_html_response', text: '', email: null, url: formattedUrl };
  }

  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  const text = extractCleanText($);

  if (isParkedOrDead(title, text)) {
    return { live: false, reason: 'parked_or_expired', text: '', email: null, url: formattedUrl };
  }

  // 1. Find emails on homepage
  let emails = extractEmailsFromHtml(html, $);

  // 2. If no email on homepage, check 1 contact link with fast 2.5s timeout
  if (emails.length === 0) {
    let contactLink = null;
    $('a[href]').each((_, el) => {
      if (contactLink) return;
      const href = $(el).attr('href') || '';
      const linkText = $(el).text().toLowerCase();
      if (
        (linkText.includes('contact') || href.includes('contact')) &&
        !href.startsWith('mailto:') &&
        !href.startsWith('tel:') &&
        !href.startsWith('javascript:')
      ) {
        try {
          const fullLink = new URL(href, formattedUrl).href;
          if (fullLink.startsWith('http')) {
            contactLink = fullLink;
          }
        } catch (e) {}
      }
    });

    if (contactLink) {
      try {
        const subResp = await client.get(contactLink, { timeout: 2500 });
        if (typeof subResp.data === 'string') {
          const $sub = cheerio.load(subResp.data);
          const subEmails = extractEmailsFromHtml(subResp.data, $sub);
          if (subEmails.length > 0) {
            emails = subEmails;
          }
        }
      } catch (e) {}
    }
  }

  const primaryEmail = emails.length > 0 ? emails[0] : null;

  return {
    live: true,
    reason: primaryEmail ? 'email_found' : 'no_email_found',
    text: text.slice(0, 3000),
    title,
    email: primaryEmail,
    url: formattedUrl,
  };
}

module.exports = {
  checkWebsite,
};
