import React, { useState, useEffect, useRef } from 'react';
import { countryCodes, extractCountryCode } from '@/features/directory/data/countryCodes';
import { categoryIconMap } from '@/features/directory/data/categoryIcons';
import { Contact, Category } from '@/features/directory/types/contact';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, LockKeyhole, Shapes, X, Upload, Trash2 } from 'lucide-react';
import { AvatarFallback } from '@/components/ui/avatar-fallback';
import { normalizeWebsiteUrl } from '@/lib/urls';
import { getDirectoryCategoryLabel } from '@/features/directory/data/categories';
import { normalizeWhatsappNumber } from '@/features/reviews/validation';
import {
  startWhatsappVerification,
  WhatsappApprovalPanel,
  type WhatsappVerificationChallenge,
} from '@/features/verification';
import {
  ProviderDeletionDialog,
  ProviderDeletionRequest,
} from './ProviderDeletionDialog';

const PROVIDER_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROVIDER_LOGO_MAX_BYTES = 5 * 1024 * 1024;

export interface ProviderWriteVerification {
  challenge: WhatsappVerificationChallenge;
}

interface ContactFormProps {
  contact?: Contact;
  categories: Category[];
  onSave: (
    contact: Omit<Contact, 'id'> | Contact,
    verification: ProviderWriteVerification,
  ) => Promise<unknown>;
  onCancel: () => void;
  onDelete?: (request: ProviderDeletionRequest) => Promise<void>;
}

export function ContactForm({
  contact,
  categories,
  onSave,
  onCancel,
  onDelete
}: ContactFormProps) {
  const [name, setName] = useState(contact?.name || '');
  const [category, setCategory] = useState<Category>(contact?.category || 'Service');
  const [description, setDescription] = useState(contact?.description || '');
  const { countryCode: initialCountryCode, localNumber: initialLocalNumber } = extractCountryCode(contact?.phone || '');
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [localPhoneNumber, setLocalPhoneNumber] = useState(initialLocalNumber);
  const [phone, setPhone] = useState(contact?.phone || '');
  const [website, setWebsite] = useState(contact?.website || '');
  const [mapUrl, setMapUrl] = useState(contact?.mapUrl || '');
  const [logoUrl, setLogoUrl] = useState(contact?.logoUrl || '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requesterWhatsapp, setRequesterWhatsapp] = useState('');
  const [verificationChallenge, setVerificationChallenge] = useState<WhatsappVerificationChallenge | null>(null);
  const [verificationError, setVerificationError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const effectRan = useRef(false);
  
  // Update combined phone number when country code or local number changes
  useEffect(() => {
    setPhone(`${countryCode}${localPhoneNumber}`);
  }, [countryCode, localPhoneNumber]);

  // Initialize logo preview for existing contact
  useEffect(() => {
    // This ensures the effect only runs once per contact change and helps avoid state conflicts
    if (!effectRan.current && contact) {
      // Try to use either logo URL or avatar URL
      const imageUrl = contact.image_url || contact.logoUrl || contact.avatarUrl;
      if (imageUrl) {
        setLogoPreview(imageUrl);
        setLogoUrl(imageUrl);
        setLogoRemoved(false);
      } else {
        setLogoPreview(null);
        setLogoUrl('');
      }
      
      effectRan.current = true;
    }
    
    // Reset the effect ran ref when contact changes
    return () => {
      effectRan.current = false;
    };
  }, [contact]);

  // Filter out 'All' from categories for the dropdown
  const dropdownCategories = categories.filter(cat => cat !== 'All');

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!description.trim()) newErrors.description = 'Description is required';
    if (!localPhoneNumber.trim()) newErrors.phone = 'Phone number is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle file selection for logo
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!PROVIDER_LOGO_TYPES.has(file.type)) {
      setErrors((current) => ({ ...current, logo: 'Logo must be a JPEG, PNG, or WebP image.' }));
      e.target.value = '';
      return;
    }
    if (file.size > PROVIDER_LOGO_MAX_BYTES) {
      setErrors((current) => ({ ...current, logo: 'Logo must be 5 MB or smaller.' }));
      e.target.value = '';
      return;
    }
    setErrors((current) => {
      const { logo: _logoError, ...remainingErrors } = current;
      return remainingErrors;
    });

    // Reset logo removed flag if user selects a new logo
    if (logoRemoved) setLogoRemoved(false);

    setLogoFile(file);
    // Process the selected logo file
    
    // Create URL for preview
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setLogoPreview(result);
    };
    reader.readAsDataURL(file);
  };

  // Trigger file input click
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Remove logo
  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoUrl('');
    setLogoRemoved(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const buildContactData = () => {
    const baseContactData: Omit<Contact, 'id' | 'image_url' | 'imageFile'> = {
      name: name.trim(),
      category,
      description: description.trim(),
      phone: phone.trim(),
      website: website.trim() ? normalizeWebsiteUrl(website) : undefined,
      mapUrl: mapUrl.trim() ? normalizeWebsiteUrl(mapUrl) : undefined,
      logoUrl: contact?.logoUrl,
      avatarUrl: contact?.avatarUrl,
    };

    const finalContactData = contact?.id
      ? {
          ...baseContactData,
          id: contact.id,
          image_url: contact.image_url,
          imageFile: logoFile,
          removeLogo: logoRemoved,
        }
      : {
          ...baseContactData,
          imageFile: logoFile,
        };

    return { baseContactData, finalContactData };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    let normalizedRequesterWhatsapp = verificationChallenge?.phone;
    if (!verificationChallenge) {
      try {
        normalizedRequesterWhatsapp = normalizeWhatsappNumber(requesterWhatsapp);
      } catch (error) {
        setVerificationError(error instanceof Error ? error.message : 'Enter a valid WhatsApp number.');
        return;
      }
    }

    setIsSubmitting(true);
    setVerificationError('');
    
    const { baseContactData } = buildContactData();
    
    try {
      if (verificationChallenge) return;
      const imageChange = logoFile
        ? 'replace'
        : contact?.id
          ? (logoRemoved ? 'remove' : 'keep')
          : 'none';
      const challenge = await startWhatsappVerification({
        actionType: contact?.id ? 'provider_update' : 'provider_create',
        phone: normalizedRequesterWhatsapp!,
        payload: {
          ...(contact?.id ? { providerId: contact.id } : {}),
          name: baseContactData.name,
          category: baseContactData.category,
          description: baseContactData.description,
          providerPhone: baseContactData.phone,
          website: baseContactData.website ?? null,
          mapUrl: baseContactData.mapUrl ?? null,
          imageChange,
        },
      });
      setVerificationChallenge(challenge);
    } catch (error) {
      console.error('Error saving contact:', error);
      setVerificationError(error instanceof Error ? error.message : 'Failed to save provider.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeApprovedProviderWrite = async () => {
    const { finalContactData } = buildContactData();
    await onSave(finalContactData, { challenge: verificationChallenge! });
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('form-container')) {
        onCancel();
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onCancel]);

  return (
    <div className="form-container">
      <div
        className="form-panel provider-form-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="provider-form-header flex items-center justify-between">
          <h2 id="provider-form-title" className="font-header text-xl font-semibold text-[var(--directory-ink)]">
            {contact ? 'Edit provider' : 'Recommend a provider'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-gray-100"
            aria-label="Close provider form"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="provider-form">
          <div className="provider-form-grid">
            <div className="provider-form-column">
          <div>
            <Label htmlFor="name">Provider or business name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={errors.name ? 'border-red-500' : ''}
              disabled={Boolean(verificationChallenge)}
            />
            {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
          </div>
          
          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as Category)}
              disabled={Boolean(verificationChallenge)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category">
                  {category && (
                    <div className="flex items-center gap-2">
                      {React.createElement(categoryIconMap[category] ?? Shapes, {
                        size: 18,
                        className: 'inline-block text-[var(--directory-green)]',
                      })}
                      <span className="font-medium">{getDirectoryCategoryLabel(category)}</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {dropdownCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    <div className="flex items-center gap-2">
                      {React.createElement(categoryIconMap[cat] ?? Shapes, {
                        size: 18,
                        className: 'inline-block text-gray-600',
                      })}
                      <span>{getDirectoryCategoryLabel(cat)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="description">What do they help with?</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`min-h-[100px] ${errors.description ? 'border-red-500' : ''}`}
              disabled={Boolean(verificationChallenge)}
            />
            {errors.description && <p className="text-sm text-red-500 mt-1">{errors.description}</p>}
          </div>
          
          <div>
            <Label htmlFor="phone">WhatsApp number</Label>
            <div className="flex space-x-2">
              <Select
                value={countryCode}
                onValueChange={(value) => setCountryCode(value)}
                disabled={Boolean(verificationChallenge)}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Code" />
                </SelectTrigger>
                <SelectContent>
                  {countryCodes.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.code} {country.country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="localPhoneNumber"
                value={localPhoneNumber}
                onChange={(e) => setLocalPhoneNumber(e.target.value)}
                className={errors.phone ? 'border-red-500' : ''}
                placeholder="Local number"
                inputMode="tel"
                disabled={Boolean(verificationChallenge)}
              />
            </div>
            <input type="hidden" id="phone" value={phone} />
            {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
          </div>

            </div>

            <div className="provider-form-column">
          <div>
            <Label htmlFor="website">Website (optional)</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={Boolean(verificationChallenge)}
            />
          </div>
          
          <div>
            <Label htmlFor="mapUrl">Map link (optional)</Label>
            <Input
              id="mapUrl"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              disabled={Boolean(verificationChallenge)}
            />
          </div>

          <div>
            <Label>Logo/Avatar (optional)</Label>
            <div className="mt-2 flex items-start space-x-4">
              {/* Preview of current logo or initial */}
              <div className="flex-shrink-0">
                <AvatarFallback 
                  name={name || 'Contact'} 
                  logoUrl={logoRemoved ? undefined : logoPreview} 
                  className="w-16 h-16"
                />
              </div>

              <div className="flex-1 space-y-2">
                {/* Hidden file input */}
                <input
                  type="file"
                  id="form-logo"
                  ref={fileInputRef}
                  onChange={handleLogoChange}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={Boolean(verificationChallenge)}
                />
                <input 
                  type="hidden"
                  id="logo-removed-flag"
                  value={logoRemoved ? 'true' : 'false'}
                />

                {/* Logo buttons container */}
                <div className="flex space-x-2">
                  {/* Button to trigger file selection */}
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={triggerFileInput}
                    className="flex items-center justify-center flex-1"
                    disabled={Boolean(verificationChallenge)}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {logoPreview ? 'Change Logo' : 'Upload Logo'}
                  </Button>

                  {/* Button to remove logo if one exists */}
                  {(logoPreview || logoUrl) && !logoRemoved ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={removeLogo}
                      className="flex items-center justify-center"
                      disabled={Boolean(verificationChallenge)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove Logo
                    </Button>
                  ) : <div className="w-0"></div>}
                </div>
                {errors.logo && <p className="text-sm text-red-500" role="alert">{errors.logo}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <Label htmlFor="provider-editor-whatsapp">WhatsApp number for verification</Label>
            <Input
              autoComplete="tel"
              disabled={Boolean(verificationChallenge)}
              id="provider-editor-whatsapp"
              inputMode="tel"
              maxLength={32}
              onChange={(event) => setRequesterWhatsapp(event.target.value)}
              placeholder="Include country code, e.g. +506 8888 8888"
              required
              type="tel"
              value={requesterWhatsapp}
            />
            <p className="flex items-center gap-1.5 text-xs leading-relaxed text-gray-600">
              <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              You’ll send Machu a ready-made WhatsApp message before {contact ? 'saving these changes' : 'adding this provider'}. Your number stays private.
            </p>

            {verificationChallenge && (
              <WhatsappApprovalPanel
                challenge={verificationChallenge}
                onApproved={completeApprovedProviderWrite}
                onReset={() => {
                  setVerificationChallenge(null);
                  setVerificationError('');
                }}
              />
            )}
          </div>

            </div>
          </div>

          {verificationError && (
            <p className="text-sm font-medium text-red-600" role="alert">{verificationError}</p>
          )}
          
          <div className="provider-form-actions">
            {contact && onDelete ? (
              <div className="provider-form-delete">
                <ProviderDeletionDialog
                  onDelete={onDelete}
                  providerId={contact.id}
                  providerName={contact.name}
                />
              </div>
            ) : (
              <div></div>
            )}
            
            <div className="provider-form-primary-actions">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              >
                Cancel
              </Button>
              {!verificationChallenge && (
                <Button
                  type="submit"
                  variant="default"
                  disabled={isSubmitting}
                  className={isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}
                >
                  {isSubmitting && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Preparing WhatsApp…' : 'Continue with WhatsApp'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
