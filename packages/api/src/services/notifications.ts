import twilio from 'twilio';
import sgMail from '@sendgrid/mail';

/**
 * Sends a plain SMS via Twilio.
 * Silently skips (with a warning) if Twilio credentials are not configured.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('[notifications] Twilio credentials not configured — skipping SMS to', to);
    return;
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({ to, from: fromNumber, body });
}

/**
 * Sends a plain-text email via SendGrid.
 * Silently skips (with a warning) if SendGrid is not configured.
 */
export async function sendEmail(to: string, subject: string, htmlOrText: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn('[notifications] SendGrid not configured — skipping email to', to);
    return;
  }

  sgMail.setApiKey(apiKey);
  const isHtml = htmlOrText.trim().startsWith('<');
  await sgMail.send({
    to,
    from: fromEmail,
    subject,
    ...(isHtml ? { html: htmlOrText } : { text: htmlOrText }),
  });
}
