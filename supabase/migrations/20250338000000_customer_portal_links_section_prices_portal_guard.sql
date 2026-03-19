-- Legacy installs expose portal data via customer_portal_links.show_section_prices_portal (NOT NULL).
-- Partial REST updates (omitting section prices) can set that column to NULL via views/rules.
-- This trigger preserves the previous value (or false on INSERT) when NULL would be written.

CREATE OR REPLACE FUNCTION public.trg_preserve_customer_portal_links_section_prices_portal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.show_section_prices_portal IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.show_section_prices_portal := COALESCE(OLD.show_section_prices_portal, false);
    ELSE
      NEW.show_section_prices_portal := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.customer_portal_links') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'customer_portal_links'
         AND column_name = 'show_section_prices_portal'
     ) THEN
    DROP TRIGGER IF EXISTS tr_preserve_show_section_prices_portal ON public.customer_portal_links;
    CREATE TRIGGER tr_preserve_show_section_prices_portal
      BEFORE INSERT OR UPDATE ON public.customer_portal_links
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_preserve_customer_portal_links_section_prices_portal();
  END IF;
END $$;
