import { createRouter, createWebHistory } from 'vue-router';
import { loginRoutes } from '../login/routes';
import { trackPageView } from '@/utils/analytics';
import { getToolDefinition } from '../agentImg/domain/toolCatalog';

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

const readAiBgSeoOverride = () => {
  try {
    const raw = String(window.localStorage.getItem('console_store_v1') || '').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const seo = parsed && typeof parsed === 'object' ? (parsed as any).aiBgSeoCopy : null;
    if (!seo || typeof seo !== 'object') return null;
    const pagePath = String(seo.pagePath || '').trim();
    const title = String(seo.title || '').trim();
    const description = String(seo.description || '').trim();
    const keywords = String(seo.keywords || '').trim();
    const ogImage = String(seo.ogImage || '').trim();
    if (!pagePath) return null;
    return { pagePath, title, description, keywords, ogImage };
  } catch {
    return null;
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

const withoutQueryKey = (query: Record<string, any>, key: string) => {
  const next = { ...query };
  delete next[key];
  return next;
};

const canonicalLegacyToolLocation = (rawId: unknown, query: Record<string, any>) => {
  const id = String(rawId || '').trim();
  const tool = getToolDefinition(id);
  if (!tool) return null;
  const nextQuery = withoutQueryKey(query, 'tool');
  if (tool.legacyIds.includes(id)) nextQuery.operation = id;
  return { path: tool.route, query: nextQuery, replace: true };
};

const routes = [
  {
    path: '/',
    redirect: '/artigen'
  },
  {
    path: '/agent-img',
    redirect: '/artigen/ai'
  },
  {
    path: '/format-factory',
    redirect: (to: any) => canonicalLegacyToolLocation(to.query.tool, to.query) || '/artigen/tools'
  },
  {
    path: '/tools',
    redirect: (to: any) => canonicalLegacyToolLocation(to.query.tool, to.query) || '/artigen/tools'
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
        zh: 'Artigen - AI 图片工坊与工具箱',
        en: 'Artigen - AI Image Workshop & Tools'
      },
      description: {
        zh: 'Artigen 提供 AI 设计（文生图/图生图）、工具箱与点数商城，一站式影像处理解决方案。',
        en: 'Artigen offers AI Design, Tools, and a credit market for end-to-end image workflows.'
      },
      keywords: {
        zh: 'AI设计,文生图,图生图,提示词优化,电商产品图,工具箱,点数商城',
        en: 'AI design,text-to-image,image-to-image,prompt optimization,ecommerce product images,tools,credits'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/format-factory',
    redirect: (to: any) => canonicalLegacyToolLocation(to.query.tool, to.query) || '/artigen/tools'
  },
  {
    path: '/artigen/tools',
    name: 'format-factory',
    component: () => import('../agentImg/views/FormatFactory.vue'),
    beforeEnter: (to: any) => canonicalLegacyToolLocation(to.query.tool, to.query) || true,
    meta: {
      title: { zh: '工具 - Artigen', en: 'Tools - Artigen' },
      description: {
        zh: '纯前端图片/文件处理工具集：转换、压缩、PDF 与常用编辑，快速、安全、无需上传。',
        en: 'Client-side image & file tools: convert, compress, PDF, and quick edits - fast, private, and upload-free.'
      },
      keywords: {
        zh: '工具,图片处理,格式转换,jpeg转webp,png转jpg,webp转换,PDF工具,前端本地处理,隐私安全',
        en: 'tools,image tools,format converter,jpeg to webp,png to jpg,webp converter,PDF tools,client-side,privacy'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/tools/:toolId',
    name: 'tool-workflow',
    component: () => import('../agentImg/views/FormatFactory.vue'),
    beforeEnter: (to: any) => {
      const requested = String(to.params.toolId || '').trim();
      const tool = getToolDefinition(requested);
      if (!tool || tool.kind !== 'tool') return { path: '/artigen/tools', replace: true };
      if (tool.id !== requested) {
        return {
          path: tool.route,
          query: { ...to.query, operation: requested },
          replace: true
        };
      }
      return true;
    },
    meta: {
      title: { zh: '工具工作流 - Artigen', en: 'Tool Workflow - Artigen' },
      description: {
        zh: '本地优先、限制透明且支持真实取消与 ZIP 导出的媒体工具工作流。',
        en: 'Local-first media workflows with explicit limits, cancellation, and real ZIP export.'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/tools-seo',
    name: 'seo-tools-landing',
    component: () => import('../agentImg/views/SeoLanding.vue'),
    meta: {
      title: {
        zh: '本地优先在线工具集 - 格式转换与 AI 工坊 - Artigen',
        en: 'Local-First Online Tools - Format Factory & AI Workshop - Artigen'
      },
      description: {
        zh: 'Artigen 提供本地优先的图片批处理、PDF/GIF/ICO 工作流，以及明确标价的 AI 文生图与图生图能力。',
        en: 'Artigen provides local-first image batching, PDF/GIF/ICO workflows, and clearly priced AI text-to-image and image-to-image tools.'
      },
      keywords: {
        zh: '在线工具,图片批处理,JPEG转WEBP,PDF工具,AI绘图,文生图,在线修图,Artigen工具箱',
        en: 'online tools,image batch processing,jpeg to webp,pdf tools,ai art generator,text to image,online photo editor,artigen toolkit'
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
    path: '/artigen/image-workshop',
    name: 'image-workshop',
    component: () => import('../agentImg/views/ImageWorkshop.vue'),
    beforeEnter: (to: any) => canonicalLegacyToolLocation(to.query.tool, to.query) || true,
    meta: {
      title: { zh: 'AI影像工坊 - Artigen', en: 'AI Image Workshop - Artigen' },
      description: {
        zh: '本地与 AI 影像工作流：证件照与职业形象、老照片增强、换背景、配料标签排版和图片编辑。',
        en: 'Local and AI workflows for ID/pro portraits, old-photo enhancement, backgrounds, ingredient label layout, and editing.'
      },
      keywords: {
        zh: '影像工坊,证件照,职业形象,老照片增强,背景替换,配料标签排版,图片编辑',
        en: 'image workshop,ID photo,professional portrait,photo enhancement,background replacement,ingredient label layout,image editor'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/image-workshop/image-editor',
    name: 'image-editor',
    component: () => import('../agentImg/views/ImageEditorRoute.vue'),
    meta: {
      title: { zh: '图片编辑 - Artigen', en: 'Image Editor - Artigen' },
      description: {
        zh: '非破坏图层编辑器：画板、文字与形状、裁剪和调整、自动保存、Worker 像素处理与多格式导出。',
        en: 'Non-destructive editor with artboards, text/shapes, crop and adjustments, autosave, Worker processing, and multi-format export.'
      },
      keywords: {
        zh: '图片编辑,在线修图,图层,裁剪,调色,导出,AI抠图,去背景',
        en: 'image editor,online photo editor,layers,crop,color adjustments,export,AI remove background'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/image-editor',
    redirect: (to: any) => ({
      path: '/artigen/image-workshop/image-editor',
      query: to.query,
      replace: true
    })
  },
  {
    path: '/artigen/image-workshop/:toolId',
    name: 'image-workshop-tool',
    component: () => import('../agentImg/views/ImageWorkshop.vue'),
    beforeEnter: (to: any) => {
      const requested = String(to.params.toolId || '').trim();
      const tool = getToolDefinition(requested);
      if (!tool || tool.kind !== 'workshop') {
        return { path: '/artigen/image-workshop', replace: true };
      }
      if (tool.id === 'image-editor') {
        return { path: tool.route, query: to.query, replace: true };
      }
      if (tool.id !== requested) {
        return { path: tool.route, query: to.query, replace: true };
      }
      return true;
    },
    meta: {
      title: { zh: '影像工坊 - Artigen', en: 'Image Workshop - Artigen' },
      description: {
        zh: '本地能力与付费 AI 明确分离的影像工作流。',
        en: 'Image workflows with clearly separated local and paid AI capabilities.'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/market',
    name: 'aether-market',
    component: () => import('../agentImg/views/AetherMarket.vue'),
    meta: {
      title: { zh: '点数商城 - Artigen', en: 'Compute Market - Artigen' },
      description: {
        zh: '购买点数，解锁更高频率与更高质量的生成体验。',
        en: 'Purchase credits to unlock higher throughput and quality generation.'
      },
      keywords: {
        zh: 'AI点数,点数充值,生成点数,图像生成点数,订阅,电商素材生成',
        en: 'AI credits,top-up,compute credits,image generation credits,pricing'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/orders',
    name: 'credits-orders',
    component: () => import('../agentImg/views/CreditsOrders.vue'),
    meta: {
      title: { zh: '我的订单 - Artigen', en: 'My Orders - Artigen' },
      description: { zh: '查看您的算力点数购买记录。', en: 'View your credit purchase history.' },
      keywords: { zh: '订单,购买记录,点数订单,点数商城', en: 'orders,credits,purchase history' }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/about',
    name: 'about',
    component: () => import('../agentImg/views/AboutPage.vue'),
    meta: {
      title: { zh: '关于我们 - Artigen', en: 'About Us - Artigen' },
      description: {
        zh: '了解 Artigen 团队与使命。',
        en: 'Learn about Artigen team and mission.'
      }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/usage',
    name: 'credits-usage',
    component: () => import('../agentImg/views/CreditsUsage.vue'),
    meta: {
      title: { zh: '点数明细 - Artigen', en: 'Credits Usage - Artigen' },
      description: {
        zh: '查看点数冻结、扣费与退款记录。',
        en: 'View holds, charges, and refunds.'
      },
      keywords: { zh: '点数明细,扣费记录,冻结,退款', en: 'credits,usage,holds,refunds' }
    } satisfies RouteSeoMeta
  },
  {
    path: '/artigen/ai',
    name: 'agent-img-tool',
    component: () => import('../agentImg/index.vue'),
    meta: {
      title: { zh: 'AI 设计 - Artigen', en: 'AI Design - Artigen' },
      description: {
        zh: 'AI 图片生成与提示词优化：文生图、图生图，适配电商主图、产品场景图与营销物料工作流。',
        en: 'AI image generation and prompt refinement: text-to-image and image-to-image for product and marketing visuals.'
      },
      keywords: {
        zh: 'AI设计,图生图,文生图,产品图生成,电商主图,场景图,提示词优化,参考图',
        en: 'AI design,image-to-image,text-to-image,product image generator,ecommerce hero images,scene images,prompt optimizer'
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
        component: () => import('@/console/views/Dashboard.vue'),
        meta: {
          title: { zh: '控制台总览 - Artigen', en: 'Console Overview - Artigen' },
          description: {
            zh: 'Artigen 后台控制台总览：账户、流量与关键指标。',
            en: 'Artigen console overview: account, traffic, and key metrics.'
          },
          keywords: { zh: '后台,控制台,总览,数据面板', en: 'console,admin,overview,dashboard' }
        } satisfies RouteSeoMeta
      },
      {
        path: 'billing',
        name: 'console-billing',
        component: () => import('@/console/views/Billing.vue'),
        meta: {
          title: { zh: '控制台计费 - Artigen', en: 'Console Billing - Artigen' },
          description: {
            zh: 'Artigen 后台计费与点数管理。',
            en: 'Artigen console billing and credits management.'
          },
          keywords: { zh: '后台,计费,点数,充值', en: 'console,billing,credits,topup' }
        } satisfies RouteSeoMeta
      },
      {
        path: 'usage',
        name: 'console-usage',
        component: () => import('@/console/views/Usage.vue'),
        meta: {
          title: { zh: '控制台用量 - Artigen', en: 'Console Usage - Artigen' },
          description: {
            zh: 'Artigen 后台用量与请求统计分析。',
            en: 'Artigen console usage and request analytics.'
          },
          keywords: { zh: '后台,用量,统计,分析', en: 'console,usage,analytics,stats' }
        } satisfies RouteSeoMeta
      },
      {
        path: 'settings',
        name: 'console-settings',
        component: () => import('@/console/views/Settings.vue'),
        meta: {
          title: { zh: '控制台设置 - Artigen', en: 'Console Settings - Artigen' },
          description: {
            zh: 'Artigen 后台个人资料与设置。',
            en: 'Artigen console profile and settings.'
          },
          keywords: { zh: '后台,设置,个人资料,API Key', en: 'console,settings,profile,api key' }
        } satisfies RouteSeoMeta
      },
      {
        path: 'playground',
        name: 'console-playground',
        component: () => import('@/console/views/Playground.vue'),
        meta: {
          title: { zh: '控制台试验场 - Artigen', en: 'Console Playground - Artigen' },
          description: {
            zh: 'Artigen 后台试验场，用于演示与验证能力。',
            en: 'Artigen console playground for demos and validation.'
          },
          keywords: { zh: '后台,试验场,演示,验证', en: 'console,playground,demo,validate' }
        } satisfies RouteSeoMeta
      },
      {
        path: 'users',
        name: 'console-users',
        component: () => import('@/console/views/UserManagement.vue'),
        meta: {
          title: { zh: '控制台用户管理 - Artigen', en: 'Console Users - Artigen' },
          description: {
            zh: 'Artigen 后台用户管理与账户信息查看。',
            en: 'Artigen console user management and account details.'
          },
          keywords: { zh: '后台,用户管理,账户,权限', en: 'console,user management,accounts,admin' }
        } satisfies RouteSeoMeta
      },
      {
        path: 'audit',
        name: 'console-audit',
        component: () => import('@/console/views/ContentAudit.vue'),
        meta: {
          title: { zh: '控制台内容审计 - Artigen', en: 'Console Content Audit - Artigen' },
          description: {
            zh: 'Artigen 后台内容审计与调用记录查看。',
            en: 'Artigen console content audit and invocation logs.'
          },
          keywords: { zh: '后台,内容审计,日志,合规', en: 'console,content audit,logs,compliance' }
        } satisfies RouteSeoMeta
      }
    ]
  },
  {
    path: '/console2',
    redirect: '/console'
  },
  ...loginRoutes.map((r) => ({ ...r, meta: { ...(r.meta || {}), robots: 'noindex,nofollow' } })),
  {
    path: '/:pathMatch(.*)*',
    redirect: '/artigen'
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: routes as any
});

router.onError((err, to) => {
  const msg = String((err as any)?.message || err || '').trim();
  const isChunkLoadError =
    /loading chunk|chunkloaderror|failed to fetch dynamically imported module|importing a module script failed/i.test(
      msg
    );
  if (!isChunkLoadError) return;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has('__reload')) return;
    const target = String((to as any)?.fullPath || (to as any)?.path || '/').trim() || '/';
    const sep = target.includes('?') ? '&' : '?';
    window.location.replace(`${target}${sep}__reload=${Date.now()}`);
  } catch {
    try {
      window.location.reload();
    } catch {}
  }
});

router.afterEach((to) => {
  const lang = getLang();
  const meta = (to.meta || {}) as RouteSeoMeta;
  const aiBgSeo = readAiBgSeoOverride();
  const shouldUseAiBgSeo = !!aiBgSeo && String(to.path || '') === String(aiBgSeo.pagePath || '');

  const title =
    (shouldUseAiBgSeo ? String(aiBgSeo?.title || '').trim() : '') ||
    pickLang(meta.title, lang) ||
    (lang === 'en' ? 'Artigen' : 'Artigen');
  const description =
    (shouldUseAiBgSeo ? String(aiBgSeo?.description || '').trim() : '') ||
    pickLang(meta.description, lang) ||
    (lang === 'en' ? 'Artigen AI image workshop and tools.' : 'Artigen AI 图片工坊与工具箱。');
  const keywords =
    (shouldUseAiBgSeo ? String(aiBgSeo?.keywords || '').trim() : '') ||
    pickLang(meta.keywords, lang) ||
    (lang === 'en'
      ? 'AI image workshop,image-to-image,text-to-image,prompt,image tools,format converter'
      : 'AI图片工坊,图生图,文生图,提示词,工具,格式转换');

  document.title = title;

  try {
    document.documentElement.setAttribute('lang', lang);
  } catch {}

  ensureMeta({ name: 'description' }, description);
  ensureMeta({ name: 'keywords' }, keywords);
  ensureMeta({ name: 'robots' }, meta.robots || 'index,follow');

  const origin = window.location.origin;
  const url = `${origin}${to.fullPath || to.path}`;
  const ogImage =
    (shouldUseAiBgSeo ? String(aiBgSeo?.ogImage || '').trim() : '') ||
    meta.ogImage ||
    `${origin}/logo.png`;

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

  trackPageView({ path: to.fullPath || to.path, title, location: url });
});

export default router;
