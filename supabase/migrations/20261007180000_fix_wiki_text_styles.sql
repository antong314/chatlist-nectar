-- BlockNote fails to load a text node without `styles`, leaving the wiki page blank.
-- Machu wrote such nodes (and early page placeholders had them); add `styles: {}` everywhere,
-- including audit snapshots that undo restores from.

CREATE OR REPLACE FUNCTION pg_temp.wiki_text_styles(node JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result JSONB;
BEGIN
  CASE jsonb_typeof(node)
  WHEN 'array' THEN
    SELECT COALESCE(jsonb_agg(pg_temp.wiki_text_styles(element) ORDER BY position), '[]'::JSONB)
      INTO result
      FROM jsonb_array_elements(node) WITH ORDINALITY AS items(element, position);
    RETURN result;
  WHEN 'object' THEN
    SELECT COALESCE(jsonb_object_agg(key, pg_temp.wiki_text_styles(value)), '{}'::JSONB)
      INTO result
      FROM jsonb_each(node);
    IF result->>'type' = 'text' AND jsonb_typeof(result->'styles') IS DISTINCT FROM 'object' THEN
      result := result || '{"styles": {}}'::JSONB;
    END IF;
    RETURN result;
  ELSE
    RETURN node;
  END CASE;
END;
$$;

-- Content is stored as a JSON string holding the serialized block array.
CREATE OR REPLACE FUNCTION pg_temp.fixed_wiki_content(content JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  blocks JSONB;
BEGIN
  IF jsonb_typeof(content) IS DISTINCT FROM 'string' THEN
    RETURN content;
  END IF;
  BEGIN
    blocks := (content #>> '{}')::JSONB;
  EXCEPTION WHEN others THEN
    RETURN content;
  END;
  IF pg_temp.wiki_text_styles(blocks) = blocks THEN
    RETURN content;
  END IF;
  RETURN to_jsonb(pg_temp.wiki_text_styles(blocks)::TEXT);
END;
$$;

UPDATE public.wiki_pages
SET content = pg_temp.fixed_wiki_content(content)
WHERE pg_temp.fixed_wiki_content(content) IS DISTINCT FROM content;

UPDATE public.wiki_change_events
SET before_snapshot = jsonb_set(before_snapshot, '{content}', pg_temp.fixed_wiki_content(before_snapshot->'content'))
WHERE before_snapshot ? 'content'
  AND pg_temp.fixed_wiki_content(before_snapshot->'content') IS DISTINCT FROM before_snapshot->'content';

UPDATE public.wiki_change_events
SET after_snapshot = jsonb_set(after_snapshot, '{content}', pg_temp.fixed_wiki_content(after_snapshot->'content'))
WHERE after_snapshot ? 'content'
  AND pg_temp.fixed_wiki_content(after_snapshot->'content') IS DISTINCT FROM after_snapshot->'content';
