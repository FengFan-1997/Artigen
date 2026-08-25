const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const { getAssetAdapter } = require('./asset-storage');
const {
  GENERATION_DIRECTIONS_MODEL,
  GENERATION_IMAGE_MODEL,
  PRODUCT_REFERENCE_PROFILE_ID,
  STANDARD_PROFILE_ID,
  SUPPORTED_ASPECT_RATIOS,
  getInternalGenerationProfile
} = require('./generation-profiles');
const { hasPayloadKey } = require('./task-payload-service');
const { hasAgentPayloadKey } = require('./agent-payload-service');
const { getAgentConfig } = require('./agent-config');
const {
  checkTurnstileHostnameConfiguration
} = require('../lib/turnstile');

const enabled = (value) => /^(1|true)$/i.test(String(value || '').trim());
const isProduction = (env) => String(env?.NODE_ENV || '').trim().toLowerCase() === 'production';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECRET_PLACEHOLDER_RE = /(?:change[-_ ]?me|default|example|password|placeholder|test[-_ ]?secret)/i;
const MIGRATION_FILE_RE = /^(\d{3}_.+)\.js$/;
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
const REPOSITORY_MIGRATIONS = Object.freeze(
  fs.readdirSync(MIGRATIONS_DIR)
    .map((name) => name.match(MIGRATION_FILE_RE)?.[1] || '')
    .filter(Boolean)
    .sort()
);
const LATEST_REPOSITORY_MIGRATION = REPOSITORY_MIGRATIONS.at(-1);

if (!LATEST_REPOSITORY_MIGRATION) {
  throw new Error('READINESS_MIGRATION_MANIFEST_EMPTY');
}

const skippedCheck = (reason = 'FEATURE_DISABLED') => ({
  ok: true,
  skipped: true,
  code: 'NOT_REQUIRED',
  reason
});

const strongSecret = (value) => {
  const secret = String(value || '').trim();
  if (Buffer.byteLength(secret, 'utf8') < 32 || SECRET_PLACEHOLDER_RE.test(secret)) return false;
  return new Set(secret).size >= 12;
};

const checkAuthSecrets = (env = process.env) => {
  const entries = [
    ['OTP_HMAC_SECRET', env.OTP_HMAC_SECRET],
    ['CSRF_SECRET', env.CSRF_SECRET],
    ['SESSION_TOKEN_HASH_SECRET', env.SESSION_TOKEN_HASH_SECRET]
  ].map(([name, value]) => [name, String(value || '').trim()]);
  const missing = entries.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) return { ok: false, code: 'AUTH_SECRETS_MISSING', missing };
  const weak = entries.filter(([, value]) => !strongSecret(value)).map(([name]) => name);
  if (weak.length) return { ok: false, code: 'AUTH_SECRETS_WEAK', weak };
  if (new Set(entries.map(([, value]) => value)).size !== entries.length) {
    return { ok: false, code: 'AUTH_SECRETS_REUSED' };
  }
  return { ok: true };
};

const checkBrevo = (env = process.env) => {
  const provider = String(env.MAIL_PROVIDER || '').trim().toLowerCase();
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const fromEmail = String(
    env.MAIL_FROM_EMAIL || env.BREVO_SENDER_EMAIL || env.BREVO_FROM_EMAIL || ''
  ).trim().toLowerCase();
  const fromName = String(
    env.MAIL_FROM_NAME || env.BREVO_SENDER_NAME || env.BREVO_FROM_NAME || ''
  ).trim();
  if (provider !== 'brevo') return { ok: false, code: 'BREVO_PROVIDER_REQUIRED' };
  if (apiKey.length < 24 || SECRET_PLACEHOLDER_RE.test(apiKey)) {
    return { ok: false, code: 'BREVO_API_KEY_MISSING' };
  }
  if (!EMAIL_RE.test(fromEmail)) return { ok: false, code: 'BREVO_SENDER_INVALID' };
  if (!fromName || fromName.length > 120) return { ok: false, code: 'BREVO_SENDER_NAME_INVALID' };
  return { ok: true, provider: 'brevo', senderConfigured: true };
};

const checkMailRelay = (env = process.env) => {
  const provider = String(env.MAIL_PROVIDER || '').trim().toLowerCase();
  const sharedSecret = String(env.MAIL_RELAY_SHARED_SECRET || '').trim();
  if (provider !== 'relay') return { ok: false, code: 'MAIL_RELAY_PROVIDER_REQUIRED' };
  if (!strongSecret(sharedSecret)) {
    return { ok: false, code: 'MAIL_RELAY_SECRET_MISSING' };
  }
  let endpoint;
  try {
    endpoint = new URL(String(env.MAIL_RELAY_URL || '').trim());
  } catch {
    return { ok: false, code: 'MAIL_RELAY_URL_INVALID' };
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname.replace(/\/+$/, '') !== '/api/send-otp'
  ) {
    return { ok: false, code: 'MAIL_RELAY_URL_INVALID' };
  }
  return { ok: true, provider: 'relay', signedTransport: true };
};

const checkMailProvider = (env = process.env) => {
  const provider = String(env.MAIL_PROVIDER || '').trim().toLowerCase();
  if (provider === 'relay') return checkMailRelay(env);
  if (provider === 'brevo') return checkBrevo(env);
  return { ok: false, code: 'MAIL_PROVIDER_UNSUPPORTED' };
};

const checkTurnstile = (env = process.env) => {
  const secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  if (secret.length < 20 || SECRET_PLACEHOLDER_RE.test(secret)) {
    return { ok: false, code: 'TURNSTILE_NOT_CONFIGURED' };
  }
  const siteKey = String(
    env.VITE_TURNSTILE_SITE_KEY || env.TURNSTILE_SITE_KEY || ''
  ).trim();
  if (siteKey.length < 20 || SECRET_PLACEHOLDER_RE.test(siteKey)) {
    return { ok: false, code: 'TURNSTILE_SITE_KEY_NOT_CONFIGURED' };
  }
  const hostnameConfiguration = checkTurnstileHostnameConfiguration(env);
  if (!hostnameConfiguration.ok) {
    return { ok: false, code: hostnameConfiguration.code };
  }
  return { ok: true };
};

const checkAfdian = (env = process.env) => {
  const apiUserId = String(env.AFDIAN_API_USER_ID || '').trim();
  const apiToken = String(env.AFDIAN_API_TOKEN || '').trim();
  if (apiUserId.length < 16 || apiUserId.length > 128 || SECRET_PLACEHOLDER_RE.test(apiUserId)) {
    return { ok: false, code: 'AFDIAN_API_USER_ID_MISSING' };
  }
  if (apiToken.length < 16 || apiToken.length > 512 || SECRET_PLACEHOLDER_RE.test(apiToken)) {
    return { ok: false, code: 'AFDIAN_API_TOKEN_MISSING' };
  }

  let planMap;
  try {
    planMap = JSON.parse(String(env.AFDIAN_PACKAGE_PLAN_ID_MAP || ''));
  } catch {
    planMap = null;
  }
  const aliases = ['starter', 'standard', 'pro', 'ultimate'];
  const validMap = Boolean(
    planMap &&
    typeof planMap === 'object' &&
    !Array.isArray(planMap) &&
    aliases.every((alias) => /^[a-f0-9]{32}$/i.test(String(planMap[alias] || '').trim())) &&
    new Set(aliases.map((alias) => String(planMap[alias]).trim().toLowerCase())).size === aliases.length
  );
  if (!validMap) return { ok: false, code: 'AFDIAN_PACKAGE_MAP_INVALID' };

  let payUrl;
  try {
    payUrl = new URL(String(
      env.AFDIAN_ORDER_CREATE_URL || env.AFDIAN_PAGE_URL || env.AFDIAN_PAY_URL || ''
    ).trim());
  } catch {
    return { ok: false, code: 'AFDIAN_PAY_URL_INVALID' };
  }
  const allowedPayHosts = new Set(['afdian.com', 'www.afdian.com', 'afdian.net', 'ifdian.net']);
  if (
    payUrl.protocol !== 'https:' ||
    (isProduction(env) && !allowedPayHosts.has(payUrl.hostname.toLowerCase()))
  ) {
    return { ok: false, code: 'AFDIAN_PAY_URL_INVALID' };
  }

  const queryUrl = String(env.AFDIAN_QUERY_ORDER_URL || '').trim();
  if (isProduction(env) && queryUrl) {
    try {
      const parsed = new URL(queryUrl);
      if (
        parsed.origin !== 'https://afdian.com' ||
        parsed.pathname.replace(/\/+$/, '') !== '/api/open/query-order' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      ) {
        return { ok: false, code: 'AFDIAN_QUERY_URL_INVALID' };
      }
    } catch {
      return { ok: false, code: 'AFDIAN_QUERY_URL_INVALID' };
    }
  }

  const signatureMode = String(env.AFDIAN_WEBHOOK_REQUIRE_SIGN || '').trim();
  if (!['0', '1'].includes(signatureMode)) {
    return { ok: false, code: 'AFDIAN_WEBHOOK_MODE_REQUIRED' };
  }
  if (signatureMode === '1') {
    try {
      crypto.createPublicKey(String(env.AFDIAN_WEBHOOK_PUBLIC_KEY || '').trim());
    } catch {
      return { ok: false, code: 'AFDIAN_WEBHOOK_PUBLIC_KEY_INVALID' };
    }
  }
  return {
    ok: true,
    provider: 'afdian',
    packageCount: aliases.length,
    webhookVerification: signatureMode === '1' ? 'provider-query+rsa' : 'provider-query'
  };
};

const checkDatabase = async (pool) => {
  if (!pool) return { ok: false, code: 'DATABASE_NOT_CONFIGURED' };
  try {
    const result = await pool.query(
      `WITH current_price_version AS (
         SELECT id
           FROM price_versions
          WHERE active=true AND effective_at <= now()
          ORDER BY version DESC
          LIMIT 1
       )
       SELECT
         to_regclass('public.tool_tasks') IS NOT NULL AS has_tasks,
         to_regclass('public.tool_task_payloads') IS NOT NULL AS has_payloads,
         to_regclass('public.generation_events') IS NOT NULL AS has_events,
         to_regclass('public.behavior_events') IS NOT NULL AS has_behavior_events,
         to_regclass('public.operational_records') IS NOT NULL AS has_operational_records,
         to_regclass('public.creative_projects') IS NOT NULL AS has_creative_projects,
         to_regclass('public.creative_project_payloads') IS NOT NULL AS has_project_payloads,
         to_regclass('public.project_asset_links') IS NOT NULL AS has_project_asset_links,
         to_regclass('public.project_versions') IS NOT NULL AS has_project_versions,
         to_regclass('public.assets') IS NOT NULL AS has_assets,
         to_regclass('public.asset_upload_sessions') IS NOT NULL AS has_upload_sessions,
         to_regclass('public.otp_delivery_attempts') IS NOT NULL AS has_otp_delivery_attempts,
         to_regclass('public.agent_runs') IS NOT NULL AS has_agent_runs,
         to_regclass('public.agent_run_payloads') IS NOT NULL AS has_agent_payloads,
         to_regclass('public.agent_model_checkpoints') IS NOT NULL AS has_agent_model_checkpoints,
         to_regclass('public.agent_events') IS NOT NULL AS has_agent_events,
         to_regclass('public.agent_artifacts') IS NOT NULL AS has_agent_artifacts,
         to_regclass('public.agent_budget_holds') IS NOT NULL AS has_agent_budget_holds,
         to_regclass('public.agent_trial_usage') IS NOT NULL AS has_agent_trial_usage,
         to_regclass('public.agent_worker_heartbeats') IS NOT NULL AS has_agent_worker_heartbeats,
         to_regclass('public.agent_desktop_tickets') IS NOT NULL AS has_agent_desktop_tickets,
         to_regclass('public.agent_subagents') IS NOT NULL AS has_agent_subagents,
         to_regclass('public.agent_subagent_payloads') IS NOT NULL AS has_agent_subagent_payloads,
         to_regclass('public.agent_subagent_model_checkpoints') IS NOT NULL AS has_agent_subagent_checkpoints,
         to_regclass('public.agent_model_calls') IS NOT NULL AS has_agent_model_calls,
         to_regclass('public.agent_provider_scheduler') IS NOT NULL AS has_agent_provider_scheduler,
         to_regclass('public.agent_provider_requests') IS NOT NULL AS has_agent_provider_requests,
         to_regclass('public.agent_quality_checks') IS NOT NULL AS has_agent_quality_checks,
         to_regclass('public.agent_model_call_receipts') IS NOT NULL AS has_agent_model_call_receipts,
         to_regclass('public.agent_tool_call_receipts') IS NOT NULL AS has_agent_tool_call_receipts,
         to_regclass('public.agent_budget_reservations') IS NOT NULL AS has_agent_budget_reservations,
         to_regclass('public.design_conversations') IS NOT NULL AS has_design_conversations,
         to_regclass('public.design_messages') IS NOT NULL AS has_design_messages,
         to_regclass('public.design_executions') IS NOT NULL AS has_design_executions,
         to_regclass('public.design_conversation_assets') IS NOT NULL AS has_design_conversation_assets,
         to_regclass('public.design_conversation_events') IS NOT NULL AS has_design_conversation_events,
         to_regclass('public.design_planning_jobs') IS NOT NULL AS has_design_planning_jobs,
         to_regclass('public.design_session_authorizations') IS NOT NULL AS has_design_authorizations,
         EXISTS(
           SELECT 1
             FROM public.pgmigrations
            WHERE name=$1
         ) AS has_latest_migration,
         (
           SELECT count(*) = 9
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='tool_tasks'
              AND column_name IN (
                'lease_owner','lease_expires_at','heartbeat_at','attempt_count',
                'cancel_requested_at','provider_dispatched_at','inputs_ready',
                'project_id','parent_version_id'
              )
              AND CASE column_name
                WHEN 'lease_owner' THEN data_type='text'
                WHEN 'attempt_count' THEN data_type='integer' AND is_nullable='NO'
                WHEN 'inputs_ready' THEN data_type='boolean' AND is_nullable='NO'
                WHEN 'project_id' THEN data_type='uuid'
                WHEN 'parent_version_id' THEN data_type='uuid'
                ELSE data_type='timestamp with time zone'
              END
         ) AS has_task_columns,
         (
           SELECT count(*) = 7
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='tool_task_payloads'
              AND column_name IN (
                'task_id','algorithm','key_version','iv','auth_tag','ciphertext','expires_at'
              )
         ) AS has_payload_columns,
         (
           SELECT count(*) = 9
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='assets'
              AND column_name IN (
                'storage_driver','uri','mime_type','byte_size','sha256','expires_at',
                'retention_class','gc_state','delete_requested_at'
              )
         ) AS has_asset_columns,
         (
           SELECT count(*) = 10
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='asset_upload_sessions'
              AND column_name IN (
                'owner_user_id','idempotency_key','object_key','upload_kind',
                'provider_upload_id','declared_mime','declared_size','status',
                'asset_id','expires_at'
              )
         ) AS has_upload_session_columns,
         (
           SELECT count(*) = 4
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='generation_events'
              AND column_name IN ('event_type','task_id','properties','occurred_at')
         ) AS has_event_columns,
         (
           SELECT count(*) = 9
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='behavior_events'
              AND column_name IN (
                'event_id','actor_user_id','user_ref','event_type','path','action',
                'properties','occurred_at','received_at'
              )
         ) AS has_behavior_columns,
         (
           SELECT count(*) = 8
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='operational_records'
              AND column_name IN (
                'record_kind','record_key','actor_user_id','user_ref','payload',
                'occurred_at','created_at','updated_at'
              )
         ) AS has_operational_columns,
         (
           SELECT count(*) = 7
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='creative_projects'
              AND column_name IN (
                'user_id','title','status','cover_asset_id','revision','deleted_at','purge_after'
              )
         ) AS has_project_columns,
         (
           SELECT count(*) = 6
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='creative_project_payloads'
              AND column_name IN ('project_id','algorithm','key_version','iv','auth_tag','ciphertext')
         ) AS has_project_payload_columns,
         (
           SELECT count(*) = 9
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='project_versions'
              AND column_name IN (
                'project_id','parent_version_id','task_id','output_asset_id','status',
                'profile_id','aspect_ratio','quoted_credits','ciphertext'
              )
         ) AS has_project_version_columns,
         (
           SELECT count(*) = 10 AND bool_and(
             column_name <> 'provider_dispatched_at'
             OR data_type='timestamp with time zone'
           )
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='otp_delivery_attempts'
              AND column_name IN (
                'idempotency_hash','target_hash','ip_hash','purpose','state',
                'challenge_id','cooldown_until','lease_expires_at','provider_message_hash',
                'provider_dispatched_at'
              )
         ) AS has_otp_delivery_columns,
         (
           SELECT count(*) = 13
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_runs'
              AND column_name IN (
                'user_id','status','idempotency_key','request_hash','model_provider',
                'sandbox_provider','checkpoint','max_credits','charged_credits',
                'step_count','pause_requested','cancel_requested','queue_expires_at'
              )
         ) AS has_agent_run_columns,
         (
           SELECT count(*) = 6
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_runs'
              AND column_name IN (
                'lease_epoch','runtime_profile_hash','runtime_profile_summary',
                'final_text_sha256','semantic_verification','platform_overrun_credits'
              )
         ) AS has_agent_runtime_v2_1_columns,
         (
           SELECT count(*) = 19
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_model_call_receipts'
              AND column_name IN (
                'id','run_id','worker_id','lease_epoch','state','algorithm','key_version',
                'intent_iv','intent_auth_tag','intent_ciphertext','response_iv',
                'response_auth_tag','response_ciphertext','dispatched_at','received_at',
                'consumed_at','ambiguous_at','updated_at','expires_at'
              )
         ) AS has_agent_model_call_receipt_columns,
         (
           SELECT count(*) = 22
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_tool_call_receipts'
              AND column_name IN (
                'id','run_id','subagent_id','receipt_key','kind','state','worker_id','lease_epoch',
                'reservation_key','request_sha256','actual_credits','algorithm','key_version',
                'result_iv','result_auth_tag','result_ciphertext','dispatched_at','consumed_at',
                'ambiguous_at','created_at','updated_at','expires_at'
              )
         ) AS has_agent_tool_call_receipt_columns,
         (
           SELECT count(*) = 12
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_budget_reservations'
              AND column_name IN (
                'id','run_id','model_call_id','subagent_id','component','reservation_key',
                'reserved_credits','actual_credits','state','consumed_at','released_at','updated_at'
              )
         ) AS has_agent_budget_reservation_columns,
         (
           SELECT count(*) = 1
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_runs'
              AND column_name='sandbox_worker_id'
         ) AS has_agent_relay_run_columns,
         (
           SELECT count(*) = 4
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_worker_heartbeats'
              AND column_name IN (
                'browser_ready','egress_verified','desktop_relay_ready','sandbox_image_ref'
              )
         ) AS has_agent_worker_readiness_columns,
         (
           SELECT count(*) = 2
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_budget_holds'
              AND column_name IN ('trial_credits','daily_free_credits')
         ) AS has_agent_budget_split_columns,
         (
           SELECT count(*) = 11
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_subagents'
              AND column_name IN (
                'run_id','ordinal','role','label','status','request_hash','step_count',
                'estimated_credits_used','usage','cancel_requested','consecutive_failures'
              )
         ) AS has_agent_subagent_columns,
         (
           SELECT count(*) = 2 AND bool_and(data_type='uuid')
             FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name IN ('agent_steps','agent_events')
              AND column_name='subagent_id'
         ) AS has_agent_subagent_links,
         (
           SELECT count(*) = 4
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='agent_runs'
              AND column_name IN (
                'runtime_version','prompt_profile','prompt_hash','skill_versions'
              )
         ) AS has_agent_runtime_v2_columns,
         COALESCE((
           SELECT count(*) = 3 AND bool_and(
             (ps.sku='ai-design.generate.v1' AND ps.credits=10 AND ps.metadata->>'operation'='generate')
             OR
             (ps.sku='ai-design.directions.v1' AND ps.credits=5 AND ps.metadata->>'operation'='directions')
             OR
             (
               ps.sku='ai-design.product-reference.v1'
               AND ps.credits=60
               AND ps.metadata->>'operation'='generate'
               AND ps.metadata->>'profileId'='product-reference-v1'
             )
           )
             FROM price_skus ps
             JOIN current_price_version pv ON pv.id=ps.price_version_id
            WHERE ps.active=true
              AND ps.sku IN (
                'ai-design.generate.v1',
                'ai-design.directions.v1',
                'ai-design.product-reference.v1'
              )
         ), false) AS has_ai_skus,
         COALESCE((
           SELECT count(*) = 4 AND bool_and(
             (ps.sku='workshop.professional-portrait.v1' AND ps.credits=5)
             OR (ps.sku='workshop.old-photo.v1' AND ps.credits=5)
             OR (ps.sku='workshop.ingredient-layout-ai.v1' AND ps.credits=10)
             OR (ps.sku='workshop.background-scene.v1' AND ps.credits=5)
           )
             FROM price_skus ps
             JOIN current_price_version pv ON pv.id=ps.price_version_id
            WHERE ps.active=true
              AND ps.sku IN (
                'workshop.professional-portrait.v1',
                'workshop.old-photo.v1',
                'workshop.ingredient-layout-ai.v1',
                'workshop.background-scene.v1'
              )
         ), false) AS has_workshop_skus`,
      [LATEST_REPOSITORY_MIGRATION]
    );
    const row = result.rows[0] || {};
    const migrated = Boolean(
      row.has_tasks &&
      row.has_payloads &&
      row.has_events &&
      row.has_behavior_events &&
      row.has_operational_records &&
      row.has_creative_projects &&
      row.has_project_payloads &&
      row.has_project_asset_links &&
      row.has_project_versions &&
      row.has_assets &&
      row.has_upload_sessions &&
      row.has_otp_delivery_attempts &&
      row.has_agent_runs &&
      row.has_agent_payloads &&
      row.has_agent_model_checkpoints &&
      row.has_agent_events &&
      row.has_agent_artifacts &&
      row.has_agent_budget_holds &&
      row.has_agent_trial_usage &&
      row.has_agent_worker_heartbeats &&
      row.has_agent_desktop_tickets &&
      row.has_agent_subagents &&
      row.has_agent_subagent_payloads &&
      row.has_agent_subagent_checkpoints &&
      row.has_agent_model_calls &&
      row.has_agent_provider_scheduler &&
      row.has_agent_provider_requests &&
      row.has_agent_quality_checks &&
      row.has_agent_model_call_receipts &&
      row.has_agent_tool_call_receipts &&
      row.has_agent_budget_reservations &&
      row.has_design_conversations &&
      row.has_design_messages &&
      row.has_design_executions &&
      row.has_design_conversation_assets &&
      row.has_design_conversation_events &&
      row.has_design_planning_jobs &&
      row.has_design_authorizations &&
      row.has_latest_migration &&
      row.has_task_columns &&
      row.has_payload_columns &&
      row.has_asset_columns &&
      row.has_upload_session_columns &&
      row.has_event_columns &&
      row.has_behavior_columns &&
      row.has_operational_columns &&
      row.has_project_columns &&
      row.has_project_payload_columns &&
      row.has_project_version_columns &&
      row.has_otp_delivery_columns &&
      row.has_agent_run_columns &&
      row.has_agent_runtime_v2_1_columns &&
      row.has_agent_model_call_receipt_columns &&
      row.has_agent_tool_call_receipt_columns &&
      row.has_agent_budget_reservation_columns &&
      row.has_agent_relay_run_columns &&
      row.has_agent_worker_readiness_columns &&
      row.has_agent_budget_split_columns &&
      row.has_agent_subagent_columns &&
      row.has_agent_subagent_links &&
      row.has_agent_runtime_v2_columns
    );
    if (!migrated) {
      return {
        ok: false,
        code: 'DATABASE_MIGRATION_REQUIRED',
        expectedMigration: LATEST_REPOSITORY_MIGRATION
      };
    }
    if (!row.has_ai_skus) return { ok: false, code: 'AI_DESIGN_SKU_NOT_READY' };
    if (!row.has_workshop_skus) return { ok: false, code: 'WORKSHOP_AI_SKU_NOT_READY' };
    return { ok: true, code: null, migration: LATEST_REPOSITORY_MIGRATION };
  } catch (error) {
    if (['42P01', '42703'].includes(String(error?.code || ''))) {
      return {
        ok: false,
        code: 'DATABASE_MIGRATION_REQUIRED',
        expectedMigration: LATEST_REPOSITORY_MIGRATION
      };
    }
    return { ok: false, code: 'DATABASE_UNAVAILABLE' };
  }
};

const checkStorage = async (adapter, { requireShared = false } = {}) => {
  try {
    if (!adapter) return { ok: false, code: 'ASSET_STORAGE_NOT_CONFIGURED' };
    if (adapter.driver === 'file') {
      if (requireShared) {
        return { ok: false, driver: 'file', code: 'SHARED_ASSET_STORAGE_REQUIRED' };
      }
      await fs.promises.mkdir(adapter.rootDir, { recursive: true });
      await fs.promises.access(adapter.rootDir, fs.constants.R_OK | fs.constants.W_OK);
      return { ok: true, driver: 'file', shared: false };
    }
    if (adapter.driver === 's3') {
      if (
        !adapter.bucket ||
        !adapter.client ||
        !adapter.commands?.HeadBucketCommand ||
        typeof adapter.open !== 'function' ||
        typeof adapter.putBuffer !== 'function' ||
        typeof adapter.putFile !== 'function' ||
        typeof adapter.delete !== 'function'
      ) {
        return { ok: false, driver: 's3', code: 'S3_NOT_CONFIGURED' };
      }
      await adapter.client.send(new adapter.commands.HeadBucketCommand({ Bucket: adapter.bucket }));
      return { ok: true, driver: 's3', shared: true };
    }
    return { ok: false, code: 'ASSET_STORAGE_NOT_CONFIGURED' };
  } catch {
    return { ok: false, driver: adapter?.driver || null, code: 'ASSET_STORAGE_UNAVAILABLE' };
  }
};

const validProfileShape = (profile) => Boolean(
  profile?.id === STANDARD_PROFILE_ID &&
  Array.isArray(profile.aspectRatios) &&
  profile.aspectRatios.length === SUPPORTED_ASPECT_RATIOS.length &&
  SUPPORTED_ASPECT_RATIOS.every((ratio) => profile.aspectRatios.includes(ratio)) &&
  profile.aspectRatios.every((ratio) => typeof profile.imageSizes?.[ratio] === 'string') &&
  Number.isInteger(profile.maxReferences) &&
  profile.maxReferences === 0 &&
  profile.supportsSeed === true &&
  profile.internalTextModel === GENERATION_IMAGE_MODEL &&
  profile.internalEditModel === '' &&
  profile.internalDirectionsModel === GENERATION_DIRECTIONS_MODEL
);

const validReferenceProfileShape = (profile) => Boolean(
  profile?.id === PRODUCT_REFERENCE_PROFILE_ID &&
  Array.isArray(profile.aspectRatios) &&
  profile.aspectRatios.length === SUPPORTED_ASPECT_RATIOS.length &&
  SUPPORTED_ASPECT_RATIOS.every((ratio) => profile.aspectRatios.includes(ratio)) &&
  profile.aspectRatios.every((ratio) => typeof profile.imageSizes?.[ratio] === 'string') &&
  Number.isInteger(profile.maxReferences) &&
  profile.maxReferences === 1 &&
  profile.supportsSeed === true &&
  profile.internalTextModel === '' &&
  profile.internalEditModel === GENERATION_IMAGE_MODEL &&
  profile.internalDirectionsModel === GENERATION_DIRECTIONS_MODEL
);

const checkGenerationProvider = ({
  provider,
  env = process.env,
  requireDirections = true,
  requireWorkshop = false
} = {}) => {
  const profile = getInternalGenerationProfile(STANDARD_PROFILE_ID, env);
  const referenceProfile = getInternalGenerationProfile(PRODUCT_REFERENCE_PROFILE_ID, env);
  const adapterValid = Boolean(
    provider?.available &&
    typeof provider.generateImage === 'function' &&
    (!requireDirections || typeof provider.generateDirections === 'function') &&
    (!requireWorkshop || typeof provider.organizeIngredientSource === 'function')
  );
  const realProviderRequired = isProduction(env);
  const kindValid = realProviderRequired
    ? provider?.kind === 'siliconflow'
    : ['siliconflow', 'contract-mock'].includes(String(provider?.kind || ''));
  if (
    !adapterValid ||
    !kindValid ||
    !validProfileShape(profile) ||
    !validReferenceProfileShape(referenceProfile)
  ) {
    return { ok: false, code: 'MODEL_PROFILE_UNAVAILABLE' };
  }
  return { ok: true, kind: provider.kind, profile: profile.id };
};

const probeGenerationProvider = async (options = {}) => {
  const local = checkGenerationProvider(options);
  if (!local.ok) return local;
  if (!isProduction(options.env || process.env)) return local;
  if (typeof options.provider?.checkAvailability !== 'function') {
    return { ok: false, code: 'PROVIDER_HEALTHCHECK_UNAVAILABLE' };
  }
  const profile = getInternalGenerationProfile(STANDARD_PROFILE_ID, options.env || process.env);
  try {
    const result = await options.provider.checkAvailability({ profile });
    return result?.ok ? result : {
      ok: false,
      code: String(result?.code || 'PROVIDER_UNAVAILABLE')
    };
  } catch {
    return { ok: false, code: 'PROVIDER_UNAVAILABLE' };
  }
};

const normalizeAllowedHost = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^\*\./, '')
  .replace(/^\.+|\.+$/g, '');

const isValidAllowedHost = (host) => Boolean(
  host &&
  !net.isIP(host) &&
  host !== 'localhost' &&
  !host.endsWith('.local') &&
  !host.endsWith('.internal') &&
  host.length <= 253 &&
  host.split('.').length >= 2 &&
  host.split('.').every((label) => (
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  ))
);

const checkOutputAllowlist = (env = process.env, { required = isProduction(env) } = {}) => {
  const entries = String(env.AI_OUTPUT_ALLOWED_HOSTS || env.OLD_PHOTO_OUTPUT_HOSTS || '')
    .split(',')
    .map(normalizeAllowedHost)
    .filter(Boolean);
  const hosts = entries.filter(isValidAllowedHost);
  if (required && entries.length === 0) {
    return { ok: false, code: 'AI_OUTPUT_ALLOWLIST_REQUIRED', hostCount: 0 };
  }
  if (required && hosts.length !== entries.length) {
    return { ok: false, code: 'AI_OUTPUT_ALLOWLIST_INVALID', hostCount: hosts.length };
  }
  return { ok: true, required, hostCount: hosts.length };
};

const getReadinessReport = async ({
  env = process.env,
  pool,
  adapter,
  generationProvider
} = {}) => {
  const aiDesignEnabled = enabled(env.AI_DESIGN_TASK_V2_ENABLED);
  const workshopAiEnabled = enabled(env.WORKSHOP_AI_TASK_V2_ENABLED);
  const paidEnabled = enabled(env.PAID_FEATURES_ENABLED);
  const paymentEnabled = paidEnabled &&
    (!Object.prototype.hasOwnProperty.call(env, 'PAYMENTS_ENABLED') ||
      enabled(env.PAYMENTS_ENABLED));
  const authEmailOtpEnabled = enabled(env.AUTH_EMAIL_OTP_ENABLED);
  const behaviorAnalyticsEnabled =
    enabled(env.BEHAVIOR_ANALYTICS_ENABLED) || enabled(env.VITE_ANALYTICS_ENABLED);
  const adminConsoleEnabled = Boolean(
    String(env.CONSOLE_ADMIN_PASSWORD || '').trim()
  );
  const agentEnabled = enabled(env.AGENT_FEATURE_ENABLED);
  const conversationEnabled = enabled(env.DESIGN_CONVERSATION_ENABLED);
  const agentConfig = agentEnabled ? getAgentConfig(env) : null;
  const agentImageGenerationRequired = Boolean(
    agentEnabled && agentConfig?.publicImageGenerationEnabled
  );
  const mainGenerationRequired = paidEnabled && (aiDesignEnabled || workshopAiEnabled);
  const generationRequired = mainGenerationRequired || agentImageGenerationRequired;
  const productionGeneration = generationRequired && isProduction(env);
  const databaseRequired =
    paidEnabled || authEmailOtpEnabled || behaviorAnalyticsEnabled || adminConsoleEnabled ||
    agentEnabled || conversationEnabled;

  let database = skippedCheck();
  let storage = skippedCheck();
  let payload = skippedCheck();
  let provider = skippedCheck();
  let outputAllowlist = skippedCheck();
  let payment = skippedCheck();
  let agent = skippedCheck();
  let conversation = skippedCheck();

  if (databaseRequired) {
    database = await checkDatabase(
      pool === undefined
        ? (isDatabaseConfigured() ? getPool() : null)
        : pool
    );
  }
  if (paidEnabled) {
    let resolvedAdapter = adapter;
    if (resolvedAdapter === undefined) {
      try {
        resolvedAdapter = getAssetAdapter();
      } catch {
        resolvedAdapter = null;
      }
    }
    storage = await checkStorage(resolvedAdapter, { requireShared: productionGeneration });
    if (paymentEnabled) payment = checkAfdian(env);
  }
  if (agentEnabled) {
    let resolvedAdapter = adapter;
    if (resolvedAdapter === undefined) {
      try {
        resolvedAdapter = getAssetAdapter();
      } catch {
        resolvedAdapter = null;
      }
    }
    if (!paidEnabled) {
      storage = await checkStorage(resolvedAdapter, {
        requireShared: isProduction(env)
      });
    }
    const missing = [];
    if (!hasAgentPayloadKey(env)) missing.push('AGENT_PAYLOAD_ENCRYPTION_KEY');
    if (
      agentConfig.runtimeDriver === 'live' &&
      agentConfig.modelProvider === 'openai' &&
      !agentConfig.openAiApiKey
    ) {
      missing.push('OPENAI_API_KEY');
    }
    if (
      agentConfig.runtimeDriver === 'live' &&
      agentConfig.modelProvider === 'siliconflow' &&
      !agentConfig.siliconFlowApiKey
    ) {
      missing.push('SILICONFLOW_API_KEY');
    }
    if (
      agentConfig.publicImageGenerationEnabled &&
      !agentConfig.siliconFlowApiKey &&
      !missing.includes('SILICONFLOW_API_KEY')
    ) {
      missing.push('SILICONFLOW_API_KEY');
    }
    if (
      agentConfig.runtimeDriver === 'live' &&
      agentConfig.sandboxProvider === 'cua' &&
      agentConfig.sandboxMode === 'cloud' &&
      !agentConfig.cuaApiKey
    ) {
      missing.push('CUA_API_KEY');
    }
    if (
      isProduction(env) &&
      agentConfig.sandboxProvider === 'cua' &&
      agentConfig.sandboxMode === 'cloud' &&
      !agentConfig.sandboxImageRef
    ) {
      missing.push('AGENT_CUA_IMAGE_REF');
    }
    const browserPublic = agentConfig.publicBrowserEnabled;
    const productionBeta = ['production', 'prod'].includes(
      agentConfig.deploymentEnvironment
    );
    if (
      productionBeta &&
      !['owner-only-v1', 'authenticated-v1'].includes(agentConfig.betaMode)
    ) {
      missing.push('AGENT_BETA_MODE');
    }
    if (
      productionBeta &&
      agentConfig.betaMode === 'owner-only-v1' &&
      agentConfig.betaUserIds.length === 0
    ) {
      missing.push('AGENT_BETA_USER_IDS');
    }
    if (browserPublic && agentConfig.browserMode !== 'full-approval-v1') {
      missing.push('AGENT_BROWSER_MODE');
    }
    if (browserPublic && agentConfig.sandboxEgressPolicy !== 'restricted-v1') {
      missing.push('AGENT_SANDBOX_EGRESS_POLICY');
    }
    if (browserPublic && !agentConfig.workerRelayUrl) {
      missing.push('AGENT_WORKER_RELAY_URL');
    }
    if (browserPublic && Buffer.byteLength(agentConfig.workerRelaySecret, 'utf8') < 32) {
      missing.push('AGENT_WORKER_RELAY_SECRET');
    }
    if (browserPublic && !agentConfig.workerId) {
      missing.push('AGENT_WORKER_ID');
    }
    agent = missing.length
      ? { ok: false, code: 'AGENT_RUNTIME_NOT_CONFIGURED', missing }
      : {
          ok: true,
          model: agentConfig.modelName,
          modelProvider: agentConfig.modelProvider,
          sandbox: agentConfig.sandboxProvider,
          sandboxMode: agentConfig.sandboxMode,
          image: agentConfig.sandboxImageRef || agentConfig.sandboxVersion,
          browserMode: agentConfig.browserMode,
          betaMode: agentConfig.betaMode,
          egressPolicy: agentConfig.sandboxEgressPolicy,
          desktopRelayConfigured: Boolean(agentConfig.workerRelayUrl),
          imageGenerationPublicEnabled: agentConfig.publicImageGenerationEnabled
        };
  }
  if (conversationEnabled) {
    const missing = [];
    if (!enabled(env.DESIGN_CONVERSATION_WORKER_ENABLED)) {
      missing.push('DESIGN_CONVERSATION_WORKER_ENABLED');
    }
    if (!hasAgentPayloadKey(env)) missing.push('AGENT_PAYLOAD_ENCRYPTION_KEY');
    if (!String(env.SILICONFLOW_API_KEY || '').trim()) missing.push('SILICONFLOW_API_KEY');
    if (!paidEnabled) missing.push('PAID_FEATURES_ENABLED');
    if (!aiDesignEnabled) missing.push('AI_DESIGN_TASK_V2_ENABLED');
    if (!workshopAiEnabled) missing.push('WORKSHOP_AI_TASK_V2_ENABLED');
    if (!agentEnabled) missing.push('AGENT_FEATURE_ENABLED');
    if (agentConfig?.betaMode !== 'authenticated-v1') missing.push('AGENT_BETA_MODE');
    if (agentConfig?.publicImageGenerationEnabled !== true) {
      missing.push('AGENT_IMAGE_GENERATION_PUBLIC_ENABLED');
    }
    conversation = missing.length
      ? { ok: false, code: 'DESIGN_CONVERSATION_NOT_CONFIGURED', missing }
      : {
          ok: true,
          plannerModel: 'Qwen/Qwen3-8B',
          imageModel: GENERATION_IMAGE_MODEL,
          autoCreditCap: Math.max(
            1,
            Math.min(500, Number.parseInt(env.DESIGN_CONVERSATION_AUTO_CREDIT_CAP || '50', 10) || 50)
          ),
          retentionDays: 30,
          accessMode: agentConfig.betaMode
        };
  }
  if (generationRequired) {
    if (mainGenerationRequired) {
      payload = hasPayloadKey(env)
        ? { ok: true }
        : { ok: false, code: 'TASK_PAYLOAD_KEY_MISSING' };
    }
    provider = await probeGenerationProvider({
      provider: generationProvider,
      env,
      requireDirections: aiDesignEnabled,
      requireWorkshop: workshopAiEnabled
    });
    outputAllowlist = checkOutputAllowlist(env, { required: productionGeneration });
  }
  const authSecrets = authEmailOtpEnabled
    ? checkAuthSecrets(env)
    : skippedCheck();
  const mail = authEmailOtpEnabled
    ? checkMailProvider(env)
    : skippedCheck();
  const turnstile = authEmailOtpEnabled
    ? checkTurnstile(env)
    : skippedCheck();
  const requiredChecks = [];
  if (databaseRequired) requiredChecks.push(database);
  if (paidEnabled) requiredChecks.push(storage);
  if (agentEnabled && !paidEnabled) requiredChecks.push(storage);
  if (paymentEnabled) requiredChecks.push(payment);
  if (mainGenerationRequired) requiredChecks.push(payload);
  if (generationRequired) requiredChecks.push(provider, outputAllowlist);
  if (authEmailOtpEnabled) requiredChecks.push(authSecrets, mail, turnstile);
  if (agentEnabled) requiredChecks.push(agent);
  if (conversationEnabled) requiredChecks.push(conversation);
  return {
    ok: requiredChecks.every((check) => check.ok),
    paidEnabled,
    paymentEnabled,
    authEmailOtpEnabled,
    behaviorAnalyticsEnabled,
    adminConsoleEnabled,
    databaseRequired,
    aiDesignEnabled,
    workshopAiEnabled,
    agentEnabled,
    conversationEnabled,
    agentImageGenerationRequired,
    generationRequired,
    checks: {
      database,
      storage,
      payload,
      provider,
      outputAllowlist,
      payment,
      authSecrets,
      mail,
      turnstile,
      agent,
      conversation
    }
  };
};

module.exports = {
  LATEST_REPOSITORY_MIGRATION,
  REPOSITORY_MIGRATIONS,
  checkAuthSecrets,
  checkAfdian,
  checkBrevo,
  checkMailProvider,
  checkMailRelay,
  checkDatabase,
  checkGenerationProvider,
  probeGenerationProvider,
  checkOutputAllowlist,
  checkStorage,
  checkTurnstile,
  getReadinessReport
};
