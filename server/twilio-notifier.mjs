// Outbound WhatsApp messages from Machu. Machu normally replies inside a
// Twilio webhook; the group digest also needs to start conversations with the
// administrator, which requires the REST API and, outside WhatsApp's 24-hour
// customer-service window, an approved message template.

export const DIGEST_TEMPLATE_NAME = 'machu_daily_digest';
export const DIGEST_TEMPLATE_BODY = 'Your Machu daily digest is ready: {{1}} directory changes, {{2}} wiki updates, and {{3}} items waiting for your review. Reply "digest" to see the details.';

const withWhatsappPrefix = (value) => {
  const text = String(value ?? '').trim();
  return text.toLowerCase().startsWith('whatsapp:') ? text : `whatsapp:${text}`;
};

export class TwilioNotifier {
  constructor({
    accountSid = process.env.TWILIO_ACCOUNT_SID,
    authToken = process.env.TWILIO_AUTH_TOKEN,
    from = process.env.TWILIO_WHATSAPP_FROM,
    fetchImpl = fetch,
  } = {}) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.from = from;
    this.fetch = fetchImpl;
  }

  get authorization() {
    return `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`;
  }

  async request(url, { method = 'GET', form, json } = {}) {
    const headers = { Authorization: this.authorization };
    let body;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    } else if (json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const response = await this.fetch(url, { method, headers, body });
    const text = await response.text();
    if (!response.ok) throw new Error(`Twilio returned ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  // Sends free-form text, or a template when contentSid is given.
  async send({ to, body, contentSid, contentVariables }) {
    const form = { From: withWhatsappPrefix(this.from), To: withWhatsappPrefix(to) };
    if (contentSid) {
      form.ContentSid = contentSid;
      form.ContentVariables = JSON.stringify(contentVariables ?? {});
    } else {
      form.Body = body;
    }
    const message = await this.request(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      { method: 'POST', form },
    );
    return { sid: message.sid, status: message.status };
  }

  // Creates the daily digest template and submits it for WhatsApp approval.
  async createDigestTemplate() {
    const content = await this.request('https://content.twilio.com/v1/Content', {
      method: 'POST',
      json: {
        friendly_name: DIGEST_TEMPLATE_NAME,
        language: 'en',
        variables: { 1: '3', 2: '1', 3: '2' },
        types: { 'twilio/text': { body: DIGEST_TEMPLATE_BODY } },
      },
    });
    const approval = await this.request(
      `https://content.twilio.com/v1/Content/${content.sid}/ApprovalRequests/whatsapp`,
      { method: 'POST', json: { name: DIGEST_TEMPLATE_NAME, category: 'UTILITY' } },
    );
    return { sid: content.sid, approval };
  }

  async getTemplateApproval(contentSid) {
    if (!/^HX[0-9a-f]{32}$/i.test(String(contentSid ?? ''))) throw new Error('Invalid template SID');
    return this.request(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`);
  }
}
