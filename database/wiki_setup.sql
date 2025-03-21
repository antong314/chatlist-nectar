-- Create table for wiki pages
CREATE TABLE IF NOT EXISTS wiki_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  is_published BOOLEAN DEFAULT TRUE
);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON wiki_pages
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- Create RLS policies for wiki pages
ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;

-- Policy for anyone to read published pages
CREATE POLICY "Anyone can read published wiki pages"
  ON wiki_pages
  FOR SELECT
  USING (is_published = TRUE);

-- Policy for authenticated users to create pages
CREATE POLICY "Authenticated users can create wiki pages"
  ON wiki_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

-- Policy for authenticated users to update pages
CREATE POLICY "Authenticated users can update any wiki page"
  ON wiki_pages
  FOR UPDATE
  TO authenticated
  USING (TRUE);

-- Policy for authenticated users to delete pages
CREATE POLICY "Authenticated users can delete any wiki page"
  ON wiki_pages
  FOR DELETE
  TO authenticated
  USING (TRUE);

-- Insert initial welcome page
INSERT INTO wiki_pages (slug, title, content, excerpt)
VALUES (
  'welcome',
  'Welcome to the Wiki',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Welcome to our Community Wiki"}]},{"type":"paragraph","content":[{"type":"text","text":"This is a collaborative space where we can share knowledge and resources about our community."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Getting Started"}]},{"type":"paragraph","content":[{"type":"text","text":"To create a new page, click the \"New Page\" button on the wiki home page. To edit this or any other page, click the \"Edit\" button."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Features"}]},{"type":"bullet_list","content":[{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"Rich text editor with formatting options"}]}]},{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"Page organization"}]}]},{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"Export pages to share with others"}]}]}]}]}',
  'A quick introduction to the community wiki and how to use it'
) ON CONFLICT (slug) DO NOTHING;
