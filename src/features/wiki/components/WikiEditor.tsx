import React, { Component, useEffect, ErrorInfo, ReactNode } from 'react';
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
  // Creates a new editor instance with default content
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

  // Update read-only state when changed
  useEffect(() => {
    if (editor) {
      editor.isEditable = !readOnly;
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
