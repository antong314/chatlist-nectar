
import React, { useState, useEffect } from 'react';
import { Contact, Category } from '@/types/contact';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';

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
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    const contactData: Omit<Contact, 'id'> = {
      name: name.trim(),
      category,
      description: description.trim(),
      phone: phone.trim(),
      website: website.trim() || undefined,
    };
    
    if (contact?.id) {
      onSave({ ...contactData, id: contact.id });
    } else {
      onSave(contactData);
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
              <Button type="submit" variant="default">
                {contact ? 'Save Changes' : 'Add Contact'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
