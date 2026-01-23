import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

export function useAgentImgLocale() {
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);

  const ui = computed(() => {
    if (currentLang.value === 'zh') {
      return {
        navFormatFactory: '工具',
        navAiWorkshop: 'AI 设计',
        navMarket: '点数商城',
        homeLink: '首页',
        goMarket: '去点数商城',
        creditsBalance: '点数余额',
        totalCredits: '总点数',
        refreshCredits: '刷新点数',
        myOrders: '我的订单',
        creditsUsage: '点数明细',
        logout: '退出登录',
        loginOrRegister: '登录 / 注册',
        productProfile: '产品档案',
        productName: '产品名称',
        productNamePh: '例如：极光精华液',
        brandName: '所属品牌',
        brandNamePh: '例如：LUMINA',
        productCategory: '产品品类',
        categoryPh: '选择品类...',
        material: '核心材质',
        materialPh: '例如：磨砂玻璃、透明塑料',
        visualStyle: '视觉风格',
        designElements: '设计元素',
        style: '风格',
        colorScheme: '色系',
        add: '添加',
        scene: '拍摄场景',
        scenePh: '例如：纯色摄影棚、自然光影',
        lighting: '布光风格',
        lightingPh: '例如：柔和漫射、强对比侧光',
        primaryColor: '主色调',
        primaryColorPh: '例如：#FF5500 或 暖橙色',
        brandAssets: '品牌资产',
        logoFile: 'Logo 文件',
        logoUploadPh: '点击上传 PNG/SVG',
        deepThinkingTitle: '深度思考分析',
        deepThinkingSub: '基于您的输入，为您规划了 4 个视觉方向',
        generateThisDirection: '生成',
        welcomeTitle: '欢迎使用 Artigen AI 设计。',
        welcomeSub:
          '请简单描述您想要生成的图片 或上传参考图。发送后我会优化您的输入并且结合相关提示词并生成结果。',
        memory: '历史记录',
        noHistory: '暂无历史记录',
        resultTitle: '生成结果',
        positivePrompt: '正向提示词',
        negativePrompt: '反向提示词',
        imageLabel: '图片',
        download: '下载',
        reference: '引用',
        addImage: '添加图片',
        model: '模型',
        modelTip: '当前：默认模型',
        modelStandard: '默认模型',
        modelNanobanana: 'Nano Banana',
        modelNanobananaPro: 'Nano BananaPro',
        modelLocked: '需要 Pro 以上',
        modelComingSoon: '暂未接入',
        costTip: '预计扣费：{n} 点/次',
        deepThinkToggle: '深度思考',
        deepThinkDisabledTip: '图生图暂不支持深度思考',
        productSpecial: '产品专项',
        sendHint: 'Ctrl + Enter 发送',
        inputPlaceholder: '描述你想要的产品图，比如：“一瓶精华液放在冰块上，背景是阳光海滩”...',
        dropHint: '拖拽图片到这里松开即可添加',
        loadingText: '正在处理，请耐心等待…',
        guideTitle: '使用指南 / 我们的优势',
        guideDesc:
          '如果是电商产品，可以先在左侧「产品档案」补齐关键信息；非电商场景可跳过，直接用一句话描述场景。打开「深度思考」会自动优化提示词与构图。支持多参考图图生图，让风格与质感更稳定。',
        guideKeywords: [
          '深度思考模型',
          '多参考图生成',
          '主流强力生图模型',
          '电商产品工作流',
          '4K 高清下载（Pro+）'
        ],
        guideFaqs: [
          {
            q: '文件会上传到服务器吗？',
            a: '工具相关功能默认在浏览器本地处理；AI 设计在生成/图生图时会将必要信息（提示词/参考图）发送到模型服务完成生成。'
          },
          {
            q: '从哪里开始更快？',
            a: '有参考图就用图生图；只有想法就用文生图。做电商图建议先填产品档案，再选择风格/场景。'
          },
          {
            q: '深度思考有什么用？',
            a: '深度思考会自动补全构图、光影、材质与质量词，并做提示词结构化；同时带有“记忆”能力，会结合你多轮输入自动融合需求。非深度思考仅接受单次输入。'
          },
          {
            q: '怎么提高一致性与可控性？',
            a: '支持多张参考图同时参与生成，建议用：产品图 + 风格参考 + 场景参考；再配合产品档案字段，稳定输出。'
          },
          {
            q: '我们的优势是什么？',
            a: '内置深度思考模型做提示词与构图优化；支持多图同时作为参考进行生成；接入多种主流强力生图模型，覆盖写实/商业/风格化等场景。'
          }
        ]
      };
    }
    return {
      navFormatFactory: 'Tools',
      navAiWorkshop: 'AI Design',
      navMarket: 'Compute Market',
      homeLink: 'Home',
      goMarket: 'Go to Market',
      creditsBalance: 'Credit balance',
      totalCredits: 'Total credits',
      refreshCredits: 'Refresh credits',
      myOrders: 'My Orders',
      creditsUsage: 'Credits Usage',
      logout: 'Logout',
      loginOrRegister: 'Login / Register',
      productProfile: 'Product Profile',
      productName: 'Product Name',
      productNamePh: 'e.g. Aurora Serum',
      brandName: 'Brand',
      brandNamePh: 'e.g. LUMINA',
      productCategory: 'Category',
      categoryPh: 'Select a category...',
      material: 'Material',
      materialPh: 'e.g. Frosted glass, clear plastic',
      visualStyle: 'Visual Style',
      designElements: 'Design Elements',
      style: 'Style',
      colorScheme: 'Color Scheme',
      add: 'Add',
      scene: 'Scene',
      scenePh: 'e.g. Studio backdrop, natural light',
      lighting: 'Lighting',
      lightingPh: 'e.g. Soft diffuse, high-contrast side light',
      primaryColor: 'Primary Color',
      primaryColorPh: 'e.g. #FF5500 or warm orange',
      brandAssets: 'Brand Assets',
      logoFile: 'Logo File',
      logoUploadPh: 'Upload PNG/SVG',
      deepThinkingTitle: 'Deep Thinking Analysis',
      deepThinkingSub: 'Based on your input, we planned 4 visual directions',
      generateThisDirection: 'Generate',
      welcomeTitle: 'Welcome to Artigen AI Design.',
      welcomeSub:
        'Please briefly describe the image you want to generate, or upload a reference image. After you send, I’ll refine your input, combine it with relevant prompts, and generate the result.',
      memory: 'History',
      noHistory: 'No history yet',
      resultTitle: 'Result',
      positivePrompt: 'Positive Prompt',
      negativePrompt: 'Negative Prompt',
      imageLabel: 'Image',
      download: 'Download',
      reference: 'Reference',
      addImage: 'Add image',
      model: 'Model',
      modelTip: 'Current: Default model',
      modelStandard: 'Default model',
      modelNanobanana: 'Nano Banana',
      modelNanobananaPro: 'Nano BananaPro',
      modelLocked: 'Requires Pro pack or higher',
      modelComingSoon: 'Coming soon',
      costTip: 'Est. cost: {n} credits/run',
      deepThinkToggle: 'Deep Thinking',
      deepThinkDisabledTip: 'Deep Thinking is disabled for image-to-image',
      productSpecial: 'Product',
      sendHint: 'Ctrl + Enter to send',
      inputPlaceholder:
        'Describe your scene, e.g. a sparkling soda on ice cubes with a sunny beach background...',
      dropHint: 'Drop image here to add',
      loadingText: 'Processing, please wait…',
      guideTitle: 'Quick guide / Why us',
      guideDesc:
        'For e-commerce products, you can fill the product profile on the left; for other cases, you can skip it and describe the scene in one line. Turn on Deep Thinking to refine prompts and composition. Multi-reference img2img keeps style and texture consistent.',
      guideKeywords: [
        'deep thinking model',
        'multi-reference img2img',
        'top image generation models',
        'commerce workflow',
        '4K download (Pro+)'
      ],
      guideFaqs: [
        {
          q: 'Do files get uploaded to a server?',
          a: 'Tools run locally in your browser by default. For AI generation/img2img, we send the required inputs (prompts/reference images) to the model service to produce results.'
        },
        {
          q: 'Where should I start for faster results?',
          a: 'Use img2img when you have references; use text-to-image for fast ideation. For commerce images, complete the product profile first.'
        },
        {
          q: 'What does Deep Thinking do?',
          a: 'It refines prompts and composition by adding lighting/material/quality cues. It also has memory: it can merge multiple turns of your inputs into one coherent request. Non-Deep Thinking accepts only single-turn input.'
        },
        {
          q: 'How to improve consistency and control?',
          a: 'Use multi-reference img2img: combine a product photo, a style reference, and a scene reference. Product profile fields further stabilize results.'
        },
        {
          q: 'What makes it different?',
          a: 'Deep Thinking improves prompts and composition; multi-reference generation for stronger control; and access to powerful mainstream image models for diverse styles.'
        }
      ]
    };
  });

  const categories = computed(() =>
    currentLang.value === 'zh'
      ? [
          '消费品/日用',
          '护肤美妆',
          '食品饮料',
          '3C数码',
          '家居家电',
          '服饰鞋包',
          '珠宝配饰',
          '母婴用品',
          '医疗健康',
          '汽车出行',
          '文创礼品',
          '工业产品',
          '教育服务',
          '软件/互联网',
          '其他'
        ]
      : [
          'Consumer Goods',
          'Beauty & Skincare',
          'Food & Beverage',
          'Electronics',
          'Home & Appliances',
          'Fashion',
          'Jewelry & Accessories',
          'Baby & Kids',
          'Health & Wellness',
          'Automotive',
          'Gifts & IP',
          'Industrial',
          'Education & Services',
          'Software & Internet',
          'Other'
        ]
  );

  return { ui, categories };
}
