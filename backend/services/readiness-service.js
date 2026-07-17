const fs = require('fs');
const net = require('net');
const path = require('path');
const { getPool, isDatabaseConfigured } = require('../db/pool');
const { getAssetAdapter } = require('./asset-storage');
const {
  STANDARD_PROFILE_ID,
  SUPPORTED_ASPECT_RATIOS,
  getInternalGenerationProfile
} = require('./generation-profiles');
const { hasPayloadKey } = require('./task-payload-service');
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
         to_regclass('public.assets') IS NOT NULL AS has_assets,
         to_regclass('public.otp_delivery_attempts') IS NOT NULL AS has_otp_delivery_attempts,
         EXISTS(
           SELECT 1
             FROM public.pgmigrations
            WHERE name=$1
         ) AS has_latest_migration,
         (
           SELECT count(*) = 7
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='tool_tasks'
              AND column_name IN (
                'lease_owner','lease_expires_at','heartbeat_at','attempt_count',
                'cancel_requested_at','provider_dispatched_at','inputs_ready'
              )
              AND CASE column_name
                WHEN 'lease_owner' THEN data_type='text'
                WHEN 'attempt_count' THEN data_type='integer' AND is_nullable='NO'
                WHEN 'inputs_ready' THEN data_type='boolean' AND is_nullable='NO'
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
           SELECT count(*) = 4
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='generation_events'
              AND column_name IN ('event_type','task_id','properties','occurred_at')
         ) AS has_event_columns,
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
         COALESCE((
           SELECT count(*) = 2 AND bool_and(
             (ps.sku='ai-design.generate.v1' AND ps.credits=10 AND ps.metadata->>'operation'='generate')
             OR
             (ps.sku='ai-design.directions.v1' AND ps.credits=5 AND ps.metadata->>'operation'='directions')
           )
             FROM price_skus ps
             JOIN current_price_version pv ON pv.id=ps.price_version_id
            WHERE ps.active=true
              AND ps.sku IN ('ai-design.generate.v1','ai-design.directions.v1')
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
      row.has_assets &&
      row.has_otp_delivery_attempts &&
      row.has_latest_migration &&
      row.has_task_columns &&
      row.has_payload_columns &&
      row.has_asset_columns &&
      row.has_event_columns &&
      row.has_otp_delivery_columns
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
  profile.maxReferences === 3 &&
  profile.supportsSeed === true &&
  ['internalTextModel', 'internalEditModel', 'internalDirectionsModel']
    .every((key) => typeof profile[key] === 'string' && profile[key].trim().length > 0)
);

const checkGenerationProvider = ({
  provider,
  env = process.env,
  requireDirections = true,
  requireWorkshop = false
} = {}) => {
  const profile = getInternalGenerationProfile(STANDARD_PROFILE_ID, env);
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
  if (!adapterValid || !kindValid || !validProfileShape(profile)) {
    return { ok: false, code: 'MODEL_PROFILE_UNAVAILABLE' };
  }
  return { ok: true, kind: provider.kind, profile: profile.id };
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
  const authEmailOtpEnabled = enabled(env.AUTH_EMAIL_OTP_ENABLED);
  const generationRequired = paidEnabled && (aiDesignEnabled || workshopAiEnabled);
  const productionGeneration = generationRequired && isProduction(env);
  const databaseRequired = paidEnabled || authEmailOtpEnabled;

  let database = skippedCheck();
  let storage = skippedCheck();
  let payload = skippedCheck();
  let provider = skippedCheck();
  let outputAllowlist = skippedCheck();

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
  }
  if (generationRequired) {
    payload = hasPayloadKey(env)
      ? { ok: true }
      : { ok: false, code: 'TASK_PAYLOAD_KEY_MISSING' };
    provider = checkGenerationProvider({
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
    ? checkBrevo(env)
    : skippedCheck();
  const turnstile = authEmailOtpEnabled
    ? checkTurnstile(env)
    : skippedCheck();
  const requiredChecks = [];
  if (generationRequired) requiredChecks.push(database, storage, payload, provider, outputAllowlist);
  else if (paidEnabled) requiredChecks.push(database, storage);
  if (authEmailOtpEnabled) requiredChecks.push(database, authSecrets, mail, turnstile);
  return {
    ok: requiredChecks.every((check) => check.ok),
    paidEnabled,
    authEmailOtpEnabled,
    aiDesignEnabled,
    workshopAiEnabled,
    generationRequired,
    checks: {
      database,
      storage,
      payload,
      provider,
      outputAllowlist,
      authSecrets,
      mail,
      turnstile
    }
  };
};

module.exports = {
  LATEST_REPOSITORY_MIGRATION,
  REPOSITORY_MIGRATIONS,
  checkAuthSecrets,
  checkBrevo,
  checkDatabase,
  checkGenerationProvider,
  checkOutputAllowlist,
  checkStorage,
  checkTurnstile,
  getReadinessReport
};
