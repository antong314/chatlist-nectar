export const DIRECTORY_CATEGORIES = [
  'Construction',
  'Mechanic',
  'Taxi',
  'Tow Truck',
  'Groceries',
  'Healer',
  'Creative',
  'Retreats',
  'Service',
];

export const CATEGORY_LABELS = {
  Construction: 'home & repairs',
  Mechanic: 'mechanics',
  Taxi: 'taxis & drivers',
  'Tow Truck': 'towing',
  Groceries: 'food & groceries',
  Healer: 'wellness',
  Creative: 'creative',
  Retreats: 'retreats & stays',
  Service: 'general services',
};

const CATEGORY_ALIASES = {
  Construction: [
    'construction', 'builder', 'building', 'repair', 'repairs', 'home repair',
    'plumber', 'plumbing', 'electrician', 'carpenter', 'roof', 'contractor',
    'construccion', 'construcción', 'reparacion', 'reparación', 'plomero',
    'fontanero', 'electricista', 'carpintero', 'albanil', 'albañil',
  ],
  Mechanic: [
    'mechanic', 'mechanics', 'car repair', 'auto repair', 'motorcycle repair',
    'mecánico', 'mecanico', 'taller', 'automotriz', 'moto repair',
  ],
  Taxi: [
    'taxi', 'taxis', 'driver', 'drivers', 'transport', 'transportation',
    'airport ride', 'shuttle', 'chofer', 'conductor', 'transporte', 'traslado',
  ],
  'Tow Truck': ['tow truck', 'towing', 'tow', 'grua', 'grúa', 'remolque'],
  Groceries: [
    'grocery', 'groceries', 'food', 'market', 'deli', 'restaurant', 'bakery',
    'organic produce', 'comida', 'alimentos', 'mercado', 'pulperia', 'pulpería',
    'panaderia', 'panadería', 'verduras', 'frutas',
  ],
  Healer: [
    'wellness', 'massage', 'masseuse', 'therapy', 'therapist', 'physiotherapy',
    'doctor', 'healer', 'healing', 'yoga', 'pilates', 'acupuncture', 'dentist',
    'fisioterapia', 'fisioterapeuta', 'masaje', 'terapia', 'salud', 'bienestar',
    'medico', 'médico', 'dentista',
  ],
  Creative: [
    'creative', 'artist', 'art', 'designer', 'design', 'photographer',
    'photography', 'music', 'musician', 'video', 'fotografia', 'fotografía',
    'diseno', 'diseño', 'arte', 'musica', 'música',
  ],
  Retreats: [
    'retreat', 'hotel', 'hostel', 'lodging', 'stay', 'rental', 'cabina', 'finca',
    'airbnb', 'accommodation', 'hospedaje', 'alojamiento', 'retiro', 'alquiler',
  ],
  Service: ['service', 'services', 'servicio', 'servicios'],
};

const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const normalizePhone = (value, defaultCountryCode = '506') => {
  let digits = String(value ?? '').replace(/^whatsapp:/i, '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8 && defaultCountryCode) digits = `${defaultCountryCode}${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
};

export const extractPhoneFromText = (value) => {
  const text = String(value ?? '');
  const candidates = text.match(/(?:\+|00)?\d[\d\s().-]{6,}\d/g) ?? [];
  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    if (normalized) return { raw: candidate, normalized };
  }
  return null;
};

const decodeVcardValue = (value) => cleanText(
  String(value ?? '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\'),
);

const unfoldVcard = (value) => String(value ?? '').replace(/\r?\n[ \t]/g, '');

export const parseVcards = (value) => {
  const cards = unfoldVcard(value).match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];
  return cards.map((card) => {
    const fields = new Map();
    for (const line of card.split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const rawKey = line.slice(0, separator);
      const key = rawKey.split(';')[0].toUpperCase();
      const fieldValue = decodeVcardValue(line.slice(separator + 1));
      if (!fields.has(key)) fields.set(key, []);
      fields.get(key).push(fieldValue);
    }

    const formattedName = fields.get('FN')?.[0];
    const structuredName = fields.get('N')?.[0]
      ?.split(';')
      .filter(Boolean)
      .reverse()
      .join(' ');
    const organization = fields.get('ORG')?.[0]?.split(';')[0];
    const phone = (fields.get('TEL') ?? [])
      .map((candidate) => normalizePhone(candidate.replace(/^tel:/i, '')))
      .find(Boolean);

    return {
      name: formattedName || structuredName || organization || phone || 'Community contact',
      phone,
    };
  }).filter((card) => card.phone);
};

export const inferCategoryHeuristically = (description) => {
  const normalized = cleanText(description).toLocaleLowerCase();
  const scored = DIRECTORY_CATEGORIES.map((category) => ({
    category,
    score: CATEGORY_ALIASES[category].reduce(
      (score, alias) => score + (normalized.includes(alias.toLocaleLowerCase()) ? 1 : 0),
      0,
    ),
  })).sort((left, right) => right.score - left.score);

  const [best, second] = scored;
  if (!best || best.score === 0 || (second && best.score === second.score)) {
    return { category: 'Service', confidence: 0.35, needsClarification: true };
  }

  return {
    category: best.category,
    confidence: best.score > 1 ? 0.92 : 0.8,
    needsClarification: false,
  };
};

export const parseCategoryReply = (value) => {
  const normalized = cleanText(value).toLocaleLowerCase();
  if (!normalized) return null;
  for (const category of DIRECTORY_CATEGORIES) {
    const candidates = [category, CATEGORY_LABELS[category], ...CATEGORY_ALIASES[category]];
    if (candidates.some((candidate) => normalized === candidate.toLocaleLowerCase())) return category;
  }
  return null;
};

const REVIEW_PREFIX = /^(?:review\s*)?(?:rating\s*)?([1-5])(?:\s*(?:\/\s*5|stars?|estrellas?|⭐)\s*)?[:—–,-]?\s*(.*)$/i;

export const parseReview = (value) => {
  const normalized = cleanText(value);
  const starEmojiCount = (normalized.match(/⭐/g) ?? []).length;
  if (starEmojiCount >= 1 && starEmojiCount <= 5 && normalized.replace(/⭐/g, '').trim()) {
    return { rating: starEmojiCount, comment: normalized.replace(/⭐/g, '').trim() || null };
  }
  if (/^⭐{1,5}$/.test(normalized)) return { rating: starEmojiCount, comment: null };

  const match = normalized.match(REVIEW_PREFIX);
  if (!match) return null;
  const explicitlyReviewLike = /\b(review|rating|stars?|estrellas?)\b/i.test(normalized)
    || /^\s*[1-5]\s*(?:\/\s*5|⭐)/.test(normalized);
  if (!explicitlyReviewLike && !match[2]) return null;
  return { rating: Number(match[1]), comment: cleanText(match[2]) || null };
};

export const detectSearchCategory = (value) => {
  const normalized = cleanText(value).toLocaleLowerCase();
  const looksLikeSearch = /\b(send|show|find|search|looking|need|recommend|give|all|any|buscar|busco|necesito|manda|enviar|contactos?)\b/i.test(normalized);
  if (!looksLikeSearch) return null;

  for (const category of DIRECTORY_CATEGORIES) {
    const candidates = [category, CATEGORY_LABELS[category], ...CATEGORY_ALIASES[category]];
    if (candidates.some((candidate) => normalized.includes(candidate.toLocaleLowerCase()))) return category;
  }
  return null;
};

export const detectAddRequest = (value, senderPhone, profileName) => {
  const text = cleanText(value);
  if (!/\b(add|save|list|include|agrega|agregar|anade|añade|incluir)\b/i.test(text)) return null;

  const wantsOwnNumber = /\b(my|mine|me|mi|mio|mío)\b/i.test(text) && /\b(number|phone|numero|número|telefono|teléfono)\b/i.test(text);
  const extracted = wantsOwnNumber
    ? { raw: '', normalized: normalizePhone(senderPhone) }
    : extractPhoneFromText(text);
  if (!extracted?.normalized) return null;

  const name = cleanText(
    text
      .replace(extracted.raw || '', ' ')
      .replace(/\b(please|por favor|add|save|list|include|agrega|agregar|anade|añade|incluir|this|my|mine|me|number|phone|numero|número|telefono|teléfono|to the directory|al directorio)\b/gi, ' ')
      .replace(/["“”']/g, ' '),
  );

  return {
    phone: extracted.normalized,
    name: name || cleanText(profileName) || extracted.normalized,
  };
};

const escapeVcard = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

export const createVcard = (contact) => {
  const name = cleanText(contact.title || contact.name || 'San Mateo contact');
  const phone = normalizePhone(contact.phone_number || contact.phone) || cleanText(contact.phone_number || contact.phone);
  const description = cleanText(contact.subtitle || contact.description);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVcard(name)}`,
    `N:;${escapeVcard(name)};;;`,
    `TEL;TYPE=CELL:${escapeVcard(phone)}`,
  ];
  if (description) lines.push(`NOTE:${escapeVcard(description)}`);
  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
};

export const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const messagesToTwiml = (messages) => {
  const body = messages.map((message) => {
    const content = [];
    if (message.body) content.push(`<Body>${escapeXml(message.body)}</Body>`);
    if (message.mediaUrl) content.push(`<Media>${escapeXml(message.mediaUrl)}</Media>`);
    return `<Message>${content.join('')}</Message>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
};
