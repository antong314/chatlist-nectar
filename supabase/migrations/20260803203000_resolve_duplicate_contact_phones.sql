-- Resolve known duplicate phone-number listings before enforcing normalized
-- phone uniqueness. These are soft deletes so the records remain recoverable.

DO $$
DECLARE
  mismatched_record TEXT;
BEGIN
  SELECT expected.title
  INTO mismatched_record
  FROM (
    VALUES
      ('57d89782-7df4-4b57-b15c-221eef71c959'::UUID, 'Juan'),
      ('5169a4e7-7ed0-4c79-8cf1-fb5022d0a1cb'::UUID, 'Michael Blahut, DO'),
      ('c6ff23ff-deb8-4542-99d0-93bdf1875118'::UUID, 'Michael Blahut, DO'),
      ('534761c7-44d2-4149-a445-2b4b34ba71ff'::UUID, 'Matthew Human'),
      ('9c42bb6e-b9f0-4483-994b-5f8c49936f3d'::UUID, 'Stefany Milazzo')
  ) AS expected(id, title)
  LEFT JOIN public.contacts AS contacts
    ON contacts.id = expected.id
   AND contacts.title = expected.title
  WHERE contacts.id IS NULL
  LIMIT 1;

  IF mismatched_record IS NOT NULL THEN
    RAISE EXCEPTION 'Expected contact was missing or renamed: %', mismatched_record;
  END IF;
END;
$$;

UPDATE public.contacts
SET is_deleted = TRUE
WHERE id IN (
  '57d89782-7df4-4b57-b15c-221eef71c959'::UUID, -- Juan; keep Plomero Juan Jose
  '5169a4e7-7ed0-4c79-8cf1-fb5022d0a1cb'::UUID, -- Michael Blahut, DO (Healer)
  'c6ff23ff-deb8-4542-99d0-93bdf1875118'::UUID, -- Michael Blahut, DO (Service)
  '534761c7-44d2-4149-a445-2b4b34ba71ff'::UUID, -- Matthew Human; keep Finca Vida Verde
  '9c42bb6e-b9f0-4483-994b-5f8c49936f3d'::UUID  -- Stefany Milazzo; keep DeliCru
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.contacts
    WHERE id IN (
      '57d89782-7df4-4b57-b15c-221eef71c959'::UUID,
      '5169a4e7-7ed0-4c79-8cf1-fb5022d0a1cb'::UUID,
      'c6ff23ff-deb8-4542-99d0-93bdf1875118'::UUID,
      '534761c7-44d2-4149-a445-2b4b34ba71ff'::UUID,
      '9c42bb6e-b9f0-4483-994b-5f8c49936f3d'::UUID
    )
      AND is_deleted = FALSE
  ) THEN
    RAISE EXCEPTION 'One or more duplicate contacts remained active';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
