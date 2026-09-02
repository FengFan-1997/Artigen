const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { readMacOsKeychainSecret } = require("./local-keychain");

const normalizeUrl = (url) => {
  const s = (url || "").toString().trim();
  return s.endsWith("/") ? s.slice(0, -1) : s;
};

const normalizeSecret = (value) => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  if (raw.startsWith("<") && raw.endsWith(">")) return "";
  if (/^(changeme|replace_me|your_.*|placeholder.*)$/i.test(raw)) return "";
  return raw;
};

const NODE_ENV = String(process.env.NODE_ENV || "").trim() || "development";
const isProd = NODE_ENV === "production";

const SILICONFLOW_API_KEY = normalizeSecret(
  readMacOsKeychainSecret({
    service: process.env.SILICONFLOW_KEYCHAIN_SERVICE,
    account: process.env.SILICONFLOW_KEYCHAIN_ACCOUNT,
  }) ||
    process.env.SILICONFLOW_API_KEY ||
    process.env.SILICONFLOW_TOKEN ||
    process.env.SILICONFLOW_KEY ||
    "",
);
const SILICONFLOW_API_BASE = normalizeUrl(
  process.env.SILICONFLOW_API_BASE || "https://api.siliconflow.cn/v1",
);
const SILICONFLOW_CHAT_COMPLETIONS_URL = `${SILICONFLOW_API_BASE}/chat/completions`;
const SILICONFLOW_IMAGES_GENERATIONS_URL = `${SILICONFLOW_API_BASE}/images/generations`;
const FIXED_SILICONFLOW_CHAT_MODEL = "Qwen/Qwen3-8B";
const FIXED_SILICONFLOW_IMAGE_MODEL = "Kwai-Kolors/Kolors";
const FIXED_CLOUDFLARE_CHAT_MODEL = "@cf/openai/gpt-oss-120b";
// Legacy endpoints expose one text model field.  In a deployed Agent
// environment that field must advertise the Cloudflare model; keep the
// SiliconFlow constant available for isolated backwards-compatibility tests.
const SILICONFLOW_MODEL = String(process.env.AGENT_MODEL_PROVIDER || "cloudflare")
  .trim()
  .toLowerCase() === "cloudflare"
  ? FIXED_CLOUDFLARE_CHAT_MODEL
  : FIXED_SILICONFLOW_CHAT_MODEL;

const ACTIVE_MODEL_PROVIDER = String(process.env.AGENT_MODEL_PROVIDER || "cloudflare")
  .trim()
  .toLowerCase();
const activeTextProvider = ACTIVE_MODEL_PROVIDER === "cloudflare"
  ? (normalizeSecret(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUTH_TOKEN)
    ? "cloudflare"
    : "offline")
  : (SILICONFLOW_API_KEY ? "siliconflow" : "offline");
const SILICONFLOW_TIMEOUT_MS = (() => {
  const v = Number.parseInt(process.env.SILICONFLOW_TIMEOUT_MS || "", 10);
  return Number.isFinite(v) && v > 1000 ? v : 120000;
})();
const SILICONFLOW_REACTION_TIMEOUT_MS = (() => {
  const v = Number.parseInt(
    process.env.SILICONFLOW_REACTION_TIMEOUT_MS || "",
    10,
  );
  return Number.isFinite(v) && v > 1000 ? v : 15000;
})();

module.exports = {
  NODE_ENV,
  isProd,
  SILICONFLOW_API_KEY,
  SILICONFLOW_API_BASE,
  SILICONFLOW_MODEL,
  SILICONFLOW_CHAT_COMPLETIONS_URL,
  SILICONFLOW_IMAGES_GENERATIONS_URL,
  FIXED_SILICONFLOW_CHAT_MODEL,
  FIXED_CLOUDFLARE_CHAT_MODEL,
  FIXED_SILICONFLOW_IMAGE_MODEL,
  activeTextProvider,
  SILICONFLOW_TIMEOUT_MS,
  SILICONFLOW_REACTION_TIMEOUT_MS,
  normalizeUrl,
  normalizeSecret,
};
