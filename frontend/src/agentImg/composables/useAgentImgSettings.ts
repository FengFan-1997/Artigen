import { storeToRefs } from 'pinia';
import { useAgentImgSettingsStore } from '../stores/settings';
import { useLanguageStore } from '@/stores/language';

export function useAgentImgSettings() {
  const settingsStore = useAgentImgSettingsStore();
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);

  const {
    productName,
    productCategory,
    material,
    sceneType,
    lighting,
    primaryColor,
    brandName,
    logoFileName,
    logoFile,
    designElements,
    styles,
    colors
  } = storeToRefs(settingsStore);

  const buildProductProfileContextText = () => {
    const zh = currentLang.value === 'zh';
    const sep = zh ? '：' : ': ';
    const joinTags = (tags: string[]) => (zh ? tags.join('、') : tags.join(', '));

    const pName = String(productName.value || '').trim();
    const pCat = String(productCategory.value || '').trim();
    const bName = String(brandName.value || '').trim();
    const mat = String(material.value || '').trim();
    const scene = String(sceneType.value || '').trim();
    const light = String(lighting.value || '').trim();
    const color = String(primaryColor.value || '').trim();
    const logo = String(logoFileName.value || '').trim();
    const de = Array.isArray(designElements.value)
      ? designElements.value.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const st = Array.isArray(styles.value)
      ? styles.value.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const cs = Array.isArray(colors.value)
      ? colors.value.map((x) => String(x || '').trim()).filter(Boolean)
      : [];

    const hasAny =
      !!pName ||
      !!pCat ||
      !!bName ||
      !!mat ||
      !!scene ||
      !!light ||
      !!color ||
      !!logo ||
      de.length > 0 ||
      st.length > 0 ||
      cs.length > 0;

    if (!hasAny) return '';

    const lines: string[] = [];
    lines.push(
      zh
        ? `目标${sep}电商商品图/商业成片（主体突出、构图干净、避免文字与水印）`
        : `Goal${sep}e-commerce product visual (commercial-ready, clean composition, subject-first, avoid text/watermarks)`
    );
    if (pName) lines.push(`${zh ? '产品名称' : 'Product Name'}${sep}${pName}`);
    if (pCat) lines.push(`${zh ? '类目' : 'Category'}${sep}${pCat}`);
    if (bName) lines.push(`${zh ? '品牌' : 'Brand'}${sep}${bName}`);
    if (mat) lines.push(`${zh ? '材质' : 'Material'}${sep}${mat}`);
    if (scene) lines.push(`${zh ? '场景' : 'Scene'}${sep}${scene}`);
    if (light) lines.push(`${zh ? '布光' : 'Lighting'}${sep}${light}`);
    if (color) lines.push(`${zh ? '主色调' : 'Primary Color'}${sep}${color}`);
    lines.push(
      `${zh ? 'Logo' : 'Logo'}${sep}${logo ? (zh ? `有（${logo}）` : `Yes (${logo})`) : zh ? '无' : 'No'}`
    );
    if (de.length) lines.push(`${zh ? '设计元素' : 'Design Elements'}${sep}${joinTags(de)}`);
    if (st.length) lines.push(`${zh ? '风格' : 'Style'}${sep}${joinTags(st)}`);
    if (cs.length) lines.push(`${zh ? '色系' : 'Color Scheme'}${sep}${joinTags(cs)}`);
    return lines.join('\n');
  };

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
    designElements,
    styles,
    colors,
    buildProductProfileContextText
  };
}
