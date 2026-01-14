import { computed, ref } from 'vue';

export type AgentImgImageCount = 1 | 2 | 3 | 4;

export interface AgentImgSettings {
  productName: string;
  productCategory: string; // Changed from packageType
  material: string; // New: Product material
  sceneType: string; // New: Background/Scene context
  imageCount: AgentImgImageCount;
  logoFileName: string;
  designElements: string[];
  primaryColor: string; // Changed from palette
  lighting: string; // New: Lighting style
}

export const useAgentImgSettings = () => {
  // Product Core
  const productName = ref('');
  const productCategory = ref('');
  const material = ref('');

  // Visual Style
  const sceneType = ref('');
  const lighting = ref('');
  const primaryColor = ref('');

  // Brand Assets
  const brandName = ref('');
  const logoFileName = ref('');
  const logoFile = ref<File | null>(null);

  // Generation Config
  const imageCount = ref<AgentImgImageCount>(2);
  const designElements = ref<string[]>([]);
  const styles = ref<string[]>([]);
  const colors = ref<string[]>([]);

  const setLogoFile = (f: File | null) => {
    logoFile.value = f;
    logoFileName.value = f ? f.name : '';
  };

  const toggleDesignElement = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    const idx = designElements.value.indexOf(t);
    if (idx >= 0) designElements.value.splice(idx, 1);
    else designElements.value.push(t);
  };

  const toggleStyle = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    const idx = styles.value.indexOf(t);
    if (idx >= 0) styles.value.splice(idx, 1);
    else styles.value.push(t);
  };

  const toggleColor = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    const idx = colors.value.indexOf(t);
    if (idx >= 0) colors.value.splice(idx, 1);
    else colors.value.push(t);
  };

  // Construct a rich context string for the LLM
  const contextText = computed(() => {
    const parts = [
      productName.value ? `Product Name: ${productName.value}` : '',
      productCategory.value ? `Category: ${productCategory.value}` : '',
      brandName.value ? `Brand: ${brandName.value}` : '',
      material.value ? `Material: ${material.value}` : '',
      sceneType.value ? `Scene: ${sceneType.value}` : '',
      lighting.value ? `Lighting: ${lighting.value}` : '',
      primaryColor.value ? `Primary Color: ${primaryColor.value}` : '',
      logoFileName.value ? `Has Logo: Yes (${logoFileName.value})` : 'Has Logo: No',
      designElements.value.length > 0 ? `Design Elements: ${designElements.value.join(', ')}` : '',
      styles.value.length > 0 ? `Styles: ${styles.value.join(', ')}` : '',
      colors.value.length > 0 ? `Color Scheme: ${colors.value.join(', ')}` : ''
    ];
    return parts.filter(Boolean).join('\n');
  });

  return {
    productName,
    productCategory,
    material,
    sceneType,
    lighting,
    primaryColor,
    brandName,
    logoFileName,
    logoFile,
    setLogoFile,
    imageCount,
    designElements,
    toggleDesignElement,
    styles,
    toggleStyle,
    colors,
    toggleColor,
    contextText
  };
};
