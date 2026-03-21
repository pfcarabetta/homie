import logger from './logger';

/**
 * Validates required and optional environment variables at startup.
 * Call this before importing any modules that use process.env.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  // ── Required ──────────────────────────────────────────────────────────────
  { name: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string' },
  { name: 'JWT_SECRET', required: true, description: 'Secret key for signing JWT tokens (min 32 chars recommended)' },

  // ── Optional (degrade gracefully) ─────────────────────────────────────────
  { name: 'PORT', required: false, description: 'API server port (default: 3001)' },
  { name: 'API_BASE_URL', required: false, description: 'Public base URL for webhooks (default: https://api.homie.app)' },

  // CORS
  { name: 'CORS_ORIGIN', required: false, description: 'Allowed CORS origins, comma-separated (default: http://localhost:3000)' },

  // Anthropic
  { name: 'ANTHROPIC_API_KEY', required: false, description: 'Anthropic API key for diagnostic chat' },

  // Twilio (outreach + notifications)
  { name: 'TWILIO_ACCOUNT_SID', required: false, description: 'Twilio Account SID for voice/SMS outreach' },
  { name: 'TWILIO_AUTH_TOKEN', required: false, description: 'Twilio Auth Token' },
  { name: 'TWILIO_PHONE_NUMBER', required: false, description: 'Twilio outbound phone number' },

  // SendGrid (email)
  { name: 'SENDGRID_API_KEY', required: false, description: 'SendGrid API key for email notifications' },
  { name: 'SENDGRID_FROM_EMAIL', required: false, description: 'SendGrid sender email address' },

  // Google Maps
  { name: 'GOOGLE_MAPS_API_KEY', required: false, description: 'Google Maps API key for provider discovery' },

  // Yelp
  { name: 'YELP_API_KEY', required: false, description: 'Yelp Fusion API key for supplementary provider discovery' },

  // Webhooks
  { name: 'WEBHOOK_SECRET', required: false, description: 'HMAC secret for verifying inbound webhooks' },
  { name: 'CALLBACK_PHONE', required: false, description: 'Callback phone number included in outreach scripts' },

  // Stripe
  { name: 'STRIPE_SECRET_KEY', required: false, description: 'Stripe secret key for payment processing' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: false, description: 'Stripe webhook signing secret' },

  // Sentry
  { name: 'SENTRY_DSN', required: false, description: 'Sentry DSN for error tracking' },

  // Admin
  { name: 'ADMIN_SECRET', required: false, description: 'Shared secret for admin dashboard access' },
];

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_VARS) {
    const value = process.env[v.name];
    if (!value) {
      if (v.required) {
        missing.push(`  ✗ ${v.name} — ${v.description}`);
      } else {
        warnings.push(`  △ ${v.name} — ${v.description}`);
      }
    }
  }

  if (warnings.length > 0) {
    logger.warn(`\n[env] Optional variables not set (features will be degraded):\n${warnings.join('\n')}\n`);
  }

  if (missing.length > 0) {
    logger.error(`\n[env] Missing required environment variables:\n${missing.join('\n')}\n`);
    process.exit(1);
  }

  // Soft validations (warnings, not fatal)
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < 32) {
    logger.warn('[env] JWT_SECRET is shorter than 32 characters — consider using a stronger secret');
  }
}
