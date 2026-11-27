import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAIReply } from './gemini';

const generate = vi.hoisted(() => vi.fn());
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: generate };
    }
  },
}));

const reply = JSON.stringify({
  reply: 'Which time works for you?',
  intent: 'BOOK_APPOINTMENT',
  confidence: 95,
  handoff: false,
});

describe('AI provider fallback', () => {
  beforeEach(() => {
    generate.mockReset();
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini');
    vi.stubEnv('GEMINI_MODELS', 'primary,secondary');
    vi.stubEnv('FREELLMAPI_API_KEY', '');
    vi.stubEnv('FREELLMAPI_BASE_URL', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('OPENAI_MODEL', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('routes exhausted Gemini requests through FreeLLMAPI before OpenAI', async () => {
    generate.mockRejectedValue({ status: 429 });
    vi.stubEnv('FREELLMAPI_API_KEY', 'test-free');
    vi.stubEnv('FREELLMAPI_BASE_URL', 'http://localhost:3001/v1');
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    vi.stubEnv('OPENAI_MODEL', 'test-model');
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ choices: [{ message: { content: reply } }] })
      );
    vi.stubGlobal('fetch', request);
    expect(await generateAIReply('I want an appointment')).toMatchObject({
      intent: 'BOOK_APPOINTMENT',
    });
    expect(request).toHaveBeenCalledOnce();
    const [url, options] = request.mock.calls[0];
    expect(url.href).toBe('http://localhost:3001/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-free');
    expect(JSON.parse(options.body).model).toBe('auto');
  });

  it('switches Gemini models after a rate limit', async () => {
    generate
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ response: { text: () => reply } });
    expect(await generateAIReply('I want an appointment')).toMatchObject({
      intent: 'BOOK_APPOINTMENT',
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('switches providers when Gemini outputs are unusable', async () => {
    generate.mockResolvedValue({
      response: { text: () => '{"intent":"unexpected"}' },
    });
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    vi.stubEnv('OPENAI_MODEL', 'test-model');
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ choices: [{ message: { content: reply } }] })
      );
    vi.stubGlobal('fetch', request);
    expect(await generateAIReply('I want an appointment')).toMatchObject({
      intent: 'BOOK_APPOINTMENT',
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('hands off after all configured models fail', async () => {
    generate.mockRejectedValue({ status: 503 });
    expect(await generateAIReply('Can we discuss this?')).toMatchObject({
      handoff: true,
      intent: 'HUMAN_SUPPORT',
    });
  });
});
