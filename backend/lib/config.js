const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

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

const parseUrlList = (raw, fallback) => {
  const list = (raw || "")
    .toString()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
};

const NODE_ENV = String(process.env.NODE_ENV || "").trim() || "development";
const isProd = NODE_ENV === "production";

const API_KEY = normalizeSecret(process.env.GEMINI_API_KEY || "");

const SILICONFLOW_API_KEY = normalizeSecret(
  process.env.SILICONFLOW_API_KEY ||
    process.env.SILICONFLOW_TOKEN ||
    process.env.SILICONFLOW_KEY ||
    "",
);
const SILICONFLOW_API_BASE = normalizeUrl(
  process.env.SILICONFLOW_API_BASE || "https://api.siliconflow.cn/v1",
);
const SILICONFLOW_MODEL = (
  process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"
)
  .toString()
  .trim();
const SILICONFLOW_MESSAGES_URL = `${SILICONFLOW_API_BASE}/messages`;
const SILICONFLOW_CHAT_COMPLETIONS_URL = `${SILICONFLOW_API_BASE}/chat/completions`;
const SILICONFLOW_IMAGES_GENERATIONS_URL = `${SILICONFLOW_API_BASE}/images/generations`;
const SILICONFLOW_IMAGE_MODEL = (
  process.env.SILICONFLOW_IMAGE_MODEL || "Kwai-Kolors/Kolors"
)
  .toString()
  .trim();
const SILICONFLOW_TXT2IMG_MODEL = (
  process.env.SILICONFLOW_TXT2IMG_MODEL ||
  process.env.SILICONFLOW_IMAGE_MODEL_TXT2IMG ||
  "Kwai-Kolors/Kolors"
)
  .toString()
  .trim();
const SILICONFLOW_IMAGE_INPUT_FIELD = (
  process.env.SILICONFLOW_IMAGE_INPUT_FIELD || "image"
)
  .toString()
  .trim();

const FIXED_SILICONFLOW_CHAT_MODEL = "Qwen/Qwen2.5-7B-Instruct";
const FIXED_SILICONFLOW_IMAGE_MODEL = "Kwai-Kolors/Kolors";

let activeTextProvider = (() => {
  const preferred = (process.env.TEXT_PROVIDER || "")
    .toString()
    .trim()
    .toLowerCase();
  if (preferred === "siliconflow") return "siliconflow";
  if (preferred === "gemini") return "gemini";
  if (SILICONFLOW_API_KEY) return "siliconflow";
  if (API_KEY) return "gemini";
  return "offline";
})();

const GEMINI_API_BASE = normalizeUrl(process.env.GEMINI_API_BASE || "");
const DEFAULT_GEMINI_GENERATE_PATH =
  "v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_GENERATE_URL =
  process.env.GEMINI_GENERATE_URL ||
  (GEMINI_API_BASE
    ? `${GEMINI_API_BASE}/${DEFAULT_GEMINI_GENERATE_PATH}`
    : "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");

const GEMINI_TIMEOUT_MS = (() => {
  const v = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || "", 10);
  return Number.isFinite(v) && v > 1000 ? v : 12000;
})();
const GEMINI_REACTION_TIMEOUT_MS = (() => {
  const v = Number.parseInt(process.env.GEMINI_REACTION_TIMEOUT_MS || "", 10);
  return Number.isFinite(v) && v > 1000 ? v : 6000;
})();
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

const GEMINI_GENERATE_URLS = parseUrlList(process.env.GEMINI_GENERATE_URLS, [
  GEMINI_GENERATE_URL,
]);

module.exports = {
  NODE_ENV,
  isProd,
  API_KEY,
  SILICONFLOW_API_KEY,
  SILICONFLOW_API_BASE,
  SILICONFLOW_MODEL,
  SILICONFLOW_MESSAGES_URL,
  SILICONFLOW_CHAT_COMPLETIONS_URL,
  SILICONFLOW_IMAGES_GENERATIONS_URL,
  SILICONFLOW_IMAGE_MODEL,
  SILICONFLOW_TXT2IMG_MODEL,
  SILICONFLOW_IMAGE_INPUT_FIELD,
  FIXED_SILICONFLOW_CHAT_MODEL,
  FIXED_SILICONFLOW_IMAGE_MODEL,
  activeTextProvider,
  GEMINI_TIMEOUT_MS,
  GEMINI_REACTION_TIMEOUT_MS,
  SILICONFLOW_TIMEOUT_MS,
  SILICONFLOW_REACTION_TIMEOUT_MS,
  GEMINI_GENERATE_URLS,
  normalizeUrl,
  normalizeSecret,
  parseUrlList,
};
