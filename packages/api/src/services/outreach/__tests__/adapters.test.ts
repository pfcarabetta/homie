import { VoiceAdapter } from '../voice';
import { SmsAdapter } from '../sms';
import { WebAdapter } from '../web';
import { OutreachPayload } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// jest.mock factories are hoisted above all variable declarations, so we cannot
// reference module-level `const` from within the factory. Instead we attach the
// inner mocks to the module's default export so tests can access them via require.

jest.mock('twilio', () => {
  const callsCreate = jest.fn().mockResolvedValue({ sid: 'CAtest' });
  const messagesCreate = jest.fn().mockResolvedValue({ sid: 'SMtest' });

  const twimlVoiceInstance = {
    gather: jest.fn().mockReturnValue({ say: jest.fn() }),
    say: jest.fn(),
    toString: jest.fn().mockReturnValue('<Response/>'),
  };

  const twiml = {
    VoiceResponse: jest.fn().mockImplementation(() => twimlVoiceInstance),
  };

  const factory = Object.assign(
    jest.fn().mockReturnValue({ calls: { create: callsCreate }, messages: { create: messagesCreate } }),
    {
      twiml,
      validateRequest: jest.fn().mockReturnValue(true),
      // Expose internal mocks so tests can access and re-configure them
      _callsCreate: callsCreate,
      _messagesCreate: messagesCreate,
    },
  );

  return { __esModule: true, default: factory };
});

jest.mock('@sendgrid/mail', () => {
  const send = jest.fn().mockResolvedValue([{ statusCode: 202 }]);
  return { __esModule: true, default: { setApiKey: jest.fn(), send, _send: send } };
});

// ─── Access internal mocks ────────────────────────────────────────────────────

type TwilioMock = jest.Mock & {
  twiml: { VoiceResponse: jest.Mock };
  validateRequest: jest.Mock;
  _callsCreate: jest.Mock;
  _messagesCreate: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const twilioMod = require('twilio').default as TwilioMock;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sgMod = require('@sendgrid/mail').default as Record<string, jest.Mock>;

let mockCallsCreate: jest.Mock;
let mockMessagesCreate: jest.Mock;
let mockSgSend: jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE: OutreachPayload = {
  attemptId: 'aaaa-0001',
  jobId: 'job-0001',
  providerId: 'prov-0001',
  providerName: 'Acme Plumbing',
  phone: '+15551234567',
  email: 'info@acmeplumbing.com',
  website: 'https://acmeplumbing.com',
  script: 'Hi Acme, we have a plumbing job near you.',
  channel: 'voice',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

const ENV_BACKUP = process.env;

beforeEach(() => {
  jest.resetAllMocks();

  // Re-establish mock implementations cleared by resetAllMocks
  mockCallsCreate = twilioMod._callsCreate;
  mockCallsCreate.mockResolvedValue({ sid: 'CAtest' });

  mockMessagesCreate = twilioMod._messagesCreate;
  mockMessagesCreate.mockResolvedValue({ sid: 'SMtest' });

  // Restore the twilio() factory so it returns the client again
  twilioMod.mockReturnValue({ calls: { create: mockCallsCreate }, messages: { create: mockMessagesCreate } });
  twilioMod.validateRequest.mockReturnValue(true);
  twilioMod.twiml.VoiceResponse.mockImplementation(() => ({
    gather: jest.fn().mockReturnValue({ say: jest.fn() }),
    say: jest.fn(),
    toString: jest.fn().mockReturnValue('<Response/>'),
  }));

  mockSgSend = sgMod._send;
  mockSgSend.mockResolvedValue([{ statusCode: 202 }]);
  sgMod.setApiKey.mockImplementation(() => undefined);
  sgMod.send = mockSgSend;

  process.env = {
    ...ENV_BACKUP,
    TWILIO_ACCOUNT_SID: 'ACtest',
    TWILIO_AUTH_TOKEN: 'authtest',
    TWILIO_PHONE_NUMBER: '+18005550100',
    SENDGRID_API_KEY: 'SG.test',
    SENDGRID_FROM_EMAIL: 'noreply@homie.app',
    API_BASE_URL: 'https://api.homie.app',
    WEBHOOK_SECRET: 'testsecret',
  };
});

afterAll(() => {
  process.env = ENV_BACKUP;
});

// ─── VoiceAdapter ─────────────────────────────────────────────────────────────

describe('VoiceAdapter', () => {
  it('returns failed when phone is null', async () => {
    const result = await new VoiceAdapter().send({ ...BASE, phone: null, channel: 'voice' });
    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('phone') });
  });

  it('returns failed when Twilio credentials are missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    const result = await new VoiceAdapter().send({ ...BASE, channel: 'voice' });
    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('credentials') });
  });

  it('calls twilio.calls.create with correct to/from', async () => {
    const result = await new VoiceAdapter().send({ ...BASE, channel: 'voice' });
    expect(result.status).toBe('pending');
    expect(mockCallsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+15551234567', from: '+18005550100' }),
    );
  });

  it('includes the attemptId in the gather action URL', async () => {
    let gatherMock!: jest.Mock;
    twilioMod.twiml.VoiceResponse.mockImplementationOnce(() => {
      gatherMock = jest.fn().mockReturnValue({ say: jest.fn() });
      return { gather: gatherMock, say: jest.fn(), toString: jest.fn().mockReturnValue('<Response/>') };
    });

    await new VoiceAdapter().send({ ...BASE, channel: 'voice' });

    expect(gatherMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.stringContaining(BASE.attemptId) }),
    );
  });

  it('includes the attemptId in the status callback URL', async () => {
    await new VoiceAdapter().send({ ...BASE, channel: 'voice' });
    const call = mockCallsCreate.mock.calls[0][0] as Record<string, string>;
    expect(call.statusCallback).toContain(BASE.attemptId);
  });

  it('returns failed when twilio.calls.create throws', async () => {
    mockCallsCreate.mockRejectedValueOnce(new Error('Twilio network error'));
    const result = await new VoiceAdapter().send({ ...BASE, channel: 'voice' });
    expect(result).toEqual({ status: 'failed', error: 'Twilio network error' });
  });
});

// ─── SmsAdapter ───────────────────────────────────────────────────────────────

describe('SmsAdapter', () => {
  it('returns failed when phone is null', async () => {
    const result = await new SmsAdapter().send({ ...BASE, phone: null, channel: 'sms' });
    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('phone') });
  });

  it('returns failed when Twilio credentials are missing', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const result = await new SmsAdapter().send({ ...BASE, channel: 'sms' });
    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('credentials') });
  });

  it('calls twilio.messages.create with correct params', async () => {
    const result = await new SmsAdapter().send({ ...BASE, channel: 'sms' });
    expect(result.status).toBe('pending');
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+15551234567', from: '+18005550100', body: BASE.script }),
    );
  });

  it('includes the attemptId in the statusCallback URL', async () => {
    await new SmsAdapter().send({ ...BASE, channel: 'sms' });
    const call = mockMessagesCreate.mock.calls[0][0] as Record<string, string>;
    expect(call.statusCallback).toContain(BASE.attemptId);
  });

  it('returns failed when twilio.messages.create throws', async () => {
    mockMessagesCreate.mockRejectedValueOnce(new Error('SMS quota exceeded'));
    const result = await new SmsAdapter().send({ ...BASE, channel: 'sms' });
    expect(result).toEqual({ status: 'failed', error: 'SMS quota exceeded' });
  });
});

// ─── WebAdapter ───────────────────────────────────────────────────────────────

describe('WebAdapter', () => {
  it('returns failed when email is null', async () => {
    const result = await new WebAdapter().send({ ...BASE, email: null, channel: 'web' });
    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('email') });
  });

  it('returns failed when SendGrid credentials are missing', async () => {
    delete process.env.SENDGRID_API_KEY;
    const result = await new WebAdapter().send({ ...BASE, channel: 'web' });
    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('credentials') });
  });

  it('calls sgMail.send with correct to/from/subject', async () => {
    const result = await new WebAdapter().send({ ...BASE, channel: 'web' });
    expect(result.status).toBe('pending');
    expect(mockSgSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'info@acmeplumbing.com',
        from: 'noreply@homie.app',
        subject: expect.stringContaining('job opportunity'),
        text: BASE.script,
      }),
    );
  });

  it('includes accept and decline links in the HTML body', async () => {
    await new WebAdapter().send({ ...BASE, channel: 'web' });
    const call = mockSgSend.mock.calls[0][0] as { html: string };
    expect(call.html).toContain('action=accept');
    expect(call.html).toContain('action=decline');
    expect(call.html).toContain(BASE.attemptId);
  });

  it('returns failed when sgMail.send throws', async () => {
    mockSgSend.mockRejectedValueOnce(new Error('SendGrid rate limit'));
    const result = await new WebAdapter().send({ ...BASE, channel: 'web' });
    expect(result).toEqual({ status: 'failed', error: 'SendGrid rate limit' });
  });
});
