import 'dotenv/config';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MachuBot, hasReadableDocument, verifyContactMediaSignature } from './bot.mjs';
import { createVcard, messagesToTwiml } from './domain.mjs';
import { DirectoryStore } from './directory-store.mjs';
import { MAX_DOCUMENT_BYTES, extractDocumentText } from './documents.mjs';
import { WikiStore } from './wiki-store.mjs';
import { OpenAIProvider } from './openai-provider.mjs';
import { GroupDigest, backfillWindow } from './group-digest.mjs';
import { GroupDigestStore } from './group-digest-store.mjs';
import { TwilioNotifier } from './twilio-notifier.mjs';
import {
  CommunityVerificationService,
  verificationJsonError,
} from './community-verification.mjs';

const { validateRequest } = twilio;

const requiredEnvironment = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
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
const verifiedSessionCookie = 'machu_verified_session';
const verifiedSessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

const store = new DirectoryStore();
const wikiStore = new WikiStore();
const ai = new OpenAIProvider();
const adminSupabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const communityVerification = new CommunityVerificationService({
  supabase: adminSupabase,
  signingSecret,
  whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
});

const fetchTwilioMediaBytes = async (url, { maxBytes, timeoutMs, tooLarge }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    if (contentLength > maxBytes) throw new Error(tooLarge);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error(tooLarge);
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchTwilioMedia = async (url) => (await fetchTwilioMediaBytes(url, {
  maxBytes: 1_000_000,
  timeoutMs: 8_000,
  tooLarge: 'Contact card is too large',
})).toString('utf8');

const readTwilioDocument = async (url, contentType) => extractDocumentText(
  await fetchTwilioMediaBytes(url, {
    maxBytes: MAX_DOCUMENT_BYTES,
    timeoutMs: 30_000,
    tooLarge: 'Document is too large',
  }),
  contentType,
);

const digestAdminPhones = String(process.env.ADMIN_WHATSAPP || '')
  .split(',')
  .map((phone) => phone.trim())
  .filter(Boolean);
const digestSecret = process.env.DIGEST_SECRET || '';
const twilioNotifier = new TwilioNotifier();
const groupDigest = digestAdminPhones.length > 0
  ? new GroupDigest({
      store: new GroupDigestStore(),
      directory: store,
      wikiStore,
      ai: new OpenAIProvider({
        model: process.env.DIGEST_OPENAI_MODEL || 'gpt-6-luna',
        reasoningEffort: process.env.DIGEST_REASONING_EFFORT || 'medium',
        timeoutMs: 180_000,
      }),
      notifier: twilioNotifier,
      adminPhones: digestAdminPhones,
      mode: process.env.DIGEST_MODE || 'shadow',
      timeZone: process.env.DIGEST_TIMEZONE || 'America/Costa_Rica',
      digestHour: Number(process.env.DIGEST_HOUR || 6),
      templateSid: process.env.DIGEST_TEMPLATE_SID || '',
    })
  : null;

const bot = new MachuBot({
  store,
  wikiStore,
  ai,
  fetchMedia: fetchTwilioMedia,
  readDocument: readTwilioDocument,
  publicBaseUrl,
  signingSecret,
  digest: groupDigest,
});
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
    response.status(200).json(await handler(request, response));
  } catch (error) {
    const failure = verificationJsonError(error);
    response.status(failure.status).json({ error: failure.message });
  }
};

const readCookie = (request, name) => {
  const match = String(request.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return '';
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return '';
  }
};

const verifiedSessionCookieOptions = (request) => ({
  httpOnly: true,
  maxAge: verifiedSessionMaxAgeMs,
  path: '/',
  sameSite: 'strict',
  secure: request.secure || process.env.NODE_ENV === 'production',
});

const clearVerifiedSessionCookie = (request, response) => {
  const { maxAge: _maxAge, ...options } = verifiedSessionCookieOptions(request);
  response.clearCookie(verifiedSessionCookie, options);
};

app.get(
  '/bot/verify/session',
  verificationRoute(async (request, response) => {
    const sessionToken = readCookie(request, verifiedSessionCookie);
    const session = await communityVerification.getVerifiedSession(sessionToken);
    if (!session && sessionToken) {
      clearVerifiedSessionCookie(request, response);
    }
    return communityVerification.publicSession(session);
  }),
);

app.post(
  '/bot/verify/session/forget',
  verificationRoute(async (request, response) => {
    await communityVerification.revokeVerifiedSession(readCookie(request, verifiedSessionCookie));
    clearVerifiedSessionCookie(request, response);
    return { authenticated: false };
  }),
);

app.post(
  '/bot/verify/start',
  express.json({ limit: '256kb', type: 'application/json' }),
  verificationRoute(async (request) => {
    const verifiedSession = await communityVerification.getVerifiedSession(
      readCookie(request, verifiedSessionCookie),
    );
    return communityVerification.start({
      actionType: request.body?.actionType,
      payload: request.body?.payload,
      requestIp: request.ip,
      verifiedSession,
    });
  }),
);

app.post(
  '/bot/verify/check',
  express.json({ limit: '8kb', type: 'application/json' }),
  verificationRoute((request) => communityVerification.check({
    actionId: request.body?.actionId,
    actionToken: request.body?.actionToken,
  })),
);

app.post(
  '/bot/verify/status',
  express.json({ limit: '8kb', type: 'application/json' }),
  verificationRoute(async (request, response) => {
    const status = await communityVerification.status({
      actionId: request.body?.actionId,
      actionToken: request.body?.actionToken,
    });
    if (status.status === 'verified' || status.status === 'completed') {
      const { sessionToken } = await communityVerification.createVerifiedSessionForAction({
        actionId: request.body?.actionId,
        actionToken: request.body?.actionToken,
      });
      response.cookie(
        verifiedSessionCookie,
        sessionToken,
        verifiedSessionCookieOptions(request),
      );
    }
    return status;
  }),
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

app.post(
  '/bot/verify/provider/complete',
  express.json({ limit: '8kb', type: 'application/json' }),
  verificationRoute((request) => communityVerification.completeProviderWrite({
    actionId: request.body?.actionId,
    actionToken: request.body?.actionToken,
    imagePath: request.body?.imagePath,
  })),
);

app.post(
  '/bot/verify/provider/logo',
  express.raw({ limit: '5mb', type: ['image/jpeg', 'image/png', 'image/webp'] }),
  verificationRoute((request) => communityVerification.uploadProviderLogo({
    actionId: request.get('x-verification-action-id'),
    actionToken: request.get('x-verification-action-token'),
    contentType: request.get('content-type'),
    bytes: request.body,
  })),
);

app.post(
  '/bot/verify/wiki/complete',
  express.json({ limit: '256kb', type: 'application/json' }),
  verificationRoute((request) => communityVerification.completeWikiWrite({
    actionId: request.body?.actionId,
    actionToken: request.body?.actionToken,
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

    const approval = await communityVerification.approveInbound({
      body: request.body?.Body,
      senderPhone: request.body?.WaId || request.body?.From,
    });
    if (approval) {
      const isWikiApproval = String(approval.actionType || '').startsWith('wiki_');
      const actionLabels = {
        provider_create: 'provider recommendation',
        provider_update: 'provider update',
        provider_delete: 'provider removal',
        provider_review: 'review',
        wiki_create: 'wiki page',
        wiki_update: 'wiki update',
        wiki_delete: 'wiki page deletion',
      };
      let body;
      if (approval.approved) {
        const label = actionLabels[approval.actionType] || 'request';
        body = approval.alreadyApproved
          ? `Your ${label} is already verified 🌿 Return to San Mateo Love to finish.`
          : [
              `Verified 🌿 Return to San Mateo Love and your ${label} will finish automatically.`,
              '',
              isWikiApproval
                ? 'You can also chat with me anytime: ask a local question or tell me what the community wiki should add or update.'
                : 'You can also chat with me anytime: send a contact card to recommend a provider, or ask me to find local services.',
            ].join('\n');
      } else if (approval.reason === 'phone') {
        body = 'This request was already verified by a different WhatsApp number. Return to San Mateo Love and start a new request.';
      } else if (approval.reason === 'rate_limit') {
        body = 'Too many requests were verified from this number recently. Please wait and try again later.';
      } else if (approval.reason === 'expired') {
        body = 'That verification request has expired. Return to San Mateo Love and start it again.';
      } else {
        body = 'I could not verify that request. Return to San Mateo Love and create a new verification message.';
      }
      response.type('text/xml').send(messagesToTwiml([{ body }]));
      return;
    }

    // Reading a document can outlast Twilio's 15-second webhook timeout, so
    // acknowledge it now and reply through the API when it's done.
    if (hasReadableDocument(request.body)) {
      response.type('text/xml').send(messagesToTwiml([{ body: 'Reading your document 📄 I’ll reply in a moment.' }]));
      const to = request.body?.From;
      bot.handle(request.body)
        .catch((error) => {
          console.error('Machu document handling failed:', error);
          return [{ body: 'I hit a snag reading that document 🌱 Please try sending it again in a moment.' }];
        })
        .then(async (messages) => {
          for (const message of messages) {
            if (message.body) await twilioNotifier.send({ to, body: message.body });
          }
        })
        .catch((error) => console.error('Machu document reply failed:', error));
      return;
    }

    const messages = await bot.handle(request.body);
    response.type('text/xml').send(messagesToTwiml(messages));
  } catch (error) {
    console.error('Machu webhook error:', error);
    response.type('text/xml').send(messagesToTwiml([{
      body: 'I hit a little snag 🌱 Your message is safe—please try once more in a moment.',
    }]));
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

// Maintenance endpoints for the group digest, protected by DIGEST_SECRET.
const hasDigestSecret = (request) => {
  const provided = Buffer.from(String(request.get('x-digest-secret') || ''));
  const expected = Buffer.from(digestSecret);
  return digestSecret.length >= 32 && provided.length === expected.length && timingSafeEqual(provided, expected);
};

const digestRoute = (handler) => async (request, response) => {
  response.set('Cache-Control', 'no-store');
  if (!groupDigest || !hasDigestSecret(request)) {
    response.status(404).json({ error: 'Not found' });
    return;
  }
  try {
    response.json(await handler(request));
  } catch (error) {
    console.error('Group digest endpoint error:', error);
    response.status(500).json({ error: error.message });
  }
};

app.post('/internal/group-digest/run', digestRoute(async () => {
  groupDigest.run({ trigger: 'manual' }).catch((error) => console.error('Manual group digest failed:', error));
  return { started: true };
}));

app.post('/internal/group-digest/backfill', express.json(), digestRoute(async (request) => {
  const { from, to = from } = request.body ?? {};
  backfillWindow(from, to, groupDigest.timeZone);
  if (groupDigest.activeRun) return { started: false, reason: 'A digest is already running' };
  groupDigest.backfill({ from, to }).catch((error) => console.error('Group digest backfill failed:', error));
  return { started: true, from, to };
}));

app.get('/internal/group-digest/status', digestRoute(async () => {
  const [listener, groups, latestRun] = await Promise.all([
    groupDigest.store.getListenerStatus(),
    groupDigest.store.listGroups(),
    groupDigest.store.getLatestRun(),
  ]);
  return {
    mode: groupDigest.mode,
    model: groupDigest.ai.model,
    listener: listener && { status: listener.status, lastSeenAt: listener.last_seen_at, lastMessageAt: listener.last_message_at },
    groups: { joined: groups.length, enabled: groups.filter((group) => group.enabled).length },
    latestRun: latestRun && {
      runDate: latestRun.run_date, status: latestRun.status, stats: latestRun.stats, error: latestRun.error,
    },
  };
}));

app.post('/internal/group-digest/template', digestRoute(async () => twilioNotifier.createDigestTemplate()));

app.get('/internal/group-digest/template/:sid', digestRoute(async (request) => (
  twilioNotifier.getTemplateApproval(request.params.sid)
)));

if (groupDigest?.enabled) {
  const runDigestIfDue = () => {
    groupDigest.runIfDue().catch((error) => console.error('Scheduled group digest failed:', error));
  };
  setTimeout(runDigestIfDue, 60_000).unref();
  setInterval(runDigestIfDue, 10 * 60_000).unref();
}

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(serverDirectory, '../dist');
if (!existsSync(distDirectory)) throw new Error('The frontend build is missing. Run npm run build first.');

app.use(express.static(distDirectory, { index: false }));
app.use((_request, response) => response.sendFile(path.join(distDirectory, 'index.html')));

app.listen(port, () => {
  console.log(`San Mateo Love and Machu are listening on port ${port}`);
});
