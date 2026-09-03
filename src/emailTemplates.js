const { config } = require('./config');

/**
 * Returns a fallback cold outreach draft strictly matching the Playbook in marketing.md:
 * - Subject < 50 chars, personalized
 * - 75–120 words
 * - Step 1: Open with them, not you
 * - Step 2: Specific site observation
 * - Step 3: Bridge to business value
 * - Step 4: Low-friction CTA offering a custom demo website
 * - Step 5: Freelancer sign-off
 */
function getFallbackDraft({ name, niche, website }) {
  const senderName = config.fromName || 'Alex';
  const businessName = name || 'there';
  const displayNiche = (niche || 'local businesses').toLowerCase();

  const subject = `Quick question on ${businessName}'s website`.slice(0, 48);

  const body = `Hi ${businessName} team,

I was looking at your website (${website || 'your site'}) while researching ${displayNiche} in the area.

I noticed a few areas where a refreshed, mobile-optimized experience and clearer appointment booking could help convert more local visitors into scheduled appointments.

I'd be happy to put together a quick, modern demo website for ${businessName} so you can see how it looks and functions — would you be open to checking it out? No strings attached.

Best,
${senderName}
`;

  return {
    subject,
    body: body.trim(),
    pointers: [
      'Improve mobile responsiveness and touch-friendly booking buttons',
      'Streamline appointment scheduling flow to capture more patient inquiries',
      'Modernize hero section layout for higher conversion rates'
    ]
  };
}

module.exports = {
  getFallbackDraft,
};
