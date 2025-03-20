
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Contact, Category } from '@/types/contact';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Upload, Trash2 } from 'lucide-react';
import { AvatarFallback } from './ui/avatar-fallback';

interface ContactFormProps {
  contact?: Contact;
  categories: Category[];
  onSave: (contact: Omit<Contact, 'id'> | Contact) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
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
  const [phone, setPhone] = useState(contact?.phone || '');
  const [website, setWebsite] = useState(contact?.website || '');
  const [mapUrl, setMapUrl] = useState(contact?.mapUrl || '');
  const [logoUrl, setLogoUrl] = useState(contact?.logoUrl || '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const effectRan = useRef(false);
  
  // Initialize logo preview for existing contact
  useEffect(() => {
    // This ensures the effect only runs once per contact change and helps avoid state conflicts
    if (!effectRan.current && contact) {
      // Try to use either logo URL or avatar URL
      const imageUrl = contact.logoUrl || contact.avatarUrl;
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
    if (!phone.trim()) newErrors.phone = 'Phone number is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle file selection for logo
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    // Set loading state to true
    setIsSubmitting(true);
    
    // Show a loading toast notification
    const toastId = toast.loading(contact ? 'Saving contact...' : 'Adding new contact...');
    
    const contactData: Omit<Contact, 'id'> = {
      name: name.trim(),
      category,
      description: description.trim(),
      phone: phone.trim(),
      website: website.trim() || undefined,
      mapUrl: mapUrl.trim() || undefined,
      logoUrl: logoRemoved ? undefined : (logoUrl || undefined),
    };

    // Store logo information for later handling by the API
    // We'll handle this in the useContacts hook by accessing DOM elements
    
    // Prepare the contact data to be saved
    const finalContactData = contact?.id 
      ? { ...contactData, id: contact.id }
      : contactData;
    
    try {
      // Pass the data to the parent component
      await onSave(finalContactData);
      // Dismiss the loading toast and show success
      toast.dismiss(toastId);
      // The success toast is already shown in the useContacts hook
    } catch (error) {
      console.error('Error saving contact:', error);
      // Dismiss the loading toast and show error
      toast.dismiss(toastId);
      toast.error('Failed to save contact');
    } finally {
      // Reset loading state regardless of success or failure
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (contact?.id && onDelete) {
      if (window.confirm('Are you sure you want to delete this contact?')) {
        onDelete(contact.id);
      }
    }
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
      <div className="form-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {contact ? 'Edit Contact' : 'Add New Contact'}
          </h2>
          <button 
            onClick={onCancel}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
          </div>
          
          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as Category)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {dropdownCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`min-h-[100px] ${errors.description ? 'border-red-500' : ''}`}
            />
            {errors.description && <p className="text-sm text-red-500 mt-1">{errors.description}</p>}
          </div>
          
          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={errors.phone ? 'border-red-500' : ''}
            />
            {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
          </div>
          
          <div>
            <Label htmlFor="website">Website (optional)</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="mapUrl">Map URL (optional)</Label>
            <Input
              id="mapUrl"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
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
                  accept="image/*"
                  className="hidden"
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
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove Logo
                    </Button>
                  ) : <div className="w-0"></div>}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-between pt-4">
            {contact && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
              >
                Delete
              </Button>
            ) : (
              <div></div>
            )}
            
            <div className="space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="default" 
                disabled={isSubmitting}
                className={isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}
              >
                {isSubmitting ? (
                  <>
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></span>
                    {contact ? 'Saving...' : 'Adding...'}
                  </>
                ) : (
                  contact ? 'Save Changes' : 'Add Contact'
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
