const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('./config');
const { sendEmail } = require('./emailSender');
const { getLeadsDueForFollowUp, recordFollowUpSent } = require('./tracker');

let genAI = null;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
}

/**
 * Normalizes subject line to clean 'Re: <original subject>' threading format
 */
function formatFollowUpSubject(originalSubject, businessName) {
  const name = businessName || 'your';
  let base = originalSubject ? originalSubject.trim() : `Quick note on ${name}'s website`;
  base = base.replace(/^(re:\s*)+/i, '').trim();
  const full = `Re: ${base}`;
  return full.slice(0, 60);
}

/**
 * Fallback follow-up drafts following the Cold Outreach Playbook
 */
function getFallbackFollowUpDraft({ name, stage, originalSubject }) {
  const senderName = config.fromName || 'Alex';
  const businessName = name || 'there';
  const subject = formatFollowUpSubject(originalSubject, businessName);

  if (stage === 1) {
    const body = `Hi ${businessName} team,

Following up briefly on my note from earlier this week regarding ${businessName}'s website.

I know you're busy running the business, but I'd still love to put together that quick, custom demo website so you can see what an updated, mobile-friendly design would look like for you.

Would you like me to send that over? No strings attached.

Best,
${senderName}`;

    return { subject, body: body.trim() };
  }

  // Stage 2 (Final Breakup)
  const body = `Hi ${businessName} team,

I'll keep this brief — I assume you're all set or have your hands full right now, so I won't follow up again!

If you ever want to explore a refreshed, modern website or check out that custom demo for ${businessName} down the road, feel free to reach back out anytime.

Wishing you and the team all the best,
${senderName}`;

  return { subject, body: body.trim() };
}

/**
 * Generates an AI follow-up using Gemini 2.0 Flash or structured playbook fallback
 */
async function generateFollowUpDraft({ name, niche, region, website, pointers, stage, originalSubject }) {
  const businessName = name || 'there';
  const subject = formatFollowUpSubject(originalSubject, businessName);
  const senderName = config.fromName || 'Alex';

  if (!genAI) {
    return getFallbackFollowUpDraft({ name, stage, originalSubject });
  }

  const prompt = `
You are an expert cold outreach specialist and freelance web designer following the Cold Outreach Playbook.
Generate a high-converting, human, plain-text FOLLOW-UP email to a local business.

CONTEXT:
- Business: ${businessName}
- Niche: ${niche || 'local business'}
- Region: ${region || 'local area'}
- Website: ${website || 'their site'}
- Previous Pointers Noticed: ${(pointers || []).join('; ') || 'Mobile layout, booking flow, modern visuals'}
- Follow-Up Stage: ${stage} (1 = Gentle check-in after 3 days, 2 = Final polite breakup after 7 days)
- Original Subject: ${originalSubject || `Quick note on ${businessName}'s website`}

RULES FOR STAGE 1 (Gentle Bump):
- Word count: 40 to 65 words maximum.
- Plain text, warm, respectful.
- Acknowledge they are likely busy running operations.
- Reference the previous note offering a custom demo website to see how it looks.
- Low-friction question (e.g. "Would you be open to checking out a quick interactive demo?").
- Freelancer sign-off from "${senderName}".

RULES FOR STAGE 2 (Final Breakup):
- Word count: 35 to 55 words maximum.
- Zero pressure, completely polite closing note.
- State that you assume they are busy or all set, so you won't reach out again.
- Leave the door open if they ever want a modern website or want to see the demo down the road.
- Warm freelancer sign-off from "${senderName}".

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no backticks):
{
  "body": "Follow-up email body text"
}
`;

  const candidateModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];
  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.body) {
        return {
          subject,
          body: parsed.body.trim(),
        };
      }
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('not found')) continue;
    }
  }

  return getFallbackFollowUpDraft({ name, stage, originalSubject });
}

/**
 * Runs a complete follow-up sweep across all overdue leads in contacted.json
 */
async function runFollowUpSweep(options = {}) {
  const isDryRun = options.dryRun !== undefined ? options.dryRun : config.dryRun;
  const onProgress = options.onProgress || (() => {});
  const shouldAbort = options.shouldAbort || (() => false);

  const notify = async (msg) => {
    console.log(msg);
    try {
      await onProgress(msg);
    } catch (e) {}
  };

  const dueLeads = getLeadsDueForFollowUp();

  if (dueLeads.length === 0) {
    await notify('📬 *Follow-Up Sweep:* No prospects are currently due for follow-ups.');
    return {
      totalEvaluated: 0,
      stage1Sent: 0,
      stage2Sent: 0,
      errors: 0,
    };
  }

  await notify(`📬 *Starting Follow-Up Sweep*\nFound *${dueLeads.length}* lead(s) due for follow-up outreach.\n🛡️ *Mode:* ${isDryRun ? 'DRY RUN (Preview)' : '⚡ LIVE (Sending)'}`);

  const stats = {
    totalEvaluated: dueLeads.length,
    stage1Sent: 0,
    stage2Sent: 0,
    errors: 0,
    details: [],
  };

  for (let i = 0; i < dueLeads.length; i++) {
    if (shouldAbort()) {
      await notify('🛑 *Follow-up sweep halted by user.*');
      break;
    }

    const lead = dueLeads[i];
    const stage = lead.targetStage;

    try {
      await notify(`📨 *[${i + 1}/${dueLeads.length}]* Drafting Stage ${stage} follow-up for *${lead.name}* (\`${lead.email}\`)...`);

      const draft = await generateFollowUpDraft({
        name: lead.name,
        niche: lead.niche,
        region: lead.region,
        website: lead.website,
        pointers: lead.pointers,
        stage,
        originalSubject: lead.subject,
      });

      const emailResult = await sendEmail({
        to: lead.email,
        subject: draft.subject,
        body: draft.body,
        businessName: lead.name,
      });

      const finalStatus = isDryRun ? 'dry_run_preview' : (emailResult.success ? 'sent' : 'send_error');

      recordFollowUpSent(lead.email, stage, finalStatus, draft.subject);

      if (emailResult.success) {
        if (stage === 1) stats.stage1Sent++;
        else stats.stage2Sent++;

        stats.details.push({
          name: lead.name,
          email: lead.email,
          stage,
          subject: draft.subject,
        });

        await notify(`✅ Dispatched Stage ${stage} follow-up to *${lead.name}* (\`${lead.email}\`)`);
      } else {
        stats.errors++;
        await notify(`❌ Failed follow-up to *${lead.name}*: ${emailResult.error}`);
      }
    } catch (err) {
      stats.errors++;
      console.error(`Error following up with ${lead.email}:`, err.message);
    }
  }

  const summary = `📊 *Follow-Up Sweep Complete*\n` +
    `• Evaluated: ${stats.totalEvaluated}\n` +
    `• Stage 1 Sent (Gentle Bump): *${stats.stage1Sent}*\n` +
    `• Stage 2 Sent (Final Breakup): *${stats.stage2Sent}*\n` +
    `• Errors: ${stats.errors}`;

  await notify(summary);
  return stats;
}

module.exports = {
  formatFollowUpSubject,
  getFallbackFollowUpDraft,
  generateFollowUpDraft,
  runFollowUpSweep,
};
