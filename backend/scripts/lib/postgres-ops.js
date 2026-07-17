const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Client } = require('pg');
const { runner } = require('node-pg-migrate');
const { resolvePoolSsl } = require('../../db/pool');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'migrations');
const EXPECTED_POSTGRES_MAJOR = 16;

const parseOption = (argv, name) => {
  const directIndex = argv.indexOf(name);
  if (directIndex >= 0) {
    const value = argv[directIndex + 1];
    return value && !value.startsWith('--') ? value : '';
  }
  const prefix = `${name}=`;
  const inline = argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : '';
};

const hasFlag = (argv, name) => argv.includes(name);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
const quoteLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

const parsePostgresConnectionUrl = (connectionString, label = 'PostgreSQL URL') => {
  let parsed;
  try {
    parsed = new URL(String(connectionString || '').trim());
  } catch {
    const error = new Error(`${label} must be a valid postgresql:// connection URL`);
    error.code = 'POSTGRES_URL_INVALID';
    throw error;
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    const error = new Error(`${label} must use the postgresql:// protocol`);
    error.code = 'POSTGRES_URL_INVALID';
    throw error;
  }
  if (!parsed.hostname || !parsed.pathname.replace(/^\//, '')) {
    const error = new Error(`${label} must include a hostname and database name`);
    error.code = 'POSTGRES_URL_INVALID';
    throw error;
  }
  return parsed;
};

const isNeonPoolerHostname = (hostname) => {
  const normalized = String(hostname || '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (!(normalized === 'neon.tech' || normalized.endsWith('.neon.tech'))) return false;
  return normalized.split('.')[0].endsWith('-pooler');
};

const assertDirectPostgresUrl = (connectionString, label = 'PostgreSQL URL') => {
  const parsed = parsePostgresConnectionUrl(connectionString, label);
  if (isNeonPoolerHostname(parsed.hostname)) {
    const error = new Error(
      `${label} must use a Neon direct hostname; -pooler URLs are not supported for migrations, backups, restores, or LISTEN/NOTIFY`
    );
    error.code = 'POSTGRES_DIRECT_URL_REQUIRED';
    throw error;
  }
  return parsed;
};

const postgresConnectionIdentity = (connectionString, label = 'PostgreSQL URL') => {
  const parsed = assertDirectPostgresUrl(connectionString, label);
  let database;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    const error = new Error(`${label} contains an invalid encoded database name`);
    error.code = 'POSTGRES_URL_INVALID';
    throw error;
  }
  return {
    hostname: parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase(),
    port: parsed.port || '5432',
    database
  };
};

const assertSamePostgresDatabaseOrigin = (
  leftConnectionString,
  rightConnectionString,
  {
    leftLabel = 'DATABASE_MIGRATION_URL',
    rightLabel = 'DATABASE_URL'
  } = {}
) => {
  const left = postgresConnectionIdentity(leftConnectionString, leftLabel);
  const right = postgresConnectionIdentity(rightConnectionString, rightLabel);
  if (
    left.hostname !== right.hostname ||
    left.port !== right.port ||
    left.database !== right.database
  ) {
    const error = new Error(
      `${leftLabel} and ${rightLabel} must target the same PostgreSQL hostname, port, and database`
    );
    error.code = 'POSTGRES_DATABASE_ORIGIN_MISMATCH';
    throw error;
  }
  return left;
};

const assertSafeIdentifier = (value, label) => {
  const normalized = String(value || '').trim();
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(normalized)) {
    throw new Error(`${label} must start with a letter/underscore and contain only letters, numbers, or underscores`);
  }
  return normalized;
};

const redactDatabaseUrl = (connectionString) => {
  try {
    const parsed = new URL(connectionString);
    return {
      protocol: parsed.protocol.replace(/:$/, ''),
      hostname: parsed.hostname,
      port: parsed.port || '5432',
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '(default)',
      sslmode: parsed.searchParams.get('sslmode') || '(driver default)'
    };
  } catch {
    return {
      protocol: 'postgresql',
      hostname: '(unparseable)',
      port: '(unknown)',
      database: '(unknown)',
      sslmode: '(unknown)'
    };
  }
};

const createClient = (connectionString, env = process.env) => {
  assertDirectPostgresUrl(connectionString);
  return new Client({
    connectionString,
    ssl: resolvePoolSsl(connectionString, env),
    connectionTimeoutMillis: Math.max(1_000, Number(env.PG_CONNECT_TIMEOUT_MS || 10_000) || 10_000)
  });
};

const parsePostgresMajor = (versionText) => {
  const version = String(versionText || '');
  const match = version.match(/(?:PostgreSQL\s+)?(\d+)(?:\.\d+)?/i);
  return match ? Number(match[1]) : 0;
};

const resolvePostgresBinary = (binary, env = process.env) => {
  const configuredDirectory = String(env.PG_BIN_DIR || '').trim();
  if (configuredDirectory) {
    const configuredPath = path.resolve(configuredDirectory, binary);
    try {
      fs.accessSync(configuredPath, fs.constants.X_OK);
      return configuredPath;
    } catch {
      throw new Error(`PG_BIN_DIR does not contain an executable ${binary}: ${configuredPath}`);
    }
  }
  const candidates = [
    `/opt/homebrew/opt/postgresql@16/bin/${binary}`,
    `/usr/local/opt/postgresql@16/bin/${binary}`,
    `/opt/homebrew/opt/libpq/bin/${binary}`,
    `/usr/local/opt/libpq/bin/${binary}`
  ];
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return binary;
};

const assertServerMajor = async (client, expected = EXPECTED_POSTGRES_MAJOR) => {
  const result = await client.query(
    'SELECT current_setting($1) AS version_num, version() AS version',
    ['server_version_num']
  );
  const versionNum = String(result.rows[0]?.version_num || '');
  const major = Number(versionNum.slice(0, versionNum.length - 4)) || parsePostgresMajor(result.rows[0]?.version);
  if (major !== expected) {
    throw new Error(`PostgreSQL ${expected} is required; connected server reports ${result.rows[0]?.version || versionNum}`);
  }
  return {
    major,
    version: String(result.rows[0]?.version || ''),
    versionNum
  };
};

const runProcess = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      shell: false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });
    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve({ code, signal, stdout, stderr });
        return;
      }
      const error = new Error(
        `${command} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}${
          stderr.trim() ? `: ${stderr.trim()}` : ''
        }`
      );
      error.code = 'POSTGRES_COMMAND_FAILED';
      error.exitCode = code;
      error.signal = signal;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });

const assertPostgresBinaryMajor = async (binary, expected = EXPECTED_POSTGRES_MAJOR) => {
  const command = resolvePostgresBinary(binary);
  let result;
  try {
    result = await runProcess(command, ['--version'], { capture: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `${binary} was not found; set PG_BIN_DIR to the PostgreSQL ${expected} bin directory`
      );
    }
    throw error;
  }
  const versionText = `${result.stdout}\n${result.stderr}`.trim();
  const major = parsePostgresMajor(versionText);
  if (major !== expected) {
    throw new Error(
      `${command} from PostgreSQL ${expected} is required; found: ${versionText || 'unknown version'}`
    );
  }
  return { command, version: versionText };
};

const decodeCa = (env = process.env) => {
  let ca = String(env.PG_SSL_CA || '').replace(/\\n/g, '\n').trim();
  if (!ca && env.PG_SSL_CA_BASE64) {
    ca = Buffer.from(String(env.PG_SSL_CA_BASE64).trim(), 'base64').toString('utf8').trim();
  }
  return ca;
};

const withPgCliEnvironment = async (connectionString, callback, env = process.env) => {
  const parsed = assertDirectPostgresUrl(connectionString, 'PostgreSQL CLI URL');
  const decodeUrlPart = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const cliEnv = {
    ...env,
    PGHOST: parsed.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: parsed.port || '5432',
    PGUSER: decodeUrlPart(parsed.username),
    PGPASSWORD: decodeUrlPart(parsed.password),
    PGDATABASE: decodeUrlPart(parsed.pathname.replace(/^\//, ''))
  };
  const queryEnvironment = {
    sslmode: 'PGSSLMODE',
    channel_binding: 'PGCHANNELBINDING',
    application_name: 'PGAPPNAME',
    connect_timeout: 'PGCONNECT_TIMEOUT',
    options: 'PGOPTIONS',
    sslrootcert: 'PGSSLROOTCERT'
  };
  for (const [queryName, environmentName] of Object.entries(queryEnvironment)) {
    const value = parsed.searchParams.get(queryName);
    if (value) cliEnv[environmentName] = value;
  }
  const ca = decodeCa(env);
  let temporaryDirectory = '';
  try {
    if (ca) {
      temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-pg-ca-'));
      const caPath = path.join(temporaryDirectory, 'root.crt');
      fs.writeFileSync(caPath, `${ca}\n`, { encoding: 'utf8', mode: 0o600 });
      cliEnv.PGSSLROOTCERT = caPath;
    }
    return await callback(cliEnv);
  } finally {
    if (temporaryDirectory) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
};

const resolvePathThroughExistingAncestor = (inputPath) => {
  const absolutePath = path.resolve(String(inputPath || ''));
  let existingPath = absolutePath;
  const missingSegments = [];
  while (!fs.existsSync(existingPath)) {
    const parent = path.dirname(existingPath);
    if (parent === existingPath) break;
    missingSegments.unshift(path.basename(existingPath));
    existingPath = parent;
  }
  const realExistingPath = fs.realpathSync(existingPath);
  return path.resolve(realExistingPath, ...missingSegments);
};

const pathIsWithin = (candidate, directory) =>
  candidate === directory || candidate.startsWith(`${directory}${path.sep}`);

const assertPathOutsideRepo = (
  inputPath,
  { repoRoot = REPO_ROOT, label = 'Backup output directory' } = {}
) => {
  const lexicalCandidate = path.resolve(String(inputPath || ''));
  const lexicalRepo = path.resolve(repoRoot);
  const canonicalCandidate = resolvePathThroughExistingAncestor(lexicalCandidate);
  const canonicalRepo = resolvePathThroughExistingAncestor(lexicalRepo);
  if (
    pathIsWithin(lexicalCandidate, lexicalRepo) ||
    pathIsWithin(canonicalCandidate, canonicalRepo)
  ) {
    const error = new Error(`${label} must be outside the repository`);
    error.code = 'BACKUP_DIRECTORY_INSIDE_REPOSITORY';
    throw error;
  }
  return canonicalCandidate;
};

const pruneBackupGroups = (directory, retainCount = 14) => {
  const groups = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^artigen-neon-.+\.manifest\.json$/.test(entry.name))
    .map((entry) => {
      const manifestPath = path.join(directory, entry.name);
      const baseName = entry.name.replace(/\.manifest\.json$/, '');
      let createdAt = fs.statSync(manifestPath).mtimeMs;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const parsed = Date.parse(String(manifest.createdAt || ''));
        if (Number.isFinite(parsed)) createdAt = parsed;
      } catch {}
      return {
        baseName,
        createdAt,
        complete: ['.dump', '.manifest.json', '.sha256']
          .every((suffix) => fs.existsSync(path.join(directory, `${baseName}${suffix}`)))
      };
    })
    .filter((group) => group.complete)
    .sort((left, right) => right.createdAt - left.createdAt || right.baseName.localeCompare(left.baseName));
  const removedGroups = [];
  for (const group of groups.slice(Math.max(1, Number(retainCount) || 14))) {
    for (const suffix of ['.dump', '.manifest.json', '.sha256']) {
      fs.rmSync(path.join(directory, `${group.baseName}${suffix}`), { force: true });
    }
    removedGroups.push(group.baseName);
  }
  return removedGroups;
};

const sha256File = async (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.once('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.once('end', () => resolve(hash.digest('hex')));
  });

const runMigrations = async ({ connectionString, dbClient, dryRun = false, log = console.info }) => {
  if (!dbClient) {
    assertDirectPostgresUrl(connectionString, 'Migration database URL');
  }
  const connectionOptions = dbClient
    ? { dbClient }
    : {
        databaseUrl: {
          connectionString,
          ssl: resolvePoolSsl(connectionString)
        }
      };
  return runner({
    ...connectionOptions,
    migrationsTable: 'pgmigrations',
    dir: MIGRATIONS_DIR,
    direction: 'up',
    count: Infinity,
    singleTransaction: true,
    checkOrder: true,
    noLock: Boolean(dbClient),
    dryRun,
    log
  });
};

module.exports = {
  BACKEND_ROOT,
  EXPECTED_POSTGRES_MAJOR,
  MIGRATIONS_DIR,
  REPO_ROOT,
  assertDirectPostgresUrl,
  assertPathOutsideRepo,
  assertPostgresBinaryMajor,
  assertSafeIdentifier,
  assertSamePostgresDatabaseOrigin,
  assertServerMajor,
  createClient,
  hasFlag,
  parseOption,
  parsePostgresConnectionUrl,
  postgresConnectionIdentity,
  pruneBackupGroups,
  quoteIdentifier,
  quoteLiteral,
  redactDatabaseUrl,
  resolvePostgresBinary,
  runMigrations,
  runProcess,
  sha256File,
  withPgCliEnvironment
};
