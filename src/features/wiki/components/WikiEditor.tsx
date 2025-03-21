import React, { Component, useState, useEffect, useRef, ErrorInfo, ReactNode } from 'react';
import { BlockNoteEditor, PartialBlock } from '@blocknote/core';

// Import the styling
import '@blocknote/react/style.css';


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
  // Editor instance state
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  // Track if there was an error parsing initialContent
  const [parseError, setParseError] = useState<boolean>(false);

  // Set up the editor on mount
  useEffect(() => {
    try {
      // Create the editor with minimal configuration
      const newEditor = BlockNoteEditor.create({
        domAttributes: {
          editor: {
            class: `blocknote-editor ${className}`,
          },
        },
      });
      
      // Set editor to read-only if specified
      newEditor.isEditable = !readOnly;

      // Try to load initial content if provided first
      let hasLoadedContent = false;
      
      if (initialContent && typeof initialContent === 'string' && initialContent.trim() !== '') {
        try {
          const parsedContent = JSON.parse(initialContent);
          // Only try to use parsed content if it's a valid array
          if (Array.isArray(parsedContent) && parsedContent.length > 0) {
            console.log('Loading initial content with', parsedContent.length, 'blocks');
            
            // Replace any existing blocks with the parsed content
            if (newEditor.topLevelBlocks && newEditor.topLevelBlocks.length > 0) {
              newEditor.replaceBlocks(newEditor.topLevelBlocks, parsedContent);
            } else {
              // Insert blocks if editor is empty
              parsedContent.forEach(block => {
                newEditor.insertBlocks([block], null, "after");
              });
            }
            
            hasLoadedContent = true;
          } else {
            console.warn('Parsed content was not an array or was empty');
            setParseError(true);
          }
        } catch (err) {
          console.error('Failed to parse initial content:', err);
          setParseError(true);
        }
      }
      
      // Add default content only if we didn't load any content
      if (!hasLoadedContent) {
        try {
          console.log('Adding default content as no valid content was loaded');
          // Create a default paragraph
          const defaultBlock: PartialBlock = {
            type: "paragraph",
            content: [{ type: "text", text: "Start typing here...", styles: {} }],
            props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' }
          };
          
          // Check if the editor already has blocks
          if (!newEditor.topLevelBlocks || newEditor.topLevelBlocks.length === 0) {
            // If no blocks, insert our default block at the beginning
            newEditor.insertBlocks([defaultBlock], null, "after");
          } else {
            // If there are blocks but they're empty, replace with our default
            newEditor.replaceBlocks(newEditor.topLevelBlocks, [defaultBlock]);
          }
        } catch (err) {
          console.error('Error adding default content:', err);
        }
      }

      // Set up onChange handler
      if (onChange) {
        newEditor.onChange(() => {
          try {
            const blocks = newEditor.topLevelBlocks;
            if (!blocks || blocks.length === 0) {
              console.warn('Editor has no blocks, not updating content');
              return;
            }
            
            const content = JSON.stringify(blocks);
            console.log('Editor content changed, blocks count:', blocks.length);
            onChange(content);
          } catch (error) {
            console.error('Error saving content:', error);
          }
        });
      }

      // Store the editor in state
      setEditor(newEditor);
    } catch (err) {
      console.error('Failed to create editor:', err);
    }
  }, [className, initialContent, onChange, readOnly]);

  // Update read-only state when changed
  useEffect(() => {
    if (editor) {
      editor.isEditable = !readOnly;
    }
  }, [editor, readOnly]);

  // Fallback UI when editor fails to render
  const fallbackEditor = (
    <div className="p-6 bg-gray-50 rounded border border-gray-200">
      <h3 className="text-lg font-medium text-red-600">Editor could not be loaded</h3>
      <p className="mt-2 text-gray-600">
        There was a problem loading the editor. Your changes will still be saved, but you may need to refresh the page.
      </p>
      {!readOnly && (
        <textarea 
          className="w-full h-48 mt-4 p-3 border rounded" 
          placeholder="You can type your content here..."
          onChange={(e) => onChange?.(JSON.stringify([{
            id: 'fallback-content',
            type: 'paragraph',
            props: { textColor: 'default', backgroundColor: 'default' },
            content: [{ type: 'text', text: e.target.value, styles: {} }],
            children: []
          }]))}
        />
      )}
    </div>
  );

  // Create a reference to the editor DOM element
  const editorRef = useRef<HTMLDivElement>(null);
  // Track if the editor is mounted
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Mount the editor to the DOM when the editor instance and DOM element are available
  useEffect(() => {
    if (editor && editorRef.current && !isMounted) {
      // Use a small delay to ensure the DOM is fully ready
      const mountTimer = setTimeout(() => {
        try {
          // Mount the editor to the DOM element
          editor.mount(editorRef.current!);
          setIsMounted(true);
          
          // Auto-focus the editor if requested and not in read-only mode
          if (autoFocus && !readOnly && editorRef.current) {
            // Small additional delay to ensure editor is fully initialized
            setTimeout(() => {
              try {
                // Try to find the contenteditable element within the editor
                const editableElements = editorRef.current?.querySelectorAll('[contenteditable=true]');
                if (editableElements && editableElements.length > 0) {
                  // Focus the first contenteditable element
                  const editableElement = editableElements[0] as HTMLElement;
                  editableElement.focus();
                  console.log('Editor focused using DOM approach on mount');
                  
                  // Try to place cursor at the end of the text
                  try {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    
                    // If the element has child nodes, select the last one
                    if (editableElement.childNodes.length > 0) {
                      const lastNode = editableElement.childNodes[editableElement.childNodes.length - 1];
                      if (lastNode.nodeType === Node.TEXT_NODE) {
                        // If it's a text node, place cursor at the end of the text
                        range.setStart(lastNode, lastNode.textContent?.length || 0);
                      } else {
                        // Otherwise append to the element
                        range.selectNodeContents(lastNode);
                        range.collapse(false); // collapse to end
                      }
                    } else {
                      // If no child nodes, just select the element itself
                      range.selectNodeContents(editableElement);
                      range.collapse(false); // collapse to end
                    }
                    
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                  } catch (selectionErr) {
                    console.warn('Could not set cursor position on mount, but element is focused:', selectionErr);
                  }
                } else {
                  // Fallback to the editor's focus method
                  try {
                    editor.focus();
                  } catch (editorFocusErr) {
                    console.warn('Could not focus editor using API on mount:', editorFocusErr);
                  }
                }
              } catch (focusErr) {
                console.error('Error focusing editor on mount:', focusErr);
              }
            }, 300);
          }
        } catch (err) {
          console.error('Failed to mount editor:', err);
        }
      }, 100);
      
      // Clean up on unmount
      return () => {
        clearTimeout(mountTimer);
        // Try to clean up the editor if it was mounted
        try {
          if (isMounted && editorRef.current) {
            // Remove the editor's DOM content manually since there's no unmount method
            if (editorRef.current.firstChild) {
              editorRef.current.innerHTML = '';
            }
          }
        } catch (err) {
          console.error('Error during cleanup:', err);
        }
      };
    }
  }, [editor, editorRef, isMounted, autoFocus, readOnly]);
  
  // Focus the editor when it transitions from readOnly to editable
  useEffect(() => {
    // Only proceed if editor is mounted and we're in edit mode
    if (editor && isMounted && !readOnly && autoFocus && editorRef.current) {
      // Use a longer delay to ensure the editor is fully ready after the readOnly state changes
      const focusTimer = setTimeout(() => {
        try {
          // Try to find the contenteditable element within the editor
          const editableElements = editorRef.current?.querySelectorAll('[contenteditable=true]');
          if (editableElements && editableElements.length > 0) {
            // Focus the first contenteditable element
            const editableElement = editableElements[0] as HTMLElement;
            editableElement.focus();
            console.log('Editor focused using DOM approach');
            
            // Try to place cursor at the end of the text
            try {
              const selection = window.getSelection();
              const range = document.createRange();
              
              // If the element has child nodes, select the last one
              if (editableElement.childNodes.length > 0) {
                const lastNode = editableElement.childNodes[editableElement.childNodes.length - 1];
                if (lastNode.nodeType === Node.TEXT_NODE) {
                  // If it's a text node, place cursor at the end of the text
                  range.setStart(lastNode, lastNode.textContent?.length || 0);
                } else {
                  // Otherwise append to the element
                  range.selectNodeContents(lastNode);
                  range.collapse(false); // collapse to end
                }
              } else {
                // If no child nodes, just select the element itself
                range.selectNodeContents(editableElement);
                range.collapse(false); // collapse to end
              }
              
              selection?.removeAllRanges();
              selection?.addRange(range);
            } catch (selectionErr) {
              console.warn('Could not set cursor position, but element is focused:', selectionErr);
            }
          } else {
            // Fallback to the editor's focus method if we can't find contenteditable elements
            try {
              editor.focus();
            } catch (editorFocusErr) {
              console.warn('Could not focus editor using API:', editorFocusErr);
            }
          }
        } catch (err) {
          console.error('Error focusing editor after readOnly change:', err);
        }
      }, 300); // Increased delay for better reliability
      
      return () => clearTimeout(focusTimer);
    }
  }, [editor, isMounted, readOnly, autoFocus, editorRef]);

  // Return the editor with an error boundary
  return (
    <div className={`border rounded-md ${className}`}>
      {parseError && (
        <div className="bg-yellow-50 p-2 text-xs text-yellow-800 border-b">
          Note: Editor initialized with default content due to formatting issues. Your changes will still be saved correctly.
        </div>
      )}
      <EditorErrorBoundary fallback={fallbackEditor}>
        {editor ? (
          <div 
            ref={editorRef} 
            className="p-4 min-h-[200px] border border-gray-200 rounded"
            data-testid="editor-container"
          ></div>
        ) : (
          <div className="p-4 text-gray-500">Loading editor...</div>
        )}
      </EditorErrorBoundary>
    </div>
  );
};

export default WikiEditor;
