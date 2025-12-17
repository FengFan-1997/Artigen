const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

type SupplementTableItem = {
  name: string;
  amount: string;
  dv: string;
};

type WarningsContent = {
  do_not_use?: string[];
  ask_doctor_before_use?: string[];
  ask_doctor_or_pharmacist?: string[];
  when_using_this_product?: string[];
  stop_use_and_ask_doctor?: string[];
  pregnancy_breastfeeding?: string[];
  keep_out_of_reach?: string[];
};

type DirectionsGroup = {
  age: string;
  dose: string;
  frequency: string;
};

type DirectionsContent = {
  groups?: DirectionsGroup[];
  general?: string[];
};

type Section = {
  title: string;
  content:
    | string
    | string[]
    | SupplementTableItem[]
    | { servingSize?: string; servingsPerContainer?: string }
    | WarningsContent
    | DirectionsContent;
  isTable?: boolean;
  isHeader?: boolean;
};

const callAI = async (prompt: string) => {
  const promptBody = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ]
  };
  const response = await fetch(`${API_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptBody)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      layoutType: parsed.layoutType || 'standard'
    };
  }
  throw new Error('Invalid JSON format');
};

export const buildLabelSectionsUnified = async (
  userText: string,
  productType: string
): Promise<{
  sections: Section[];
  layoutType: 'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts';
}> => {
  let systemInstruction = '';
  let jsonStructure = '';
  const productTypeUpper = productType.toUpperCase();

  if (productTypeUpper === 'DRUG') {
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
    const js = {
      layoutType: 'drug_facts' as const,
      sections: [
        { title: 'ACTIVE INGREDIENTS', content: '...' },
        { title: 'PURPOSE', content: '...' },
        { title: 'USES', content: '...' },
        { title: 'WARNINGS', content: { do_not_use: ['...'] } },
        {
          title: 'DIRECTIONS',
          content: { groups: [{ age: 'Adults', dose: '2 tablets', frequency: 'every 6 hours' }] }
        },
        { title: 'OTHER INFORMATION', content: ['...'] },
        { title: 'INACTIVE INGREDIENTS', content: '...' },
        { title: 'MANUFACTURER', content: '...' },
        { title: 'NET CONTENT', content: '...' },
        { title: 'NDC', content: '...' },
        { title: 'LOT NUMBER', content: '...' },
        { title: 'EXPIRATION DATE', content: '...' }
      ]
    };
    jsonStructure = JSON.stringify(js);
  } else if (productTypeUpper === 'DIETARY SUPPLEMENT') {
    systemInstruction = `FDA Supplement Facts expert. Convert the user's text (${userText}) into the Supplement Facts JSON format. INGREDIENTS MUST be a single, comma-separated list (e.g., Gelatin, Cellulose). 
    
    **CRITICAL EXPANSION**: 
    1. If the user text is minimal (1-2 words/ingredients) or implies 'pure'/'only', you MUST infer and expand it into a realistic, full commercial ingredient list.
    2. **%DV Handling**: For ingredients where Daily Value (DV) is not established (e.g. herbal extracts, specific amino acids), set 'dv' to '*' (asterisk). Do NOT use 'N/A'.
    3. **WARNINGS**: If warnings are missing, you MUST generate these **EXACT** standard warnings: "Keep out of reach of children.", "Do not use if safety seal is broken or missing.", and "Consult a physician if pregnant, nursing, taking medication, or have a medical condition."
    4. **MANUFACTURER**: You MUST generate a realistic Manufacturer Name AND Full US Physical Address (Street, City, State Zip) if not provided (e.g., "Vitality Supps LLC, 123 Wellness Dr, Austin, TX 78701").
    5. **NET CONTENT**: You MUST generate realistic net content in dual units if missing (e.g., "60 Capsules" or "Net Wt 5 oz (140 g)").
    
    Infer necessary content for all required sections. **CRITICAL: Translate all user content to American English.** Keep content extremely concise, capitalized, and without special formatting symbols. All titles must be ENGLISH and UPPERCASE. Output ONLY the JSON object.`;
    jsonStructure = JSON.stringify({
      layoutType: 'supplement_facts',
      sections: [
        {
          title: 'SERVE HEADER',
          content: { servingSize: '...', servingsPerContainer: '...' },
          isHeader: true
        },
        {
          title: 'SUPPLEMENT FACTS TABLE',
          content: [{ name: '...', amount: '...', dv: '*' }],
          isTable: true
        },
        { title: 'OTHER INGREDIENTS', content: '...' },
        { title: 'SUGGESTED USE', content: '...' },
        { title: 'WARNINGS', content: '...' },
        { title: 'MANUFACTURER', content: '...' },
        { title: 'NET CONTENT', content: '...' }
      ]
    });
  } else if (productTypeUpper === 'COSMETIC') {
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
    
    **NO DRUG CLAIMS**: Do NOT include any therapeutic or drug claims in the text.
    
    Output ONLY the JSON object.`;

    jsonStructure = JSON.stringify({
      layoutType: 'standard',
      sections: [
        { title: 'INGREDIENTS', content: 'Aqua, Glycerin, ...' },
        { title: 'CONTAINS', content: 'Cinnamal, Peanuts, ...' },
        { title: 'MAY CONTAIN', content: 'Titanium Dioxide (CI 77891), ...' }
      ]
    });
  } else if (productTypeUpper === 'FOOD') {
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
      layoutType: 'standard',
      sections: [
        { title: 'INGREDIENTS', content: '...' },
        { title: 'CONTAINS', content: '...' }
      ]
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
      layoutType: 'nutrition_facts',
      sections: [
        {
          title: 'NUTRITION FACTS',
          content: {
            servingSize: '...',
            servingsPerContainer: '...',
            calories: '...',
            totalFat: { amount: '...g', dv: '...%' },
            sodium: { amount: '...mg', dv: '...%' },
            totalCarbohydrate: { amount: '...g', dv: '...%' },
            protein: '...g'
          },
          isTable: true
        },
        { title: 'INGREDIENTS', content: '...' },
        { title: 'CONTAINS', content: '...' }
      ]
    });
  }

  const prompt = `${systemInstruction}\nReturn ONLY the JSON object conforming to this structure: ${jsonStructure}`;

  const { sections: parsedSections, layoutType } = await callAI(prompt);
  const sections = Array.isArray(parsedSections) ? parsedSections : [];
  return {
    sections,
    layoutType:
      (layoutType as 'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts') ||
      'standard'
  };
};
