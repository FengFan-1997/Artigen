const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const { resolveUserId } = require('./billing-service');
const {
  decryptIntegrationSecret,
  encryptIntegrationSecret
} = require('./agent-payload-service');

const PROVIDERS = new Set(['google_drive', 'github']);

const strongStateSecret = (env = process.env) => {
  const secret = String(env.AGENT_OAUTH_STATE_SECRET || '').trim();
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ApiError(503, 'AGENT_OAUTH_NOT_CONFIGURED', { retryable: false });
  }
  return secret;
};

const encodeState = ({ userId, provider, returnTo = '/artigen/agent', env = process.env }) => {
  const payload = Buffer.from(JSON.stringify({
    userId,
    provider,
    returnTo: String(returnTo || '/artigen/agent').startsWith('/artigen/')
      ? String(returnTo)
      : '/artigen/agent',
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60_000
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', strongStateSecret(env))
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
};

const decodeState = (state, env = process.env) => {
  const [payload, signature, extra] = String(state || '').split('.');
  if (!payload || !signature || extra) throw new ApiError(400, 'AGENT_OAUTH_STATE_INVALID');
  const expected = crypto
    .createHmac('sha256', strongStateSecret(env))
    .update(payload)
    .digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, 'base64url');
  } catch {
    supplied = Buffer.alloc(0);
  }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new ApiError(400, 'AGENT_OAUTH_STATE_INVALID');
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(400, 'AGENT_OAUTH_STATE_INVALID');
  }
  if (
    !PROVIDERS.has(parsed.provider) ||
    !parsed.userId ||
    !Number.isFinite(parsed.exp) ||
    parsed.exp < Date.now()
  ) {
    throw new ApiError(400, 'AGENT_OAUTH_STATE_INVALID');
  }
  return parsed;
};

const redirectUri = (provider, env = process.env) => {
  const explicit = provider === 'github'
    ? env.GITHUB_OAUTH_REDIRECT_URI
    : env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return String(explicit).trim();
  const origin = String(env.APP_ORIGIN || env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
  if (!origin) throw new ApiError(503, 'AGENT_OAUTH_NOT_CONFIGURED', { provider });
  return `${origin}/api/integrations/${provider}/callback`;
};

const providerConfig = (provider, env = process.env) => {
  if (!PROVIDERS.has(provider)) throw new ApiError(404, 'AGENT_INTEGRATION_UNSUPPORTED');
  if (provider === 'github') {
    const clientId = String(env.GITHUB_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(env.GITHUB_OAUTH_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      throw new ApiError(503, 'AGENT_OAUTH_NOT_CONFIGURED', { provider });
    }
    return {
      clientId,
      clientSecret,
      redirectUri: redirectUri(provider, env),
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['read:user', 'repo']
    };
  }
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new ApiError(503, 'AGENT_OAUTH_NOT_CONFIGURED', { provider });
  }
  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri(provider, env),
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/drive.file'
    ]
  };
};

const fetchJson = async (fetchImpl, url, init, errorCode) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
      throw new ApiError(502, errorCode, {
        retryable: response.status >= 500 || response.status === 429,
        providerStatus: response.status
      });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
};

const createAgentIntegrationService = ({
  pool,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) => {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('AGENT_INTEGRATION_POOL_REQUIRED');
  }

  const begin = async ({ userId, provider, returnTo }) => {
    const client = await pool.connect();
    try {
      const dbUserId = await resolveUserId(client, userId);
      const config = providerConfig(provider, env);
      const state = encodeState({ userId: dbUserId, provider, returnTo, env });
      const url = new URL(config.authorizeUrl);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.redirectUri);
      url.searchParams.set('scope', config.scopes.join(provider === 'github' ? ' ' : ' '));
      url.searchParams.set('state', state);
      if (provider === 'google_drive') {
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('access_type', 'offline');
        url.searchParams.set('prompt', 'consent');
        url.searchParams.set('include_granted_scopes', 'true');
      }
      return { provider, authorizeUrl: url.toString(), expiresInSeconds: 600 };
    } finally {
      client.release();
    }
  };

  const complete = async ({ userId, provider, code, state }) => {
    const parsedState = decodeState(state, env);
    const identityClient = await pool.connect();
    let dbUserId;
    try {
      dbUserId = await resolveUserId(identityClient, userId);
    } finally {
      identityClient.release();
    }
    if (parsedState.provider !== provider || String(parsedState.userId) !== String(dbUserId)) {
      throw new ApiError(403, 'AGENT_OAUTH_STATE_MISMATCH');
    }
    const config = providerConfig(provider, env);
    const token = provider === 'github'
      ? await fetchJson(fetchImpl, config.tokenUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: config.redirectUri
          })
        }, 'AGENT_OAUTH_TOKEN_EXCHANGE_FAILED')
      : await fetchJson(fetchImpl, config.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: config.redirectUri,
            grant_type: 'authorization_code'
          }).toString()
        }, 'AGENT_OAUTH_TOKEN_EXCHANGE_FAILED');
    if (!token.access_token) throw new ApiError(502, 'AGENT_OAUTH_TOKEN_EXCHANGE_FAILED');

    const identity = provider === 'github'
      ? await fetchJson(fetchImpl, 'https://api.github.com/user', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token.access_token}`,
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }, 'AGENT_OAUTH_IDENTITY_FAILED')
      : await fetchJson(fetchImpl, 'https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${token.access_token}` }
        }, 'AGENT_OAUTH_IDENTITY_FAILED');
    const subject = String(identity.id || identity.sub || '').trim();
    if (!subject) throw new ApiError(502, 'AGENT_OAUTH_IDENTITY_FAILED');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const integrationId = crypto.randomUUID();
      const scopes = String(token.scope || config.scopes.join(' '))
        .split(/[,\s]+/)
        .filter(Boolean);
      const integration = await client.query(
        `INSERT INTO agent_integrations
          (id,user_id,provider,external_subject,scopes,secret_ref,status,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7)
         ON CONFLICT (user_id,provider) DO UPDATE SET
           external_subject=EXCLUDED.external_subject,
           scopes=EXCLUDED.scopes,
           secret_ref=EXCLUDED.secret_ref,
           status='active',
           expires_at=EXCLUDED.expires_at,
           updated_at=now()
         RETURNING id`,
        [
          integrationId,
          dbUserId,
          provider,
          subject,
          JSON.stringify(scopes),
          `db:${integrationId}`,
          token.expires_in
            ? new Date(Date.now() + Number(token.expires_in) * 1000)
            : null
        ]
      );
      const actualId = integration.rows[0].id;
      const encrypted = encryptIntegrationSecret({
        userId: dbUserId,
        integrationId: actualId,
        provider,
        value: {
          accessToken: token.access_token,
          refreshToken: token.refresh_token || null,
          tokenType: token.token_type || 'Bearer',
          scopes
        },
        env
      });
      await client.query(
        `INSERT INTO agent_integration_secrets
          (integration_id,algorithm,key_version,iv,auth_tag,ciphertext,rotated_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (integration_id) DO UPDATE SET
           algorithm=EXCLUDED.algorithm,key_version=EXCLUDED.key_version,
           iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,
           ciphertext=EXCLUDED.ciphertext,rotated_at=now()`,
        [
          actualId,
          encrypted.algorithm,
          encrypted.keyVersion,
          encrypted.iv,
          encrypted.authTag,
          encrypted.ciphertext
        ]
      );
      await client.query(
        'UPDATE agent_integrations SET secret_ref=$2 WHERE id=$1',
        [actualId, `db:${actualId}`]
      );
      await client.query('COMMIT');
      return { provider, returnTo: parsedState.returnTo || '/artigen/agent' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const revoke = async ({ userId, provider }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const dbUserId = await resolveUserId(client, userId);
      const integration = await client.query(
        `SELECT id FROM agent_integrations
          WHERE user_id=$1 AND provider=$2 AND status='active'
          FOR UPDATE`,
        [dbUserId, provider]
      );
      if (!integration.rowCount) throw new ApiError(404, 'AGENT_INTEGRATION_NOT_FOUND');
      await client.query(
        'DELETE FROM agent_integration_secrets WHERE integration_id=$1',
        [integration.rows[0].id]
      );
      await client.query(
        `UPDATE agent_integrations
            SET status='revoked',secret_ref='revoked',updated_at=now()
          WHERE id=$1`,
        [integration.rows[0].id]
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const readTokenForConnector = async ({ userId, provider }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT integration.id,integration.user_id,integration.provider,
                integration.expires_at,
                secret.algorithm,secret.key_version,secret.iv,secret.auth_tag,secret.ciphertext
           FROM agent_integrations integration
           JOIN agent_integration_secrets secret ON secret.integration_id=integration.id
          WHERE integration.user_id=$1 AND integration.provider=$2
            AND integration.status='active'
          FOR UPDATE OF integration,secret`,
        [userId, provider]
      );
      if (!result.rowCount) throw new ApiError(404, 'AGENT_INTEGRATION_NOT_AVAILABLE');
      const row = result.rows[0];
      let token = decryptIntegrationSecret({
        userId: row.user_id,
        integrationId: row.id,
        provider: row.provider,
        record: row,
        env
      });
      const expired = row.expires_at && new Date(row.expires_at).getTime() <= Date.now() + 30_000;
      if (expired) {
        if (provider !== 'google_drive' || !token.refreshToken) {
          throw new ApiError(401, 'AGENT_INTEGRATION_REAUTH_REQUIRED');
        }
        const config = providerConfig(provider, env);
        const refreshed = await fetchJson(fetchImpl, config.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: token.refreshToken,
            grant_type: 'refresh_token'
          }).toString()
        }, 'AGENT_OAUTH_REFRESH_FAILED');
        if (!refreshed.access_token) throw new ApiError(502, 'AGENT_OAUTH_REFRESH_FAILED');
        token = {
          ...token,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || token.refreshToken,
          tokenType: refreshed.token_type || token.tokenType || 'Bearer',
          scopes: String(refreshed.scope || '')
            .split(/\s+/)
            .filter(Boolean)
            .concat(refreshed.scope ? [] : token.scopes || [])
        };
        const encrypted = encryptIntegrationSecret({
          userId: row.user_id,
          integrationId: row.id,
          provider,
          value: token,
          env
        });
        await client.query(
          `UPDATE agent_integration_secrets
              SET algorithm=$2,key_version=$3,iv=$4,auth_tag=$5,ciphertext=$6,rotated_at=now()
            WHERE integration_id=$1`,
          [
            row.id,
            encrypted.algorithm,
            encrypted.keyVersion,
            encrypted.iv,
            encrypted.authTag,
            encrypted.ciphertext
          ]
        );
        await client.query(
          `UPDATE agent_integrations
              SET expires_at=clock_timestamp()+($2::text || ' seconds')::interval,
                  last_used_at=now(),updated_at=now()
            WHERE id=$1`,
          [row.id, Math.max(60, Number(refreshed.expires_in || 3600))]
        );
      } else {
        await client.query(
          'UPDATE agent_integrations SET last_used_at=now(),updated_at=now() WHERE id=$1',
          [row.id]
        );
      }
      await client.query('COMMIT');
      return token;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  return { begin, complete, readTokenForConnector, revoke };
};

module.exports = {
  PROVIDERS,
  createAgentIntegrationService,
  decodeState,
  encodeState,
  providerConfig,
  redirectUri
};
