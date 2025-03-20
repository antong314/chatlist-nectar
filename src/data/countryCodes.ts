interface CountryCode {
  code: string;
  country: string;
}

export const countryCodes: CountryCode[] = [
  { code: '+506', country: 'Costa Rica' },
  { code: '+1', country: 'United States/Canada' },
  { code: '+44', country: 'United Kingdom' },
  { code: '+52', country: 'Mexico' },
  { code: '+34', country: 'Spain' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
  { code: '+39', country: 'Italy' },
  { code: '+55', country: 'Brazil' },
  { code: '+54', country: 'Argentina' },
  { code: '+57', country: 'Colombia' },
  { code: '+56', country: 'Chile' },
  { code: '+51', country: 'Peru' },
  { code: '+58', country: 'Venezuela' },
  { code: '+507', country: 'Panama' },
  { code: '+503', country: 'El Salvador' },
  { code: '+502', country: 'Guatemala' },
  { code: '+504', country: 'Honduras' },
  { code: '+505', country: 'Nicaragua' },
  { code: '+809', country: 'Dominican Republic' },
  { code: '+86', country: 'China' },
  { code: '+91', country: 'India' },
  { code: '+81', country: 'Japan' },
  { code: '+82', country: 'South Korea' },
];

// Function to extract country code from a full phone number
export const extractCountryCode = (phoneNumber: string): { countryCode: string; localNumber: string } => {
  // Default to Costa Rica if we can't identify the country code
  if (!phoneNumber) {
    return { countryCode: '+506', localNumber: '' };
  }

  const normalizedNumber = phoneNumber.trim().replace(/\s+/g, '');
  
  // Check if the number starts with a plus sign
  if (!normalizedNumber.startsWith('+')) {
    return { 
      countryCode: '+506', 
      localNumber: normalizedNumber 
    };
  }

  // Try to find the country code by checking possible matches from longest to shortest
  const sortedCodes = [...countryCodes].sort((a, b) => b.code.length - a.code.length);
  
  for (const { code } of sortedCodes) {
    if (normalizedNumber.startsWith(code)) {
      return {
        countryCode: code,
        localNumber: normalizedNumber.substring(code.length)
      };
    }
  }

  // Default fallback to Costa Rica if no match found
  return { 
    countryCode: '+506', 
    localNumber: normalizedNumber.startsWith('+') ? normalizedNumber.substring(1) : normalizedNumber 
  };
};
