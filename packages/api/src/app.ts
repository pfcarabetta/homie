import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import diagnosticRouter from './routes/diagnostic';
import jobsRouter from './routes/jobs';
import bookingsRouter from './routes/bookings';
import providersRouter from './routes/providers';
import webhooksRouter from './routes/webhooks';
import { requireAuth } from './middleware/auth';

const app = express();

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);
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
app.use('/api/v1/webhooks', webhooksRouter);

export default app;
