import { generateScripts, clearTemplateCache } from '../generation';
import { GenerateScriptsParams } from '../../../types/scripts';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@anthropic-ai/sdk', () => {
  const create = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ messages: { create } })),
    _create: create, // expose for assertions
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: Anthropic, _create: mockCreate } = require('@anthropic-ai/sdk') as {
  default: jest.Mock;
  _create: jest.Mock;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PARAMS: GenerateScriptsParams = {
  jobId: 'job-123',
  providerId: 'prov-456',
  providerName: 'Acme Plumbing',
  category: 'plumbing',
  severity: 'high',
  summary: 'Burst pipe under kitchen sink causing active water leak',
  recommendedActions: ['Shut off water main', 'Replace pipe section'],
  budget: '$200–$500',
  zipCode: '90210',
  timing: 'asap',
};

function makeToolUseResponse(voice: string, sms: string, web: string) {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'generate_scripts',
        input: { voice, sms, web },
        id: 'tu_001',
      },
    ],
    stop_reason: 'tool_use',
  };
}

const MOCK_TEMPLATES = {
  voice:
    'Hi {{provider_name}}, this is Homie calling about a {{category}} job in {{zip_code}}. {{summary}}. Budget is {{budget}}. Reply 1 to accept. Call back: {{callback_number}}.',
  sms: '{{category}} job in {{zip_code}}, budget {{budget}}. Accept: {{accept_link}}',
  web: 'Hello {{provider_name}}, we have a {{category}} job near {{zip_code}}. {{summary}} Budget: {{budget}}. View details: {{job_link}}',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks();
  clearTemplateCache();
  Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateScripts', () => {
  it('calls Claude with the correct model and tool_choice', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(MOCK_TEMPLATES.voice, MOCK_TEMPLATES.sms, MOCK_TEMPLATES.web));

    await generateScripts(BASE_PARAMS);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe('claude-opus-4-6');
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'generate_scripts' });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe('generate_scripts');
  });

  it('returns interpolated voice/sms/web scripts with job-specific values', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(MOCK_TEMPLATES.voice, MOCK_TEMPLATES.sms, MOCK_TEMPLATES.web));

    const bundle = await generateScripts(BASE_PARAMS);

    expect(bundle.job_id).toBe('job-123');
    expect(bundle.provider_id).toBe('prov-456');

    // Provider name interpolated
    expect(bundle.voice).toContain('Acme Plumbing');
    expect(bundle.web).toContain('Acme Plumbing');

    // Category, zip, budget interpolated in all channels
    expect(bundle.voice).toContain('plumbing');
    expect(bundle.voice).toContain('90210');
    expect(bundle.voice).toContain('$200–$500');

    expect(bundle.sms).toContain('plumbing');
    expect(bundle.sms).toContain('90210');
    expect(bundle.sms).toContain('$200–$500');

    expect(bundle.web).toContain('90210');
    expect(bundle.web).toContain('$200–$500');

    // Links contain provider and job IDs
    expect(bundle.sms).toContain('prov-456');
    expect(bundle.sms).toContain('job-123');
    expect(bundle.web).toContain('prov-456');
    expect(bundle.web).toContain('job-123');
  });

  it('includes generated_at timestamp', async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(MOCK_TEMPLATES.voice, MOCK_TEMPLATES.sms, MOCK_TEMPLATES.web));

    const before = new Date().toISOString();
    const bundle = await generateScripts(BASE_PARAMS);
    const after = new Date().toISOString();

    expect(bundle.generated_at >= before).toBe(true);
    expect(bundle.generated_at <= after).toBe(true);
  });

  it('caches the template — only calls Claude once for same category+severity', async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse(MOCK_TEMPLATES.voice, MOCK_TEMPLATES.sms, MOCK_TEMPLATES.web));

    await generateScripts(BASE_PARAMS);
    await generateScripts({ ...BASE_PARAMS, jobId: 'job-999', providerId: 'prov-999', providerName: 'Bob Plumbing' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('calls Claude again for a different category', async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse(MOCK_TEMPLATES.voice, MOCK_TEMPLATES.sms, MOCK_TEMPLATES.web));

    await generateScripts(BASE_PARAMS); // plumbing:high
    await generateScripts({ ...BASE_PARAMS, category: 'electrical' }); // electrical:high

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('calls Claude again for a different severity', async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse(MOCK_TEMPLATES.voice, MOCK_TEMPLATES.sms, MOCK_TEMPLATES.web));

    await generateScripts(BASE_PARAMS); // plumbing:high
    await generateScripts({ ...BASE_PARAMS, severity: 'low' }); // plumbing:low

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('uses fresh cache after clearTemplateCache', async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse(MOCK_TEMPLATES.voice, MOCK_TEMPLATES.sms, MOCK_TEMPLATES.web));

    await generateScripts(BASE_PARAMS);
    clearTemplateCache();
    await generateScripts(BASE_PARAMS);

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws when Claude does not call the tool', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I cannot help with that.' }],
      stop_reason: 'end_turn',
    });

    await expect(generateScripts(BASE_PARAMS)).rejects.toThrow(
      'Claude did not call the generate_scripts tool',
    );
  });

  it('throws when tool response is missing required fields', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'generate_scripts',
          input: { voice: 'hi', sms: '' /* missing web */ },
          id: 'tu_002',
        },
      ],
      stop_reason: 'tool_use',
    });

    await expect(generateScripts(BASE_PARAMS)).rejects.toThrow(
      'generate_scripts tool response is missing required fields',
    );
  });

  it('leaves unknown placeholders intact', async () => {
    const templateWithUnknown = 'Hello {{unknown_var}} and {{provider_name}}';
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(templateWithUnknown, MOCK_TEMPLATES.sms, MOCK_TEMPLATES.web));

    const bundle = await generateScripts(BASE_PARAMS);

    expect(bundle.voice).toContain('{{unknown_var}}');
    expect(bundle.voice).toContain('Acme Plumbing');
  });
});
