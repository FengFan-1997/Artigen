const installSystemRoutes = (app, deps) => {
  const NODE_ENV = deps?.NODE_ENV;
  const isProd = !!deps?.isProd;
  const requireLlmProvider = !!deps?.requireLlmProvider;
  const API_KEY = deps?.API_KEY;
  const SILICONFLOW_API_KEY = deps?.SILICONFLOW_API_KEY;
  const activeTextProvider = deps?.activeTextProvider;
  const imgCredits = deps?.imgCredits;
  const VECTORS_FILE = deps?.VECTORS_FILE;
  const readJson = deps?.readJson;
  const fs = deps?.fs;
  const path = deps?.path;
  const rateLimit = deps?.rateLimit;
  const assertAuthUserMatches = deps?.assertAuthUserMatches;
  const HF_RESOLVE_BASES = Array.isArray(deps?.HF_RESOLVE_BASES)
    ? deps.HF_RESOLVE_BASES
    : [];
  const HF_API_BASES = Array.isArray(deps?.HF_API_BASES)
    ? deps.HF_API_BASES
    : [];
  const hfProxyBaseHealth = deps?.hfProxyBaseHealth;
  const normalizeUpstreamBase = deps?.normalizeUpstreamBase;
  const HF_CACHE_DIR = deps?.HF_CACHE_DIR;
  const HF_CACHE_TTL_MS = deps?.HF_CACHE_TTL_MS;
  const HF_CACHE_MAX_BYTES = deps?.HF_CACHE_MAX_BYTES;
  const HF_CACHE_MAX_FILES = deps?.HF_CACHE_MAX_FILES;
  const getHfCacheUsage = deps?.getHfCacheUsage;
  const getHfCacheStats = deps?.getHfCacheStats;
  const buildModeDocIndex = deps?.buildModeDocIndex;
  const callGeminiGenerate = deps?.callGeminiGenerate;
  const callSiliconFlowChat = deps?.callSiliconFlowChat;
  const callTextGenerate = deps?.callTextGenerate;
  const GEMINI_GENERATE_URLS = deps?.GEMINI_GENERATE_URLS;
  const GEMINI_EMBED_URLS = deps?.GEMINI_EMBED_URLS;
  const GEMINI_TIMEOUT_MS = deps?.GEMINI_TIMEOUT_MS;
  const GEMINI_REACTION_TIMEOUT_MS = deps?.GEMINI_REACTION_TIMEOUT_MS;
  const SILICONFLOW_API_BASE = deps?.SILICONFLOW_API_BASE;
  const SILICONFLOW_MODEL = deps?.SILICONFLOW_MODEL;
  const MODEDOC_ROOT = deps?.MODEDOC_ROOT;
  const getClientIp = deps?.getClientIp;
  const assertAdmin = deps?.assertAdmin;
  const fetchWithTimeout = deps?.fetchWithTimeout;
  const PORT = deps?.PORT;
  const upsertUsageLedgerItem = deps?.upsertUsageLedgerItem;
  const computeCreditsDelta = deps?.computeCreditsDelta;
  const normalizeEmail = deps?.normalizeEmail;
  const canUseTestLoginCode = deps?.canUseTestLoginCode;
  const MEMORY_DIR = deps?.MEMORY_DIR;
  const appendUserImageHistory = deps?.appendUserImageHistory;
  const appendUserAuditHistory = deps?.appendUserAuditHistory;

  const listRegisteredRoutes = (appInstance) => {
    try {
      const router = appInstance?.router || appInstance?._router;
      const stack = Array.isArray(router?.stack) ? router.stack : [];
      const routes = [];
      for (const layer of stack) {
        const route = layer?.route;
        const routePath = route?.path;
        const methodsObj = route?.methods;
        if (!routePath || !methodsObj || typeof methodsObj !== "object")
          continue;
        const methods = Object.keys(methodsObj)
          .filter((k) => !!methodsObj[k])
          .map((m) => m.toUpperCase());
        routes.push({ path: routePath, methods });
      }
      return routes;
    } catch {
      return [];
    }
  };

  const isWritableDir = (dirPath) => {
    try {
      const p = path.resolve(String(dirPath || "").trim());
      fs.mkdirSync(p, { recursive: true });
      const testFile = path.join(
        p,
        `.write_test_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}.tmp`,
      );
      fs.writeFileSync(testFile, "ok");
      fs.unlinkSync(testFile);
      return { ok: true, path: p };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  };
  const parseCost = (v, fallback) => {
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const normalizeReasonKey = (raw) => {
    const key = String(raw || "")
      .trim()
      .toLowerCase();
    if (!key) return "";
    return key.replace(/[\s/-]+/g, "_");
  };
  const resolveCreditsCostByPurpose = (purpose) => {
    const key = normalizeReasonKey(purpose);
    if (!key) return 0;
    const costs = {
      aidesignQuick: parseCost(process.env.CREDITS_COST_AIDESIGN_QUICK, 10),
      aidesignSemantic: parseCost(
        process.env.CREDITS_COST_AIDESIGN_SEMANTIC,
        5,
      ),
      aidesignFinal: parseCost(process.env.CREDITS_COST_AIDESIGN_FINAL, 10),
      aiLab: parseCost(process.env.CREDITS_COST_AI_LAB, 5),
      aiImageWorkshop: parseCost(process.env.CREDITS_COST_AI_IMAGE_WORKSHOP, 5),
      aiBackground: parseCost(process.env.CREDITS_COST_AI_BACKGROUND, 5),
      aiIdPhoto: parseCost(process.env.CREDITS_COST_AI_ID_PHOTO, 5),
      aiOldPhoto: parseCost(process.env.CREDITS_COST_AI_OLD_PHOTO, 5),
      aiIngredientList: parseCost(
        process.env.CREDITS_COST_AI_INGREDIENT_LIST,
        10,
      ),
      generate: parseCost(process.env.CREDITS_COST_GENERATE, 10),
    };
    if (
      key === "aidesign_quick" ||
      key === "aidesign_generate" ||
      key === "aidesign"
    )
      return costs.aidesignQuick;
    if (
      key === "aidesign_semantic" ||
      key === "aidesign_directions" ||
      key === "aidesign_deep_analysis" ||
      key === "agentimg_directions"
    ) {
      return costs.aidesignSemantic;
    }
    if (key === "agentimg_final") return costs.aidesignFinal;
    if (key === "agentimg_ingredient_label") return costs.aiIngredientList;
    if (key === "ingredient_label") return costs.aiIngredientList;
    if (key === "aidesign_final" || key === "aidesign_deep_generate")
      return costs.aidesignFinal;
    if (key === "ai_lab") return costs.aiLab;
    if (key === "ai_image_workshop") return costs.aiImageWorkshop;
    if (key === "ai_design") return costs.aidesignQuick;
    if (key === "ai_background") return costs.aiBackground;
    if (key === "ai_id_photo" || key === "id_photo") return costs.aiIdPhoto;
    if (key === "ai_old_photo" || key === "old_photo") return costs.aiOldPhoto;
    if (key === "ai_ingredient_list") return costs.aiIngredientList;
    if (key === "generate") return costs.generate;
    return 0;
  };
  const resolveReasonText = (purpose) => {
    const key = normalizeReasonKey(purpose);
    if (!key) return "";
    const map = {
      aidesign_quick: "生图",
      aidesign_generate: "生图",
      aidesign: "生图",
      aidesign_semantic: "深度思考语义分析",
      aidesign_directions: "深度思考语义分析",
      aidesign_deep_analysis: "深度思考语义分析",
      agentimg_directions: "深度思考语义分析",
      agentimg_final: "生图",
      agentimg_ingredient_label: "AI配料表",
      ingredient_label: "AI配料表",
      aidesign_final: "生图",
      aidesign_deep_generate: "生图",
      ai_lab: "AI实验室",
      ai_image_workshop: "AI影像工坊",
      ai_design: "生图",
      ai_background: "AI背景",
      ai_id_photo: "AI证件照",
      id_photo: "AI证件照",
      ai_old_photo: "AI老照片",
      old_photo: "AI老照片",
      ai_ingredient_list: "AI配料表",
      generate: "生成",
    };
    return map[key] || "";
  };

  const agentImgPromptLibrary = {
    baseStyle: [
      "high quality",
      "high detail",
      "sharp focus",
      "cinematic lighting",
      "volumetric light",
      "clean composition",
    ],
    safeNegative: [
      "nsfw",
      "nudity",
      "gore",
      "violence",
      "lowres",
      "bad anatomy",
      "blurry",
      "watermark",
      "signature",
      "text",
    ],
    directionSystem: [
      "You are an expert creative director and prompt engineer for text-to-image models.",
      "Propose 4 distinct visual directions that follow: Style + Perspective/Composition + Subject + Background + Details + Lighting/Tone + Quality.",
      "Return ONLY valid JSON. No markdown, no explanations.",
    ].join("\n"),
    directionSchema: {
      type: "object",
      properties: {
        options: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              summary: { type: "string" },
              styleTags: { type: "array", items: { type: "string" } },
              negativeTags: { type: "array", items: { type: "string" } },
              suggested: {
                type: "object",
                properties: {
                  imageSize: { type: "string" },
                  steps: { type: "number" },
                  guidanceScale: { type: "number" },
                  seed: { type: "number" },
                },
              },
            },
            required: ["id", "title", "summary", "styleTags"],
          },
        },
      },
      required: ["options"],
    },
    finalPromptSystem: [
      "You are an expert prompt engineer for text-to-image models.",
      "You must produce a final, model-ready prompt with a safe negative prompt.",
      "Return ONLY valid JSON. No markdown, no explanations.",
    ].join("\n"),
    finalPromptSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        negativePrompt: { type: "string" },
        params: {
          type: "object",
          properties: {
            imageSize: { type: "string" },
            steps: { type: "number" },
            guidanceScale: { type: "number" },
            seed: { type: "number" },
          },
        },
      },
      required: ["prompt", "negativePrompt"],
    },
  };

  const safeJsonStringify = (v) => {
    try {
      return JSON.stringify(v);
    } catch {
      return "{}";
    }
  };

  const fnv1aHash = (input) => {
    const s = String(input || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };

  const safeJsonParse = (raw) => {
    try {
      return JSON.parse(String(raw || ""));
    } catch {
      return null;
    }
  };

  const extractFirstJsonObject = (raw) => {
    const s = String(raw || "");
    const match = s.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return safeJsonParse(match[0]);
  };

  const trimJsonValue = (v, opts) => {
    const maxDepth = Number(opts?.maxDepth || 4) || 4;
    const maxItems = Number(opts?.maxItems || 40) || 40;
    const maxString = Number(opts?.maxString || 400) || 400;
    const walk = (x, depth) => {
      if (x === null || x === undefined) return null;
      if (typeof x === "string")
        return x.length > maxString ? x.slice(0, maxString) : x;
      if (typeof x === "number" || typeof x === "boolean") return x;
      if (depth >= maxDepth)
        return typeof x === "object" ? "[truncated]" : null;
      if (Array.isArray(x))
        return x.slice(0, maxItems).map((it) => walk(it, depth + 1));
      if (typeof x === "object") {
        const out = {};
        const keys = Object.keys(x).slice(0, maxItems);
        for (const k of keys) out[k] = walk(x[k], depth + 1);
        return out;
      }
      return null;
    };
    return walk(v, 0);
  };

  const detectUserInputLang = (input) => {
    const s = String(input || "").trim();
    if (/[\u4e00-\u9fff]/.test(s)) return "zh";
    return "en";
  };

  const normalizeUserInputKey = (s) =>
    String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  const splitUserInputSegments = (input) => {
    const s = String(input || "").trim();
    if (!s) return [];
    const parts = s.split(/\n\s*\n+/g).map((x) => String(x || "").trim());
    return parts.filter(Boolean);
  };

  const normalizeMemoryInputs = (inputs, max = 6) => {
    const list = Array.isArray(inputs) ? inputs : [];
    const picked = [];
    const seen = new Set();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const raw = String(list[i] || "").trim();
      if (!raw) continue;
      const key = normalizeUserInputKey(raw);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(raw.slice(0, 800));
      if (picked.length >= max) break;
    }
    return picked.reverse();
  };

  const formatUserInputsForPrompt = (inputs, lang) => {
    const list = normalizeMemoryInputs(inputs, 6);
    if (list.length <= 1) return "";
    const body = list.map((s, i) => `${i + 1}. ${s}`).join("\n");
    return lang === "zh"
      ? `多轮用户输入（按时间顺序，越靠后越新）:\n${body}`
      : `Multi-turn user inputs (chronological, later is newer):\n${body}`;
  };

  const buildAgentImgDirectionPrompt = (input) => {
    const userInput = String(input?.userInput || "")
      .trim()
      .slice(0, 4000);
    const contextText = String(input?.contextText || "")
      .trim()
      .slice(0, 8000);
    const attempt = Number(input?.attempt || 0) || 0;
    const lang = detectUserInputLang(userInput);
    const zh = lang === "zh";
    const memoryInputs = normalizeMemoryInputs(
      [
        ...(Array.isArray(input?.memoryInputs) ? input.memoryInputs : []),
        ...splitUserInputSegments(userInput),
      ],
      6,
    );
    const memoryText = formatUserInputsForPrompt(memoryInputs, lang);
    const schema = safeJsonStringify(agentImgPromptLibrary.directionSchema);
    return [
      agentImgPromptLibrary.directionSystem,
      `Schema: ${schema}`,
      `User input language: ${lang}`,
      zh
        ? "所有输出字段必须使用中文（title/summary/styleTags/negativeTags），禁止出现英文。"
        : "All output fields must be English (title/summary/styleTags/negativeTags). Do not output Chinese.",
      zh
        ? "为保证内容足够丰富且不被截断：每个方向的 summary 必须是一个单行字符串（各模块：风格限定/视角构图/主体描述/背景设定/细节修饰/光影色调/质量词 之间用逗号或句号分隔，绝对不要换行），不要额外写“导语/总述/结尾”。summary 总长度控制在 260–420 个汉字左右。styleTags 输出 14–18 条；negativeTags 输出 14–22 条。必须输出 4 个方向且 id 严格为 opt_1..opt_4，按顺序。任何字符串字段里不要出现未转义的英文双引号，也绝对禁止出现真实换行符。"
        : "To ensure richness without truncation: summary must be a single continuous string (separate modules with commas/periods, absolutely NO newlines), and no extra intro/outro paragraphs. Keep summary total length around 150–260 words. Output 14–18 styleTags and 14–22 negativeTags. Must output exactly 4 options with ids opt_1..opt_4 in order. Do not include unescaped double quotes or real newlines inside any string field.",
      zh
        ? "规则：尽可能保留用户输入中的原话与具体约束（颜色/数量/人物/物体/位置/动作等），不要同义改写或删减；只补全用户未明确但生成必须的细节。"
        : "Rule: Preserve the user’s exact phrasing and concrete constraints (colors/counts/people/objects/positions/actions). Do not paraphrase or drop constraints; only fill in missing-but-necessary details.",
      memoryText
        ? zh
          ? "如果存在多轮用户输入：将它们自动融合为一个一致的需求；若有冲突，以最新一条为准，并尽量保留可兼容的历史细节。"
          : "If multiple user inputs exist: merge them into one coherent request; if conflicts exist, prioritize the latest while keeping compatible prior details."
        : "",
      attempt > 0
        ? zh
          ? "上一次输出 JSON 不可解析或不完整。请重新从头生成，务必输出可解析的完整 JSON（含所有右括号/右中括号），不要引用或解释之前的输出。"
          : "Your previous output was invalid or incomplete JSON. Regenerate from scratch and output fully parseable JSON (with all closing brackets). Do not reference or explain the previous output."
        : "",
      contextText
        ? zh
          ? `上下文:\n${contextText}`
          : `Context:\n${contextText}`
        : "",
      memoryText ? memoryText : "",
      zh
        ? `用户输入（本轮原文）: ${userInput}`
        : `User input (verbatim, this turn): ${userInput}`,
      zh
        ? "只返回 JSON，不要包含任何解释或多余文本。"
        : "Return ONLY JSON. No extra text.",
      "Output JSON example:",
      '{"options":[{"id":"opt_1","title":"...","summary":"...","styleTags":["..."],"negativeTags":["..."],"suggested":{"imageSize":"1024x1024","steps":20,"guidanceScale":7.5,"seed":123}}]}',
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const buildAgentImgFinalPrompt = (input) => {
    const userInput = String(input?.userInput || "")
      .trim()
      .slice(0, 4000);
    const contextText = String(input?.contextText || "")
      .trim()
      .slice(0, 8000);
    const lang = detectUserInputLang(userInput);
    const zh = lang === "zh";
    const memoryInputs = normalizeMemoryInputs(
      [
        ...(Array.isArray(input?.memoryInputs) ? input.memoryInputs : []),
        ...splitUserInputSegments(userInput),
      ],
      6,
    );
    const memoryText = formatUserInputsForPrompt(memoryInputs, lang);
    const opt =
      input?.option && typeof input.option === "object" ? input.option : null;
    const optionText = opt
      ? safeJsonStringify({
          title: String(opt.title || "")
            .trim()
            .slice(0, 140),
          summary: String(opt.summary || "")
            .trim()
            .slice(0, 1200),
          styleTags: Array.isArray(opt.styleTags)
            ? opt.styleTags.slice(0, 24)
            : [],
          negativeTags: Array.isArray(opt.negativeTags)
            ? opt.negativeTags.slice(0, 24)
            : [],
          suggested:
            opt.suggested && typeof opt.suggested === "object"
              ? opt.suggested
              : {},
        })
      : "";
    const schema = safeJsonStringify(agentImgPromptLibrary.finalPromptSchema);
    const baseStyle = agentImgPromptLibrary.baseStyle.join(", ");
    const safeNeg = agentImgPromptLibrary.safeNegative.join(", ");
    return [
      agentImgPromptLibrary.finalPromptSystem,
      `Schema: ${schema}`,
      `User input language: ${lang}`,
      zh
        ? "prompt 与 negativePrompt 必须使用中文，禁止出现英文。"
        : "prompt and negativePrompt must be English. Do not output Chinese.",
      zh
        ? "规则：prompt 必须尽可能保留用户输入中的原话与具体约束，不要同义改写或删减；如需补全，只补全用户未明确但生成必须的细节。"
        : "Rule: Keep the user’s original wording and constraints in prompt; do not paraphrase or drop them. Only add missing-but-necessary details.",
      `Base style tags to incorporate when appropriate: ${baseStyle}`,
      `Safety negative tags (must include): ${safeNeg}`,
      contextText
        ? zh
          ? `上下文:\n${contextText}`
          : `Context:\n${contextText}`
        : "",
      memoryText ? memoryText : "",
      zh
        ? `用户输入（本轮原文）: ${userInput}`
        : `User input (verbatim, this turn): ${userInput}`,
      optionText
        ? zh
          ? `已选方向: ${optionText}`
          : `Chosen direction: ${optionText}`
        : "",
      zh
        ? "只返回 JSON：prompt, negativePrompt, params"
        : "Return JSON with: prompt, negativePrompt, params",
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const buildIngredientLabelPrompt = (input) => {
    const userText = String(input?.userText || "")
      .trim()
      .slice(0, 8000);
    const productTypeUpper = String(input?.productType || "")
      .trim()
      .toUpperCase()
      .slice(0, 80);

    let systemInstruction = "";
    let jsonStructure = "";

    if (productTypeUpper === "DRUG") {
      systemInstruction = `Generate FDA-compliant Drug Facts JSON from: ${userText}. Titles in ALL CAPS. Required sections and order: ACTIVE INGREDIENTS, PURPOSE, USES, WARNINGS, DIRECTIONS, OTHER INFORMATION, INACTIVE INGREDIENTS, MANUFACTURER, NET CONTENT, NDC, LOT NUMBER, EXPIRATION DATE. 
    
    CRITICAL: If the user input is minimal, YOU MUST INFER and GENERATE realistic standard FDA content for 'WARNINGS', 'DIRECTIONS', and 'OTHER INFORMATION' based on the active ingredients identified. Do not return empty objects. 
    - WARNINGS must be an object with keys: do_not_use, ask_doctor_before_use, ask_doctor_or_pharmacist, when_using_this_product, stop_use_and_ask_doctor, pregnancy_breastfeeding, keep_out_of_reach. Populate these with standard warnings for the drug type. **KEEP WARNINGS EXTREMELY CONCISE (3–5 words per bullet, no full sentences) while maintaining FDA compliance.**
    - DIRECTIONS may be an object with groups [{age,dose,frequency}] and general []. Populate with standard dosages.
    - OTHER INFORMATION: Populate with standard storage info (e.g., Store at 20-25°C).
    - USES: Provide concise bullet-point style uses.
    - MANUFACTURER: Generate a realistic manufacturer name and address if not provided (e.g., "HealthPharma Inc., New York, NY 10001").
    - NET CONTENT: Generate realistic net quantity in dual units if missing (e.g., "100 tablets" or "Net Wt 1 oz (28 g)").
    - NDC: Generate a realistic National Drug Code (e.g., "12345-678-90").
    - LOT NUMBER: Generate a realistic lot number (e.g., "A1234567").
    - EXPIRATION DATE: Generate a realistic expiration date (e.g., "Exp: 12/2026").
    
    Content must be concise, direct, and in American English.`;
      jsonStructure = JSON.stringify({
        layoutType: "drug_facts",
        sections: [
          { title: "ACTIVE INGREDIENTS", content: "..." },
          { title: "PURPOSE", content: "..." },
          { title: "USES", content: "..." },
          { title: "WARNINGS", content: { do_not_use: ["..."] } },
          {
            title: "DIRECTIONS",
            content: {
              groups: [
                {
                  age: "Adults",
                  dose: "2 tablets",
                  frequency: "every 6 hours",
                },
              ],
            },
          },
          { title: "OTHER INFORMATION", content: ["..."] },
          { title: "INACTIVE INGREDIENTS", content: "..." },
          { title: "MANUFACTURER", content: "..." },
          { title: "NET CONTENT", content: "..." },
          { title: "NDC", content: "..." },
          { title: "LOT NUMBER", content: "..." },
          { title: "EXPIRATION DATE", content: "..." },
        ],
      });
    } else if (productTypeUpper === "DIETARY SUPPLEMENT") {
      systemInstruction = `FDA Supplement Facts expert. Convert the user's text (${userText}) into the Supplement Facts JSON format. INGREDIENTS MUST be a single, comma-separated list (e.g., Gelatin, Cellulose). 
    
    **CRITICAL EXPANSION**: 
    1. If the user text is minimal (1-2 words/ingredients) or implies 'pure'/'only', you MUST infer and expand it into a realistic, full commercial ingredient list.
    2. **%DV Handling**: For ingredients where Daily Value (DV) is not established (e.g. herbal extracts, specific amino acids), set 'dv' to '*' (asterisk). Do NOT use 'N/A'.
    3. **WARNINGS**: If warnings are missing, you MUST generate these **EXACT** standard warnings: "Keep out of reach of children.", "Do not use if safety seal is broken or missing.", and "Consult a physician if pregnant, nursing, taking medication, or have a medical condition."
    4. **MANUFACTURER**: You MUST generate a realistic Manufacturer Name AND Full US Physical Address (Street, City, State Zip) if not provided (e.g., "Vitality Supps LLC, 123 Wellness Dr, Austin, TX 78701").
    5. **NET CONTENT**: You MUST generate realistic net content in dual units if missing (e.g., "60 Capsules" or "Net Wt 5 oz (140 g)").
    
    Infer necessary content for all required sections. **CRITICAL: Translate all user content to American English.** Keep content extremely concise, capitalized, and without special formatting symbols. All titles must be ENGLISH and UPPERCASE. Output ONLY the JSON object.`;
      jsonStructure = JSON.stringify({
        layoutType: "supplement_facts",
        sections: [
          {
            title: "SERVE HEADER",
            content: { servingSize: "...", servingsPerContainer: "..." },
            isHeader: true,
          },
          {
            title: "SUPPLEMENT FACTS TABLE",
            content: [{ name: "...", amount: "...", dv: "*" }],
            isTable: true,
          },
          { title: "OTHER INGREDIENTS", content: "..." },
          { title: "SUGGESTED USE", content: "..." },
          { title: "WARNINGS", content: "..." },
          { title: "MANUFACTURER", content: "..." },
          { title: "NET CONTENT", content: "..." },
        ],
      });
    } else if (productTypeUpper === "COSMETIC") {
      systemInstruction = `FDA/INCI Cosmetic Label Expert. Convert the user's text (${userText}) into a strictly compliant Cosmetic Ingredient List JSON.
    
    **STRICT RULES**:
    1. **INCI Naming**: All non-colorant ingredients MUST use INCI names (e.g., 'Water' -> 'Aqua', 'Vitamin E' -> 'Tocopherol').
    2. **Descending Order**: Ingredients > 1% MUST be listed in descending order of weight. Ingredients <= 1% can follow in any order.
    3. **Colorants (FDA Legal Names)**: Provide FDA-required legal colorant names with CI numbers in parentheses and list them in a unified 'MAY CONTAIN' section at the end (e.g., "Titanium Dioxide (CI 77891)", "Iron Oxides (CI 77491, CI 77492, 77499)", "Red 7 Lake (CI 15850)", "Mica"). Do NOT scatter colorants inside the main ingredients.
    4. **Fragrance**: Use "Fragrance" or "Parfum" instead of individual components. If the fragrance contains any of FDA's 26 cosmetic contact allergens (e.g., Benzyl Alcohol, Cinnamal, Citral), list those specific allergens in the 'CONTAINS' section (not "Fragrance").
    5. **Allergens (CONTAINS Section)**: 
      - **Only list these FDA-recognized cosmetic/food allergens**: 
        1. Cosmetic contact allergens (26 FDA-mandated): Benzyl Alcohol, Benzyl Cinnamate, Benzyl Salicylate, Cinnamal, Cinnamyl Alcohol, Citral, Citronellol, Coumarin, Eugenol, Farnesol, Geraniol, Hydroxycitronellal, Isoeugenol, Limonene, Linalool, Amyl Cinnamal, Amyl Cinnamal Alcohol, Anise Alcohol, Benzyl Benzoate, Butylphenyl Methylpropional, Citrus Aurantium Bergamia (Bergamot) Fruit Oil, Citrus Aurantium Dulcis (Orange) Peel Oil, Citrus Limon (Lemon) Peel Oil, Evernia Furfuracea (Treemoss) Extract, Evernia Prunastri (Oakmoss) Extract, Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde
        2. Food-derived allergens: Peanuts, Tree Nuts (Almond, Walnut), Milk, Eggs, Soy, Wheat, Fish, Crustacean Shellfish, Sesame
      - If the user text contains these allergens (e.g., "Peanut Oil" → "Peanuts"; "Cinnamal" → "Cinnamal"), list them in a 'CONTAINS' section (UPPERCASE title) using their FDA-standard name.
      - If NO allergens are present, OMIT the 'CONTAINS' section entirely (do NOT output "None").
    6. **Title**: Use "INGREDIENTS" as the main section title (UPPERCASE).
    7. **Exclusions**: DO NOT include Manufacturer/Distributor information. DO NOT include Net Content/Quantity information.
    
    **CRITICAL EXPANSION**: Unless the user explicitly says 'pure' or 'only', infer and expand minimal inputs into a realistic commercial formula (base, emulsifiers, preservatives, actives). When 'pure' or 'only' is stated, do not expand.
    
    **NO DRUG CLAIMS**: DO NOT include any therapeutic or drug claims in the text.
    
    Output ONLY the JSON object.`;
      jsonStructure = JSON.stringify({
        layoutType: "standard",
        sections: [
          { title: "INGREDIENTS", content: "Aqua, Glycerin, ..." },
          { title: "CONTAINS", content: "Cinnamal, Peanuts, ..." },
          { title: "MAY CONTAIN", content: "Titanium Dioxide (CI 77891), ..." },
        ],
      });
    } else if (productTypeUpper === "FOOD") {
      systemInstruction = `FDA Food Label Expert. Convert the user's text (${userText}) into a strictly compliant Food Ingredient List JSON.
    
    **STRICT RULES**:
    1. **Layout**: Use 'standard' layout ONLY. DO NOT generate 'nutrition_facts' or 'supplement_facts'.
    2. **Sections**: Return ONLY 'INGREDIENTS' and 'CONTAINS'.
    3. **Net Content**: DO NOT generate or include 'NET CONTENT' or any quantity information (e.g. "10 fl oz").
    4. **Ingredients Expansion**: Expand ingredients by default into a realistic, full commercial list (including excipients/preservatives if applicable). If the user explicitly says 'pure' or 'only', DO NOT expand and only list provided items.
    5. **Contains (Allergens)**: 
       - Identify major food allergens (Milk, Eggs, Fish, Crustacean shellfish, Tree Nuts, Peanuts, Wheat, Soybeans, Sesame).
       - **CRITICAL**: If NO allergens are present, DO NOT include the 'CONTAINS' section in the JSON. Omit it entirely. DO NOT output "None".
    
    **Translate all content to American English.** Keep content concise and capitalized. All titles ENGLISH and UPPERCASE. Output ONLY the JSON object.`;
      jsonStructure = JSON.stringify({
        layoutType: "standard",
        sections: [
          { title: "INGREDIENTS", content: "..." },
          { title: "CONTAINS", content: "..." },
        ],
      });
    } else {
      systemInstruction = `Convert the user's text (${userText}) into the Standard JSON format.
    
    **INTELLIGENT MODE**:
    1. Check if the user provided any quantitative nutritional information (e.g., Calories, Fat).
    2. IF YES: Generate a 'NUTRITION FACTS' JSON structure (layoutType: 'nutrition_facts').
       - Include 'NUTRITION FACTS' section with: servingSize, servingsPerContainer, calories, totalFat (g/%), sodium (mg/%), totalCarb (g/%), protein (g).
       - Include 'INGREDIENTS' and 'CONTAINS' as usual.
    3. IF NO (just simple ingredients): Use 'standard' layout with 'INGREDIENTS' and 'CONTAINS'.
    
    **CRITICAL EXPANSION for Ingredients**: Expand by default into a realistic commercial list. If the user explicitly says 'pure' or 'only', DO NOT expand.
    For 'CONTAINS', if NO allergens are present, omit the 'CONTAINS' section entirely.
    **Translate all content to American English.** Keep content concise and capitalized. All titles ENGLISH and UPPERCASE. Output ONLY the JSON object.`;
      jsonStructure = JSON.stringify({
        layoutType: "nutrition_facts",
        sections: [
          {
            title: "NUTRITION FACTS",
            content: {
              servingSize: "...",
              servingsPerContainer: "...",
              calories: "...",
              totalFat: { amount: "...g", dv: "...%" },
              sodium: { amount: "...mg", dv: "...%" },
              totalCarbohydrate: { amount: "...g", dv: "...%" },
              protein: "...g",
            },
            isTable: true,
          },
          { title: "INGREDIENTS", content: "..." },
          { title: "CONTAINS", content: "..." },
        ],
      });
    }

    return `${systemInstruction}\nReturn ONLY the JSON object conforming to this structure: ${jsonStructure}`;
  };

  const isLocalRequest = (req) => {
    const ip = typeof getClientIp === "function" ? getClientIp(req) : "";
    return (
      ip === "::1" ||
      ip === "127.0.0.1" ||
      ip.startsWith("127.") ||
      ip === "::ffff:127.0.0.1" ||
      ip.startsWith("::ffff:127.") ||
      ip === "::ffff:7f00:1" ||
      ip === "localhost"
    );
  };

  const isDebugRoutesEnabled = (req) => {
    const raw = String(process.env.DEBUG_ROUTES || "")
      .trim()
      .toLowerCase();
    if (raw === "1" || raw === "true") return true;
    return !isProd && isLocalRequest(req);
  };

  app.get(["/healthz", "/readyz"], (req, res) => {
    const hasGeminiKey = !!API_KEY;
    const hasSiliconflowKey = !!SILICONFLOW_API_KEY;
    const hasProvider = hasGeminiKey || hasSiliconflowKey;
    const ok = requireLlmProvider ? hasProvider : true;
    res.status(ok ? 200 : 503).json({
      ok,
      nodeEnv: NODE_ENV,
      uptimeSec: Math.floor(process.uptime()),
      hasProvider,
      rid: String(res.locals.requestId || ""),
    });
  });

  app.get(
    "/api/meta",
    rateLimit("meta", { max: 300, windowMs: 60 * 1000 }),
    (req, res) => {
      res.json({
        ok: true,
        nodeEnv: NODE_ENV,
        uptimeSec: Math.floor(process.uptime()),
        rid: String(res.locals.requestId || ""),
        gitSha:
          String(
            process.env.GIT_SHA ||
              process.env.VERCEL_GIT_COMMIT_SHA ||
              process.env.RAILWAY_GIT_COMMIT_SHA ||
              "",
          ).trim() || null,
      });
    },
  );

  app.get(
    "/api/health",
    rateLimit("health", { max: 120, windowMs: 60 * 1000 }),
    async (req, res) => {
      const probe = String(req.query.probe || "").trim() === "1";
      const expose = isDebugRoutesEnabled(req);
      if (!expose) {
        return res.json({
          ok: true,
          serverTime: Date.now(),
          rid: String(res.locals.requestId || ""),
        });
      }
      const hasApiKey = !!API_KEY;
      const hasSiliconflowKey = !!SILICONFLOW_API_KEY;
      const proxyUrl =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        "";

      const hfBases = HF_RESOLVE_BASES.map((b) =>
        typeof normalizeUpstreamBase === "function"
          ? normalizeUpstreamBase(b)
          : "",
      ).filter(Boolean);
      const hfHealth = hfBases.map((b) => {
        const s =
          typeof hfProxyBaseHealth?.get === "function"
            ? hfProxyBaseHealth.get(b)
            : null;
        const downUntil = Number(s?.downUntil || 0);
        return {
          base: b,
          failCount: Number(s?.failCount || 0),
          downUntil: downUntil || 0,
          down: downUntil > Date.now(),
        };
      });

      const result = {
        ok: true,
        serverTime: Date.now(),
        hasApiKey,
        textProvider: activeTextProvider,
        hf: {
          resolveBases: HF_RESOLVE_BASES,
          apiBases: HF_API_BASES,
          baseHealth: hfHealth,
          cache: {
            dir: HF_CACHE_DIR,
            ttlMs: HF_CACHE_TTL_MS,
            maxBytes: HF_CACHE_MAX_BYTES,
            maxFiles: HF_CACHE_MAX_FILES,
            usage:
              typeof getHfCacheUsage === "function" ? getHfCacheUsage() : null,
            stats:
              typeof getHfCacheStats === "function" ? getHfCacheStats() : null,
          },
        },
        gemini: {
          generateUrls: GEMINI_GENERATE_URLS,
          embedUrls: GEMINI_EMBED_URLS,
          timeoutMs: GEMINI_TIMEOUT_MS,
          reactionTimeoutMs: GEMINI_REACTION_TIMEOUT_MS,
          proxyConfigured: !!proxyUrl,
          lastProbe: null,
        },
        siliconflow: {
          baseUrl: SILICONFLOW_API_BASE,
          model: SILICONFLOW_MODEL,
          hasApiKey: hasSiliconflowKey,
          lastProbe: null,
        },
        rag: {
          vectorsFile: VECTORS_FILE,
          exists: false,
          sizeBytes: 0,
          totalVectors: 0,
          withEmbedding: 0,
          embeddingNull: 0,
          sources: 0,
        },
        modedoc: {
          root:
            typeof MODEDOC_ROOT === "function" ? MODEDOC_ROOT() : MODEDOC_ROOT,
          indexed: false,
          countZh: 0,
          countEn: 0,
        },
        storage: {
          memoryDir: "",
          writable: false,
        },
      };

      try {
        if (fs.existsSync(VECTORS_FILE)) {
          result.rag.exists = true;
          const st = fs.statSync(VECTORS_FILE);
          result.rag.sizeBytes = Number(st?.size || 0);
          const vectors0 =
            typeof readJson === "function" ? readJson(VECTORS_FILE, []) : [];
          const vectors = Array.isArray(vectors0) ? vectors0 : [];
          result.rag.totalVectors = vectors.length;
          let withEmbedding = 0;
          let embeddingNull = 0;
          const sources = new Set();
          for (const v of vectors) {
            const emb = v?.embedding;
            if (Array.isArray(emb) && emb.length > 0) withEmbedding += 1;
            else embeddingNull += 1;
            const meta =
              v?.metadata && typeof v.metadata === "object" ? v.metadata : null;
            const src =
              typeof meta?.sourceRel === "string"
                ? meta.sourceRel
                : typeof meta?.source === "string"
                  ? meta.source
                  : "";
            if (src && String(src).trim()) sources.add(String(src).trim());
          }
          result.rag.withEmbedding = withEmbedding;
          result.rag.embeddingNull = embeddingNull;
          result.rag.sources = sources.size;
        }
      } catch {}

      try {
        if (typeof buildModeDocIndex === "function") {
          const idx = buildModeDocIndex();
          result.modedoc.indexed = true;
          result.modedoc.countZh = idx?.zh?.size || 0;
          result.modedoc.countEn = idx?.en?.size || 0;
        }
      } catch {}

      try {
        const check = isWritableDir(MEMORY_DIR);
        result.storage.memoryDir = MEMORY_DIR;
        result.storage.writable = !!check.ok;
        if (!check.ok) result.storage.error = check.error;
      } catch (e) {
        result.storage.memoryDir = "";
        result.storage.writable = false;
        result.storage.error = String(e?.message || e);
      }

      if (probe) {
        const startedAt = Date.now();
        if (activeTextProvider === "gemini" && hasApiKey) {
          try {
            const { usedUrl, failures } = await callGeminiGenerate({
              timeoutMs: 5000,
              contents: [{ role: "user", parts: [{ text: "ping" }] }],
            });
            result.gemini.lastProbe = {
              ok: true,
              usedUrl,
              elapsedMs: Date.now() - startedAt,
              failures: Array.isArray(failures) ? failures.slice(0, 3) : [],
            };
          } catch (e) {
            result.gemini.lastProbe = {
              ok: false,
              elapsedMs: Date.now() - startedAt,
              error: String(e?.message || e),
              failures: Array.isArray(e?.failures)
                ? e.failures.slice(0, 3)
                : [],
            };
          }
        } else if (hasSiliconflowKey) {
          try {
            const { usedUrl, failures } = await callSiliconFlowChat({
              timeoutMs: 5000,
              messages: [{ role: "user", content: "ping" }],
              maxTokens: 32,
            });
            result.siliconflow.lastProbe = {
              ok: true,
              usedUrl,
              elapsedMs: Date.now() - startedAt,
              failures: Array.isArray(failures) ? failures.slice(0, 3) : [],
            };
          } catch (e) {
            result.siliconflow.lastProbe = {
              ok: false,
              elapsedMs: Date.now() - startedAt,
              error: String(e?.message || e),
              failures: Array.isArray(e?.failures)
                ? e.failures.slice(0, 3)
                : [],
            };
          }
        }
      }

      res.json(result);
    },
  );

  let hfPrewarmRunning = null;
  const normalizeSelfBaseUrl = (raw) =>
    String(raw || "")
      .trim()
      .replace(/\/+$/, "");
  const resolveSelfBaseUrl = () => {
    const fromEnv = normalizeSelfBaseUrl(process.env.SELF_BASE_URL || "");
    if (fromEnv) return fromEnv;
    const n = Number.parseInt(String(PORT || process.env.PORT || 8080), 10);
    const port = Number.isFinite(n) && n > 0 ? n : 8080;
    return `http://127.0.0.1:${port}`;
  };
  const normalizePrewarmMode = (raw) => {
    const m = String(raw || "")
      .trim()
      .toLowerCase();
    if (m === "head" || m === "range" || m === "full") return m;
    return "full";
  };
  const parsePrewarmUrls = (raw) => {
    const items = String(raw || "")
      .split(/[\n,\s]+/g)
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 200);
    const base = resolveSelfBaseUrl();
    const out = [];
    for (const it of items) {
      try {
        const u = /^https?:\/\//i.test(it)
          ? new URL(it)
          : new URL(it.startsWith("/") ? `${base}${it}` : `${base}/${it}`);
        if (u.protocol !== "http:" && u.protocol !== "https:") continue;
        if (!u.pathname.startsWith("/api/hf/")) continue;
        u.hash = "";
        out.push(u.toString());
      } catch {}
    }
    return out;
  };
  const readAndDiscardBody = async (resp) => {
    const body = resp?.body;
    if (!body || typeof body.on !== "function") return 0;
    return await new Promise((resolve) => {
      let bytes = 0;
      const onData = (chunk) => {
        try {
          bytes += Buffer.isBuffer(chunk)
            ? chunk.length
            : Buffer.byteLength(String(chunk || ""));
        } catch {}
      };
      const done = () => resolve(bytes);
      try {
        body.on("data", onData);
        body.on("end", done);
        body.on("error", done);
        body.resume();
      } catch {
        resolve(bytes);
      }
    });
  };
  const runHfPrewarm = async ({ urls, mode, timeoutMs, concurrency }) => {
    if (typeof fetchWithTimeout !== "function")
      return { ok: false, error: "FETCH_NOT_AVAILABLE", items: [] };
    const list = Array.isArray(urls) ? urls.filter(Boolean).slice(0, 200) : [];
    if (!list.length) return { ok: true, total: 0, items: [], elapsedMs: 0 };

    const m = normalizePrewarmMode(mode);
    const t = Number.parseInt(String(timeoutMs || ""), 10);
    const timeout =
      Number.isFinite(t) && t > 0 ? Math.min(Math.max(t, 2000), 180000) : 45000;
    const c = Number.parseInt(String(concurrency || ""), 10);
    const conc = Number.isFinite(c) && c > 0 ? Math.min(Math.max(c, 1), 6) : 2;

    const startedAt = Date.now();
    let cursor = 0;
    const items = [];
    const worker = async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= list.length) return;
        const url = list[idx];
        const itemStartedAt = Date.now();
        try {
          const headers = {};
          let method = "GET";
          if (m === "head") method = "HEAD";
          if (m === "range") headers.Range = "bytes=0-1023";
          const resp = await fetchWithTimeout(
            url,
            { method, headers, redirect: "follow", compress: false },
            timeout,
          );
          const status = Number(resp?.status || 0) || 0;
          const bytes = method === "HEAD" ? 0 : await readAndDiscardBody(resp);
          items.push({
            ok: !!resp?.ok,
            status,
            url,
            bytes,
            elapsedMs: Math.max(0, Date.now() - itemStartedAt),
          });
        } catch (e) {
          items.push({
            ok: false,
            status: 0,
            url,
            bytes: 0,
            elapsedMs: Math.max(0, Date.now() - itemStartedAt),
            error: String(e?.message || e),
          });
        }
      }
    };

    const workers = [];
    for (let i = 0; i < conc; i += 1) workers.push(worker());
    await Promise.all(workers);
    items.sort((a, b) => a.url.localeCompare(b.url));
    return {
      ok: true,
      total: list.length,
      mode: m,
      items,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    };
  };

  app.post(
    "/api/admin/hf/prewarm",
    typeof rateLimit === "function"
      ? rateLimit("admin_hf_prewarm", { max: 12, windowMs: 60 * 1000 })
      : (req, res, next) => next(),
    async (req, res) => {
      if (typeof assertAdmin !== "function")
        return res.status(501).json({ error: "ADMIN_NOT_AVAILABLE" });
      if (!assertAdmin(req, res)) return;
      if (hfPrewarmRunning && typeof hfPrewarmRunning.then === "function") {
        return res.status(409).json({ error: "PREWARM_IN_PROGRESS" });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const urls =
        Array.isArray(body.urls) && body.urls.length
          ? parsePrewarmUrls(body.urls.join("\n"))
          : parsePrewarmUrls(process.env.HF_PREWARM_URLS || "");
      const mode = normalizePrewarmMode(
        body.mode || process.env.HF_PREWARM_MODE || "full",
      );
      const timeoutMs =
        body.timeoutMs || process.env.HF_PREWARM_TIMEOUT_MS || 45000;
      const concurrency =
        body.concurrency || process.env.HF_PREWARM_CONCURRENCY || 2;

      hfPrewarmRunning = runHfPrewarm({ urls, mode, timeoutMs, concurrency })
        .catch((e) => ({
          ok: false,
          error: String(e?.message || e),
          items: [],
        }))
        .finally(() => {
          hfPrewarmRunning = null;
        });
      const out = await hfPrewarmRunning;
      return res.json(out);
    },
  );

  const HF_PREWARM_ON_START =
    String(process.env.HF_PREWARM_ON_START || "").trim() === "1";
  if (HF_PREWARM_ON_START) {
    const urls = parsePrewarmUrls(process.env.HF_PREWARM_URLS || "");
    if (urls.length && typeof fetchWithTimeout === "function") {
      setTimeout(() => {
        if (hfPrewarmRunning) return;
        const mode = normalizePrewarmMode(
          process.env.HF_PREWARM_MODE || "full",
        );
        const timeoutMs = process.env.HF_PREWARM_TIMEOUT_MS || 45000;
        const concurrency = process.env.HF_PREWARM_CONCURRENCY || 2;
        hfPrewarmRunning = runHfPrewarm({ urls, mode, timeoutMs, concurrency })
          .catch(() => null)
          .finally(() => {
            hfPrewarmRunning = null;
          });
      }, 4000);
    }
  }

  const GENERATE_RATE_MAX = (() => {
    const v = Number.parseInt(String(process.env.GENERATE_RATE_MAX || ""), 10);
    return Number.isFinite(v) && v > 0 ? v : 60;
  })();
  const GENERATE_RATE_WINDOW_MS = (() => {
    const v = Number.parseInt(
      String(process.env.GENERATE_RATE_WINDOW_MS || ""),
      10,
    );
    return Number.isFinite(v) && v > 0 ? v : 60 * 1000;
  })();

  const GENERATE_USER_MAX_CONCURRENCY = (() => {
    const v = Number.parseInt(
      String(process.env.GENERATE_USER_MAX_CONCURRENCY || ""),
      10,
    );
    return Number.isFinite(v) && v >= 0 ? Math.min(v, 20) : 2;
  })();
  const generateUserInFlight = new Map();
  const acquireGenerateUserSlot = (userId) => {
    if (GENERATE_USER_MAX_CONCURRENCY <= 0)
      return { ok: true, release: () => {} };
    const uid = String(userId || "").trim();
    if (!uid) return { ok: true, release: () => {} };
    const now = Date.now();
    if (generateUserInFlight.size > 6000) {
      let removed = 0;
      for (const [k, v] of generateUserInFlight) {
        const last = Number(v?.last || 0) || 0;
        if (now - last > 10 * 60 * 1000) {
          generateUserInFlight.delete(k);
          removed += 1;
        }
        if (removed > 500) break;
      }
    }
    const cur = generateUserInFlight.get(uid) || { n: 0, last: now };
    const n = Number(cur?.n || 0) || 0;
    if (n >= GENERATE_USER_MAX_CONCURRENCY)
      return { ok: false, release: () => {} };
    generateUserInFlight.set(uid, { n: n + 1, last: now });
    const release = () => {
      const cur2 = generateUserInFlight.get(uid);
      if (!cur2) return;
      const n2 = Math.max(0, (Number(cur2?.n || 0) || 0) - 1);
      if (n2 <= 0) generateUserInFlight.delete(uid);
      else generateUserInFlight.set(uid, { n: n2, last: Date.now() });
    };
    return { ok: true, release };
  };

  const GENERATE_IDEMPOTENCY_TTL_MS = (() => {
    const v = Number.parseInt(
      String(process.env.GENERATE_IDEMPOTENCY_TTL_MS || ""),
      10,
    );
    return Number.isFinite(v) && v > 0
      ? Math.min(v, 24 * 60 * 60 * 1000)
      : 10 * 60 * 1000;
  })();
  const generateIdempotencyCache = new Map();
  const generateIdempotencyInFlight = new Map();
  const cleanupGenerateIdempotency = () => {
    const now = Date.now();
    if (generateIdempotencyCache.size > 6000) {
      let removed = 0;
      for (const [k, v] of generateIdempotencyCache) {
        const ts = Number(v?.ts || 0) || 0;
        if (!ts || now - ts > GENERATE_IDEMPOTENCY_TTL_MS) {
          generateIdempotencyCache.delete(k);
          removed += 1;
        }
        if (removed > 800) break;
      }
    }
    if (generateIdempotencyInFlight.size > 6000) {
      let removed = 0;
      for (const [k, v] of generateIdempotencyInFlight) {
        const ts = Number(v?.ts || 0) || 0;
        if (!ts || now - ts > Math.max(30000, GENERATE_IDEMPOTENCY_TTL_MS)) {
          generateIdempotencyInFlight.delete(k);
          removed += 1;
        }
        if (removed > 800) break;
      }
    }
  };

  app.post(
    "/api/generate",
    typeof rateLimit === "function"
      ? rateLimit("generate", {
          max: GENERATE_RATE_MAX,
          windowMs: GENERATE_RATE_WINDOW_MS,
        })
      : (req, res, next) => next(),
    async (req, res) => {
      const startedAt = Date.now();
      const requestId = String(
        req.body.requestId || res.locals.requestId || "",
      );
      let prompt = String(req.body.prompt || "").trim();
      const timeoutMs = Number(req.body.timeoutMs) || 0;
      const modelRaw = String(req.body.model || "").trim();
      const userId = String(req.body.userId || "").trim();
      const purpose = String(req.body.purpose || "").trim();
      const purposeKey = normalizeReasonKey(purpose);
      const costRaw = Number.parseInt(String(req.body.cost ?? ""), 10);
      const cost = Number.isFinite(costRaw) && costRaw > 0 ? costRaw : 0;
      const resolvedCost =
        cost > 0 ? cost : purpose ? resolveCreditsCostByPurpose(purpose) : 0;
      const deepModeProvided =
        req.body && Object.prototype.hasOwnProperty.call(req.body, "deepMode");
      const deepMode = !!req.body.deepMode;
      const initialInputRaw = String(req.body.initialInput || "").trim();
      const initialInput = initialInputRaw
        ? initialInputRaw.slice(0, 2000)
        : "";
      const userText = String(req.body.userText || "").trim();
      const sessionId = String(req.body.sessionId || "")
        .trim()
        .slice(0, 160);
      const projectId = String(req.body.projectId || "")
        .trim()
        .slice(0, 160);
      const requestSource = String(req.body.requestSource || "")
        .trim()
        .slice(0, 160);
      const pageContextRaw = req.body.pageContext;
      const pageContext =
        pageContextRaw && typeof pageContextRaw === "object"
          ? trimJsonValue(pageContextRaw, {
              maxDepth: 6,
              maxItems: 80,
              maxString: 260,
            })
          : typeof pageContextRaw === "string"
            ? pageContextRaw.trim().slice(0, 12000)
            : "";

      if (
        !prompt &&
        (purposeKey === "agentimg_directions" ||
          purposeKey === "agentimg_final" ||
          purposeKey === "agentimg_ingredient_label" ||
          purposeKey === "ingredient_label")
      ) {
        const agentImg = req.body?.agentImg;
        const ingredient = req.body?.ingredient;
        const input = agentImg || ingredient;
        try {
          if (purposeKey === "agentimg_directions")
            prompt = buildAgentImgDirectionPrompt(input);
          if (purposeKey === "agentimg_final")
            prompt = buildAgentImgFinalPrompt(input);
          if (
            purposeKey === "agentimg_ingredient_label" ||
            purposeKey === "ingredient_label"
          )
            prompt = buildIngredientLabelPrompt(input);
        } catch {}
      }
      if (!prompt)
        return res.status(400).json({ error: "EMPTY_PROMPT", requestId });

      const idempotencyKey = (() => {
        const rid = String(requestId || "").trim();
        if (!rid) return "";
        const basis =
          userId ||
          (typeof getClientIp === "function" ? getClientIp(req) : "") ||
          "unknown";
        return `${basis}::${rid}`.slice(0, 500);
      })();
      let userSlot = { ok: true, release: () => {} };

      const finalizeIdempotency = (status, body) => {
        if (!idempotencyKey) return;
        try {
          generateIdempotencyCache.set(idempotencyKey, {
            ts: Date.now(),
            status,
            body,
          });
        } catch {}
        try {
          const inflight = generateIdempotencyInFlight.get(idempotencyKey);
          if (inflight && typeof inflight.resolve === "function") {
            inflight.resolve({ status, body });
          }
        } catch {}
        try {
          generateIdempotencyInFlight.delete(idempotencyKey);
        } catch {}
      };

      try {
        if (idempotencyKey) {
          cleanupGenerateIdempotency();
          const cached = generateIdempotencyCache.get(idempotencyKey);
          if (
            cached &&
            cached?.ts &&
            Date.now() - cached.ts <= GENERATE_IDEMPOTENCY_TTL_MS
          ) {
            res.status(Number(cached.status || 200) || 200);
            return res.json(cached.body || { requestId });
          }

          const inflight = generateIdempotencyInFlight.get(idempotencyKey);
          if (inflight && typeof inflight.promise?.then === "function") {
            const waitMs = (() => {
              const v = Number(timeoutMs) || 0;
              if (!v) return 65000;
              return Math.max(1000, Math.min(v, 120000));
            })();
            const out = await Promise.race([
              inflight.promise,
              new Promise((resolve) =>
                setTimeout(
                  () =>
                    resolve({
                      status: 504,
                      body: { error: "UPSTREAM_TIMEOUT", requestId },
                    }),
                  waitMs,
                ),
              ),
            ]);
            res.status(Number(out?.status || 200) || 200);
            return res.json(out?.body || { requestId });
          }

          let resolve = null;
          const promise = new Promise((r) => {
            resolve = r;
          });
          generateIdempotencyInFlight.set(idempotencyKey, {
            ts: Date.now(),
            promise,
            resolve,
          });
        }

        userSlot = acquireGenerateUserSlot(userId);
        if (!userSlot.ok) {
          res.setHeader("Retry-After", "2");
          const payload = { error: "SERVER_BUSY", requestId };
          finalizeIdempotency(503, payload);
          return res.status(503).json(payload);
        }

        if (
          userId &&
          !userId.startsWith("guest_") &&
          typeof assertAuthUserMatches === "function"
        ) {
          const auth = assertAuthUserMatches(req, res, userId);
          if (!auth) {
            const status = Number(res.statusCode || 401) || 401;
            const payload = {
              error: status === 403 ? "FORBIDDEN" : "UNAUTHORIZED",
              requestId,
            };
            finalizeIdempotency(status, payload);
            return;
          }
        }

        if (typeof callTextGenerate !== "function") {
          throw new Error("callTextGenerate is not available");
        }

        const isAllowedTextModel = (raw) => {
          const k = String(raw || "")
            .trim()
            .toLowerCase();
          return (
            k === "qwen" ||
            k === "qwen/qwen2.5-7b-instruct" ||
            k === "qwen2.5-7b-instruct"
          );
        };

        const hold = (() => {
          try {
            if (!resolvedCost) return null;
            if (!userId) return { ok: false, error: "MISSING_USER_ID" };
            if (!imgCredits || typeof imgCredits.freezeCredits !== "function")
              return null;
            return imgCredits.freezeCredits({
              userId,
              cost: resolvedCost,
              requestId,
              reason: purpose || "generate",
              reasonText: resolveReasonText(purpose || "generate"),
            });
          } catch {
            return null;
          }
        })();
        if (hold && !hold.ok) {
          const wallet =
            hold.wallet && typeof hold.wallet === "object"
              ? hold.wallet
              : undefined;
          const payload = {
            error: String(hold.error || "CREDITS_ERROR"),
            requestId,
            ...(wallet ? { wallet } : {}),
          };
          finalizeIdempotency(402, payload);
          return res.status(402).json(payload);
        }

        const contents = [{ role: "user", parts: [{ text: prompt }] }];
        let result = null;
        try {
          result = await callTextGenerate({
            contents,
            timeoutMs: timeoutMs || 60000,
            ...(isAllowedTextModel(modelRaw) ? { model: modelRaw } : {}),
          });
        } catch (e) {
          if (
            hold?.holdId &&
            imgCredits &&
            typeof imgCredits.refundHold === "function"
          ) {
            try {
              imgCredits.refundHold({ userId, holdId: hold.holdId });
            } catch {}
          }
          throw e;
        }

        if (!result.text && !result.error) {
          if (
            hold?.holdId &&
            imgCredits &&
            typeof imgCredits.refundHold === "function"
          ) {
            try {
              imgCredits.refundHold({ userId, holdId: hold.holdId });
            } catch {}
          }
          const payload = { error: "EMPTY_RESPONSE_TEXT", requestId };
          finalizeIdempotency(500, payload);
          return res.status(500).json(payload);
        }

        // --- Add JSON validation ---
        if (result.text && !result.error && (purposeKey === "agentimg_directions" || purposeKey === "agentimg_final" || purposeKey === "agentimg_ingredient_label" || purposeKey === "ingredient_label")) {
           let parsedJson = null;
           try {
             const jsonStrMatch = result.text.match(/\{[\s\S]*\}/);
             if (jsonStrMatch) {
               // Attempt to parse. We'll also try the fallback replacement we added in frontend.
               const candidate = jsonStrMatch[0];
               try {
                 parsedJson = JSON.parse(candidate);
               } catch {
                 const sanitized = candidate.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t');
                 parsedJson = JSON.parse(sanitized);
               }
             }
           } catch {}
           
           if (!parsedJson) {
             if (
               hold?.holdId &&
               imgCredits &&
               typeof imgCredits.refundHold === "function"
             ) {
               try {
                 imgCredits.refundHold({ userId, holdId: hold.holdId });
               } catch {}
             }
             const payload = { error: "PARSE_OPTIONS_FAILED", requestId };
             finalizeIdempotency(500, payload);
             return res.status(500).json(payload);
           }
        }
        // ---------------------------

        if (
          hold?.holdId &&
          imgCredits &&
          typeof imgCredits.settleHold === "function"
        ) {
          try {
            imgCredits.settleHold({
              userId,
              holdId: hold.holdId,
              actualCost: resolvedCost,
            });
          } catch {}
        }

        const ingredientMeta = (() => {
          const isIngredient =
            purposeKey === "agentimg_ingredient_label" ||
            purposeKey === "ingredient_label" ||
            purpose.trim().toLowerCase() === "ingredient_label" ||
            userText.toLowerCase().startsWith("ai_ingredient");
          if (!isIngredient) return null;
          const agentImg = req.body?.agentImg;
          const ingredient = req.body?.ingredient;
          const input = agentImg || ingredient || {};
          const productType = String(input?.productType || "")
            .trim()
            .slice(0, 80);
          const parsed0 = extractFirstJsonObject(result?.text || "");
          const parsed =
            parsed0 && typeof parsed0 === "object"
              ? trimJsonValue(parsed0, {
                  maxDepth: 5,
                  maxItems: 40,
                  maxString: 800,
                })
              : null;
          const layoutType =
            parsed0 && typeof parsed0 === "object"
              ? String(parsed0?.layoutType || "")
                  .trim()
                  .slice(0, 60) || null
              : null;
          const sectionTitles =
            parsed0 &&
            typeof parsed0 === "object" &&
            Array.isArray(parsed0?.sections)
              ? parsed0.sections
                  .map((it) =>
                    it && typeof it === "object"
                      ? String(it.title || "").trim()
                      : "",
                  )
                  .filter(Boolean)
                  .slice(0, 40)
              : [];
          const usage = result?.usage || null;
          const tokensIn = Number(usage?.promptTokens || 0) || 0;
          const tokensOut = Number(usage?.completionTokens || 0) || 0;
          const tokensTotal =
            Number(usage?.totalTokens || 0) || tokensIn + tokensOut;
          return {
            productType: productType || null,
            layoutType,
            sectionTitles,
            parsed,
            tokensIn,
            tokensOut,
            tokensTotal,
          };
        })();

        try {
          if (typeof upsertUsageLedgerItem === "function" && userId) {
            const usage = result?.usage || null;
            const tokensIn = Number(usage?.promptTokens || 0) || 0;
            const tokensOut = Number(usage?.completionTokens || 0) || 0;
            const tokensTotal =
              Number(usage?.totalTokens || 0) || tokensIn + tokensOut;
            const creditsDelta =
              resolvedCost > 0
                ? resolvedCost
                : typeof computeCreditsDelta === "function"
                  ? computeCreditsDelta({ tokensTotal, ragUsed: false })
                  : 0;
            const basePlan =
              deepModeProvided || initialInput
                ? {
                    deepMode,
                    ...(deepMode && initialInput ? { initialInput } : {}),
                  }
                : undefined;
            const plan =
              ingredientMeta && typeof ingredientMeta === "object"
                ? {
                    ...(basePlan || {}),
                    ingredientLabel: {
                      productType: ingredientMeta.productType,
                      layoutType: ingredientMeta.layoutType,
                      sectionTitles: ingredientMeta.sectionTitles,
                    },
                  }
                : basePlan;
            upsertUsageLedgerItem({
              requestId: requestId || `gen_${Date.now().toString(36)}`,
              ts: Date.now(),
              userId,
              ...(sessionId ? { sessionId } : {}),
              ...(projectId ? { projectId } : {}),
              trigger: normalizeReasonKey(purpose) || "generate",
              provider: String(
                result?.provider || activeTextProvider || "text",
              ).trim(),
              model: String(result?.model || modelRaw || "").trim(),
              usedUrl: String(result?.usedUrl || "").trim(),
              tokensIn,
              tokensOut,
              tokensTotal,
              creditsDelta,
              ...(plan ? { plan } : {}),
              ...(requestSource ? { requestSource } : {}),
              status: result?.text ? "ok" : "empty",
              durationMs: Math.max(0, Date.now() - startedAt),
              ip: typeof getClientIp === "function" ? getClientIp(req) : "",
              ua:
                typeof req.headers["user-agent"] === "string"
                  ? req.headers["user-agent"].slice(0, 220)
                  : "",
            });
          }
        } catch {}

        try {
          if (typeof appendUserImageHistory === "function" && userId) {
            if (ingredientMeta && typeof ingredientMeta === "object") {
              const entry = {
                id:
                  requestId ||
                  `ingredient_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                ts: Date.now(),
                type: "ingredient_label",
                provider: String(
                  result?.provider || activeTextProvider || "text",
                ).trim(),
                model: String(result?.model || modelRaw || "").trim(),
                usedUrl: String(result?.usedUrl || "").trim() || undefined,
                cost: resolvedCost,
                durationMs: Math.max(0, Date.now() - startedAt),
                tokensIn: ingredientMeta.tokensIn,
                tokensOut: ingredientMeta.tokensOut,
                tokensTotal: ingredientMeta.tokensTotal,
                purpose:
                  purposeKey || (purpose ? normalizeReasonKey(purpose) : ""),
                productType: ingredientMeta.productType,
                promptLen: prompt.length,
                promptHash: fnv1aHash(prompt),
                userText: userText ? userText.slice(0, 8000) : "",
                aiText: result?.text ? String(result.text).slice(0, 20000) : "",
                layoutType: ingredientMeta.layoutType,
                sectionTitles: ingredientMeta.sectionTitles,
                parsed: ingredientMeta.parsed,
                status: result?.text ? "ok" : "empty",
              };
              appendUserImageHistory({ userId, entry });
            }
          }
        } catch {}

        try {
          if (typeof appendUserAuditHistory === "function" && userId) {
            const usage = result?.usage || null;
            const tokensIn = Number(usage?.promptTokens || 0) || 0;
            const tokensOut = Number(usage?.completionTokens || 0) || 0;
            const tokensTotal =
              Number(usage?.totalTokens || 0) || tokensIn + tokensOut;
            const agentImg = req.body?.agentImg;
            const ingredient = req.body?.ingredient;
            const input = agentImg || ingredient || null;
            const inputTrimmed =
              input && typeof input === "object"
                ? trimJsonValue(input, {
                    maxDepth: 6,
                    maxItems: 60,
                    maxString: 1200,
                  })
                : null;
            const entry = {
              id: requestId || `gen_${Date.now().toString(36)}`,
              ts: Date.now(),
              kind: "generate",
              biz:
                purposeKey ||
                (purpose ? normalizeReasonKey(purpose) : "") ||
                "generate",
              provider: String(
                result?.provider || activeTextProvider || "text",
              ).trim(),
              model: String(result?.model || modelRaw || "").trim(),
              usedUrl: String(result?.usedUrl || "").trim() || undefined,
              cost: resolvedCost,
              tokensIn,
              tokensOut,
              tokensTotal,
              deepMode: !!deepMode,
              ...(initialInput ? { initialInput } : {}),
              ...(inputTrimmed ? { input: inputTrimmed } : {}),
              ...(ingredientMeta ? { ingredientLabel: ingredientMeta } : {}),
              promptLen: prompt.length,
              promptHash: fnv1aHash(prompt),
              ...(userText ? { userText: userText.slice(0, 8000) } : {}),
              aiText: result?.text ? String(result.text).slice(0, 20000) : "",
              ...(sessionId ? { sessionId } : {}),
              ...(projectId ? { projectId } : {}),
              ...(requestSource ? { requestSource } : {}),
              ...(pageContext ? { pageContext } : {}),
              status: result?.text ? "ok" : "empty",
              durationMs: Math.max(0, Date.now() - startedAt),
              ip: typeof getClientIp === "function" ? getClientIp(req) : "",
              ua:
                typeof req.headers["user-agent"] === "string"
                  ? req.headers["user-agent"].slice(0, 220)
                  : "",
            };
            appendUserAuditHistory({ userId, entry });
          }
        } catch {}

        const payload = {
          candidates: [
            {
              content: {
                parts: [{ text: result.text }],
              },
            },
          ],
          usageMetadata: result.usage
            ? {
                promptTokenCount: result.usage.promptTokens,
                candidatesTokenCount: result.usage.completionTokens,
                totalTokenCount: result.usage.totalTokens,
              }
            : undefined,
          requestId,
        };

        finalizeIdempotency(200, payload);

        res.json(payload);
      } catch (e) {
        const msg = String(e?.message || e);
        const codeRaw = String(e?.code || "").trim();
        const failures = Array.isArray(e?.failures) ? e.failures : [];
        const errorCode = (() => {
          if (codeRaw) {
            if (codeRaw === "SILICONFLOW_RPM_LIMIT") return "RATE_LIMITED";
            return codeRaw;
          }
          const name = String(e?.name || "").trim();
          if (name === "AbortError") return "UPSTREAM_TIMEOUT";
          if (failures.length) {
            const statuses = failures
              .map((f) => Number(f?.status || 0) || 0)
              .filter((n) => Number.isFinite(n) && n > 0);
            if (statuses.includes(429)) return "RATE_LIMITED";
            if (statuses.includes(504)) return "UPSTREAM_TIMEOUT";
            if (statuses.some((s) => s === 500 || s === 502 || s === 503))
              return "SERVER_BUSY";
            if (statuses.includes(401)) return "UNAUTHORIZED";
            if (statuses.includes(403)) return "FORBIDDEN";
            const first = statuses[0];
            if (first) return `API_ERROR_${first}`;
            if (failures.some((f) => (Number(f?.status || 0) || 0) === 0))
              return "NETWORK_ERROR";
          }
          if (name && /abort/i.test(name)) return "UPSTREAM_TIMEOUT";
          return "TEXT_GENERATE_FAILED";
        })();
        const status = (() => {
          if (errorCode === "RATE_LIMITED") return 429;
          if (errorCode === "SERVER_BUSY") return 503;
          if (errorCode === "MISSING_SILICONFLOW_API_KEY") return 503;
          if (errorCode === "UPSTREAM_TIMEOUT") return 504;
          if (errorCode === "UNAUTHORIZED" || errorCode === "LOGIN_REQUIRED")
            return 401;
          if (errorCode === "FORBIDDEN") return 403;
          const m = errorCode.match(/^API_ERROR_(\d{3})$/);
          if (m) return Number(m[1]) || 500;
          return 500;
        })();
        try {
          const isIngredient =
            purposeKey === "agentimg_ingredient_label" ||
            purposeKey === "ingredient_label" ||
            purpose.trim().toLowerCase() === "ingredient_label" ||
            userText.toLowerCase().startsWith("ai_ingredient");
          if (
            isIngredient &&
            typeof appendUserImageHistory === "function" &&
            userId
          ) {
            const agentImg = req.body?.agentImg;
            const ingredient = req.body?.ingredient;
            const input = agentImg || ingredient || {};
            const productType =
              String(input?.productType || "")
                .trim()
                .slice(0, 80) || null;
            const entry = {
              id:
                requestId ||
                `ingredient_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
              ts: Date.now(),
              type: "ingredient_label",
              cost: resolvedCost,
              durationMs: Math.max(0, Date.now() - startedAt),
              purpose:
                purposeKey || (purpose ? normalizeReasonKey(purpose) : ""),
              productType,
              promptLen: prompt.length,
              promptHash: fnv1aHash(prompt),
              userText: userText ? userText.slice(0, 8000) : "",
              status: "error",
              error: errorCode,
            };
            appendUserImageHistory({ userId, entry });
          }
        } catch {}
        try {
          if (typeof appendUserAuditHistory === "function" && userId) {
            const agentImg = req.body?.agentImg;
            const ingredient = req.body?.ingredient;
            const input = agentImg || ingredient || null;
            const inputTrimmed =
              input && typeof input === "object"
                ? trimJsonValue(input, {
                    maxDepth: 6,
                    maxItems: 60,
                    maxString: 1200,
                  })
                : null;
            const entry = {
              id: requestId || `gen_${Date.now().toString(36)}`,
              ts: Date.now(),
              kind: "generate",
              biz:
                purposeKey ||
                (purpose ? normalizeReasonKey(purpose) : "") ||
                "generate",
              cost: resolvedCost,
              deepMode: !!deepMode,
              ...(initialInput ? { initialInput } : {}),
              ...(inputTrimmed ? { input: inputTrimmed } : {}),
              promptLen: prompt.length,
              promptHash: fnv1aHash(prompt),
              ...(userText ? { userText: userText.slice(0, 8000) } : {}),
              ...(sessionId ? { sessionId } : {}),
              ...(projectId ? { projectId } : {}),
              ...(requestSource ? { requestSource } : {}),
              ...(pageContext ? { pageContext } : {}),
              status: "error",
              error: errorCode,
              durationMs: Math.max(0, Date.now() - startedAt),
              ip: typeof getClientIp === "function" ? getClientIp(req) : "",
              ua:
                typeof req.headers["user-agent"] === "string"
                  ? req.headers["user-agent"].slice(0, 220)
                  : "",
            };
            appendUserAuditHistory({ userId, entry });
          }
        } catch {}
        console.error("[API][Generate] Error:", {
          error: errorCode,
          requestId,
        });
        const payload = {
          error: errorCode,
          requestId,
        };
        finalizeIdempotency(status, payload);
        res.status(status).json(payload);
      } finally {
        try {
          userSlot.release();
        } catch {}
      }
    },
  );

  app.get("/api/_debug/routes", (req, res) => {
    if (!isDebugRoutesEnabled(req))
      return res.status(404).json({ error: "Not Found" });
    const routes = listRegisteredRoutes(app);
    const hasImg2img = routes.some(
      (r) =>
        r &&
        r.path === "/api/img2img" &&
        Array.isArray(r.methods) &&
        r.methods.includes("POST"),
    );
    res.json({ ok: true, hasImg2img, routes });
  });

  app.get("/api/_debug/storage", (req, res) => {
    if (!isDebugRoutesEnabled(req))
      return res.status(404).json({ error: "Not Found" });
    const check = isWritableDir(MEMORY_DIR);
    res.json({
      ok: true,
      memoryDir: MEMORY_DIR,
      writable: !!check.ok,
      ...(check.ok ? {} : { error: check.error }),
      nodeEnv: String(process.env.NODE_ENV || "").trim(),
    });
  });

  app.get("/api/_debug/ip", (req, res) => {
    const ip = typeof getClientIp === "function" ? getClientIp(req) : "";
    if (!isLocalRequest(req))
      return res.status(404).json({ error: "Not Found" });
    res.json({
      ok: true,
      ip,
      reqIp: typeof req.ip === "string" ? req.ip : "",
      xf: req.headers["x-forwarded-for"] || null,
    });
  });

  app.post("/api/_debug/login-test", (req, res) => {
    if (!isDebugRoutesEnabled(req))
      return res.status(404).json({ error: "Not Found" });
    const body = req.body || {};
    const email =
      typeof normalizeEmail === "function" ? normalizeEmail(body.email) : "";
    const code = String(body.code || "").trim();
    const expected =
      String(process.env.LOGIN_TEST_CODE || "123456").trim() || "123456";
    const ip = typeof getClientIp === "function" ? getClientIp(req) : "";
    res.json({
      ok: true,
      ip,
      nodeEnv: String(process.env.NODE_ENV || ""),
      email,
      code,
      expected,
      canUse:
        typeof canUseTestLoginCode === "function"
          ? canUseTestLoginCode(req, code, email)
          : false,
    });
  });
};

module.exports = { installSystemRoutes };
