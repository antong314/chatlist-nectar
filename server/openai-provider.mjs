import { DIRECTORY_CATEGORIES } from './domain.mjs';

const DEFAULT_MODEL = 'gpt-5.6-luna';

const extractOutputText = (response) => {
  for (const item of response?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && content.text) return content.text;
    }
  }
  return null;
};

export class OpenAIProvider {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
    fetchImpl = fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }

  get enabled() {
    return Boolean(this.apiKey);
  }

  async structured({ instructions, input, name, schema }) {
    if (!this.enabled) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const response = await this.fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          instructions,
          input,
          reasoning: { effort: 'none' },
          store: false,
          text: {
            verbosity: 'low',
            format: {
              type: 'json_schema',
              name,
              schema,
              strict: true,
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI returned ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const payload = await response.json();
      const outputText = extractOutputText(payload);
      return outputText ? JSON.parse(outputText) : null;
    } catch (error) {
      console.warn('OpenAI classification unavailable; using deterministic fallback:', error.message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async inferCategory({ name, description }) {
    return this.structured({
      name: 'directory_category',
      instructions: [
        'Classify a community service provider into exactly one directory category.',
        'Use Service only when none of the specific categories is reasonably supported.',
        'Set needs_clarification true only when the description is genuinely ambiguous.',
        'Do not invent facts.',
      ].join(' '),
      input: `Provider: ${name || 'Unknown'}\nDescription: ${description}`,
      schema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: DIRECTORY_CATEGORIES },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          needs_clarification: { type: 'boolean' },
        },
        required: ['category', 'confidence', 'needs_clarification'],
        additionalProperties: false,
      },
    });
  }

  async classifyMessage(message) {
    return this.structured({
      name: 'bot_intent',
      instructions: [
        'Classify a WhatsApp message for a local community directory.',
        'The bot can add a phone contact, find providers by category, collect a review, explain its capabilities, or treat the message as other.',
        'Only extract a phone or name when explicitly present. Use empty strings when absent.',
      ].join(' '),
      input: message,
      schema: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            enum: ['add_contact', 'search_directory', 'leave_review', 'help', 'other'],
          },
          category: { type: 'string', enum: ['', ...DIRECTORY_CATEGORIES] },
          phone: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['intent', 'category', 'phone', 'name'],
        additionalProperties: false,
      },
    });
  }
}
