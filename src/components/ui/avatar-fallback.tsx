
import React, { useState } from 'react';
import { cn } from "@/lib/utils";

interface AvatarFallbackProps {
  name: string;
  logoUrl?: string;
  className?: string;
  onImageError?: () => void;
}

const colors = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-cyan-500'
];

export function AvatarFallback({ name, logoUrl, className, onImageError }: AvatarFallbackProps) {
  const [imageError, setImageError] = useState(false);
  
  // Get initials from name
  const initials = name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  // Get a consistent color based on the name
  const colorIndex = name
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  
  const bgColor = colors[colorIndex];

  const handleImageError = () => {
    console.log('Image failed to load:', logoUrl);
    setImageError(true);
    if (onImageError) onImageError();
  };

  // If we have a logo URL and no error, show the image
  if (logoUrl && !imageError) {
    return (
      <div 
        className={cn(
          "rounded-full overflow-hidden",
          className
        )}
      >
        <img 
          src={logoUrl} 
          alt={`${name} logo`}
          onError={handleImageError}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Otherwise show the fallback with initials
  return (
    <div 
      className={cn(
        "flex items-center justify-center text-white font-semibold rounded-full",
        bgColor,
        className
      )}
    >
      {initials}
    </div>
  );
}
