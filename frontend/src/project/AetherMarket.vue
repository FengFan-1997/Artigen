<template>
  <div class="aether-market">
    <div class="noise-overlay"></div>

    <nav class="market-nav">
      <div class="logo">AETHER <span class="version">v3.0</span></div>
      <div class="links">
        <a
          href="#"
          :class="{ active: activeTab === 'market' }"
          @click.prevent="activeTab = 'market'"
          >Marketplace</a
        >
        <a
          href="#"
          :class="{ active: activeTab === 'create' }"
          @click.prevent="activeTab = 'create'"
          >AI Studio</a
        >
        <a href="#" :class="{ active: activeTab === 'drops' }" @click.prevent="activeTab = 'drops'"
          >Live Drops</a
        >
      </div>
      <div class="connect-btn" @click="connectWallet">
        <span v-if="!walletAddress">Connect Wallet</span>
        <span v-else class="wallet-address">
          <span class="status-dot"></span> {{ walletAddress }}
        </span>
      </div>
    </nav>

    <!-- Content Area -->
    <div class="content-container">
      <!-- Marketplace View -->
      <div v-if="activeTab === 'market'" class="view-market">
        <div class="hero-section">
          <div class="hero-content">
            <h1>AI-Generated <br /><span class="gradient-text">Digital Artifacts</span></h1>
            <p>
              Experience the first decentralized marketplace powered by Neural Style Transfer and
              Generative Adversarial Networks.
            </p>
            <div class="stats-row">
              <div class="stat">
                <span class="value">12.5k</span>
                <span class="label">Items</span>
              </div>
              <div class="stat">
                <span class="value">8.2 ETH</span>
                <span class="label">Floor</span>
              </div>
              <div class="stat">
                <span class="value">24h</span>
                <span class="label">Volume</span>
              </div>
            </div>
          </div>

          <div class="hero-visual" ref="canvasContainer">
            <!-- Three.js Canvas -->
          </div>
        </div>

        <div class="trending-section">
          <div class="section-header">
            <h2>Trending Collections</h2>
            <div class="filter-tabs">
              <span class="active">All</span>
              <span>Art</span>
              <span>Photography</span>
              <span>3D</span>
            </div>
          </div>
          <div class="card-grid">
            <div class="nft-card" v-for="(item, i) in marketItems" :key="i">
              <div
                class="card-image"
                :style="{
                  backgroundImage: `url(${item.image})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }"
              >
                <div class="ai-overlay">AI GENERATED</div>
                <div class="card-actions">
                  <button class="buy-btn" @click="buyItem(i)" :disabled="item.sold">
                    {{ item.sold ? 'OWNED' : 'BUY NOW' }}
                  </button>
                </div>
              </div>
              <div class="card-info">
                <div class="card-header-row">
                  <div class="card-title">{{ item.name }}</div>
                  <div class="card-likes">❤️ {{ item.likes }}</div>
                </div>
                <div class="card-price-row">
                  <div class="price-label">Current Price</div>
                  <div class="card-price"><span class="eth-icon">Ξ</span> {{ item.price }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Create/AI Studio View -->
      <div v-else-if="activeTab === 'create'" class="view-create">
        <div class="create-container">
          <div class="create-panel left">
            <h2>Neural Engine</h2>
            <p>Describe your vision and let our GANs hallucinate reality.</p>

            <div class="input-group">
              <label>Prompt</label>
              <textarea
                v-model="generationPrompt"
                placeholder="E.g., A cyberpunk city floating in a nebula, neon lights, 8k resolution..."
                rows="4"
              ></textarea>
            </div>

            <div class="input-group">
              <label>Style Model</label>
              <div class="style-options">
                <div
                  v-for="style in ['Cybernetic', 'Oil Painting', 'Vaporwave', 'Abstract']"
                  :key="style"
                  class="style-chip"
                  :class="{ active: selectedStyle === style }"
                  @click="selectedStyle = style"
                >
                  {{ style }}
                </div>
              </div>
            </div>

            <button class="generate-btn" @click="generateArtifact" :disabled="isGenerating">
              <span v-if="!isGenerating">✨ GENESIS</span>
              <span v-else>PROCESSING {{ progress }}%</span>
            </button>
          </div>

          <div class="create-panel right">
            <div class="preview-area" :class="{ 'has-content': generatedImage }">
              <div v-if="!generatedImage && !isGenerating" class="placeholder">
                <span>Preview will appear here</span>
              </div>
              <div v-else-if="isGenerating" class="generating-loader">
                <div class="scanner"></div>
                <div class="log-text">{{ generationLog }}</div>
              </div>
              <div v-else class="result-image" :style="`background: ${generatedImage}`">
                <div class="result-overlay">
                  <button class="mint-btn" @click="mintNFT">MINT TO WALLET (0.05 ETH)</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Live Drops View -->
      <div v-else-if="activeTab === 'drops'" class="view-drops">
        <div class="drops-container">
          <h2>Live Auctions</h2>
          <div class="auction-list">
            <div class="auction-item" v-for="n in 3" :key="n">
              <div class="auction-visual" :style="`background: hsl(${n * 60}, 70%, 20%)`"></div>
              <div class="auction-info">
                <h3>Quantum Glitch #{{ 900 + n }}</h3>
                <div class="countdown">
                  Ending in: <span class="mono">0{{ 4 - n }}:2{{ n * 5 }}:12</span>
                </div>
                <div class="bid-row">
                  <span>Highest Bid:</span>
                  <span class="highlight">{{ 2.5 + n * 0.5 }} ETH</span>
                </div>
                <button class="bid-btn">PLACE BID</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue';
import * as THREE from 'three';

const activeTab = ref('market');
const walletAddress = ref('');
const canvasContainer = ref<HTMLElement | null>(null);

// Market Data
interface MarketItem {
  name: string;
  price: string;
  likes: number;
  image: string;
  sold: boolean;
  creator: string;
}

const marketItems = ref<MarketItem[]>([]);

const fetchMarketData = async () => {
  // Simulate API delay for authenticity
  await new Promise((resolve) => setTimeout(resolve, 600));

  marketItems.value = [
    {
      name: 'Cyber Skull #1024',
      price: '0.85',
      likes: 1204,
      image:
        'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=600&auto=format&fit=crop',
      sold: false,
      creator: '0x3f...a1b2'
    },
    {
      name: 'Neon Genesis',
      price: '1.20',
      likes: 892,
      image:
        'https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?q=80&w=600&auto=format&fit=crop',
      sold: false,
      creator: 'CryptoArt'
    },
    {
      name: 'Abstract Mind',
      price: '0.50',
      likes: 450,
      image:
        'https://images.unsplash.com/photo-1618172193622-ae2d025f4032?q=80&w=600&auto=format&fit=crop',
      sold: true,
      creator: 'DeepDream'
    },
    {
      name: 'Digital Horizon',
      price: '2.15',
      likes: 2100,
      image:
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop',
      sold: false,
      creator: 'FutureVis'
    },
    {
      name: 'Glitch Portrait',
      price: '0.99',
      likes: 670,
      image:
        'https://images.unsplash.com/photo-1549490349-8643362247b5?q=80&w=600&auto=format&fit=crop',
      sold: false,
      creator: 'GlitchMaster'
    },
    {
      name: 'Vaporwave City',
      price: '1.50',
      likes: 1500,
      image:
        'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=600&auto=format&fit=crop',
      sold: false,
      creator: 'RetroWave'
    },
    {
      name: 'Crystal Void',
      price: '3.00',
      likes: 3200,
      image:
        'https://images.unsplash.com/photo-1614726365723-49cfa0950ecb?q=80&w=600&auto=format&fit=crop',
      sold: false,
      creator: 'GemHunter'
    },
    {
      name: 'Ethereal Being',
      price: '4.50',
      likes: 4100,
      image:
        'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=600&auto=format&fit=crop',
      sold: true,
      creator: 'SpiritAI'
    }
  ];
};

// Create/Generate Data
const generationPrompt = ref('');
const selectedStyle = ref('Cybernetic');
const isGenerating = ref(false);
const progress = ref(0);
const generationLog = ref('Initializing...');
const generatedImage = ref('');

// Three.js Vars
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let animationId: number;
let cube: THREE.Mesh;

// Actions
const connectWallet = () => {
  if (walletAddress.value) return;
  // Simulate connection
  const mockAddr = '0x71C...9A23';
  walletAddress.value = 'Connecting...';
  setTimeout(() => {
    walletAddress.value = mockAddr;
  }, 1000);
};

const buyItem = (index: number) => {
  if (!walletAddress.value) {
    alert('Please connect wallet first!');
    return;
  }
  marketItems.value[index].sold = true;
};

const generateArtifact = () => {
  if (!generationPrompt.value) return;
  isGenerating.value = true;
  generatedImage.value = '';
  progress.value = 0;

  const logs = [
    'Parsing semantics...',
    'Loading VQGAN models...',
    'Optimizing latent space...',
    'Applying style transfer...',
    'Rendering final output...'
  ];

  let step = 0;
  const interval = setInterval(() => {
    progress.value += 10;
    if (step < logs.length && progress.value % 20 === 0) {
      generationLog.value = logs[step];
      step++;
    }

    if (progress.value >= 100) {
      clearInterval(interval);
      isGenerating.value = false;
      // Generate a random gradient as the "result"
      const hue = Math.floor(Math.random() * 360);
      generatedImage.value = `linear-gradient(${Math.random() * 360}deg, hsl(${hue}, 80%, 50%), #000)`;
    }
  }, 400);
};

const mintNFT = () => {
  if (!walletAddress.value) {
    alert('Connect wallet to mint!');
    return;
  }
  alert('Minting transaction submitted to Ethereum Mainnet!');
};

// Three.js Logic
const initThree = () => {
  if (!canvasContainer.value) return;

  // Clear previous if any
  while (canvasContainer.value.firstChild) {
    canvasContainer.value.removeChild(canvasContainer.value.firstChild);
  }

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.z = 2.5;

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(400, 400); // Fixed size for hero visual
  canvasContainer.value.appendChild(renderer.domElement);

  const geometry = new THREE.TorusKnotGeometry(0.6, 0.2, 100, 16);
  const material = new THREE.MeshNormalMaterial({ wireframe: true });
  cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  const light = new THREE.PointLight(0xffffff, 1);
  light.position.set(5, 5, 5);
  scene.add(light);
};

const animate = () => {
  animationId = requestAnimationFrame(animate);
  if (cube) {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
  }
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
};

// Watch active tab to re-init Three.js if needed (since it's in the DOM)
watch(activeTab, (newVal) => {
  if (newVal === 'market') {
    nextTick(() => {
      initThree();
    });
  }
});

onMounted(() => {
  fetchMarketData();
  initThree();
  animate();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  if (renderer) renderer.dispose();
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Space+Grotesk:wght@300;400;600&display=swap');

.aether-market {
  min-height: 100vh;
  background: #0a0a0a;
  color: #e0e0e0;
  font-family: 'Space Grotesk', sans-serif;
  overflow-x: hidden;
  padding-bottom: 50px;
}

/* Remove noise overlay for cleaner look */
.noise-overlay {
  display: none;
}

.market-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 50px;
  position: sticky;
  top: 0;
  background: #0a0a0a;
  z-index: 100;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.logo {
  font-family: 'Playfair Display', serif;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #fff;
}

.version {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.7rem;
  color: #666;
  margin-left: 8px;
  vertical-align: middle;
}

.links {
  display: flex;
  gap: 40px;
}

.links a {
  color: #888;
  text-decoration: none;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  transition: color 0.3s;
  padding: 5px 0;
  position: relative;
}

.links a::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: #fff;
  transition: width 0.3s ease;
}

.links a:hover,
.links a.active {
  color: #fff;
}

.links a:hover::after,
.links a.active::after {
  width: 100%;
}

.connect-btn {
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 12px 24px;
  border-radius: 0; /* Sharp corners */
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.3s;
  background: transparent;
  color: #fff;
}

.connect-btn:hover {
  background: #fff;
  color: #000;
  border-color: #fff;
}

.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #fff; /* White dot instead of green */
  border-radius: 50%;
  margin-right: 8px;
}

/* Hero Section */
.hero-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 80px 100px;
  min-height: 60vh;
  position: relative;
  z-index: 1;
}

.hero-content {
  max-width: 600px;
}

h1 {
  font-family: 'Playfair Display', serif;
  font-size: 4.5rem;
  line-height: 1.1;
  margin-bottom: 30px;
  color: #fff;
  font-weight: 400;
}

.gradient-text {
  /* Remove gradient, use italic serif for emphasis */
  background: none;
  -webkit-text-fill-color: initial;
  color: #fff;
  font-style: italic;
  font-weight: 400;
}

.stats-row {
  display: flex;
  gap: 60px;
  margin-top: 60px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 30px;
}

.stat {
  display: flex;
  flex-direction: column;
}

.stat .value {
  font-size: 2rem;
  font-weight: 300;
  font-family: 'Playfair Display', serif;
  color: #fff;
}

.stat .label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #666;
  margin-top: 5px;
}

.hero-visual {
  width: 400px;
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8; /* Subtle visual */
  filter: grayscale(100%); /* Make 3D object grayscale */
  transition: filter 0.5s ease;
}

.hero-visual:hover {
  filter: grayscale(0%);
}

/* Trending Section */
.trending-section {
  padding: 0 100px 80px;
  position: relative;
  z-index: 1;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 50px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 20px;
}

h2 {
  font-family: 'Playfair Display', serif;
  font-size: 2.5rem;
  font-weight: 400;
  margin: 0;
  color: #fff;
}

.filter-tabs {
  display: flex;
  gap: 30px;
}

.filter-tabs span {
  cursor: pointer;
  color: #666;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.3s;
}

.filter-tabs span.active,
.filter-tabs span:hover {
  color: #fff;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px; /* Tighter grid */
}

.nft-card {
  background: #0f0f0f;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0; /* Sharp corners */
  overflow: hidden;
  transition: all 0.4s ease;
  position: relative;
}

.nft-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.2);
  background: #141414;
}

.card-image {
  height: 300px; /* Taller images */
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: grayscale(100%);
  transition: filter 0.5s ease;
}

.nft-card:hover .card-image {
  filter: grayscale(0%);
}

.ai-overlay {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #000;
  color: #fff;
  padding: 4px 8px;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: none;
}

.card-actions {
  opacity: 0;
  transition: opacity 0.3s;
  position: absolute;
  bottom: 20px;
  width: 100%;
  display: flex;
  justify-content: center;
}

.card-image:hover .card-actions {
  opacity: 1;
}

.buy-btn {
  background: #fff;
  color: #000;
  border: none;
  padding: 12px 30px;
  border-radius: 0;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
}

.buy-btn:disabled {
  background: #222;
  color: #555;
  cursor: not-allowed;
}

.card-info {
  padding: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.card-header-row,
.card-price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-price-row {
  margin-bottom: 0;
  margin-top: 15px;
}

.card-title {
  font-family: 'Playfair Display', serif;
  font-weight: 500;
  font-size: 1.1rem;
  color: #fff;
}

.card-likes {
  font-size: 0.75rem;
  color: #666;
}

.price-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #555;
}

.card-price {
  font-weight: 400;
  color: #fff;
  font-family: 'Space Grotesk', sans-serif;
}

.eth-icon {
  color: #888;
  margin-right: 4px;
}

/* Create View */
.view-create {
  padding: 60px 100px;
  position: relative;
  z-index: 1;
}

.create-container {
  display: flex;
  gap: 80px;
  max-width: 1400px;
  margin: 0 auto;
}

.create-panel {
  flex: 1;
}

.input-group {
  margin-bottom: 40px;
}

.input-group label {
  display: block;
  margin-bottom: 12px;
  color: #888;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

textarea {
  width: 100%;
  background: #0f0f0f;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 20px;
  border-radius: 0;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1rem;
  resize: none;
  transition: border-color 0.3s;
}

textarea:focus {
  outline: none;
  border-color: #fff;
}

.style-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.style-chip {
  padding: 10px 20px;
  background: #0f0f0f;
  border-radius: 0;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #888;
  transition: all 0.3s;
}

.style-chip:hover {
  border-color: #666;
  color: #ccc;
}

.style-chip.active {
  background: #fff;
  border-color: #fff;
  color: #000;
}

.generate-btn {
  width: 100%;
  padding: 20px;
  background: #fff;
  border: none;
  border-radius: 0;
  color: #000;
  font-weight: 600;
  letter-spacing: 0.2em;
  cursor: pointer;
  font-size: 0.9rem;
  text-transform: uppercase;
  transition: background 0.3s;
}

.generate-btn:hover {
  background: #e0e0e0;
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.preview-area {
  width: 100%;
  aspect-ratio: 1;
  background: #050505;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.preview-area.has-content {
  border-color: #fff;
}

.generating-loader {
  text-align: center;
}

.scanner {
  width: 40px;
  height: 40px;
  border: 2px solid #333;
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 24px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.log-text {
  font-family: 'Space Grotesk', monospace;
  color: #666;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.result-image {
  width: 100%;
  height: 100%;
  position: relative;
}

.result-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 30px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
  display: flex;
  justify-content: center;
}

.mint-btn {
  background: #fff;
  color: #000;
  border: none;
  padding: 12px 30px;
  border-radius: 0;
  font-weight: 600;
  letter-spacing: 0.1em;
  cursor: pointer;
  text-transform: uppercase;
  font-size: 0.8rem;
}

/* Drops View */
.view-drops {
  padding: 60px 100px;
  z-index: 1;
  position: relative;
}

.auction-list {
  display: grid;
  gap: 1px; /* Divider look */
  background: rgba(255, 255, 255, 0.1); /* Divider color */
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 40px;
}

.auction-item {
  display: flex;
  gap: 40px;
  background: #0a0a0a;
  padding: 40px;
  border-radius: 0;
}

.auction-visual {
  width: 180px;
  height: 180px;
  border-radius: 0;
  filter: grayscale(100%);
}

.auction-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.auction-info h3 {
  font-family: 'Playfair Display', serif;
  font-size: 2rem;
  margin-bottom: 15px;
  color: #fff;
}

.countdown {
  font-size: 1rem;
  margin-bottom: 25px;
  color: #888;
  font-family: monospace;
}

.bid-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 25px;
}

.highlight {
  font-size: 1.5rem;
  font-weight: 300;
  color: #fff;
  font-family: 'Playfair Display', serif;
}

.bid-btn {
  background: transparent;
  border: 1px solid #fff;
  color: #fff;
  padding: 12px 30px;
  border-radius: 0;
  cursor: pointer;
  align-self: flex-start;
  transition: all 0.3s;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.8rem;
}

.bid-btn:hover {
  background: #fff;
  color: #000;
}

/* Responsive */
@media (max-width: 1024px) {
  .hero-section {
    flex-direction: column;
    padding: 60px 40px;
    text-align: center;
  }

  .stats-row {
    justify-content: center;
    border-top: none;
    margin-top: 40px;
  }

  .trending-section,
  .view-create,
  .view-drops {
    padding: 40px;
  }

  .create-container {
    flex-direction: column;
  }
}

@media (max-width: 600px) {
  .market-nav {
    padding: 15px 20px;
  }

  .hero-section {
    padding: 30px 20px;
  }

  .trending-section,
  .view-create,
  .view-drops {
    padding: 0 20px 50px;
  }

  .links {
    display: none; /* Hide nav links on mobile or use a menu */
  }

  h1 {
    font-size: 2.5rem;
  }

  .hero-visual {
    width: 100%;
    height: 300px;
  }
}
</style>
