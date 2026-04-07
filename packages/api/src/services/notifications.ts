import twilio from 'twilio';
import sgMail from '@sendgrid/mail';
import logger from '../logger';

/**
 * Sends a plain SMS via Twilio.
 * Silently skips (with a warning) if Twilio credentials are not configured.
 */
/** Normalize phone to E.164 format (+1XXXXXXXXXX for US numbers) */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    logger.warn('[notifications] Twilio credentials not configured — skipping SMS to %s', to);
    return;
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({ to: normalizePhone(to), from: fromNumber, body });
}

/**
 * Sends a plain-text email via SendGrid.
 * Silently skips (with a warning) if SendGrid is not configured.
 */
export async function sendEmail(to: string, subject: string, htmlOrText: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    logger.warn('[notifications] SendGrid not configured — skipping email to %s', to);
    return;
  }

  sgMail.setApiKey(apiKey);
  const isHtml = htmlOrText.trim().startsWith('<');
  await sgMail.send({
    to,
    from: { email: fromEmail, name: 'Homie' },
    subject,
    ...(isHtml ? { html: htmlOrText } : { text: htmlOrText }),
  });
}
