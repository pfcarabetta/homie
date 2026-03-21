import logger from '../../logger';

/**
 * Scrapes a provider's website to find contact email addresses.
 * Fetches the homepage and common contact pages, extracts emails via regex.
 */
export async function scrapeEmailFromWebsite(websiteUrl: string): Promise<string | null> {
  if (!websiteUrl) return null;

  // Normalize URL
  let baseUrl = websiteUrl;
  if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

  // Pages to check for email addresses
  const pagePaths = ['', '/contact', '/contact-us', '/about', '/about-us'];

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const foundEmails = new Set<string>();

  // Common non-contact emails to skip
  const skipPatterns = [
    'noreply', 'no-reply', 'donotreply', 'example.com', 'sentry.io',
    'googleapis.com', 'google.com', 'facebook.com', 'twitter.com',
    'wix.com', 'squarespace.com', 'wordpress.com', 'godaddy.com',
    '.png', '.jpg', '.gif', '.css', '.js',
  ];

  for (const path of pagePaths) {
    try {
      const url = baseUrl.replace(/\/+$/, '') + path;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HomieBot/1.0; +https://homiepro.ai)',
          'Accept': 'text/html',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const html = await res.text();

      // Extract emails from mailto: links and page text
      const matches = html.match(emailRegex) ?? [];
      for (const email of matches) {
        const lower = email.toLowerCase();
        if (skipPatterns.some(p => lower.includes(p))) continue;
        foundEmails.add(lower);
      }

      // Also check for mailto: links specifically (more reliable)
      const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
      const mailtoMatches = html.match(mailtoRegex) ?? [];
      for (const mailto of mailtoMatches) {
        const email = mailto.replace(/^mailto:/i, '').toLowerCase();
        if (skipPatterns.some(p => email.includes(p))) continue;
        foundEmails.add(email);
      }

      // If we found emails, no need to check more pages
      if (foundEmails.size > 0) break;
    } catch {
      // Timeout or fetch error — skip this page
      continue;
    }
  }

  if (foundEmails.size === 0) {
    logger.info(`[email-scraper] No email found on ${baseUrl}`);
    return null;
  }

  // Prefer emails with common contact prefixes
  const preferredPrefixes = ['info', 'contact', 'hello', 'office', 'service', 'support', 'admin', 'sales'];
  const sorted = Array.from(foundEmails).sort((a, b) => {
    const aPreferred = preferredPrefixes.some(p => a.startsWith(p + '@'));
    const bPreferred = preferredPrefixes.some(p => b.startsWith(p + '@'));
    if (aPreferred && !bPreferred) return -1;
    if (!aPreferred && bPreferred) return 1;
    return 0;
  });

  const bestEmail = sorted[0];
  logger.info(`[email-scraper] Found email ${bestEmail} on ${baseUrl} (${foundEmails.size} total)`);
  return bestEmail;
}
