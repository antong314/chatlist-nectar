import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MachuBot, verifyContactMediaSignature } from './bot.mjs';
import { createVcard, messagesToTwiml } from './domain.mjs';
import { DirectoryStore } from './directory-store.mjs';
import { OpenAIProvider } from './openai-provider.mjs';
import {
  CommunityVerificationService,
  verificationJsonError,
} from './community-verification.mjs';

const { validateRequest } = twilio;

const requiredEnvironment = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'TWILIO_VERIFY_SERVICE_SID',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
if (missingEnvironment.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
}

const port = Number(process.env.PORT || 3000);
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'https://www.sanmateo.love').replace(/\/$/, '');
const webhookUrl = process.env.TWILIO_WEBHOOK_URL || `${publicBaseUrl}/bot`;
const signingSecret = process.env.BOT_SIGNING_SECRET || process.env.TWILIO_AUTH_TOKEN;
const validateTwilioSignatures = process.env.TWILIO_VALIDATE_SIGNATURE !== 'false';

const store = new DirectoryStore();
const ai = new OpenAIProvider();
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const adminSupabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const communityVerification = new CommunityVerificationService({
  supabase: adminSupabase,
  twilioClient,
  verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
  signingSecret,
});

const fetchTwilioMedia = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const credentials = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
    ).toString('base64');
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Twilio media returned ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 1_000_000) throw new Error('Contact card is too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 1_000_000) throw new Error('Contact card is too large');
    return buffer.toString('utf8');
  } finally {
    clearTimeout(timeout);
  }
};

const bot = new MachuBot({ store, ai, fetchMedia: fetchTwilioMedia, publicBaseUrl, signingSecret });
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.get('/healthz', (_request, response) => {
  response.json({ ok: true, service: 'sanmateo-love', bot: 'Machu' });
});

app.get('/bot', (_request, response) => {
  response.json({
    ok: true,
    bot: 'Machu',
    webhook: '/bot',
    directory: `${publicBaseUrl}/`,
    directoryFooter: true,
  });
});

const verificationRoute = (handler) => async (request, response) => {
  response.set('Cache-Control', 'no-store');
  try {
    response.status(200).json(await handler(request));
  } catch (error) {
    const failure = verificationJsonError(error);
    response.status(failure.status).json({ error: failure.message });
  }
};

app.post(
  '/bot/verify/start',
  express.json({ limit: '16kb', type: 'application/json' }),
  verificationRoute((request) => communityVerification.start({
    actionType: request.body?.actionType,
    phone: request.body?.phone,
    payload: request.body?.payload,
    requestIp: request.ip,
  })),
);

app.post(
  '/bot/verify/check',
  express.json({ limit: '8kb', type: 'application/json' }),
  verificationRoute((request) => communityVerification.check({
    actionId: request.body?.actionId,
    actionToken: request.body?.actionToken,
    code: request.body?.code,
  })),
);

app.post(
  '/bot/verify/review/complete',
  express.json({ limit: '8kb', type: 'application/json' }),
  verificationRoute((request) => communityVerification.completeReview({
    actionId: request.body?.actionId,
    actionToken: request.body?.actionToken,
    imagePaths: request.body?.imagePaths,
  })),
);

app.post('/bot', express.urlencoded({ extended: false, limit: '256kb' }), async (request, response) => {
  try {
    if (validateTwilioSignatures) {
      const signature = request.get('x-twilio-signature') || '';
      if (!validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, webhookUrl, request.body)) {
        response.status(403).type('text/plain').send('Invalid Twilio signature');
        return;
      }
    }

    const messages = await bot.handle(request.body);
    response.type('text/xml').send(messagesToTwiml(messages));
  } catch (error) {
    console.error('Machu webhook error:', error);
    response.type('text/xml').send(messagesToTwiml(bot.withDirectoryFooter([{
      body: 'I hit a little snag 🌱 Your message is safe—please try once more in a moment.',
    }])));
  }
});

app.get('/bot/contact/:contactId.vcf', async (request, response) => {
  try {
    const { contactId } = request.params;
    if (!verifyContactMediaSignature(contactId, request.query.token, signingSecret)) {
      response.status(403).type('text/plain').send('Invalid contact link');
      return;
    }
    const contact = await store.getContact(contactId);
    if (!contact) {
      response.status(404).type('text/plain').send('Contact not found');
      return;
    }
    response
      .set('Content-Type', 'text/vcard; charset=utf-8')
      .set('Content-Disposition', 'inline; filename="contact.vcf"')
      .set('Cache-Control', 'public, max-age=300')
      .send(createVcard(contact));
  } catch (error) {
    console.error('Machu vCard error:', error);
    response.status(500).type('text/plain').send('Unable to create contact card');
  }
});

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(serverDirectory, '../dist');
if (!existsSync(distDirectory)) throw new Error('The frontend build is missing. Run npm run build first.');

app.use(express.static(distDirectory, { index: false }));
app.use((_request, response) => response.sendFile(path.join(distDirectory, 'index.html')));

app.listen(port, () => {
  console.log(`San Mateo Love and Machu are listening on port ${port}`);
});
