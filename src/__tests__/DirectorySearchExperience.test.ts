import { Contact } from '@/types/contact';
import {
  matchesDirectorySearch,
  normalizeSearchText,
  searchDirectoryContacts,
} from '@/features/directory/search/directorySearch';

const contacts: Contact[] = [
  {
    id: '1',
    name: 'Carlos Reparaciones',
    description: 'Plomero para fugas y tuberias',
    category: 'Service',
    phone: '50680000001',
  },
  {
    id: '2',
    name: 'Taller El Puente',
    description: 'Mecanico de autos',
    category: 'Mechanic',
    phone: '50680000002',
  },
  {
    id: '3',
    name: 'Mercado Verde',
    description: 'Fresh local produce and groceries',
    category: 'Groceries',
    phone: '50680000003',
  },
  {
    id: '4',
    name: 'Casa Bien Hecha',
    description: 'Construccion y reparacion de casas',
    category: 'Construction',
    phone: '50680000004',
  },
  {
    id: '5',
    name: 'Somatic Coach',
    description: 'Somatic coaching and leadership mentoring. Message me to learn more.',
    category: 'Healer',
    phone: '50680000005',
  },
  {
    id: '6',
    name: 'Bodywork Studio',
    description: 'Therapeutic massage and wellness sessions',
    category: 'Healer',
    phone: '50680000006',
  },
  {
    id: '7',
    name: 'Market Equipment',
    description: 'Shopping cart repair and maintenance',
    category: 'Service',
    phone: '50680000007',
  },
];

describe('directory search experience', () => {
  test('normalizes accents, punctuation, and casing', () => {
    expect(normalizeSearchText('  MÉDICO / Clínica! ')).toBe('medico clinica');
  });

  test('matches English searches to Spanish provider descriptions', () => {
    expect(matchesDirectorySearch(contacts[0], 'plumber')).toBe(true);
    expect(matchesDirectorySearch(contacts[1], 'car repair')).toBe(true);
  });

  test('matches Spanish searches to English provider descriptions', () => {
    expect(matchesDirectorySearch(contacts[2], 'comida')).toBe(true);
  });

  test('supports ambiguous repair terms across mechanics and home services', () => {
    expect(matchesDirectorySearch(contacts[1], 'repair')).toBe(true);
    expect(matchesDirectorySearch(contacts[3], 'repair')).toBe(true);
    expect(matchesDirectorySearch(contacts[3], 'home repair')).toBe(true);
  });

  test('tolerates useful spelling mistakes', () => {
    expect(matchesDirectorySearch(contacts[0], 'plumbr')).toBe(true);
    expect(matchesDirectorySearch(contacts[1], 'mecancio')).toBe(true);
  });

  test('does not turn a recognized service term into an unrelated valid word', () => {
    expect(matchesDirectorySearch(contacts[4], 'massage')).toBe(false);
    expect(matchesDirectorySearch(contacts[5], 'massage')).toBe(true);
    expect(matchesDirectorySearch(contacts[6], 'art')).toBe(false);
  });

  test('requires every search concept to match', () => {
    expect(matchesDirectorySearch(contacts[0], 'plumber groceries')).toBe(false);
  });

  test('ranks direct name matches ahead of synonym matches', () => {
    const ranked = searchDirectoryContacts(contacts, 'mercado');
    expect(ranked.map((contact) => contact.name)).toEqual(['Mercado Verde']);
  });
});
