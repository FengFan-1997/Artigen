import { createRouter, createWebHistory } from 'vue-router';
import { loginRoutes } from '../login/routes';
//here 路由开关 注释会开启
(globalThis as any).__ROUTE_LOCKDOWN__ = true;
const ROUTE_LOCKDOWN = (globalThis as any).__ROUTE_LOCKDOWN__ === true;

type RouteSeoMeta = {
  title?: { zh: string; en: string } | string;
  description?: { zh: string; en: string } | string;
  keywords?: { zh: string; en: string } | string;
  robots?: string;
  ogImage?: string;
};

const getLang = (): 'zh' | 'en' => {
  try {
    const v = String(window.localStorage.getItem('app_lang') || '')
      .trim()
      .toLowerCase();
    return v === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
};

const pickLang = (v: { zh: string; en: string } | string | undefined, lang: 'zh' | 'en') => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return lang === 'en' ? v.en : v.zh;
};

const ensureMeta = (selector: { name?: string; property?: string }, content: string) => {
  const key = selector.name ? `name="${selector.name}"` : `property="${selector.property}"`;
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${key}]`);
  if (existing) {
    existing.setAttribute('content', content);
    return;
  }
  const meta = document.createElement('meta');
  if (selector.name) meta.setAttribute('name', selector.name);
  if (selector.property) meta.setAttribute('property', selector.property);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
};

const ensureLink = (rel: string, href: string) => {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (existing) {
    existing.setAttribute('href', href);
    return;
  }
  const link = document.createElement('link');
  link.setAttribute('rel', rel);
  link.setAttribute('href', href);
  document.head.appendChild(link);
};

const ensureJsonLd = (id: string, data: any) => {
  const scriptId = String(id || '').trim() || 'jsonld';
  const existing = document.head.querySelector<HTMLScriptElement>(`script#${scriptId}`);
  const text = JSON.stringify(data || {});
  if (existing) {
    existing.type = 'application/ld+json';
    existing.textContent = text;
    return;
  }
  const el = document.createElement('script');
  el.id = scriptId;
  el.type = 'application/ld+json';
  el.textContent = text;
  document.head.appendChild(el);
};

const routes = [
  {
    path: '/',
    ...(ROUTE_LOCKDOWN
      ? { redirect: '/artigen' }
      : { name: 'home', component: () => import('../views/PortfolioHome.vue') })
  },
  {
    path: '/agent-img',
    redirect: '/artigen/ai'
  },
  {
    path: '/format-factory',
    redirect: '/artigen/format-factory'
  },
  {
    path: '/aether-market',
    redirect: '/artigen/market'
  },
  {
    path: '/legal/terms',
    redirect: '/artigen/legal/terms'
  },
  {
    path: '/legal/privacy',
    redirect: '/artigen/legal/privacy'
  },
  {
    path: '/legal/refund',
    redirect: '/artigen/legal/refund'
  },
  {
    path: '/artigen',
    name: 'agent-img-landing',
    component: () => import('../agentImg/views/LandingPage.vue'),
    meta: {
      title: {
        zh: 'Artigen - AI 图片工坊与格式工厂',
        en: 'Artigen - AI Image Workshop & Format Factory'
      },
      description: {
        zh: 'Artigen 提供 AI 工坊（文生图/图生图）、格式工厂与算力商城，一站式影像处理解决方案。',
        en: 'Artigen offers an AI workshop, format factory, and compute market for end‑to‑end image workflows.'
      },
      keywords: {
        zh: 'AI图片工坊,文生图,图生图,提示词优化,电商产品图,格式工厂,算力商城',
        en: 'AI image workshop,text-to-image,image-to-image,prompt optimization,ecommerce product images,format factory,compute market'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/format-factory',
    name: 'format-factory',
    component: () => import('../agentImg/views/FormatFactory.vue'),
    meta: {
      title: { zh: '格式工厂 - Artigen', en: 'Format Factory - Artigen' },
      description: {
        zh: '纯前端图片格式转换与处理工具集，快速、安全、无需上传。',
        en: 'Client-side image format conversion tools — fast, private, and upload-free.'
      },
      keywords: {
        zh: '图片格式转换,heic转jpg,png转jpg,webp转换,前端本地处理,隐私安全',
        en: 'image format converter,heic to jpg,png to jpg,webp converter,client-side,privacy'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/legal/terms',
    name: 'terms',
    component: () => import('../agentImg/views/legal/TermsOfService.vue'),
    meta: {
      title: { zh: '服务条款 - Artigen', en: 'Terms of Service - Artigen' },
      description: {
        zh: 'Artigen 服务条款与使用规则。',
        en: 'Artigen terms of service and usage rules.'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/legal/privacy',
    name: 'privacy',
    component: () => import('../agentImg/views/legal/PrivacyPolicy.vue'),
    meta: {
      title: { zh: '隐私政策 - Artigen', en: 'Privacy Policy - Artigen' },
      description: {
        zh: 'Artigen 隐私政策与数据处理说明。',
        en: 'Artigen privacy policy and data handling.'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/legal/refund',
    name: 'refund',
    component: () => import('../agentImg/views/legal/RefundPolicy.vue'),
    meta: {
      title: { zh: '退款政策 - Artigen', en: 'Refund Policy - Artigen' },
      description: {
        zh: 'Artigen 退款与争议处理政策。',
        en: 'Artigen refund and dispute policy.'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/ai-ppt',
    name: 'ai-ppt',
    component: () => import('../project/AiPptGen.vue')
  },
  {
    path: '/secret-garden',
    name: 'secret-garden',
    component: () => import('../project/SecretLove.vue')
  },
  {
    path: '/secret/galaxy',
    name: 'galaxy',
    component: () => import('../components/secret/pages/GalaxyPage.vue')
  },
  {
    path: '/secret/sea',
    name: 'sea',
    component: () => import('../components/secret/pages/SeaOfStarsPage.vue')
  },
  {
    path: '/secret/crystal',
    name: 'crystal',
    component: () => import('../components/secret/pages/CrystalWorldPage.vue')
  },
  {
    path: '/secret/matrix',
    name: 'matrix',
    component: () => import('../components/secret/pages/MatrixRainPage.vue')
  },
  {
    path: '/secret/fireworks',
    name: 'fireworks',
    component: () => import('../components/secret/pages/FireworksPage.vue')
  },
  {
    path: '/secret/quantum',
    name: 'quantum',
    component: () => import('../components/secret/pages/QuantumFieldPage.vue')
  },
  {
    path: '/secret/blackhole',
    name: 'blackhole',
    component: () => import('../components/secret/pages/BlackHolePage.vue')
  },
  {
    path: '/secret/tunnel',
    name: 'tunnel',
    component: () => import('../components/secret/pages/TimeTunnelPage.vue')
  },
  {
    path: '/secret/nebula',
    name: 'nebula',
    component: () => import('../components/secret/pages/NebulaPage.vue')
  },
  {
    path: '/secret/sakura',
    name: 'sakura',
    component: () => import('../components/secret/pages/SakuraPage.vue')
  },
  {
    path: '/portfolio-home',
    name: 'portfolio-home',
    component: () => import('../views/PortfolioHome.vue')
  },
  {
    path: '/gemini-chat',
    name: 'gemini-chat',
    component: () => import('../project/GeminiChat.vue')
  },
  {
    path: '/translator',
    name: 'translator',
    component: () => import('../project/Translator.vue')
  },
  {
    path: '/storyteller',
    name: 'storyteller',
    component: () => import('../project/StoryTeller.vue')
  },
  {
    path: '/ingredient',
    name: 'ingredient',
    component: () => import('../Ingredient/index.vue')
  },
  {
    path: '/christmas-tree',
    name: 'christmas-tree',
    component: () => import('../ChristmasTree/index.vue')
  },
  {
    path: '/resume-forge',
    name: 'resume-forge',
    component: () => import('../project/ResumeForge.vue')
  },
  {
    path: '/code-guardian',
    name: 'code-guardian',
    component: () => import('../project/CodeGuardian.vue')
  },
  {
    path: '/travel-planner',
    name: 'travel-planner',
    component: () => import('../project/TravelPlanner.vue')
  },
  {
    path: '/nexus-dashboard',
    name: 'nexus-dashboard',
    component: () => import('../project/NexusDashboard.vue')
  },
  {
    path: '/artigen/market',
    name: 'aether-market',
    component: () => import('../agentImg/views/AetherMarket.vue'),
    meta: {
      title: { zh: '算力商城 - Artigen', en: 'Compute Market - Artigen' },
      description: {
        zh: '购买算力点数，解锁更高频率与更高质量的生成体验。',
        en: 'Purchase credits to unlock higher throughput and quality generation.'
      },
      keywords: {
        zh: 'AI算力,点数充值,生成点数,图像生成算力,订阅,电商素材生成',
        en: 'AI credits,top-up,compute credits,image generation credits,pricing'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/room',
    name: 'room',
    component: () => import('../room/RoomPage.vue')
  },
  {
    path: '/agent-debug',
    name: 'agent-debug',
    component: () => import('../views/AgentDebug.vue')
  },
  {
    path: '/artigen/ai',
    name: 'agent-img-tool',
    component: () => import('../agentImg/index.vue'),
    meta: {
      title: { zh: 'AI 工坊 - Artigen', en: 'AI Workshop - Artigen' },
      description: {
        zh: 'AI 图片生成与提示词优化：文生图、图生图，适配电商主图、产品场景图与营销物料工作流。',
        en: 'AI image generation and prompt refinement: text-to-image and image-to-image for product and marketing visuals.'
      },
      keywords: {
        zh: 'AI工坊,图生图,文生图,产品图生成,电商主图,场景图,提示词优化,参考图',
        en: 'AI workshop,image-to-image,text-to-image,product image generator,ecommerce hero images,scene images,prompt optimizer'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/console',
    component: () => import('@/console/ConsoleLayout.vue'),
    meta: { robots: 'noindex,nofollow' } satisfies RouteSeoMeta,
    children: [
      {
        path: '',
        name: 'console-dashboard',
        component: () => import('@/console/views/Dashboard.vue')
      },
      {
        path: 'billing',
        name: 'console-billing',
        component: () => import('@/console/views/Billing.vue')
      },
      {
        path: 'usage',
        name: 'console-usage',
        component: () => import('@/console/views/Usage.vue')
      },
      {
        path: 'settings',
        name: 'console-settings',
        component: () => import('@/console/views/Settings.vue')
      },
      {
        path: 'playground',
        name: 'console-playground',
        component: () => import('@/console/views/Playground.vue')
      },
      {
        path: 'users',
        name: 'console-users',
        component: () => import('@/console/views/UserManagement.vue')
      },
      {
        path: 'audit',
        name: 'console-audit',
        component: () => import('@/console/views/ContentAudit.vue')
      }
    ]
  },
  ...loginRoutes.map((r) => ({ ...r, meta: { ...(r.meta || {}), robots: 'noindex,nofollow' } }))
];

const isAllowedInLockdown = (path: string) => {
  if (path === '/') return true;
  if (path.startsWith('/artigen')) return true;
  if (path.startsWith('/console')) return true;
  if (path.startsWith('/login')) return true;
  if (path === '/agent-img') return true;
  if (path === '/format-factory') return true;
  if (path === '/aether-market') return true;
  if (path === '/legal/terms') return true;
  if (path === '/legal/privacy') return true;
  if (path === '/legal/refund') return true;
  return false;
};

const activeRoutes = ROUTE_LOCKDOWN
  ? [
      ...routes.filter((r: any) => isAllowedInLockdown(String(r?.path || ''))),
      { path: '/:pathMatch(.*)*', redirect: '/artigen' }
    ]
  : routes;

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: activeRoutes as any
});

router.afterEach((to) => {
  const lang = getLang();
  const meta = (to.meta || {}) as RouteSeoMeta;
  const title = pickLang(meta.title, lang) || (lang === 'en' ? 'Artigen' : 'Artigen');
  const description =
    pickLang(meta.description, lang) ||
    (lang === 'en'
      ? 'Artigen AI image workshop and format factory.'
      : 'Artigen AI 图片工坊与格式工厂。');
  const keywords =
    pickLang(meta.keywords, lang) ||
    (lang === 'en'
      ? 'AI image workshop,image-to-image,text-to-image,prompt,format converter'
      : 'AI图片工坊,图生图,文生图,提示词,格式转换');

  document.title = title;

  try {
    document.documentElement.setAttribute('lang', lang);
  } catch {}

  ensureMeta({ name: 'description' }, description);
  ensureMeta({ name: 'keywords' }, keywords);
  ensureMeta({ name: 'robots' }, meta.robots || 'index,follow');

  const origin = window.location.origin;
  const url = `${origin}${to.fullPath || to.path}`;
  const ogImage = meta.ogImage || `${origin}/logo.png`;

  ensureLink('canonical', url);

  ensureMeta({ property: 'og:title' }, title);
  ensureMeta({ property: 'og:description' }, description);
  ensureMeta({ property: 'og:url' }, url);
  ensureMeta({ property: 'og:type' }, 'website');
  ensureMeta({ property: 'og:site_name' }, 'Artigen');
  ensureMeta({ property: 'og:image' }, ogImage);
  ensureMeta({ property: 'og:locale' }, lang === 'en' ? 'en_US' : 'zh_CN');

  ensureMeta({ name: 'twitter:card' }, 'summary_large_image');
  ensureMeta({ name: 'twitter:title' }, title);
  ensureMeta({ name: 'twitter:description' }, description);
  ensureMeta({ name: 'twitter:image' }, ogImage);

  ensureJsonLd('seo-jsonld', {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url,
    inLanguage: lang === 'en' ? 'en' : 'zh-CN',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Artigen',
      url: origin
    }
  });
});

export default router;
