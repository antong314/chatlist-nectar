import React, { Component, useEffect, useRef, useCallback, ErrorInfo, ReactNode } from 'react';
import { FormattingToolbar, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';

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

  // Creates a new editor instance
  const editor = useCreateBlockNote({
    domAttributes: {
      editor: {
        class: `blocknote-editor ${className}`,
        style: 'color: black;',
      },
    },
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

  // Set up custom paste handler for markdown support
  useEffect(() => {
    if (editor && !readOnly) {
      // Function to process pasted markdown text
      const handlePastedMarkdown = async (text: string) => {
        try {
          // Use the markdown parser from editor
          const blocks = await editor.tryParseMarkdownToBlocks(text);
          
          if (blocks && blocks.length > 0) {
            // Replace the current document with markdown content
            // This simple approach ensures compatibility
            const previousContent = editor.document;
            editor.replaceBlocks(previousContent, blocks);
            console.log('Processed markdown paste successfully');
            return true;
          }
        } catch (error) {
          console.error('Failed to process markdown:', error);
        }
        return false;
      };
      
      // Add a command listener to the editor for markdown paste processing
      const processIfMarkdown = async (text: string) => {
        // Simple heuristic to detect markdown
        const containsMarkdown = /[\*#\-\>\`\|\[\]]/.test(text) || 
                                /^\d+\.\s/.test(text) || 
                                text.includes('http') ||
                                text.includes('__') ||
                                text.includes('> ');
        
        if (containsMarkdown) {
          return await handlePastedMarkdown(text);
        }
        return false;
      };
      
      // Add a paste event handler to the document
      const handlePaste = async (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain');
        if (!text) return;
        
        // Try to process as markdown
        const processed = await processIfMarkdown(text);
        if (processed) {
          e.preventDefault(); // Prevent default paste if we handled it
        }
      };
      
      // Get the editor DOM element
      const editorElement = document.querySelector('.blocknote-editor');
      if (editorElement) {
        editorElement.addEventListener('paste', handlePaste as EventListener);
        return () => {
          editorElement.removeEventListener('paste', handlePaste as EventListener);
        };
      }
    }
  }, [editor, readOnly]);

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
              </div>
            )}
          </BlockNoteView>
        </div>
      </EditorErrorBoundary>
    </div>
  );
};

export default WikiEditor;
