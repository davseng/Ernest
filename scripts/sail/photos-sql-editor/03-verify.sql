-- READ ONLY. Same isolated ernest-v011-test / neondb branch after COMMIT.
BEGIN READ ONLY;
SELECT name,applied_at FROM public.schema_migrations WHERE name='028_sail_photos.sql';
SELECT to_regclass('public.sail_media') AS relation;
SELECT count(*) AS photo_count FROM sail_media;
SELECT column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='sail_media' AND column_name IN ('asset_id','owner_id','voyage_id','ready','published','home_cover','voyage_cover','width','height','revision') ORDER BY column_name;
COMMIT;
