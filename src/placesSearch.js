const axios = require('axios');
const { config } = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Searches for places matching niche + region via Google Places Text Search API.
 * Supports pagination up to maxResults.
 */
async function searchPlaces(niche = config.niche, region = config.region, maxResults = config.maxResults) {
  if (!config.googlePlacesApiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured in .env');
  }

  const query = `${niche} in ${region}`;
  console.log(`\n🔍 Searching Google Places for: "${query}" (Target max: ${maxResults})...`);

  const results = [];
  let nextPageToken = null;
  let page = 1;

  while (results.length < maxResults) {
    const params = {
      query,
      key: config.googlePlacesApiKey,
    };

    if (nextPageToken) {
      params.pagetoken = nextPageToken;
      // Google Places API requires a short delay before next_page_token becomes valid
      console.log('   ⏳ Waiting 2 seconds for next page token to become active...');
      await sleep(2000);
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
        params,
        timeout: 10000,
      });

      const { data } = response;

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error(`[Places API Error] Status: ${data.status} - ${data.error_message || 'No additional error info'}`);
        break;
      }

      if (!data.results || data.results.length === 0) {
        console.log('   No more places found in this search area.');
        break;
      }

      console.log(`   Fetched page ${page}: found ${data.results.length} results.`);
      results.push(...data.results);

      nextPageToken = data.next_page_token;
      if (!nextPageToken || results.length >= maxResults) {
        break;
      }
      page += 1;
    } catch (err) {
      console.error(`[Places API] Network/Request error on page ${page}:`, err.message);
      break;
    }
  }

  const trimmedResults = results.slice(0, maxResults);
  console.log(`✅ Total places gathered: ${trimmedResults.length}\n`);

  // Now enrich each place with Place Details (to ensure we get website, phone, full address)
  const detailedPlaces = [];
  for (let i = 0; i < trimmedResults.length; i++) {
    const item = trimmedResults[i];
    console.log(`   [${i + 1}/${trimmedResults.length}] Fetching details for: "${item.name}"...`);
    const details = await getPlaceDetails(item.place_id, item);
    detailedPlaces.push(details);
    // slight delay to be respectful of rate limits
    await sleep(200);
  }

  return detailedPlaces;
}

/**
 * Fetches detailed information for a specific place_id.
 */
async function getPlaceDetails(placeId, fallbackData = {}) {
  if (!placeId) {
    return {
      placeId: null,
      name: fallbackData.name || 'Unknown',
      address: fallbackData.formatted_address || '',
      phone: '',
      website: '',
      rating: fallbackData.rating || null,
    };
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,url',
        key: config.googlePlacesApiKey,
      },
      timeout: 10000,
    });

    const result = response.data.result || {};

    return {
      placeId,
      name: result.name || fallbackData.name || 'Unknown',
      address: result.formatted_address || fallbackData.formatted_address || '',
      phone: result.formatted_phone_number || result.international_phone_number || '',
      website: (result.website || '').trim(),
      rating: result.rating !== undefined ? result.rating : fallbackData.rating || null,
      mapsUrl: result.url || '',
    };
  } catch (err) {
    console.warn(`   ⚠️ Error fetching details for place ${placeId}: ${err.message}. Using basic data.`);
    return {
      placeId,
      name: fallbackData.name || 'Unknown',
      address: fallbackData.formatted_address || '',
      phone: '',
      website: '',
      rating: fallbackData.rating || null,
      mapsUrl: '',
    };
  }
}

module.exports = {
  searchPlaces,
  getPlaceDetails,
};
