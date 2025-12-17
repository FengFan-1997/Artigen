import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLanguageStore = defineStore('language', () => {
  const currentLang = ref<'en' | 'zh'>('zh');

  const translations = {
    en: {
      nav: {
        hero: 'Home',
        projects: 'Projects',
        about: 'About',
        skills: 'Skills',
        experience: 'Experience',
        testimonials: 'Testimonials'
      },
      hero: {
        greeting: 'Hello, I am',
        welcome: 'Welcome to my ',
        workshop: 'AI Creative Workshop',
        role: 'Creative Developer',
        description: 'Building immersive web experiences with Vue 3, Three.js, and AI.',
        subtitle: 'Creating digital experiences where intelligence meets immersion',
        valueProp: 'AI Driven · Interactive Innovation · Extreme Performance',
        scroll: 'SCROLL TO EXPLORE',
        cta: 'View My Work'
      },
      about: {
        title: 'ABOUT ME',
        bio: 'Builder focused on modern frontend engineering and user experience. Solid CS background (GPA 3.15, Shandong Agricultural University). Expert in implementing AI models, data visualization, and complex interactions into high-performance Web apps. During my tenure at Packify, I drove the frontend architecture for the AI packaging design platform. I led the development of core modules including the AI Design Inspiration page, Nutrition Label Generator, Developer API Portal, Price Page Optimization, and SEO Template System. I successfully solved complex challenges in mobile adaptation and internationalization, achieving significant growth in organic traffic and user conversion. Adhering to "Performance First" and "Data Driven" philosophy.',
        proficient: 'Core Tech Stack',
        stack1:
          'Vue 3 Ecosystem (Vite, Pinia), TypeScript, ECharts, Highmaps (LOCA), TensorFlow.js',
        familiar: 'Engineering & Backend',
        stack2: 'Git Workflow, Webpack/Vite, Java (SpringBoot), Python, LLM Integration',
        education: {
          title: 'Education',
          school: 'Shandong Agricultural University',
          degree: 'Computer Science and Technology (Bachelor)',
          period: '2021 - 2025',
          courses: 'Web Development, Data Structures & Algorithms, OS, Database Principles'
        },
        honors: {
          title: 'Honors & Awards',
          list: [
            'Lanqiao Cup National Software Competition: Provincial Award (Java)',
            'University Software Design Competition: Provincial Second Prize',
            'National Endeavor Scholarship & First Class School Scholarship'
          ]
        },
        philosophy:
          'User experience at the core, code quality as the baseline. Delivering reliable frontend solutions.',
        stats: {
          years: 'Years Exp.',
          projects: 'Projects',
          awards: 'Awards'
        }
      },
      skills: {
        title: 'TECHNICAL ARSENAL'
      },
      projects: {
        title: 'SELECTED WORKS',
        viewProject: 'View Project',
        filters: {
          all: 'All'
        },
        items: {
          ingredients: {
            title: 'AI INGREDIENTS',
            desc: 'Intelligent Label Generation powered by Gemini. Transform simple text into FDA-compliant nutrition facts and ingredient lists with one click.'
          },
          gemini: {
            title: 'GEMINI CHAT',
            desc: 'Advanced conversational interface powered by Gemini 2.5 Flash. Features real-time streaming responses and context-aware interactions.'
          },
          polyglot: {
            title: 'AI POLYGLOT',
            desc: 'Smart translation and text polishing tool. Supports multiple languages and tone adjustments (Professional, Casual, Creative).'
          },
          storyteller: {
            title: 'STORYTELLER',
            desc: 'Interactive AI story generator. Create immersive narratives based on genre, theme, and character inputs.'
          },
          christmas: {
            title: 'CHRISTMAS MAGIC',
            desc: 'An immersive 3D experience controlled by hand gestures. Uses MediaPipe for tracking and Three.js for rendering a magical interactive scene.'
          },
          nexus: {
            title: 'NEXUS DASHBOARD',
            desc: 'AI-Powered High-Frequency Trading Dashboard. Features predictive market analytics, real-time anomaly detection, and neural network-driven sentiment analysis.'
          },
          market: {
            title: 'AETHER MARKET',
            desc: 'Generative AI NFT Marketplace. Experience the first decentralized gallery where neural networks curate and generate unique 3D digital artifacts in real-time.'
          },
          resume: {
            title: 'AI RESUME FORGE',
            desc: 'Intelligent resume optimization tool. Analyzes your CV against job descriptions to increase ATS pass rates and interview chances.'
          },
          audit: {
            title: 'CODE GUARDIAN',
            desc: 'Automated Smart Contract Auditor. Instantly detects vulnerabilities in Solidity code and provides secure fix suggestions.'
          },
          travel: {
            title: 'WANDERLUST AI',
            desc: 'Personalized travel itinerary planner. Generates day-by-day schedules based on your interests, budget, and travel style.'
          },
          aippt: {
            title: 'AI PPT GEN',
            desc: 'Automated presentation generator. Transform topics into structured slide decks with AI-driven content expansion.'
          }
        }
      },
      experience: {
        title: 'JOURNEY',
        items: {
          item1: {
            period: '2025.08 - 2025.10',
            role: 'Core Frontend & UX Lead',
            company: 'Packify (Core Product)',
            desc: [
              '**AI Design & Responsive Architecture**: Rebuilt the "Inspiration" page using a flexible layout system, ensuring 98% consistency across all devices. Established team-wide code submission norms.',
              '**Interaction & Mobile Optimization**: Refactored the sidebar/dialog interaction. Implemented 60FPS animations for desktop and a full-screen touch-optimized mode for mobile, boosting user smoothness ratings to 4.8/5.',
              '**Conversion (Price Page)**: Collaborated on the Pricing page overhaul, optimizing visual hierarchy and "Recommended" highlights, increasing click-through conversion by 30%.'
            ]
          },
          item2: {
            period: '2025.10 - 2025.12',
            role: 'Growth Engine & Ecosystem Developer',
            company: 'Packify (Growth & API)',
            desc: [
              '**Growth & SEO (Nutrition Label)**: Developed the "Nutrition Label Generator" from scratch. Optimized for SEO (SSR, semantic tags), driving the keyword to Google Top 3 and increasing organic traffic by 120%.',
              '**Developer Ecosystem (API Portal)**: Built the end-to-end Developer Portal (API Key management, Usage Analytics, Docs), enabling self-service for enterprise clients.',
              '**Efficiency (SEO Templates)**: Created a reusable landing page system with schema markup, reducing operation campaign launch time from 3 days to 1 hour (95% efficiency gain).'
            ]
          },
          item3: {
            period: 'Project Experience',
            role: 'Full Stack Dev (Vue3 + TS + TF.js)',
            company: 'AI Weather Insight',
            desc: [
              'Visualization Engine: Integrated Amap LOCA & ECharts for million-level data rendering with 26 dynamic themes.',
              'Edge AI: Implemented TensorFlow.js for natural language weather queries with 89.6% accuracy.',
              'Performance: Reduced bundle size by 62% via code splitting and optimized concurrency for <2s response time.'
            ]
          },
          item4: {
            period: 'Project Experience',
            role: 'Core Frontend (Vue3 + WebSocket)',
            company: 'Digital Lab Sync',
            desc: [
              'Real-time Sync: Built full-duplex communication using WebSocket for millisecond-level data synchronization.',
              'Data Audit: Designed provenance mechanism ensuring experimental data integrity and immutability.',
              'Optimization: Applied Tree Shaking and async components to improve performance on low-end devices.'
            ]
          },
          item5: {
            period: 'Project Experience',
            role: 'Frontend Lead (Vue3 + Pinia + LLM)',
            company: 'Zhiyuanbao AI',
            desc: [
              'LLM Integration: Integrated Spark API with custom Prompt Engineering for intelligent college counseling.',
              'Auth System: Built JWT Token management with Pinia and localStorage for persistent login state.',
              'Data Display: Integrated QS World Rankings API with dynamic marquee components for authoritative data showcase.'
            ]
          }
        }
      },
      testimonials: {
        title: 'WHAT PEOPLE SAY',
        items: {
          item1: {
            text: "One of the most talented developers I've worked with. The attention to detail in animations is unmatched.",
            author: 'Sarah J.',
            role: 'Product Design Lead'
          },
          item2: {
            text: 'Delivered the project ahead of schedule and the performance optimization was incredible. Highly recommended.',
            author: 'Michael C.',
            role: 'CTO, StartUp Inc.'
          },
          item3: {
            text: 'A true creative technologist. Transformed our vague requirements into a stunning interactive experience.',
            author: 'David L.',
            role: 'Creative Director'
          }
        }
      },
      common: {
        loading: 'Loading...'
      }
    },
    zh: {
      nav: {
        hero: '首页',
        projects: '项目',
        about: '关于',
        skills: '技能',
        experience: '经历',
        testimonials: '评价'
      },
      hero: {
        greeting: '你好，我是',
        welcome: '欢迎来到我的',
        workshop: 'AI创意工坊',
        role: '创意开发工程师',
        description: '使用 Vue 3, Three.js 和 AI 构建沉浸式网络体验。',
        subtitle: '打造智能与沉浸并存的数字体验',
        valueProp: 'AI 驱动 · 交互创新 · 极致性能',
        scroll: '向下滚动探索',
        cta: '查看作品'
      },
      about: {
        title: '关于我',
        bio: '专注于现代前端工程化与用户体验的构建者。具备扎实的计算机科学基础（GPA 3.15, 山东农业大学），擅长将 AI 模型、数据可视化与复杂交互逻辑落地为高性能 Web 应用。在 Packify 任职期间，我主导了 AI 包装设计平台的前端架构演进。独立负责了 AI 灵感库、营养成分表生成器、开发者 API 门户、价格页转化优化及 SEO 模版系统等核心模块的开发。攻克了复杂场景下的移动端适配与国际化难题，显著提升了产品的自然流量与用户转化率。始终坚持“性能优先”与“数据驱动”的开发理念。',
        proficient: '核心技术栈',
        stack1:
          'Vue 3 Ecosystem (Vite, Pinia), TypeScript, ECharts, Highmaps (LOCA), TensorFlow.js',
        familiar: '工程化与后端',
        stack2: 'Git Workflow, Webpack/Vite, Java (SpringBoot), Python, LLM Integration',
        education: {
          title: '教育背景',
          school: '山东农业大学',
          degree: '计算机科学与技术 (本科)',
          period: '2021 - 2025',
          courses: 'Web 开发技术, 数据结构与算法, 操作系统, 数据库原理'
        },
        honors: {
          title: '荣誉奖项',
          list: [
            '蓝桥杯全国软件专业人才设计大赛：省级奖项 (Java 软件开发方向)',
            '大学生软件设计大赛：省级二等奖',
            '国家励志奖学金 & 校级一等奖学金'
          ]
        },
        philosophy: '以用户体验为核心，以代码质量为底线，交付可靠的前端解决方案。',
        stats: {
          years: '从业年限',
          projects: '项目数',
          awards: '奖项'
        }
      },
      skills: {
        title: '技术栈'
      },
      projects: {
        title: '精选作品',
        viewProject: '查看项目',
        filters: {
          all: '全部'
        },
        items: {
          ingredients: {
            title: 'AI 配料表',
            desc: '基于 Gemini 的智能标签生成。一键将简单文本转换为符合 FDA 标准的营养成分表和配料表。'
          },
          gemini: {
            title: 'Gemini 对话',
            desc: '基于 Gemini 2.5 Flash 的高级对话界面。支持实时流式响应和上下文感知交互。'
          },
          polyglot: {
            title: 'AI 多语言助手',
            desc: '智能翻译和文本润色工具。支持多种语言和语气调整（专业、休闲、创意）。'
          },
          storyteller: {
            title: '故事讲述者',
            desc: '交互式 AI 故事生成器。根据流派、主题和角色输入创建沉浸式叙事。'
          },
          christmas: {
            title: '圣诞魔法',
            desc: '通过手势控制的沉浸式 3D 体验。使用 MediaPipe 进行追踪，Three.js 进行渲染。'
          },
          nexus: {
            title: 'Nexus 仪表盘',
            desc: '面向高频交易的下一代分析平台。具有实时 WebGL 图表、亚毫秒级数据更新和可定制工作区。'
          },
          market: {
            title: 'Aether 市场',
            desc: '具有 3D 沉浸式画廊模式的去中心化 NFT 市场。基于以太坊构建，集成 IPFS 和自定义智能合约。'
          },
          resume: {
            title: 'AI 简历锻造师',
            desc: '智能简历优化工具。针对职位描述分析您的简历，提高 ATS 通过率和面试机会。'
          },
          audit: {
            title: '代码卫士',
            desc: '自动化智能合约审计员。即时检测 Solidity 代码中的漏洞并提供安全修复建议。'
          },
          travel: {
            title: '漫游 AI',
            desc: '个性化旅行行程规划师。根据您的兴趣、预算和旅行风格生成每日详细行程。'
          },
          aippt: {
            title: 'AI PPT 生成器',
            desc: '自动化演示文稿生成器。通过 AI 内容扩展将主题转换为结构化的幻灯片。'
          }
        }
      },
      experience: {
        title: '成长历程',
        items: {
          item1: {
            period: '2025.08 - 2025.10',
            role: '核心前端开发 & 交互优化负责人',
            company: 'Packify (核心产品线)',
            desc: [
              '**AI 灵感页与响应式架构**: 重构页面骨架，采用弹性布局方案实现全终端（桌面/平板/移动）98%的一致性体验；制定并落地团队代码提交规范。',
              '**交互体验与移动端适配**: 针对双端差异重构侧边栏交互。桌面端引入高性能过渡动画，移动端开发全屏触控模式，将用户操作流畅度评分提升至 4.8/5。',
              '**商业转化 (价格页重塑)**: 主导价格页视觉升级，通过分层设计与权益对比优化，将套餐选择转化率提升 30%。'
            ]
          },
          item2: {
            period: '2025.10 - 2025.12',
            role: '增长引擎与开发者生态负责人',
            company: 'Packify (增长与生态)',
            desc: [
              '**增长引擎 (SEO与全栈开发)**: 独立开发“营养成分表生成器”全链路。通过组件化拆分与 SEO 深度优化，助推核心关键词占据 Google Top 3，自然流量激增 120%。',
              '**开发者生态 (API Portal)**: 从 0 到 1 搭建开发者门户，实现 API Key 全生命周期管理与可视化文档，支撑企业级用户自助接入。',
              '**工程化提效 (SEO模板)**: 搭建通用 SEO 落地页模板库，集成结构化数据与自动化配置，将运营活动页上线周期从 3 天缩短至 1 小时。'
            ]
          },
          item3: {
            period: '项目经历',
            role: '全栈开发 (Vue3 + TS + TF.js)',
            company: '气象数据可视化平台',
            desc: [
              '可视化引擎：集成高德 LOCA 引擎与 ECharts 实现百万级数据点渲染；支持 26 种气象主题自适应切换。',
              '端侧 AI：引入 TensorFlow.js 实现自然语言天气查询，预测准确率 89.6%。',
              '性能优化：通过代码分割减少首屏体积 62%，并发控制确保高并发下响应 <2秒。'
            ]
          },
          item4: {
            period: '项目经历',
            role: '核心前端 (Vue3 + WebSocket)',
            company: '数字化物理实验平台',
            desc: [
              '实时通信：基于 WebSocket 构建核心同步模块，实现毫秒级数据同步。',
              '数据审计：设计数据溯源机制，记录每一次录入的时间戳与版本，确保实验严谨性。',
              '构建调优：利用 Tree Shaking 剔除冗余代码，提升低性能设备运行流畅度。'
            ]
          },
          item5: {
            period: '项目经历',
            role: '前端负责人 (Vue3 + Pinia + LLM)',
            company: '志愿宝 AI',
            desc: [
              '大模型集成：接入讯飞星火 API，定制 Prompt Engineering 实现智能升学咨询。',
              '鉴权体系：基于 Pinia + localStorage 封装 JWT Token 管理模块，实现持久化登录。',
              '数据整合：对接 QS 排名接口，通过 Marquee 组件构建权威数据展示层。'
            ]
          }
        }
      },
      testimonials: {
        title: '客户评价',
        items: {
          item1: {
            text: '是我合作过最有才华的开发者之一，对动画细节的把控无与伦比。',
            author: 'Sarah J.',
            role: '产品设计主管'
          },
          item2: {
            text: '项目提前交付，性能优化非常出色。强烈推荐。',
            author: 'Michael C.',
            role: 'CTO，StartUp Inc.'
          },
          item3: {
            text: '真正的创意技术专家。将我们模糊的需求变成令人惊叹的交互体验。',
            author: 'David L.',
            role: '创意总监'
          }
        }
      },
      common: {
        loading: '加载中...'
      }
    }
  };

  function toggleLanguage() {
    currentLang.value = currentLang.value === 'en' ? 'zh' : 'en';
  }

  function setLanguage(lang: 'en' | 'zh') {
    currentLang.value = lang;
  }

  function t(key: string) {
    const keys = key.split('.');
    let value: any = translations[currentLang.value];
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key;
      }
    }
    return value;
  }

  return {
    currentLang,
    toggleLanguage,
    setLanguage,
    t
  };
});
