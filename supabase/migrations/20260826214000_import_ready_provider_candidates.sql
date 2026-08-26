-- Import high-confidence provider candidates while preserving active directory records.
-- Rows matching an active phone, title, or website are deliberately skipped.

WITH candidates (title, category, subtitle, phone_number, website_url, map_url) AS (
  VALUES
  ('Andrew Jenkin — Breathwork', 'Healer', 'Guided breathwork ceremonies, an online breath practice community, and individual breathwork sessions.', NULL, 'https://chat.whatsapp.com/BvGcDq5uGfY1w5BS9st1Kl', NULL),
  ('Arq. Dixon Badilla R. — Architecture, Design & Construction', 'Construction', 'Architecture, permitting, budgeting, construction supervision, and turnkey residential and commercial project management.', '+50687566345', NULL, NULL),
  ('Art House Atenas', 'Service', 'Independent film screenings and community cinema programming in central Atenas.', '+50688163482', 'mailto:arthouseatenas@gmail.com', NULL),
  ('Artesano del Cuerpo — Myofascial Shiatsu', 'Healer', 'Myofascial Shiatsu, craniofacial bodywork, and Kobido sessions focused on mobility, relaxation, and tension relief.', '+50663804288', 'https://artesanodelcuerpo.com', NULL),
  ('Britt — In-Home Massage & Bodywork', 'Healer', 'In-home massage and bodywork sessions for relaxation, nervous-system support, and physical tension.', NULL, 'https://www.instagram.com/reel/DWRJ6OPjgJ-/', NULL),
  ('Christy Quesada — Dance & Spanish Instruction', 'Service', 'Spanish instruction and dance classes, including ballet and Latin dance offerings.', '+50683283766', NULL, NULL),
  ('Dr. Chinca Experience', 'Retreats', 'Small-group guided journeys and retreat-style experiences in Egypt.', NULL, 'https://www.chinca-experience.com', NULL),
  ('Eli Barber Studio', 'Service', 'Mobile and local barber services in Alegría and Ecovilla San Mateo.', '+50660832731', 'https://www.instagram.com/elibaberstudio2025', NULL),
  ('Flor de Potrero', 'Service', 'Local restaurant offering meals, sourdough baking, reservations, takeout, delivery, and community programming.', '+50684440179', 'https://www.instagram.com/flordepotrerocr', 'https://maps.app.goo.gl/wdGq2cSRJ3HB1MLHA'),
  ('Francisco Elizondo — Water Treatment Services', 'Service', 'On-site water filtration consultation and systems for sediment, metals, chlorine taste, and bacteria reduction.', '+50672707082', 'https://whatsapp.com/channel/0029VbD7OWFDDmFbCOtL052c', NULL),
  ('Green Pacífico — Luis Armando', 'Service', 'Gardening, landscaping, tree pruning, lot cleanup, outdoor improvements, and property maintenance.', '+50686903015', 'mailto:greenpacifico.cr@gmail.com', NULL),
  ('Gym Multifitness Orotina', 'Service', 'Orotina fitness center with gym access and group GAP, boxing, and spinning classes.', '+50689525252', NULL, NULL),
  ('Jesai Jayhmes — Teatro de la Tierra', 'Creative', 'Weekly acting and theater classes for adults, led by Teatro de la Tierra’s artistic director.', '+17187496303', 'https://www.teatrodelatierra.com/', NULL),
  ('Juan Carlos Mejías — Official Taxi Orotina', 'Taxi', 'Insured formal taxi service based in Orotina, available for advance-booked trips throughout Costa Rica.', '+50688362732', NULL, NULL),
  ('MARMORIA — Angela de la Agua', 'Creative', 'Portrait photography sessions with a guided, personalized approach.', NULL, 'https://angeladelaagua.com/portrait-ceremony', NULL),
  ('Maximilian Merling — Custom Sacred Geometry Art', 'Creative', 'Custom interior artwork in wood, canvas, glass, and copper using geometric designs.', '+50670788311', NULL, NULL),
  ('Pol Costa Rica — The Digital Navigator', 'Service', 'Websites, apps, technology operations, and digital marketing support for online educators, coaches, and membership businesses.', NULL, 'https://thedigitalnavigator.com/', NULL),
  ('Regenerative Earth Designs — Paola Triviño', 'Construction', 'Regenerative landscaping, water and erosion management, land planning, and natural hardscape consulting.', '+50670644913', 'https://www.regenerativeearthdesigns.com', NULL),
  ('Samuel Rotker — Web Strategy & Development', 'Service', 'Web strategy, website planning, and development consulting for businesses and community projects.', NULL, 'https://samuelrotker.dev', NULL),
  ('Sazón Vegetariano', 'Service', 'Prepared vegetarian, vegan, and gluten-free meals, frozen-food delivery, and school meal plans.', NULL, 'https://wa.me/message/7C7JU43CXS5TH1', 'https://maps.app.goo.gl/NGKEhcmdkc4LTops5'),
  ('Scott Gallant — Porvenir Design', 'Construction', 'Syntropic agroforestry education, farm-design guidance, and tropical planting workshops.', NULL, 'https://www.porvenirdesign.com/', NULL),
  ('Servicios Técnicos Lizano Atenas', 'Service', 'Technical inspection and small-appliance repair service in Atenas.', '+50683543948', NULL, NULL),
  ('Soluciones y Reparaciones MyG', 'Construction', 'Construction, remodeling, painting, plumbing, electrical work, welding, air-conditioning, refrigeration, and appliance repair.', NULL, 'https://www.facebook.com/share/1bcM9i4yzn/', NULL),
  ('Sunshine Sitters — Harper', 'Service', 'Childcare and children’s camps with games, crafts, and supervised activities.', '+50671497509', NULL, NULL)
)
INSERT INTO public.contacts (
  title,
  category,
  subtitle,
  phone_number,
  website_url,
  map_url
)
SELECT
  candidates.title,
  candidates.category,
  candidates.subtitle,
  candidates.phone_number,
  candidates.website_url,
  candidates.map_url
FROM candidates
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contacts AS existing
  WHERE existing.is_deleted = FALSE
    AND (
      lower(btrim(existing.title)) = lower(btrim(candidates.title))
      OR (
        public.normalize_contact_phone(candidates.phone_number) IS NOT NULL
        AND existing.phone_normalized = public.normalize_contact_phone(candidates.phone_number)
      )
      OR (
        NULLIF(lower(btrim(candidates.website_url)), '') IS NOT NULL
        AND lower(btrim(existing.website_url)) = lower(btrim(candidates.website_url))
      )
    )
)
ON CONFLICT DO NOTHING;
