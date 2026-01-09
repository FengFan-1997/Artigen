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
import AetherMarket from '../agentImg/views/AetherMarket.vue';
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
import AgentDebug from '../views/AgentDebug.vue';
import RoomPage from '../room/RoomPage.vue';
import LandingPage from '../agentImg/views/LandingPage.vue';
import FormatFactory from '../agentImg/views/FormatFactory.vue';
import TermsOfService from '../agentImg/views/legal/TermsOfService.vue';
import PrivacyPolicy from '../agentImg/views/legal/PrivacyPolicy.vue';
import RefundPolicy from '../agentImg/views/legal/RefundPolicy.vue';
import AgentImg from '../agentImg/index.vue';
import { loginRoutes } from '../login/routes';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: PortfolioHome
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
      component: LandingPage
    },
    {
      path: '/artigen/format-factory',
      name: 'format-factory',
      component: FormatFactory
    },
    {
      path: '/artigen/legal/terms',
      name: 'terms',
      component: TermsOfService
    },
    {
      path: '/artigen/legal/privacy',
      name: 'privacy',
      component: PrivacyPolicy
    },
    {
      path: '/artigen/legal/refund',
      name: 'refund',
      component: RefundPolicy
    },
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
      path: '/artigen/market',
      name: 'aether-market',
      component: AetherMarket
    },
    {
      path: '/room',
      name: 'room',
      component: RoomPage
    },
    {
      path: '/agent-debug',
      name: 'agent-debug',
      component: AgentDebug
    },
    {
      path: '/artigen/ai',
      name: 'agent-img-tool',
      component: AgentImg
    },
    {
      path: '/console',
      component: () => import('@/console/ConsoleLayout.vue'),
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
    ...loginRoutes
  ]
});

export default router;
