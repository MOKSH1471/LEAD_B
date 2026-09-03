const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('./config');
const { getFallbackDraft } = require('./emailTemplates');

let genAI = null;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
}

/**
 * Analyzes website text and context with Gemini using the Cold Outreach Playbook (marketing.md)
 * Offering a custom Demo Website as the low-friction CTA.
 */
async function analyzeSite({ name, niche = config.niche, region = config.region, website, siteText }) {
  if (!genAI) {
    console.log('   ℹ️ Gemini API key not found. Using structured fallback playbook template.');
    return getFallbackDraft({ name, niche, website });
  }

  const senderName = config.fromName || 'Alex';

  const prompt = `
You are an expert cold outreach specialist and freelance web designer following the strict rules from "Marketing.md — Cold Outreach Playbook for Maximum Conversion".

BUSINESS CONTEXT:
- Business Name: ${name}
- Niche: ${niche}
- Region: ${region}
- Website URL: ${website}
- Scraped Website Text:
"""
${siteText ? siteText.slice(0, 3000) : 'No readable text extracted.'}
"""

STRICT PLAYBOOK RULES FROM MARKETING.MD:

1. SUBJECT LINE:
   - MUST be strictly under 50 characters (mobile display rule).
   - MUST personalize with business name or an observation (e.g. "Quick note on ${name}'s website" or "Demo site idea for ${name}").
   - NO spam trigger words ("free", "guarantee", "discount", "100%", "cheap").
   - NO emojis, NO ALL CAPS, NO excessive punctuation.
   - Make it about THEM, not about your service.

2. EMAIL BODY:
   - Word Count: STRICTLY 75 to 120 words. (Short, clean, plain-text feeling).
   - Step 1 (Opening): OPEN WITH THEM, NOT YOU. First line MUST reference looking at ${name}'s website while researching ${niche} in ${region}. NEVER start with "Hi, my name is..." or "I am a web developer".
   - Step 2 (Observation): Cite 1 or 2 hyper-specific, genuine observations found on their actual site (e.g. mobile navigation clarity, appointment booking visibility, speed, modern visual hierarchy).
   - Step 3 (Value Bridge): 1 sentence on the business impact (e.g. making it seamless for visitors to book appointments or call directly).
   - Step 4 (CTA — DEMO WEBSITE OFFER): The call-to-action MUST offer to build and share a custom, modern demo website tailored for their business to see if they like it. Low friction (e.g. "I'd be happy to put together a quick interactive demo website for ${name} if you'd be open to seeing how it looks? No strings attached."). NEVER ask for a phone call.
   - Step 5 (Sign-off): Simple first-person freelancer sign-off from "${senderName}". No agency corporate block.

3. IMPROVEMENT POINTERS:
   - Provide 3-4 specific, concrete pointers based on their actual website text.

OUTPUT FORMAT:
Return ONLY a valid raw JSON object (no markdown, no backticks):
{
  "subject": "Under 50 chars subject line",
  "body": "75-120 word body offering a custom demo website",
  "pointers": [
    "Specific pointer 1",
    "Specific pointer 2",
    "Specific pointer 3"
  ]
}
`;

  const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'];

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
      });

      const result = await model.generateContent(prompt);
      const textResponse = result.response.text();

      const cleaned = textResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      if (!parsed.subject || !parsed.body) {
        throw new Error('Incomplete JSON response from Gemini');
      }

      let subject = parsed.subject.trim();
      if (subject.length > 50) {
        subject = `Quick note on ${name}'s website`.slice(0, 48);
      }

      return {
        subject,
        body: parsed.body.trim(),
        pointers: Array.isArray(parsed.pointers) ? parsed.pointers : [],
      };
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('not found')) {
        continue;
      }
      console.warn(`   ⚠️ Gemini note with ${modelName}: ${err.message}`);
    }
  }

  console.warn(`   ⚠️ Using fallback playbook draft.`);
  return getFallbackDraft({ name, niche, website });
}

module.exports = {
  analyzeSite,
};
