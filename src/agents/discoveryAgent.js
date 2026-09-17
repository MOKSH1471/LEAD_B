const { Worker } = require('bullmq');
const { redisConnection, verificationQueue } = require('../queues');
const db = require('../db');
const { config } = require('../config');
const { searchPlaces } = require('../places');
const { searchPlacesOSM } = require('../osmSearch');
const { searchNominatim } = require('../nominatimSearch');
const { searchWebFallback } = require('../webScraperSearch');

const concurrency = parseInt(process.env.SCRAPER_CONCURRENCY || '5', 10);

console.log(`🚀 [Discovery Agent] Starting with concurrency=${concurrency}...`);

const insertLeadRaw = db.prepare(`
  INSERT INTO leads_raw (business_name, domain, place_id, city, niche, scraped_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const findRawByPlaceId = db.prepare(`
  SELECT id FROM leads_raw WHERE place_id = ?
`);

const isSuppressedDomain = db.prepare(`
  SELECT email FROM suppression WHERE email LIKE ?
`);

async function searchWithFallbacks(niche, region, limit) {
  let places = [];
  if (config.searchProvider === 'google') {
    places = await searchPlaces(niche, region, limit);
  } else {
    // Layer 1: OpenStreetMap Overpass
    try {
      places = await searchPlacesOSM(niche, region, limit);
    } catch (err) {
      console.warn(`[Discovery] OSM Overpass error: ${err.message}`);
    }

    // Layer 2: Nominatim fallback
    if (!places || places.length === 0) {
      console.log(`[Discovery] Fallback to Nominatim for ${niche} in ${region}...`);
      try {
        places = await searchNominatim(niche, region, limit);
      } catch (err) {
        console.warn(`[Discovery] Nominatim error: ${err.message}`);
      }
    }

    // Layer 3: Web search fallback
    if (!places || places.length === 0) {
      console.log(`[Discovery] Fallback to web search for ${niche} in ${region}...`);
      try {
        places = await searchWebFallback(niche, region, limit);
      } catch (err) {
        console.warn(`[Discovery] Web scraper search error: ${err.message}`);
      }
    }
  }
  return places || [];
}

const worker = new Worker(
  'discovery',
  async (job) => {
    const { niche = 'dentists', region = 'Austin, TX', maxResults = 20 } = job.data;
    console.log(`🔍 [Discovery] Job #${job.id}: Searching for ${maxResults} ${niche} in ${region}...`);

    // Check region stats for deprioritization feedback from Monitoring Agent
    const regionStat = db.prepare('SELECT priority_score FROM region_stats WHERE region = ?').get(region);
    if (regionStat && regionStat.priority_score < 0.4) {
      console.warn(`⚠️ [Discovery] Region "${region}" has poor deliverability history (score: ${regionStat.priority_score}).`);
    }

    const multiplier = 2; // Fetch extra to account for missing sites or duplicates
    const rawPlaces = await searchWithFallbacks(niche, region, maxResults * multiplier);
    console.log(`📍 [Discovery] Found ${rawPlaces.length} candidate places.`);

    let queuedCount = 0;
    let skippedCount = 0;

    for (const place of rawPlaces) {
      if (queuedCount >= maxResults) break;

      const placeId = place.placeId || `${place.name}_${place.address || region}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      
      // Check existing raw leads
      const existing = findRawByPlaceId.get(placeId);
      if (existing) {
        skippedCount++;
        continue;
      }

      // Extract domain if website exists
      let domain = '';
      if (place.website) {
        try {
          const urlObj = new URL(place.website.startsWith('http') ? place.website : `https://${place.website}`);
          domain = urlObj.hostname.replace(/^www\./, '');
        } catch {
          domain = '';
        }
      }

      // Check suppression by domain
      if (domain) {
        const suppressed = isSuppressedDomain.get(`%@${domain}`);
        if (suppressed) {
          console.log(`   ⏭️ Skipping suppressed domain: ${domain}`);
          skippedCount++;
          continue;
        }
      }

      const result = insertLeadRaw.run(
        place.name,
        domain || null,
        placeId,
        region,
        niche,
        new Date().toISOString()
      );

      const leadRawId = result.lastInsertRowid;

      // Push to Verification Queue
      await verificationQueue.add('verify-lead', {
        leadRawId,
        businessName: place.name,
        website: place.website || null,
        address: place.address || null,
        phone: place.phone || null,
        niche,
        region,
      });

      queuedCount++;
    }

    console.log(`✅ [Discovery] Completed job #${job.id}: queued ${queuedCount} leads to Verification (skipped ${skippedCount} duplicates/suppressed).`);
    return { queued: queuedCount, skipped: skippedCount, totalFound: rawPlaces.length };
  },
  {
    connection: redisConnection,
    concurrency,
  }
);

worker.on('failed', (job, err) => {
  console.error(`❌ [Discovery Agent] Job #${job?.id} failed:`, err.message);
});

module.exports = worker;
