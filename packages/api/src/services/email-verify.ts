import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { sendEmail } from './notifications';

const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

export function generateVerifyToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function sendVerificationEmail(homeownerId: string, email: string, token: string, firstName?: string | null): Promise<void> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
  const name = firstName || 'there';

  const subject = 'Verify your Homie account';
  const html = `
    <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <h1 style="font-size: 24px; font-weight: 700; color: #E8632B; margin-bottom: 24px;">homie</h1>
      <p style="font-size: 16px; color: #2D2926; margin-bottom: 16px;">Hey ${name}!</p>
      <p style="font-size: 15px; color: #6B6560; line-height: 1.6; margin-bottom: 24px;">
        Thanks for signing up. Click the button below to verify your email and activate your account.
      </p>
      <a href="${verifyUrl}" style="display: inline-block; background: #E8632B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 100px; font-size: 16px; font-weight: 600;">
        Verify my email
      </a>
      <p style="font-size: 13px; color: #9B9490; margin-top: 32px; line-height: 1.5;">
        If you didn't create a Homie account, you can ignore this email.
      </p>
      <p style="font-size: 12px; color: #ccc; margin-top: 24px;">
        Or copy this link: ${verifyUrl}
      </p>
    </div>
  `;

  await sendEmail(email, subject, html);
}

export async function verifyEmail(token: string): Promise<boolean> {
  const [homeowner] = await db
    .select({ id: homeowners.id })
    .from(homeowners)
    .where(eq(homeowners.emailVerifyToken, token))
    .limit(1);

  if (!homeowner) return false;

  await db.update(homeowners).set({
    emailVerified: true,
    emailVerifyToken: null,
  }).where(eq(homeowners.id, homeowner.id));

  return true;
}
