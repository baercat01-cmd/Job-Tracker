-- Keep exactly one formal proposal for a job, delete all others, renumber the keeper to {jobBase}-1.
-- Uses public.delete_proposal() for each removed quote.
--
-- Lookup tries several strategies (exact formal → relaxed → normalized digits).
-- Set v_job_id_filter when the same display number could exist on multiple jobs.
--
-- If nothing matches, run the diagnostic SELECT at the bottom of this file (commented).

BEGIN;

DO $$
DECLARE
  v_display_number text := '26040-11'; -- UI label, or NULL if using v_keep_quote_id only
  v_job_id_filter uuid := NULL; -- strongly recommended: job UUID from office URL or jobs table
  v_keep_quote_id uuid := NULL; -- optional: paste quotes.id to skip all lookups
  v_job_id uuid;
  v_base text;
  v_new text;
  v_norm_digits text;
  r record;
  v_has_pn boolean;
  v_has_qn boolean;
  v_has_est boolean;
  v_has_updated_at boolean;
  v_has_en boolean;
  v_est_formal text;
  v_est_any text := 'true';
  v_sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'proposal_number'
  ) INTO v_has_pn;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'quote_number'
  ) INTO v_has_qn;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'is_customer_estimate'
  ) INTO v_has_est;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'updated_at'
  ) INTO v_has_updated_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'estimate_number'
  ) INTO v_has_en;

  IF NOT v_has_pn AND NOT v_has_qn THEN
    RAISE EXCEPTION '%',
      'public.quotes has neither proposal_number nor quote_number; add one or set v_keep_quote_id.';
  END IF;

  v_est_formal := CASE
    WHEN v_has_est THEN 'COALESCE(q.is_customer_estimate, false) = false'
    ELSE 'true'
  END;

  IF v_keep_quote_id IS NULL OR v_keep_quote_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    v_keep_quote_id := NULL;
  END IF;

  v_norm_digits := regexp_replace(
    regexp_replace(lower(btrim(COALESCE(v_display_number, ''))), '\s', '', 'g'),
    '[^0-9]',
    '',
    'g'
  );

  IF v_keep_quote_id IS NULL THEN
    IF v_display_number IS NULL OR btrim(v_display_number) = '' THEN
      RAISE EXCEPTION '%',
        'Set v_display_number (e.g. ''26040-11'') or set v_keep_quote_id to the quote UUID.';
    END IF;

    IF v_norm_digits = '' THEN
      RAISE EXCEPTION '%', 'v_display_number has no digits; cannot match.';
    END IF;

    -- Pass 1: exact text match, formal rows only
    IF v_has_pn AND v_has_qn THEN
      v_sql := format(
        $q$
        SELECT q.id FROM public.quotes q
        WHERE (
          btrim(COALESCE(q.proposal_number, '')) = btrim($1)
          OR btrim(COALESCE(q.quote_number, '')) = btrim($1)
        )
          AND (%s)
          AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
        ORDER BY q.created_at DESC NULLS LAST, q.id DESC
        LIMIT 1
        $q$,
        v_est_formal
      );
    ELSIF v_has_pn THEN
      v_sql := format(
        $q$
        SELECT q.id FROM public.quotes q
        WHERE btrim(COALESCE(q.proposal_number, '')) = btrim($1)
          AND (%s)
          AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
        ORDER BY q.created_at DESC NULLS LAST, q.id DESC
        LIMIT 1
        $q$,
        v_est_formal
      );
    ELSE
      v_sql := format(
        $q$
        SELECT q.id FROM public.quotes q
        WHERE btrim(COALESCE(q.quote_number, '')) = btrim($1)
          AND (%s)
          AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
        ORDER BY q.created_at DESC NULLS LAST, q.id DESC
        LIMIT 1
        $q$,
        v_est_formal
      );
    END IF;

    EXECUTE v_sql INTO v_keep_quote_id USING v_display_number, v_job_id_filter;

    -- Pass 2: exact text, any row (wrong is_customer_estimate flag)
    IF v_keep_quote_id IS NULL AND v_has_est THEN
      IF v_has_pn AND v_has_qn THEN
        v_sql := format(
          $q$
          SELECT q.id FROM public.quotes q
          WHERE (
            btrim(COALESCE(q.proposal_number, '')) = btrim($1)
            OR btrim(COALESCE(q.quote_number, '')) = btrim($1)
          )
            AND (%s)
            AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
          ORDER BY q.created_at DESC NULLS LAST, q.id DESC
          LIMIT 1
          $q$,
          v_est_any
        );
      ELSIF v_has_pn THEN
        v_sql := format(
          $q$
          SELECT q.id FROM public.quotes q
          WHERE btrim(COALESCE(q.proposal_number, '')) = btrim($1)
            AND (%s)
            AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
          ORDER BY q.created_at DESC NULLS LAST, q.id DESC
          LIMIT 1
          $q$,
          v_est_any
        );
      ELSE
        v_sql := format(
          $q$
          SELECT q.id FROM public.quotes q
          WHERE btrim(COALESCE(q.quote_number, '')) = btrim($1)
            AND (%s)
            AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
          ORDER BY q.created_at DESC NULLS LAST, q.id DESC
          LIMIT 1
          $q$,
          v_est_any
        );
      END IF;
      EXECUTE v_sql INTO v_keep_quote_id USING v_display_number, v_job_id_filter;
      IF v_keep_quote_id IS NOT NULL THEN
        RAISE NOTICE 'Matched with relaxed is_customer_estimate filter; confirm this is the intended quote.';
      END IF;
    END IF;

    -- Pass 3: digits-only match on proposal_number / quote_number (+ estimate_number if column exists), formal
    IF v_keep_quote_id IS NULL THEN
      IF v_has_pn AND v_has_qn THEN
        IF v_has_en THEN
          v_sql := format(
            $q$
            SELECT q.id FROM public.quotes q
            WHERE (
              regexp_replace(regexp_replace(lower(btrim(COALESCE(q.proposal_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
              OR regexp_replace(regexp_replace(lower(btrim(COALESCE(q.quote_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
              OR regexp_replace(regexp_replace(lower(btrim(COALESCE(q.estimate_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
            )
              AND (%s)
              AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
            ORDER BY q.created_at DESC NULLS LAST, q.id DESC
            LIMIT 1
            $q$,
            v_est_formal
          );
        ELSE
          v_sql := format(
            $q$
            SELECT q.id FROM public.quotes q
            WHERE (
              regexp_replace(regexp_replace(lower(btrim(COALESCE(q.proposal_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
              OR regexp_replace(regexp_replace(lower(btrim(COALESCE(q.quote_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
            )
              AND (%s)
              AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
            ORDER BY q.created_at DESC NULLS LAST, q.id DESC
            LIMIT 1
            $q$,
            v_est_formal
          );
        END IF;
      ELSIF v_has_pn THEN
        v_sql := format(
          $q$
          SELECT q.id FROM public.quotes q
          WHERE regexp_replace(regexp_replace(lower(btrim(COALESCE(q.proposal_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
            AND (%s)
            AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
          ORDER BY q.created_at DESC NULLS LAST, q.id DESC
          LIMIT 1
          $q$,
          v_est_formal
        );
      ELSE
        v_sql := format(
          $q$
          SELECT q.id FROM public.quotes q
          WHERE regexp_replace(regexp_replace(lower(btrim(COALESCE(q.quote_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
            AND (%s)
            AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
          ORDER BY q.created_at DESC NULLS LAST, q.id DESC
          LIMIT 1
          $q$,
          v_est_formal
        );
      END IF;
      EXECUTE v_sql INTO v_keep_quote_id USING v_display_number, v_job_id_filter, v_norm_digits;
      IF v_keep_quote_id IS NOT NULL THEN
        RAISE NOTICE 'Matched using digit-normalized proposal_number / quote_number; confirm this is the intended quote.';
      END IF;
    END IF;

    -- Pass 4: digits-only, ignore customer-estimate filter
    IF v_keep_quote_id IS NULL AND v_has_est THEN
      IF v_has_pn AND v_has_qn THEN
        IF v_has_en THEN
          v_sql := format(
            $q$
            SELECT q.id FROM public.quotes q
            WHERE (
              regexp_replace(regexp_replace(lower(btrim(COALESCE(q.proposal_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
              OR regexp_replace(regexp_replace(lower(btrim(COALESCE(q.quote_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
              OR regexp_replace(regexp_replace(lower(btrim(COALESCE(q.estimate_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
            )
              AND (%s)
              AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
            ORDER BY q.created_at DESC NULLS LAST, q.id DESC
            LIMIT 1
            $q$,
            v_est_any
          );
        ELSE
          v_sql := format(
            $q$
            SELECT q.id FROM public.quotes q
            WHERE (
              regexp_replace(regexp_replace(lower(btrim(COALESCE(q.proposal_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
              OR regexp_replace(regexp_replace(lower(btrim(COALESCE(q.quote_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
            )
              AND (%s)
              AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
            ORDER BY q.created_at DESC NULLS LAST, q.id DESC
            LIMIT 1
            $q$,
            v_est_any
          );
        END IF;
      ELSIF v_has_pn THEN
        v_sql := format(
          $q$
          SELECT q.id FROM public.quotes q
          WHERE regexp_replace(regexp_replace(lower(btrim(COALESCE(q.proposal_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
            AND (%s)
            AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
          ORDER BY q.created_at DESC NULLS LAST, q.id DESC
          LIMIT 1
          $q$,
          v_est_any
        );
      ELSE
        v_sql := format(
          $q$
          SELECT q.id FROM public.quotes q
          WHERE regexp_replace(regexp_replace(lower(btrim(COALESCE(q.quote_number, ''))), '\s', '', 'g'), '[^0-9]', '', 'g') = $3
            AND (%s)
            AND ($2::uuid IS NULL OR q.job_id = $2::uuid)
          ORDER BY q.created_at DESC NULLS LAST, q.id DESC
          LIMIT 1
          $q$,
          v_est_any
        );
      END IF;
      EXECUTE v_sql INTO v_keep_quote_id USING v_display_number, v_job_id_filter, v_norm_digits;
      IF v_keep_quote_id IS NOT NULL THEN
        RAISE NOTICE 'Matched with digit normalization and relaxed is_customer_estimate; confirm before relying on deletes.';
      END IF;
    END IF;

    IF v_keep_quote_id IS NULL THEN
      RAISE EXCEPTION '%',
        format(
          'No quote matched display number %s after exact + digit-normalized lookups (with/without is_customer_estimate). '
          || 'Set v_job_id_filter to this job UUID from the office app URL, or set v_keep_quote_id to quotes.id from Table Editor. '
          || 'Diagnostic: SELECT id, job_id, proposal_number, quote_number, estimate_number, is_customer_estimate FROM public.quotes WHERE job_id = YOUR_JOB_UUID ORDER BY created_at DESC;',
          btrim(v_display_number)
        );
    END IF;
  END IF;

  SELECT q.job_id INTO v_job_id FROM public.quotes q WHERE q.id = v_keep_quote_id;
  IF v_job_id IS NULL THEN
    RAISE EXCEPTION '%', format('Quote %s not found or job_id is null', v_keep_quote_id);
  END IF;

  IF v_has_est AND COALESCE((SELECT is_customer_estimate FROM public.quotes WHERE id = v_keep_quote_id), false) THEN
    RAISE EXCEPTION '%',
      format(
        'Keeper %s is is_customer_estimate=true. Clear the flag or pick a formal row (set v_keep_quote_id to a formal quote UUID).',
        v_keep_quote_id
      );
  END IF;

  IF v_has_pn AND v_has_qn THEN
    EXECUTE
      $q$
      SELECT (regexp_match(COALESCE(proposal_number, quote_number, ''), '^([0-9]+)-'))[1]
      FROM public.quotes
      WHERE id = $1
        AND (
          COALESCE(proposal_number, '') ~ '^[0-9]+-[0-9]+$'
          OR COALESCE(quote_number, '') ~ '^[0-9]+-[0-9]+$'
        )
      $q$
    INTO v_base
    USING v_keep_quote_id;
  ELSIF v_has_pn THEN
    EXECUTE
      $q$
      SELECT (regexp_match(proposal_number, '^([0-9]+)-'))[1]
      FROM public.quotes
      WHERE id = $1 AND proposal_number ~ '^[0-9]+-[0-9]+$'
      $q$
    INTO v_base
    USING v_keep_quote_id;
  ELSE
    EXECUTE
      $q$
      SELECT (regexp_match(quote_number, '^([0-9]+)-'))[1]
      FROM public.quotes
      WHERE id = $1 AND quote_number ~ '^[0-9]+-[0-9]+$'
      $q$
    INTO v_base
    USING v_keep_quote_id;
  END IF;

  IF v_base IS NULL OR btrim(v_base) = '' THEN
    RAISE EXCEPTION '%',
      format(
        'Could not parse base from proposal_number/quote_number on quote %s (need pattern like 26040-11).',
        v_keep_quote_id
      );
  END IF;

  v_new := v_base || '-1';

  v_sql := format(
    $q$
    SELECT q.id FROM public.quotes q
    WHERE q.job_id = $1
      AND q.id IS DISTINCT FROM $2
      AND (%s)
    $q$,
    v_est_formal
  );
  FOR r IN EXECUTE v_sql USING v_job_id, v_keep_quote_id LOOP
    PERFORM public.delete_proposal(r.id);
  END LOOP;

  IF v_has_pn AND v_has_qn THEN
    IF v_has_updated_at THEN
      UPDATE public.quotes
      SET proposal_number = v_new, quote_number = v_new, updated_at = now()
      WHERE id = v_keep_quote_id;
    ELSE
      UPDATE public.quotes
      SET proposal_number = v_new, quote_number = v_new
      WHERE id = v_keep_quote_id;
    END IF;
  ELSIF v_has_pn THEN
    IF v_has_updated_at THEN
      UPDATE public.quotes
      SET proposal_number = v_new, updated_at = now()
      WHERE id = v_keep_quote_id;
    ELSE
      UPDATE public.quotes
      SET proposal_number = v_new
      WHERE id = v_keep_quote_id;
    END IF;
  ELSE
    IF v_has_updated_at THEN
      UPDATE public.quotes
      SET quote_number = v_new, updated_at = now()
      WHERE id = v_keep_quote_id;
    ELSE
      UPDATE public.quotes
      SET quote_number = v_new
      WHERE id = v_keep_quote_id;
    END IF;
  END IF;

  RAISE NOTICE '%',
    format('Done: kept %s, set numbering to %s (updated existing columns only)', v_keep_quote_id, v_new);
END $$;

COMMIT;

-- Diagnostic (run separately; paste your job id or search string):
-- SELECT id, job_id, proposal_number, quote_number, estimate_number, is_customer_estimate, created_at
-- FROM public.quotes
-- WHERE proposal_number ILIKE '%26040-11%' OR quote_number ILIKE '%26040-11%' OR estimate_number ILIKE '%26040-11%'
-- ORDER BY created_at DESC;
