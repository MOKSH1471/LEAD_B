const axios = require('axios');
const { config } = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const NICHE_TAG_MAPPING = {
  // Hotels, Hospitality & Boutique Hotels
  'hotel boutique': ['tourism=hotel', 'tourism=guest_house', 'shop=boutique'],
  'hotel boutiques': ['tourism=hotel', 'tourism=guest_house', 'shop=boutique'],
  'boutique hotel': ['tourism=hotel', 'tourism=guest_house', 'shop=boutique'],
  'boutique hotels': ['tourism=hotel', 'tourism=guest_house', 'shop=boutique'],
  'hotel': ['tourism=hotel'],
  'hotels': ['tourism=hotel'],
  'resort': ['tourism=hotel', 'leisure=resort'],
  'resorts': ['tourism=hotel', 'leisure=resort'],
  'motel': ['tourism=motel'],
  'motels': ['tourism=motel'],
  'inn': ['tourism=hotel', 'tourism=guest_house'],
  'lodging': ['tourism=hotel', 'tourism=guest_house'],
  'b&b': ['tourism=guest_house'],
  'hostel': ['tourism=hostel'],

  // Fashion, Boutiques & Retail
  'boutique': ['shop=boutique', 'shop=clothes', 'shop=fashion'],
  'boutiques': ['shop=boutique', 'shop=clothes', 'shop=fashion'],
  'clothing': ['shop=clothes', 'shop=boutique', 'shop=fashion'],
  'clothes': ['shop=clothes', 'shop=boutique'],
  'fashion': ['shop=boutique', 'shop=clothes', 'shop=fashion'],
  'apparel': ['shop=clothes', 'shop=boutique'],
  'jewelry': ['shop=jewelry'],
  'shoes': ['shop=shoes'],
  'florist': ['shop=florist'],
  'flowers': ['shop=florist'],

  // Beauty, Salons & Spas
  'nail': ['shop=beauty', 'shop=hairdresser', 'beauty=nail_salon'],
  'nails': ['shop=beauty', 'shop=hairdresser', 'beauty=nail_salon'],
  'nailsalon': ['shop=beauty', 'shop=hairdresser', 'beauty=nail_salon'],
  'nailsalons': ['shop=beauty', 'shop=hairdresser', 'beauty=nail_salon'],
  'nail salon': ['shop=beauty', 'shop=hairdresser', 'beauty=nail_salon'],
  'nail salons': ['shop=beauty', 'shop=hairdresser', 'beauty=nail_salon'],
  'salon': ['shop=beauty', 'shop=hairdresser'],
  'salons': ['shop=beauty', 'shop=hairdresser'],
  'hair': ['shop=hairdresser'],
  'hair salon': ['shop=hairdresser'],
  'hairdresser': ['shop=hairdresser'],
  'barber': ['shop=hairdresser'],
  'barbershop': ['shop=hairdresser'],
  'spa': ['shop=beauty', 'leisure=spa'],
  'spas': ['shop=beauty', 'leisure=spa'],
  'massage': ['shop=massage', 'shop=beauty'],

  // Dental & Healthcare
  'dentist': ['amenity=dentist', 'healthcare=dentist'],
  'dentists': ['amenity=dentist', 'healthcare=dentist'],
  'dental': ['amenity=dentist', 'healthcare=dentist'],
  'orthodontist': ['amenity=dentist', 'healthcare=dentist'],
  'doctor': ['amenity=doctors', 'amenity=clinic', 'healthcare=doctor'],
  'doctors': ['amenity=doctors', 'amenity=clinic', 'healthcare=doctor'],
  'clinic': ['amenity=clinic', 'healthcare=clinic'],
  'chiropractor': ['healthcare=chiropractor', 'amenity=clinic'],
  'optometrist': ['healthcare=optometrist', 'shop=optician'],
  'vet': ['amenity=veterinary'],
  'veterinarian': ['amenity=veterinary'],
  'veterinarians': ['amenity=veterinary'],
  'physiotherapy': ['healthcare=physiotherapist'],

  // Home Services & Trades
  'plumber': ['craft=plumber'],
  'plumbers': ['craft=plumber'],
  'plumbing': ['craft=plumber'],
  'electrician': ['craft=electrician'],
  'electricians': ['craft=electrician'],
  'roofing': ['craft=roofer', 'craft=carpenter'],
  'roofer': ['craft=roofer'],
  'roofers': ['craft=roofer'],
  'contractor': ['craft=builder', 'craft=carpenter', 'office=company'],
  'contractors': ['craft=builder', 'craft=carpenter', 'office=company'],
  'painter': ['craft=painter'],
  'painters': ['craft=painter'],
  'hvac': ['craft=hvac', 'craft=plumber', 'shop=trade'],
  'ac repair': ['craft=hvac', 'craft=electrician'],
  'landscaping': ['craft=gardener', 'craft=landscaper'],
  'cleaner': ['craft=cleaning', 'shop=laundry'],
  'cleaning': ['craft=cleaning', 'office=company'],

  // Professional Services
  'lawyer': ['office=lawyer'],
  'lawyers': ['office=lawyer'],
  'attorney': ['office=lawyer'],
  'attorneys': ['office=lawyer'],
  'law firm': ['office=lawyer'],
  'accountant': ['office=accountant', 'office=tax_advisor'],
  'accountants': ['office=accountant', 'office=tax_advisor'],
  'cpa': ['office=accountant'],
  'realtor': ['office=estate_agent'],
  'realtors': ['office=estate_agent'],
  'real estate': ['office=estate_agent'],
  'insurance': ['office=insurance'],

  // Food & Hospitality
  'restaurant': ['amenity=restaurant'],
  'restaurants': ['amenity=restaurant'],
  'cafe': ['amenity=cafe'],
  'cafes': ['amenity=cafe'],
  'bakery': ['shop=bakery'],
  'bakeries': ['shop=bakery'],
  'coffee': ['amenity=cafe'],

  // Fitness
  'gym': ['leisure=fitness_centre'],
  'gyms': ['leisure=fitness_centre'],
  'fitness': ['leisure=fitness_centre'],
  'yoga': ['leisure=fitness_centre'],

  // Automotive
  'mechanic': ['shop=car_repair'],
  'auto repair': ['shop=car_repair'],
  'car repair': ['shop=car_repair'],
};

async function geocodeRegion(region) {
  const cleanRegion = (region || '').replace(/,([^\s])/g, ', $1').trim();

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanRegion)}&limit=1`;
    const resp = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });

    if (resp.data && resp.data.features && resp.data.features.length > 0) {
      const feat = resp.data.features[0];
      const extent = feat.properties.extent;
      if (extent && extent.length === 4) {
        const [minLon, maxLat, maxLon, minLat] = extent;
        return {
          south: minLat,
          north: maxLat,
          west: minLon,
          east: maxLon,
          displayName: feat.properties.name || cleanRegion,
        };
      } else if (feat.geometry && feat.geometry.coordinates) {
        const [lon, lat] = feat.geometry.coordinates;
        const delta = 0.12;
        return {
          south: lat - delta,
          north: lat + delta,
          west: lon - delta,
          east: lon + delta,
          displayName: feat.properties.name || cleanRegion,
        };
      }
    }
  } catch (err) {
    console.warn(`   ⚠️ Geocoder note: ${err.message}`);
  }

  return null;
}

function findTagsForNiche(niche) {
  const norm = niche.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
  if (NICHE_TAG_MAPPING[norm]) {
    return NICHE_TAG_MAPPING[norm];
  }

  const words = norm.split(/\s+/);
  for (const w of words) {
    if (NICHE_TAG_MAPPING[w]) {
      return NICHE_TAG_MAPPING[w];
    }
  }

  for (const [k, v] of Object.entries(NICHE_TAG_MAPPING)) {
    if (norm.includes(k) || k.includes(norm)) {
      return v;
    }
  }

  return [];
}

function buildOverpassQuery(niche, bbox) {
  const { south, north, west, east } = bbox;
  const bboxStr = `${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)}`;

  const tags = findTagsForNiche(niche);

  if (tags.length > 0) {
    const clauses = tags.map((t) => {
      const [k, v] = t.split('=');
      return `node["${k}"="${v}"]["name"](${bboxStr});\nway["${k}"="${v}"]["name"](${bboxStr});`;
    }).join('\n');

    return `[out:json][timeout:20];(\n${clauses}\n);out tags center 150;`;
  }

  return `[out:json][timeout:20];(node["name"]["shop"](${bboxStr});node["name"]["amenity"](${bboxStr});node["name"]["craft"](${bboxStr});node["name"]["office"](${bboxStr});node["name"]["tourism"](${bboxStr});way["name"]["shop"](${bboxStr});way["name"]["tourism"](${bboxStr}););out tags center 150;`;
}

/**
 * Searches OpenStreetMap using reliable high-speed endpoints.
 */
async function searchPlacesOSM(niche = config.niche, region = config.region, maxResults = config.maxResults) {
  console.log(`\n🗺️  [OpenStreetMap] Searching for "${niche}" in "${region}"...`);

  const bbox = await geocodeRegion(region);
  if (!bbox) {
    console.error('❌ Failed to locate the region coordinates.');
    return [];
  }

  console.log(`   📍 Region matched: ${bbox.displayName}`);

  const overpassQuery = buildOverpassQuery(niche, bbox);
  const overpassEndpoints = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  let rawElements = [];
  for (const endpoint of overpassEndpoints) {
    try {
      console.log(`   📡 Querying OpenStreetMap via ${new URL(endpoint).hostname}...`);
      const resp = await axios.post(endpoint, overpassQuery, {
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0',
        },
        timeout: 20000,
      });

      if (resp.data && Array.isArray(resp.data.elements) && resp.data.elements.length > 0) {
        rawElements = resp.data.elements;
        break;
      }
    } catch (err) {
      console.warn(`   ⚠️ Endpoint ${new URL(endpoint).hostname} note (${err.message}), trying next mirror...`);
      await sleep(500);
    }
  }

  console.log(`   Found ${rawElements.length} raw map entities in ${region}.`);

  const matchedTags = findTagsForNiche(niche);
  const searchWords = niche.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const formatted = [];
  for (const elem of rawElements) {
    const tags = elem.tags || {};
    const name = tags.name || tags['brand'] || tags['operator'];
    if (!name) continue;

    if (matchedTags.length === 0 && searchWords.length > 0) {
      const allText = `${name} ${tags.amenity || ''} ${tags.shop || ''} ${tags.tourism || ''} ${tags.craft || ''} ${tags.office || ''}`.toLowerCase();
      const hasWordMatch = searchWords.some(w => allText.includes(w));
      if (!hasWordMatch) {
        continue;
      }
    }

    const street = tags['addr:street'] ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}`.trim() : '';
    const city = tags['addr:city'] || region;
    const postcode = tags['addr:postcode'] || '';
    const fullAddress = [street, city, postcode].filter(Boolean).join(', ') || region;

    const phone = tags['phone'] || tags['contact:phone'] || tags['phone:mobile'] || '';
    const website = (tags['website'] || tags['contact:website'] || tags['url'] || '').trim();
    const directEmail = (tags['email'] || tags['contact:email'] || '').trim();

    const placeId = `osm_${elem.type}_${elem.id}`;

    formatted.push({
      placeId,
      name,
      address: fullAddress,
      phone,
      website,
      directEmail,
      rating: null,
    });
  }

  // Prioritize businesses with websites or direct emails
  formatted.sort((a, b) => {
    const scoreA = (a.directEmail ? 2 : 0) + (a.website ? 1 : 0);
    const scoreB = (b.directEmail ? 2 : 0) + (b.website ? 1 : 0);
    return scoreB - scoreA;
  });

  const withWebsites = formatted.filter(b => Boolean(b.website || b.directEmail));

  console.log(`✅ Prioritized ${withWebsites.length} businesses with active websites/emails out of ${formatted.length} total.\n`);

  return withWebsites.slice(0, maxResults);
}

module.exports = {
  searchPlacesOSM,
};
