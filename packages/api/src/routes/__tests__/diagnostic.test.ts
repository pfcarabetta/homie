import request from 'supertest';
import app from '../../app';

const HOMEOWNER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

jest.mock('../../db', () => ({ db: {} }));

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: { homeownerId: string }, _res: unknown, next: () => void) => {
    req.homeownerId = HOMEOWNER_ID;
    next();
  },
  signToken: jest.fn(),
}));

jest.mock('../../services/orchestration', () => ({
  dispatchJob: jest.fn(),
  sendBookingNotifications: jest.fn(),
}));

jest.mock('../../services/providers/scores', () => ({
  recordHomeownerRating: jest.fn(),
}));

// Mock Anthropic SDK — factory runs before variable declarations due to jest hoisting
jest.mock('@anthropic-ai/sdk', () => {
  function makeStream() {
    return {
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } };
      },
    };
  }
  return jest.fn().mockImplementation(() => ({
    messages: { stream: jest.fn().mockReturnValue(makeStream()) },
  }));
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe('POST /api/v1/diagnostic/chat', () => {
  it('400 when message is missing', async () => {
    const res = await request(app).post('/api/v1/diagnostic/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  it('400 when message is empty string', async () => {
    const res = await request(app).post('/api/v1/diagnostic/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  it('503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await request(app)
      .post('/api/v1/diagnostic/chat')
      .send({ message: 'My faucet is leaking' });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Diagnostic service is not configured');
  });

  it('streams SSE tokens and ends with [DONE]', async () => {
    const res = await request(app)
      .post('/api/v1/diagnostic/chat')
      .send({ message: 'My faucet is leaking' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');

    const lines = res.text.split('\n').filter((l: string) => l.startsWith('data: '));
    expect(lines.length).toBeGreaterThanOrEqual(3);

    expect(JSON.parse(lines[0].slice(6))).toEqual({ token: 'Hello ' });
    expect(JSON.parse(lines[1].slice(6))).toEqual({ token: 'world' });
    expect(lines[lines.length - 1]).toBe('data: [DONE]');
  });

  it('sends error SSE when stream throws mid-stream', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        stream: jest.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } };
            throw new Error('network fail');
          },
        }),
      },
    }));

    const res = await request(app)
      .post('/api/v1/diagnostic/chat')
      .send({ message: 'test error' });

    expect(res.status).toBe(200);
    const lines = res.text.split('\n').filter((l: string) => l.startsWith('data: '));
    const errorLine = lines.find((l: string) => l.includes('"error"'));
    expect(errorLine).toBeDefined();
  });
});
