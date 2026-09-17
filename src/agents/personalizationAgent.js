const { Worker } = require('bullmq');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { redisConnection, dispatchQueue } = require('../queues');
const db = require('../db');
const { config } = require('../config');
const { analyzeSite } = require('../analyzer');

console.log('✍️ [Personalization Agent] Starting worker...');

let genAI = null;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
}

const minScore = parseInt(process.env.PERSONALIZATION_MIN_SCORE || '3', 10);
const rpmLimit = parseInt(process.env.GEMINI_RPM_LIMIT || '15', 10);
const delayBetweenCallsMs = Math.ceil(60000 / rpmLimit);

const insertSendQueue = db.prepare(`
  INSERT INTO send_queue (lead_id, draft_subject, draft_text, personalization_score, niche, scheduled_at, status)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function critiqueDraft(businessName, niche, subject, body) {
  if (!genAI) {
    // If no AI key or in fallback mode, pass with standard score
    return { score: 4, critique: 'Default template score (heuristic)' };
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `
You are a cold email deliverability and conversion quality auditor.
Score the following email draft written for "${businessName}" in the "${niche}" niche.

Email Subject: ${subject}
Email Body:
"""
${body}
"""

Evaluate how specific and natural this draft is:
- Score 5: Highly specific to this exact business, mentions concrete observations, reads like an authentic 1-on-1 note.
- Score 3: Reasonable personalization, not overly generic.
- Score 1: Vague, generic, looks like an automated mass blast.

Return ONLY a raw JSON object (no markdown, no backticks):
{"score": <number between 1 and 5>, "critique": "<one sentence reasoning>"}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleanJson = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleanJson);
    return {
      score: Math.max(1, Math.min(5, Number(parsed.score) || 3)),
      critique: parsed.critique || 'Evaluated by Gemini',
    };
  } catch (err) {
    console.warn(`[Personalization] Critique pass error: ${err.message}. Defaulting score to 3.`);
    return { score: 3, critique: 'Fallback score on critique failure' };
  }
}

const worker = new Worker(
  'personalization',
  async (job) => {
    const { leadVerifiedId, email, businessName, website, websiteText, niche, region } = job.data;
    console.log(`🤖 [Personalization] Job #${job.id}: Drafting pitch for "${businessName}" (${niche})...`);

    // 1. Generate customized email pitch
    const draft = await analyzeSite({
      name: businessName,
      niche,
      region,
      website,
      siteText: websiteText,
    });

    const subject = draft.subject || `Question regarding ${businessName}'s website`;
    const body = draft.body;

    // Rate-limit pause before next AI call
    await sleep(delayBetweenCallsMs);

    // 2. Self-critique pass
    const critique = await critiqueDraft(businessName, niche, subject, body);
    const score = critique.score;
    const isApproved = score >= minScore;
    const status = isApproved ? 'ready' : 'flagged';

    console.log(`   📊 Score: ${score}/5 (${critique.critique}) -> Status: ${status}`);

    // 3. Save to send_queue
    const result = insertSendQueue.run(
      leadVerifiedId,
      subject,
      body,
      score,
      niche,
      new Date().toISOString(),
      status
    );
    const sendQueueId = result.lastInsertRowid;

    if (isApproved) {
      // 4. Queue into Dispatch Queue
      await dispatchQueue.add('dispatch-email', {
        sendQueueId,
        leadVerifiedId,
        email,
        businessName,
        subject,
        body,
        niche,
        score,
      });
      console.log(`   ✅ Queued for Dispatch: #${sendQueueId} -> ${email}`);
    } else {
      console.warn(`   ⚠️ Draft #${sendQueueId} flagged for review due to low personalization score (${score} < ${minScore}).`);
    }

    return { sendQueueId, status, score, critique: critique.critique };
  },
  {
    connection: redisConnection,
    concurrency: 1, // Keep concurrency 1 to strictly respect Gemini rate limits
  }
);

worker.on('failed', (job, err) => {
  console.error(`❌ [Personalization Agent] Job #${job?.id} failed:`, err.message);
});

module.exports = worker;
