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
          '从模板开始或描述商品画面，按商品、风格、场景上传参考图；服务端报价确认后才会创建任务。',
        memory: '历史记录',
        noHistory: '暂无历史记录',
        resultTitle: '生成结果',
        positivePrompt: '正向提示词',
        negativePrompt: '反向提示词',
        imageLabel: '图片',
        imageMissing: '图片已失效',
        imageMissingShort: '已失效',
        imageMissingSub: '原图暂时无法加载',
        generationFailed: '生成失败，请稍后再试',
        generationCancelled: '已取消',
        statusFailed: '失败',
        statusCancelled: '已取消',
        statusPending: '处理中',
        download: '下载',
        reference: '引用',
        edit: '编辑',
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
          '先补齐产品档案，再按商品、风格、场景添加参考图。快速生成直接出图；深度思考会先单独生成 4 个视觉方向，选择后再次确认生成。每一步都独立报价。',
        guideKeywords: [
          '4 个视觉方向',
          '三类语义参考图',
          '标准生成',
          '电商产品工作流',
          '失败自动退款'
        ],
        guideFaqs: [
          {
            q: '深度思考有什么用？',
            a: '深度思考会先生成 4 个可编辑视觉方向，这一步单独报价 5 点；只有选择方向并再次确认后，才会创建 10 点的出图任务。'
          },
          {
            q: '从哪里开始更快？',
            a: '有参考图就用图生图；只有想法就用文生图。做电商图建议先填产品档案，再选择风格/场景。'
          },
          {
            q: '怎么提高一致性与可控性？',
            a: '当前免费标准模型仅支持文生图。你可以填写产品档案与需求，生成后进入 Editor V2 继续编辑。'
          },
          {
            q: '我们的优势是什么？',
            a: '围绕商品视觉把产品档案、三类参考图、方向探索、标准生成、编辑器与下载串成可恢复、可取消、可退款的工作流。'
          },
          {
            q: '文件会上传到服务器吗？',
            a: '工具相关功能默认在浏览器本地处理；AI 设计在生成/图生图时会将必要信息（提示词/参考图）发送到模型服务完成生成。'
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
        'Start with a recipe or describe a product visual. The current free standard model supports text-to-image only, and a task starts only after you confirm the server quote.',
      memory: 'History',
      noHistory: 'No history yet',
      resultTitle: 'Result',
      positivePrompt: 'Positive Prompt',
      negativePrompt: 'Negative Prompt',
      imageLabel: 'Image',
      imageMissing: 'Image unavailable',
      imageMissingShort: 'Missing',
      imageMissingSub: 'The original image could not be loaded.',
      generationFailed: 'Generation failed. Please try again later.',
      generationCancelled: 'Cancelled',
      statusFailed: 'Failed',
      statusCancelled: 'Cancelled',
      statusPending: 'Pending',
      download: 'Download',
      reference: 'Reference',
      edit: 'Edit',
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
        'Complete the product profile and describe the visual. Generate creates an image directly; Deep Thinking first creates four separately quoted directions, then asks again before generating.',
      guideKeywords: [
        'four visual directions',
        'text-to-image',
        'standard generation',
        'commerce workflow',
        'automatic refunds'
      ],
      guideFaqs: [
        {
          q: 'What does Deep Thinking do?',
          a: 'It creates four editable visual directions as a separately quoted 5-credit task. An image is generated only after you select a direction and confirm the separate 10-credit task.'
        },
        {
          q: 'Where should I start for faster results?',
          a: 'The current free standard model supports text-to-image only. Complete the product profile first for more controlled commerce prompts.'
        },
        {
          q: 'How to improve consistency and control?',
          a: 'Reference-image generation is currently unavailable because it would require a non-approved model. Use product profile fields and then refine the result in Editor V2.'
        },
        {
          q: 'What makes it different?',
          a: 'It connects product profiles, direction exploration, standard text-to-image generation, Editor V2, and downloads in one recoverable, cancellable, refundable workflow.'
        },
        {
          q: 'Do files get uploaded to a server?',
          a: 'Tools run locally in your browser by default. For AI generation, we send the confirmed prompt to the model service to produce the result.'
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
