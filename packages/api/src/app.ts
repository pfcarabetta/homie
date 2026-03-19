import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import jobsRouter from './routes/jobs';
import bookingsRouter from './routes/bookings';
import providersRouter from './routes/providers';
import webhooksRouter from './routes/webhooks';
import { requireAuth } from './middleware/auth';

const app = express();

app.use(cors());
app.use(express.json());
// Twilio sends webhooks as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/jobs', requireAuth, jobsRouter);
app.use('/api/v1/bookings', requireAuth, bookingsRouter);
// /providers/discover is public; /providers/:id/suppress requires auth
app.use('/api/v1/providers', providersRouter);
app.use('/api/v1/webhooks', webhooksRouter);

export default app;
