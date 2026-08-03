import { Contact } from '@/types/contact';

const SEARCH_SYNONYM_GROUPS = [
  ['plumber', 'plumbing', 'plomero', 'fontanero', 'pipe', 'leak', 'fuga'],
  ['electrician', 'electrical', 'electricista', 'electricidad'],
  ['mechanic', 'mecanico', 'mechanics', 'garage', 'taller', 'auto', 'car', 'repair'],
  ['tow', 'towing', 'tow truck', 'grua'],
  ['taxi', 'ride', 'driver', 'transportation', 'transporte', 'chofer'],
  ['food', 'groceries', 'grocery', 'comida', 'mercado', 'supermarket', 'produce'],
  ['doctor', 'medical', 'medico', 'clinic', 'clinica', 'health', 'salud'],
  ['dentist', 'dental', 'dentista'],
  ['lawyer', 'legal', 'attorney', 'abogado'],
  ['construction', 'builder', 'contractor', 'construccion', 'construir', 'home repair', 'house repair', 'reparacion'],
  ['cleaner', 'cleaning', 'housekeeping', 'limpieza'],
  ['gardener', 'gardening', 'landscaping', 'jardinero', 'jardineria'],
  ['massage', 'masaje'],
  ['wellness', 'healer', 'therapy', 'therapist', 'bienestar', 'terapia'],
  ['photographer', 'photography', 'photo', 'fotografo', 'fotografia', 'foto'],
  ['creative', 'artist', 'art', 'creativo', 'artista', 'arte'],
  ['retreat', 'lodging', 'hotel', 'cabin', 'alojamiento', 'cabina'],
  ['restaurant', 'cafe', 'dining', 'restaurante', 'soda'],
  ['childcare', 'nanny', 'babysitter', 'ninera'],
  ['pest', 'fumigation', 'exterminator', 'fumigacion'],
  ['veterinarian', 'veterinary', 'vet', 'veterinario', 'mascota'],
  ['service', 'services', 'provider', 'servicio', 'servicios', 'proveedor'],
] as const;

const MIN_FUZZY_LENGTH = 4;

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const insertion = currentRow[rightIndex - 1] + 1;
      const deletion = previousRow[rightIndex] + 1;
      const substitution = previousRow[rightIndex - 1]
        + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);

      currentRow.push(Math.min(insertion, deletion, substitution));
    }

    previousRow = currentRow;
  }

  return previousRow[right.length];
}

function fuzzyMatch(left: string, right: string): boolean {
  if (left.length < MIN_FUZZY_LENGTH || right.length < MIN_FUZZY_LENGTH) return false;

  const longestLength = Math.max(left.length, right.length);
  const allowedDistance = longestLength >= 8 ? 2 : 1;
  return Math.abs(left.length - right.length) <= allowedDistance
    && levenshteinDistance(left, right) <= allowedDistance;
}

function groupContainsExactToken(group: readonly string[], token: string): boolean {
  return group.some((alias) =>
    normalizeSearchText(alias).split(' ').includes(token),
  );
}

function includesWholePhrase(searchableText: string, phrase: string): boolean {
  return ` ${searchableText} `.includes(` ${phrase} `);
}

function aliasGroupsForToken(token: string): ReadonlyArray<readonly string[]> {
  const exactGroups = SEARCH_SYNONYM_GROUPS.filter((group) =>
    groupContainsExactToken(group, token),
  );

  // A recognized service term is already valid vocabulary. Keep it anchored to
  // its curated synonym group instead of fuzzily turning it into another valid
  // word in a provider description (for example, "massage" -> "message").
  if (exactGroups.length > 0) return exactGroups;

  return SEARCH_SYNONYM_GROUPS.filter((group) =>
    group.some((alias) => {
      const normalizedAlias = normalizeSearchText(alias);
      return normalizedAlias.split(' ').some((aliasToken) =>
        aliasToken === token || fuzzyMatch(aliasToken, token),
      );
    }),
  );
}

function tokenMatches(token: string, searchableText: string, searchableTokens: string[]): boolean {
  const aliasGroups = aliasGroupsForToken(token);
  const isRecognizedServiceTerm = aliasGroups.some((group) =>
    groupContainsExactToken(group, token),
  );

  if (isRecognizedServiceTerm) {
    if (includesWholePhrase(searchableText, token)) return true;

    return aliasGroups.some((aliasGroup) =>
      aliasGroup.some((alias) =>
        includesWholePhrase(searchableText, normalizeSearchText(alias)),
      ),
    );
  }

  if (searchableText.includes(token)) return true;
  if (searchableTokens.some((candidate) => fuzzyMatch(token, candidate))) return true;

  return aliasGroups.some((aliasGroup) =>
    aliasGroup.some((alias) => {
      const normalizedAlias = normalizeSearchText(alias);
      return searchableText.includes(normalizedAlias)
        || normalizedAlias.split(' ').some((aliasToken) =>
          searchableTokens.some((candidate) => fuzzyMatch(aliasToken, candidate)),
        );
    }),
  );
}

export function matchesDirectorySearch(contact: Contact, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const searchableText = normalizeSearchText([
    contact.name,
    contact.category,
    contact.description,
  ].filter(Boolean).join(' '));

  const searchableTokens = searchableText.split(' ').filter(Boolean);
  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .every((token) => tokenMatches(token, searchableText, searchableTokens));
}

function scoreContact(contact: Contact, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const name = normalizeSearchText(contact.name);
  const category = normalizeSearchText(contact.category);
  const description = normalizeSearchText(contact.description);

  if (name === normalizedQuery) return 100;
  if (name.startsWith(normalizedQuery)) return 80;
  if (name.includes(normalizedQuery)) return 60;
  if (category === normalizedQuery) return 45;
  if (category.includes(normalizedQuery)) return 35;
  if (description.includes(normalizedQuery)) return 25;
  return 10;
}

export function searchDirectoryContacts(contacts: Contact[], query: string): Contact[] {
  if (!normalizeSearchText(query)) return contacts;

  return contacts
    .filter((contact) => matchesDirectorySearch(contact, query))
    .map((contact, index) => ({ contact, index, score: scoreContact(contact, query) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ contact }) => contact);
}
