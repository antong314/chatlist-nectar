// scripts/migrate-images.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Buffer } from 'buffer';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp'; // Import sharp

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
// Get old API URL from VITE env var or use the known production fallback
const OLD_API_URL = process.env.VITE_API_URL || 'https://machu-server-app-2tn7n.ondigitalocean.app';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role Key for admin tasks
const SUPABASE_BUCKET = 'contact-images'; // The name of your storage bucket
const COMPRESSION_THRESHOLD_BYTES = 800 * 1024; // Compress if original is > 800KB
const MAX_DIMENSION = 1024; // Max width/height for resized images
const JPEG_QUALITY = 80; // Compression quality for JPEG

// --- End Configuration ---

// --- Helper Functions ---

/**
 * Downloads an image from a URL and returns it as a Buffer.
 * @param {string} url - The URL of the image to download.
 * @returns {Promise<{buffer: Buffer, contentType: string | null}>} - Image buffer and content type.
 */
async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status} ${response.statusText}) from ${url}`);
  }
  const contentType = response.headers.get('content-type');
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

// --- End Helper Functions ---

async function main() {
  console.log('--- Starting Image Migration Script ---');

  // Validate environment variables
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Error: Missing Supabase environment variables in .env file (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
    console.error('Please ensure your .env file is set up correctly in the project root.');
    process.exit(1);
  }
  if (!OLD_API_URL) {
      console.error('Error: Could not determine OLD_API_URL.');
      process.exit(1);
  }

  console.log(`Using Supabase URL: ${SUPABASE_URL}`);
  console.log(`Using Old Backend URL: ${OLD_API_URL}`);
  console.log(`Using Supabase Bucket: ${SUPABASE_BUCKET}`);

  // Initialize Supabase client with Service Role Key
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
          // Prevent client from trying to use browser storage
          persistSession: false,
          autoRefreshToken: false
      }
  });

  // 1. Fetch contacts from the old backend
  console.log('\nFetching contacts from old backend...');
  let oldContactsData = [];
  try {
    const response = await fetch(`${OLD_API_URL}/get_directory_data?nocache=${Date.now()}`);
    if (!response.ok) {
        const errorText = await response.text();
      throw new Error(`Failed to fetch from old API: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }
    const rawData = await response.json();
    // Adapt based on actual response structure (Airtable often nests in 'records' and 'fields')
    oldContactsData = (rawData.records || rawData).map(c => ({ ...(c.fields || c), id_from_old_system: c.id }));
    console.log(`Fetched ${oldContactsData.length} contacts from old backend.`);
    if (oldContactsData.length > 0) {
        // Log the keys of the first record to help identify image URL field
        console.log('Sample old contact keys:', Object.keys(oldContactsData[0]));
    } else {
        console.log('No contacts found in old backend response.');
        return; // Exit if no data
    }
  } catch (error) {
    console.error('Error fetching or parsing data from old backend:', error);
    process.exit(1);
  }

  // 2. Fetch contacts from Supabase
  console.log('\nFetching contacts from Supabase...');
  const { data: supabaseContacts, error: supabaseFetchError } = await supabase
    .from('contacts')
    .select('id, title, image_url'); // Select existing image_url to potentially skip

  if (supabaseFetchError) {
    console.error('Error fetching contacts from Supabase:', supabaseFetchError);
    process.exit(1);
  }
  console.log(`Fetched ${supabaseContacts.length} contacts from Supabase.`);

  // Create a map for quick lookup by title (case-insensitive, trimmed)
  const supabaseContactMap = new Map();
  supabaseContacts.forEach(c => {
      if (c.title) {
        const cleanTitle = c.title.trim().toLowerCase();
        if (supabaseContactMap.has(cleanTitle)) {
            console.warn(`Warning: Duplicate title found in Supabase: "${c.title}". Matching might be ambiguous.`);
        }
        supabaseContactMap.set(cleanTitle, c);
      }
  });

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  console.log('\nStarting image migration process...');
  console.log('=====================================');

  // 3. Iterate through old contacts and migrate images
  for (const oldContact of oldContactsData) {
    const fields = oldContact; // Data seems already mapped to fields level + id_from_old_system
    const oldTitle = fields.Title?.trim();
    let oldImageUrl = null;

    // Correctly target fields.Logo[0].url
    if (fields.Logo && Array.isArray(fields.Logo) && fields.Logo.length > 0 && fields.Logo[0].url) {
        oldImageUrl = fields.Logo[0].url;
    } // Add other potential fallback fields here if needed

    if (!oldTitle) {
        console.warn(`Skipping: Old contact missing 'Title'. Data: ${JSON.stringify(oldContact).substring(0, 100)}...`);
        skippedCount++;
        continue;
    }

    const cleanOldTitle = oldTitle.toLowerCase();
    const matchedSupabaseContact = supabaseContactMap.get(cleanOldTitle);

    if (!matchedSupabaseContact) {
        // console.log(`Skipping: No Supabase contact found matching title "${oldTitle}"`);
        skippedCount++;
        continue; // Don't log every miss, can be noisy
    }

    // // Optional: Skip if Supabase contact already has an image_url pointing to Supabase Storage
    // // --- Temporarily Disabled AGAIN to Force Re-upload/Compression for ALL --- 
    // if (matchedSupabaseContact.image_url && matchedSupabaseContact.image_url.includes(SUPABASE_URL)) {
    //     // console.log(`Skipping "${oldTitle}": Already has a Supabase image URL.`);
    //     skippedCount++;
    //     continue; // Don't log every skip
    // }

    if (!oldImageUrl) {
        // console.log(`Skipping "${oldTitle}": No image URL found in old data field fields.Logo[0].url.`);
        skippedCount++;
        continue; // Don't log every skip
    }

    console.log(`Processing "${oldTitle}" (Supabase ID: ${matchedSupabaseContact.id})`);
    console.log(`  Old Image URL: ${oldImageUrl}`);

    try {
        // 1. Download image
        let { buffer: imageBuffer, contentType: downloadedContentType } = await downloadImage(oldImageUrl);
        let needsCompression = false;
        let originalSize = imageBuffer.length;

        console.log(`  Downloaded original image size: ${(originalSize / 1024).toFixed(1)} KB`);

        // Get metadata for dimension checks
        let metadata = {};
        try {
            metadata = await sharp(imageBuffer).metadata();
        } catch (metaError) {
            console.warn(`  Warning: Could not read image metadata for "${oldTitle}". Skipping dimension checks. Error: ${metaError.message}`);
        }

        // Determine if compression is needed
        if (originalSize > COMPRESSION_THRESHOLD_BYTES) {
            needsCompression = true;
            console.log(`  Image size (${(originalSize / 1024).toFixed(1)} KB) exceeds threshold (${(COMPRESSION_THRESHOLD_BYTES / 1024).toFixed(1)} KB).`);
        } else if (metadata.width && metadata.width > MAX_DIMENSION) {
            needsCompression = true;
            console.log(`  Image width (${metadata.width}px) exceeds max dimension (${MAX_DIMENSION}px).`);
        } else if (metadata.height && metadata.height > MAX_DIMENSION) {
            needsCompression = true;
            console.log(`  Image height (${metadata.height}px) exceeds max dimension (${MAX_DIMENSION}px).`);
        }

        // Fallback: Always compress if not a standard web format already
        // Note: fileTypeResult logic happens *after* this, so we use metadata.format
        const isStandardFormat = metadata.format && ['jpeg', 'png', 'webp', 'gif'].includes(metadata.format);
        if (!isStandardFormat) {
            needsCompression = true;
            console.log(`  Image format (${metadata.format || 'unknown'}) is not standard web format. Compressing.`);
        }

        // 2. Determine file type and extension (from original or compressed buffer)
        let currentBuffer = imageBuffer;
        let finalFileName = matchedSupabaseContact.id; // Base filename on UUID
        let finalMimeType = '';
        let finalExtension = '';

        if (needsCompression) {
            console.log(`  Compressing image (Max: ${MAX_DIMENSION}x${MAX_DIMENSION}, Quality: ${JPEG_QUALITY}%)...`);
            try {
                currentBuffer = await sharp(imageBuffer)
                    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: JPEG_QUALITY, progressive: true })
                    .toBuffer();

                let compressedSize = currentBuffer.length;
                console.log(`  Compressed image size: ${(compressedSize / 1024).toFixed(1)} KB`);
                finalExtension = 'jpg';
                finalMimeType = 'image/jpeg';

            } catch (compressionError) {
                console.error(`  Error during image compression for "${oldTitle}": ${compressionError.message}`);
                // Fallback to trying the original buffer if compression fails
                currentBuffer = imageBuffer;
                needsCompression = false; // Reset flag so we use original type logic below
            }
        }

        // Determine final file type if not already set by compression
        if (!finalMimeType) {
            const fileTypeResult = await fileTypeFromBuffer(currentBuffer);
            finalMimeType = fileTypeResult?.mime;
            finalExtension = fileTypeResult?.ext;

            // Fallback if fileTypeFromBuffer fails but we got Content-Type header
            if (!finalMimeType && downloadedContentType && downloadedContentType.startsWith('image/')) {
                finalMimeType = downloadedContentType;
                // Basic extension mapping from mime type
                if (finalMimeType === 'image/jpeg') finalExtension = 'jpg';
                else if (finalMimeType === 'image/png') finalExtension = 'png';
                else if (finalMimeType === 'image/gif') finalExtension = 'gif';
                else if (finalMimeType === 'image/webp') finalExtension = 'webp';
                // Add more as needed
            }
        }

        // Final validation
        if (!finalMimeType || !finalExtension || !finalMimeType.startsWith('image/')) {
            throw new Error(`Processed file from ${oldImageUrl} is not a recognized image type (Detected mime: ${finalMimeType}, Header: ${downloadedContentType})`);
        }

        finalFileName = `${matchedSupabaseContact.id}.${finalExtension}`; // Add final extension
        const filePath = `${finalFileName}`; // Store in root of bucket for simplicity

        // 3. Upload to Supabase Storage
        console.log(`  Uploading as "${filePath}" (Type: ${finalMimeType})...`);
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .upload(filePath, currentBuffer, { // Use currentBuffer (original or compressed)
            contentType: finalMimeType,
            upsert: true, // Overwrite if file with same name exists
          });

        if (uploadError) {
          // Attempting to upload duplicate content hash might throw a specific error
          if (uploadError.message.includes('Duplicate') || uploadError.message.includes('duplicate')) {
             console.warn(`  Upload skipped (potential duplicate content): ${uploadError.message}`);
             // Assume we can still get the public URL of the existing file
          } else {
            throw new Error(`Supabase storage upload error: ${uploadError.message}`);
          }
        }

        // 4. Get Public URL (even if upload was skipped due to duplicate)
        const { data: publicUrlData } = supabase.storage
          .from(SUPABASE_BUCKET)
          .getPublicUrl(filePath); // Get URL based on the intended path

        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error('Failed to get public URL for image.');
        }
        const newImageUrl = publicUrlData.publicUrl;
        console.log(`  Public URL: ${newImageUrl}`);

        // 5. Update Supabase contact record ONLY if the URL has changed
        if (matchedSupabaseContact.image_url !== newImageUrl) {
            console.log('  Updating database record...');
            const { error: updateError } = await supabase
              .from('contacts')
              .update({ image_url: newImageUrl })
              .eq('id', matchedSupabaseContact.id);

            if (updateError) {
              throw new Error(`Supabase DB update error: ${updateError.message}`);
            }
            console.log(`  Database record updated for "${oldTitle}".`);
        } else {
            console.log('  Database record already up-to-date.');
        }

        migratedCount++;

    } catch (error) {
        console.error(`  Error processing "${oldTitle}": ${error.message}`);
        errorCount++;
    }
    console.log('-------------------------------------'); // Separator
  }

  console.log('\nMigration Summary:');
  console.log(`  Successfully Processed/Updated: ${migratedCount}`);
  console.log(`  Skipped (No match, no URL, already migrated, etc.): ${skippedCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log('--- Migration Script Finished ---');
}

main().catch(err => {
    console.error("\n--- Script Failed ---");
    console.error(err);
    process.exit(1);
});
