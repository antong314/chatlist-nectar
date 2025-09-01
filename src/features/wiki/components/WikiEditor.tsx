import React, { Component, useEffect, useRef, useCallback, ErrorInfo, ReactNode } from 'react';
import { FormattingToolbar, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Import the styling
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import './WikiEditor.css';

interface WikiEditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
  className?: string;
  autoFocus?: boolean;
}

// Error boundary for catching rendering errors in the editor
class EditorErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Editor error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const WikiEditor: React.FC<WikiEditorProps> = ({
  initialContent,
  onChange,
  readOnly = false,
  className = "",
  autoFocus = false
}) => {
  // Track the content version for refreshing on changes
  const contentVersion = useRef(initialContent);
  const contentInitialized = useRef(false);

  // Image upload handler for BlockNote
  const handleImageUpload = async (file: File) => {
    try {
      // Create a unique filename with timestamp
      const timestamp = new Date().getTime();
      const fileExt = file.name.split('.').pop();
      const fileName = `${timestamp}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
      const filePath = `images/${fileName}`;
      
      // Show upload progress in console
      console.log(`Uploading image ${file.name} to Supabase storage...`);
      
      // Upload the file to Supabase Storage
      const { data, error } = await supabase.storage
        .from('wikimedia')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) {
        console.error('Error uploading image:', error);
        
        // Check for permission errors
        if (error.message && error.message.includes('policy')) {
          alert(
            'Permission error: You need to configure Supabase Storage permissions.\n\n' +
            'Please go to Supabase Dashboard > Storage > Policies and add a policy for the wikimedia bucket that allows uploads.\n\n' +
            'Example policy: CREATE POLICY "Allow public uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = \'wikimedia\');'
          );
        } else {
          alert(`Failed to upload image: ${error.message || 'Unknown error'}`);
        }
        
        return null;
      }
      
      // Get the public URL for the uploaded image
      const { data: urlData } = supabase.storage
        .from('wikimedia')
        .getPublicUrl(filePath);
      
      console.log('Image uploaded successfully:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error('Image upload failed:', error);
      alert('Image upload failed. Please try again later.');
      return null;
    }
  };

  // Creates a new editor instance with image upload capability and custom paste handler
  const editor = useCreateBlockNote({
    domAttributes: {
      editor: {
        class: `blocknote-editor ${className}`,
        style: 'color: black;',
      },
    },
    // Enable image uploads
    uploadFile: handleImageUpload,
    // Custom paste handler for markdown support
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      // Only handle text/plain content
      if (event.clipboardData?.types.includes("text/plain")) {
        const text = event.clipboardData.getData("text/plain");

        // Simple heuristic to detect markdown
        const containsMarkdown = /[\*#\-\>\`\|\[\]]/.test(text) ||
                                /^\d+\.\s/.test(text) ||
                                text.includes('http') ||
                                text.includes('__') ||
                                text.includes('> ');

        if (containsMarkdown) {
          // Use BlockNote's built-in pasteMarkdown method which handles cursor positioning correctly
          editor.pasteMarkdown(text);
          return true; // Prevent default paste behavior
        }
      }

      // For non-markdown content, use the default paste handler
      return defaultPasteHandler();
    }
  });
  


  // Set up onChange handler
  useEffect(() => {
    if (editor && onChange) {
      const unsubscribe = editor.onChange(() => {
        try {
          const blocks = editor.topLevelBlocks;
          onChange(JSON.stringify(blocks));
        } catch (error) {
          console.error('Error saving content:', error);
        }
      });
      
      return () => unsubscribe();
    }
  }, [editor, onChange]);

  // Initialize editor with content and update when initialContent changes
  useEffect(() => {
    // Only proceed if we have an editor and content to load
    if (editor && initialContent) {
      // Check if the content has changed from what we previously loaded
      const contentChanged = contentVersion.current !== initialContent;
      
      // Either we haven't initialized yet or the content has changed
      if (!contentInitialized.current || contentChanged) {
        try {
          // Check if initialContent is valid JSON and not empty
          if (initialContent && initialContent.trim() !== '') {
            const parsedContent = JSON.parse(initialContent);
            if (Array.isArray(parsedContent) && parsedContent.length > 0) {
              console.log('Loading/refreshing content into BlockNote editor');
              editor.replaceBlocks(editor.topLevelBlocks, parsedContent);
              contentInitialized.current = true;
              // Update our reference to the current content
              contentVersion.current = initialContent;
            } else {
              console.warn('Content appears to be empty array, not loading:', parsedContent);
            }
          } else {
            console.warn('No initial content to load');
          }
        } catch (error) {
          console.error('Error parsing content for BlockNote editor:', error);
          console.log('Invalid content:', initialContent);
        }
      }
    }
  }, [editor, initialContent]);

  // Update read-only state when changed
  useEffect(() => {
    if (editor) {
      editor.isEditable = !readOnly;
    }
  }, [editor, readOnly]);

  // Note: Custom paste handling is now done through the pasteHandler option in useCreateBlockNote
  // This ensures proper integration with BlockNote's paste system and prevents double pasting

  // Auto-focus the editor when it's ready and not in read-only mode
  useEffect(() => {
    if (editor && !readOnly && autoFocus) {
      const focusTimer = setTimeout(() => {
        try {
          editor.focus();
        } catch (err) {
          console.warn('Could not focus editor:', err);
        }
      }, 300);
      
      return () => clearTimeout(focusTimer);
    }
  }, [editor, readOnly, autoFocus]);

  // Fallback UI when editor fails to render
  const fallbackEditor = (
    <div className="p-6 bg-gray-50 rounded border border-gray-200">
      <h3 className="text-lg font-medium text-red-600">Editor could not be loaded</h3>
      <p className="mt-2 text-gray-600">
        There was a problem loading the editor. Please refresh the page to try again.
      </p>
    </div>
  );

  // Return the editor with an error boundary
  return (
    <div className={`rounded-lg shadow ${className}`}>
      <EditorErrorBoundary fallback={fallbackEditor}>
        <div className="wiki-editor-container">
          <BlockNoteView 
            editor={editor} 
            formattingToolbar={false}
            className="min-h-[200px] bg-white text-black rounded-lg overflow-hidden"
          >
            {!readOnly && (
              <div className="formatting-toolbar-container p-2 bg-white">
                <FormattingToolbar />
                
                {/* Add custom image upload button */}
                <div className="flex items-center px-2 ml-2 h-8 rounded border border-gray-200 bg-white shadow-sm hover:bg-gray-50">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm font-medium text-gray-700"
                    title="Insert Image"
                    onClick={() => {
                      // Upload image using BlockNote's file picker
                      // This will trigger our uploadFile handler
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          // Our uploadFile handler will be called automatically
                          try {
                            // Directly upload the file using our handler
                            const imageUrl = await handleImageUpload(file);
                            
                            if (imageUrl) {
                              // Once we have the URL, create and insert an image block
                              // BlockNote will handle the appropriate structure
                              try {
                                // Insert a paragraph first as a fallback in case image fails
                                const currentPosition = editor.getTextCursorPosition();
                                
                                // Use standard BlockNote API to create an image block
                                // Get cursor position
                                const insertPosition = {
                                  block: currentPosition.block,
                                  placement: 'after' as const
                                };
                                
                                // Create a temporary partial block
                                // This uses the structure that BlockNote expects
                                const imageBlock = {
                                  type: 'image',
                                  props: {
                                    url: imageUrl,    // Use URL or src depending on version
                                    alt: file.name,
                                    caption: file.name
                                  }
                                };
                                
                                // Insert the block at cursor position
                                editor.insertBlocks(
                                  [imageBlock as any], // Type assertion to bypass TS checking
                                  insertPosition.block,
                                  insertPosition.placement
                                );
                                
                                // If successful, focus the editor after insertion
                                setTimeout(() => editor.focus(), 100);
                              } catch (err) {
                                console.error('Error inserting image block:', err);
                                alert('Error inserting image. Please try again.');
                              }
                            }
                          } catch (err) {
                            console.error('Error handling image:', err);
                          }
                        }
                      };
                      input.click();
                    }}
                  >
                    <ImageIcon size={16} />
                    <span>Add Image</span>
                  </button>
                </div>
              </div>
            )}
          </BlockNoteView>
        </div>
      </EditorErrorBoundary>
    </div>
  );
};

export default WikiEditor;
