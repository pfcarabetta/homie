import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import diagnosticRouter from './routes/diagnostic';
import jobsRouter from './routes/jobs';
import bookingsRouter from './routes/bookings';
import providersRouter from './routes/providers';
import webhooksRouter from './routes/webhooks';
import paymentsRouter from './routes/payments';
import accountRouter from './routes/account';
import adminRouter from './routes/admin';
import { stripeWebhookHandler } from './routes/stripe-webhook';
import providerAuthRouter from './routes/provider-auth';
import providerPortalRouter from './routes/provider-portal';
import businessRouter from './routes/business';
import configRouter from './routes/config';
import demoEstimateRouter from './routes/demo-estimate';
import businessChatRouter from './routes/business-chat';
import { trackingPublicRouter, trackingAuthRouter } from './routes/tracking';
import { slackAuthRouter, slackPublicRouter } from './routes/slack-integration';
import estimatesRouter from './routes/estimates';
import { scheduleRouter, templateRouter } from './routes/schedules';
import { guestPublicRouter, guestPmRouter } from './routes/guest-reporter';
import { requireAuth } from './middleware/auth';
import { requireAdmin } from './middleware/admin';
import { requireProviderAuth } from './middleware/provider-auth';
import { authLimiter, diagnosticLimiter, apiLimiter } from './middleware/rate-limit';
import { Sentry } from './sentry';

const app = express();

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

// Stripe webhook needs raw body — mount BEFORE express.json()
app.post('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '10mb' }));
// Twilio sends webhooks as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api/v1/config', configRouter);
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/diagnostic', diagnosticLimiter, diagnosticRouter);
app.use('/api/v1/jobs', apiLimiter, requireAuth, jobsRouter);
app.use('/api/v1/bookings', apiLimiter, requireAuth, bookingsRouter);
app.use('/api/v1/providers', apiLimiter, providersRouter);
app.use('/api/v1/account', apiLimiter, requireAuth, accountRouter);
app.use('/api/v1/payments', apiLimiter, requireAuth, paymentsRouter);
app.use('/api/v1/provider-auth', authLimiter, providerAuthRouter);
app.use('/api/v1/portal', apiLimiter, requireProviderAuth, providerPortalRouter);
app.use('/api/v1/webhooks', webhooksRouter);
app.use('/api/v1/admin', requireAdmin, adminRouter);
app.use('/api/v1/business', apiLimiter, requireAuth, businessRouter);
app.use('/api/v1/demo', demoEstimateRouter);
app.use('/api/v1/business-chat', diagnosticLimiter, requireAuth, businessChatRouter);
app.use('/api/v1/tracking', apiLimiter, trackingPublicRouter);
app.use('/api/v1/jobs', apiLimiter, requireAuth, trackingAuthRouter);
app.use('/api/v1/integrations/slack', apiLimiter, slackAuthRouter);
app.use('/api/v1/slack', slackPublicRouter);
app.use('/api/v1/estimates', apiLimiter, estimatesRouter);
app.use('/api/v1/schedule-templates', apiLimiter, templateRouter);
app.use('/api/v1/business/:workspaceId/schedules', apiLimiter, requireAuth, scheduleRouter);
app.use('/api/v1/guest', apiLimiter, guestPublicRouter);
app.use('/api/v1/business', apiLimiter, requireAuth, guestPmRouter);

// Sentry error handler — must be after all routes
Sentry.setupExpressErrorHandler(app);

export default app;
