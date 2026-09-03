const axios = require('axios');
const cheerio = require('cheerio');

const IGNORED_DOMAINS = [
  'yelp.com',
  'tripadvisor.com',
  'yellowpages.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'mapquest.com',
  'bbb.org',
  'angi.com',
  'thumbtack.com',
  'groupon.com',
  'wikipedia.org',
  'youtube.com',
  'tiktok.com',
  'google.com',
  'apple.com',
  'reddit.com',
  'pinterest.com',
  'chamberofcommerce.com',
  'expertise.com',
];

function isDirectoryOrSocial(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return IGNORED_DOMAINS.some((d) => host.includes(d));
  } catch (e) {
    return true;
  }
}

/**
 * Scrapes organic web search to discover local business websites when map APIs are blocked.
 */
async function searchWebFallback(niche, region, maxResults = 20) {
  console.log(`\n🔍 [Web Search Fallback] Searching for "${niche}" in "${region}"...`);

  const cleanRegion = (region || '').replace(/,([^\s])/g, ', $1').trim();
  const query = `${niche} in ${cleanRegion}`;

  const results = [];
  const seenHosts = new Set();

  // 1. Try DuckDuckGo Lite / HTML
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(resp.data);

    $('.result').each((_, el) => {
      let rawHref = $(el).find('.result__url').attr('href') || $(el).find('.result__title a').attr('href') || '';
      let title = $(el).find('.result__title a').text().trim() || $(el).find('.result__snippet').text().trim();

      // DuckDuckGo redirect cleaner: /l/?uddg=https%3A%2F%2F...
      let actualUrl = rawHref;
      if (rawHref.includes('uddg=')) {
        try {
          const match = rawHref.match(/uddg=([^&]+)/);
          if (match && match[1]) {
            actualUrl = decodeURIComponent(match[1]);
          }
        } catch (e) {}
      }

      if (!actualUrl.startsWith('http://') && !actualUrl.startsWith('https://')) {
        actualUrl = `https://${actualUrl}`;
      }

      if (actualUrl && !isDirectoryOrSocial(actualUrl)) {
        try {
          const host = new URL(actualUrl).hostname.toLowerCase();
          if (!seenHosts.has(host)) {
            seenHosts.add(host);
            const cleanName = title
              .split(' - ')[0]
              .split(' | ')[0]
              .split(' : ')[0]
              .trim();

            results.push({
              placeId: `web_${Buffer.from(host).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
              name: cleanName || host,
              address: cleanRegion,
              phone: '',
              website: actualUrl,
              directEmail: '',
              rating: null,
            });
          }
        } catch (e) {}
      }
    });
  } catch (err) {
    console.warn(`   ⚠️ DuckDuckGo search note: ${err.message}`);
  }

  // 2. If results < maxResults, try Bing HTML search
  if (results.length < maxResults) {
    try {
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      const bingResp = await axios.get(bingUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 8000,
      });

      const $b = cheerio.load(bingResp.data);
      $b('li.b_algo').each((_, el) => {
        const link = $b(el).find('h2 a').attr('href');
        const title = $b(el).find('h2 a').text().trim();

        if (link && !isDirectoryOrSocial(link)) {
          try {
            const host = new URL(link).hostname.toLowerCase();
            if (!seenHosts.has(host)) {
              seenHosts.add(host);
              const cleanName = title.split(' - ')[0].split(' | ')[0].trim();
              results.push({
                placeId: `web_${Buffer.from(host).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
                name: cleanName || host,
                address: cleanRegion,
                phone: '',
                website: link,
                directEmail: '',
                rating: null,
              });
            }
          } catch (e) {}
        }
      });
    } catch (bErr) {
      console.warn(`   ⚠️ Bing search note: ${bErr.message}`);
    }
  }

  console.log(`✅ [Web Search Fallback] Found ${results.length} local businesses with websites.`);
  return results.slice(0, maxResults);
}

module.exports = {
  searchWebFallback,
};
