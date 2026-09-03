const axios = require('axios');

/**
 * Searches OpenStreetMap Nominatim for local businesses.
 * Cloud-friendly and reliable when Overpass mirrors block datacenter IPs.
 */
async function searchNominatim(niche, region, maxResults = 20) {
  console.log(`\n🗺️  [Nominatim] Searching for "${niche}" in "${region}"...`);

  // Clean region format
  const cleanRegion = (region || '').replace(/,([^\s])/g, ', $1').trim();
  const query = `${niche} in ${cleanRegion}`;

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&extratags=1&limit=50`;

  try {
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeadGenBot/2.0 (leadgen@outreach.local)',
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!Array.isArray(resp.data) || resp.data.length === 0) {
      console.log('   Nominatim returned 0 results.');
      return [];
    }

    const formatted = [];
    for (const item of resp.data) {
      const tags = item.extratags || {};
      const name = tags.name || (item.display_name ? item.display_name.split(',')[0].trim() : null);
      if (!name) continue;

      const website = (tags.website || tags['contact:website'] || tags.url || '').trim();
      const directEmail = (tags.email || tags['contact:email'] || '').trim();
      const phone = (tags.phone || tags['contact:phone'] || '').trim();

      formatted.push({
        placeId: `nom_${item.osm_type || 'node'}_${item.osm_id || Math.random().toString(36).slice(2, 9)}`,
        name,
        address: item.display_name || cleanRegion,
        phone,
        website,
        directEmail,
        rating: null,
      });
    }

    // Sort to prioritize items that already have a website or direct email
    formatted.sort((a, b) => {
      const scoreA = (a.directEmail ? 2 : 0) + (a.website ? 1 : 0);
      const scoreB = (b.directEmail ? 2 : 0) + (b.website ? 1 : 0);
      return scoreB - scoreA;
    });

    const withWebsites = formatted.filter(b => Boolean(b.website || b.directEmail));
    console.log(`✅ [Nominatim] Found ${formatted.length} total, ${withWebsites.length} with websites/emails.`);

    return withWebsites.slice(0, maxResults);
  } catch (err) {
    console.warn(`⚠️ [Nominatim] Search failed: ${err.message}`);
    return [];
  }
}

module.exports = {
  searchNominatim,
};
