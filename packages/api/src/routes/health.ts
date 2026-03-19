import { Router, Request, Response } from 'express';
import { ApiResponse } from '../types/api';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const response: ApiResponse<{ status: string; timestamp: string }> = {
    data: { status: 'ok', timestamp: new Date().toISOString() },
    error: null,
    meta: { version: process.env.npm_package_version ?? '1.0.0' },
  };
  res.json(response);
});

export default router;
