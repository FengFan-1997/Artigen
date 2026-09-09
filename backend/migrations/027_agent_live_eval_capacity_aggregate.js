/* eslint-disable camelcase */

// Aiven's managed PostgreSQL roles may not be allowed to inherit the
// pg_read_all_stats predefined role.  numbackends is an aggregate-only,
// non-sensitive counter that remains readable by the restricted runtime role
// and covers every database in the cluster.
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION public.artigen_live_eval_client_connection_count_aggregate()
    RETURNS integer
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = pg_catalog
    AS $function$
      SELECT COALESCE(SUM(numbackends), 0)::integer
        FROM pg_catalog.pg_stat_database
       WHERE datname IS NOT NULL
    $function$;

    REVOKE ALL ON FUNCTION public.artigen_live_eval_client_connection_count_aggregate() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.artigen_live_eval_client_connection_count_aggregate() TO PUBLIC;

    COMMENT ON FUNCTION public.artigen_live_eval_client_connection_count_aggregate() IS
      'Returns only the cluster-wide regular client connection count using pg_stat_database aggregates; no session details are exposed.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP FUNCTION IF EXISTS public.artigen_live_eval_client_connection_count_aggregate();
  `);
};
