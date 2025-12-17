import { createRouter, createWebHistory } from 'vue-router';
import Ingredient from '../Ingredient/index.vue';
import ChristmasTree from '../ChristmasTree/index.vue';
import PortfolioHome from '../views/PortfolioHome.vue';
import GeminiChat from '../project/GeminiChat.vue';
import Translator from '../project/Translator.vue';
import StoryTeller from '../project/StoryTeller.vue';
import ResumeForge from '../project/ResumeForge.vue';
import CodeGuardian from '../project/CodeGuardian.vue';
import TravelPlanner from '../project/TravelPlanner.vue';
import NexusDashboard from '../project/NexusDashboard.vue';
import AetherMarket from '../project/AetherMarket.vue';
import AiPptGen from '../project/AiPptGen.vue';
import SecretLove from '../project/SecretLove.vue';
import GalaxyPage from '../components/secret/pages/GalaxyPage.vue';
import SeaOfStarsPage from '../components/secret/pages/SeaOfStarsPage.vue';
import CrystalWorldPage from '../components/secret/pages/CrystalWorldPage.vue';
import MatrixRainPage from '../components/secret/pages/MatrixRainPage.vue';
import FireworksPage from '../components/secret/pages/FireworksPage.vue';
import QuantumFieldPage from '../components/secret/pages/QuantumFieldPage.vue';
import BlackHolePage from '../components/secret/pages/BlackHolePage.vue';
import TimeTunnelPage from '../components/secret/pages/TimeTunnelPage.vue';
import NebulaPage from '../components/secret/pages/NebulaPage.vue';
import SakuraPage from '../components/secret/pages/SakuraPage.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/ai-ppt',
      name: 'ai-ppt',
      component: AiPptGen
    },
    {
      path: '/secret-garden',
      name: 'secret-garden',
      component: SecretLove
    },
    {
      path: '/secret/galaxy',
      name: 'galaxy',
      component: GalaxyPage
    },
    {
      path: '/secret/sea',
      name: 'sea',
      component: SeaOfStarsPage
    },
    {
      path: '/secret/crystal',
      name: 'crystal',
      component: CrystalWorldPage
    },
    {
      path: '/secret/matrix',
      name: 'matrix',
      component: MatrixRainPage
    },
    {
      path: '/secret/fireworks',
      name: 'fireworks',
      component: FireworksPage
    },
    {
      path: '/secret/quantum',
      name: 'quantum',
      component: QuantumFieldPage
    },
    {
      path: '/secret/blackhole',
      name: 'blackhole',
      component: BlackHolePage
    },
    {
      path: '/secret/tunnel',
      name: 'tunnel',
      component: TimeTunnelPage
    },
    {
      path: '/secret/nebula',
      name: 'nebula',
      component: NebulaPage
    },
    {
      path: '/secret/sakura',
      name: 'sakura',
      component: SakuraPage
    },
    {
      path: '/',
      name: 'home',
      component: PortfolioHome
    },
    {
      path: '/portfolio-home',
      name: 'portfolio-home',
      component: PortfolioHome
    },
    {
      path: '/gemini-chat',
      name: 'gemini-chat',
      component: GeminiChat
    },
    {
      path: '/translator',
      name: 'translator',
      component: Translator
    },
    {
      path: '/storyteller',
      name: 'storyteller',
      component: StoryTeller
    },
    {
      path: '/ingredient',
      name: 'ingredient',
      component: Ingredient
    },
    {
      path: '/christmas-tree',
      name: 'christmas-tree',
      component: ChristmasTree
    },
    {
      path: '/resume-forge',
      name: 'resume-forge',
      component: ResumeForge
    },
    {
      path: '/code-guardian',
      name: 'code-guardian',
      component: CodeGuardian
    },
    {
      path: '/travel-planner',
      name: 'travel-planner',
      component: TravelPlanner
    },
    {
      path: '/nexus-dashboard',
      name: 'nexus-dashboard',
      component: NexusDashboard
    },
    {
      path: '/aether-market',
      name: 'aether-market',
      component: AetherMarket
    }
  ]
});

export default router;
