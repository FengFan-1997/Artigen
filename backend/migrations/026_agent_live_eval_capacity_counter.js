/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION public.artigen_live_eval_client_connection_count()
    RETURNS integer
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $function$
    DECLARE
      owner_can_read_all_stats boolean;
    BEGIN
      SELECT role.rolsuper OR pg_has_role(role.oid, 'pg_read_all_stats', 'USAGE')
        INTO owner_can_read_all_stats
        FROM pg_catalog.pg_roles AS role
       WHERE role.rolname = current_user;

      IF NOT COALESCE(owner_can_read_all_stats, false) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'ARTIGEN_LIVE_EVAL_STATS_OWNER_NOT_READY';
      END IF;

      RETURN (
        SELECT count(*)::integer
          FROM pg_catalog.pg_stat_get_activity(NULL)
         WHERE backend_type = 'client backend'
      );
    END
    $function$;

    REVOKE ALL ON FUNCTION public.artigen_live_eval_client_connection_count() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.artigen_live_eval_client_connection_count() TO PUBLIC;

    COMMENT ON FUNCTION public.artigen_live_eval_client_connection_count() IS
      'Returns only the cluster-wide regular client connection count for the signed DEV live-eval gate.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP FUNCTION IF EXISTS public.artigen_live_eval_client_connection_count();
  `);
};
