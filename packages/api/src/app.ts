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
import { requireAuth } from './middleware/auth';
import { requireAdmin } from './middleware/admin';

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

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/diagnostic', diagnosticRouter);
app.use('/api/v1/jobs', requireAuth, jobsRouter);
app.use('/api/v1/bookings', requireAuth, bookingsRouter);
// /providers/discover is public; /providers/:id/suppress requires auth
app.use('/api/v1/providers', providersRouter);
app.use('/api/v1/account', requireAuth, accountRouter);
app.use('/api/v1/payments', requireAuth, paymentsRouter);
app.use('/api/v1/webhooks', webhooksRouter);
app.use('/api/v1/admin', requireAdmin, adminRouter);

export default app;
