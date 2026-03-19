import { validateEnv } from '../env';

const ENV_BACKUP = { ...process.env };

beforeEach(() => {
  process.env = {
    ...ENV_BACKUP,
    DATABASE_URL: 'postgres://localhost:5432/test',
    JWT_SECRET: 'a-secret-that-is-at-least-32-characters-long',
  };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(() => {
  process.env = ENV_BACKUP;
  jest.restoreAllMocks();
});

describe('validateEnv', () => {
  it('passes when all required vars are set', () => {
    validateEnv();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('exits when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL'));
  });

  it('exits when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    validateEnv();
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'));
  });

  it('warns about optional vars that are not set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    validateEnv();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY'));
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('warns when JWT_SECRET is shorter than 32 chars', () => {
    process.env.JWT_SECRET = 'short';
    validateEnv();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('shorter than 32'));
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('does not warn about optional vars that are set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_PHONE_NUMBER = '+1234';
    process.env.SENDGRID_API_KEY = 'SG123';
    process.env.SENDGRID_FROM_EMAIL = 'a@b.c';
    process.env.GOOGLE_MAPS_API_KEY = 'AIza';
    process.env.YELP_API_KEY = 'yelp';
    process.env.WEBHOOK_SECRET = 'secret';
    process.env.CALLBACK_PHONE = '+1800';
    process.env.PORT = '3001';
    process.env.API_BASE_URL = 'https://api.homie.app';

    validateEnv();
    // Should only get the short JWT warning (since warn mock already captures)
    const warnCalls = (console.warn as jest.Mock).mock.calls;
    const optionalWarning = warnCalls.find((c: string[]) => c[0]?.includes('Optional variables'));
    expect(optionalWarning).toBeUndefined();
  });
});
