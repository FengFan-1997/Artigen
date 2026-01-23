<template>
  <aside class="side" :class="{ 'mobile-open': isOpen }">
    <div class="scroll-container">
      <section class="card settings-card">
        <div class="card-title">{{ ui.productProfile }}</div>

        <div class="form-group">
          <div class="field">
            <div class="label">{{ ui.productName }}</div>
            <input
              v-model="productName"
              class="control"
              type="text"
              :placeholder="ui.productNamePh"
              :disabled="loading"
            />
          </div>
          <div class="field">
            <div class="label">{{ ui.brandName }}</div>
            <input
              v-model="brandName"
              class="control"
              type="text"
              :placeholder="ui.brandNamePh"
              :disabled="loading"
            />
          </div>
        </div>

        <div class="field">
          <div class="label">{{ ui.productCategory }}</div>
          <div class="custom-select" v-click-outside="closeCategoryDropdown">
            <div
              class="custom-select-trigger"
              :class="{ 'is-open': categoryOpen, disabled: loading }"
              @click="!loading && toggleCategoryDropdown()"
            >
              <span class="selected-text" :class="{ placeholder: !productCategory }">
                {{ productCategory || ui.categoryPh }}
              </span>
              <span class="arrow-icon">▼</span>
            </div>
            <transition name="dropdown-fade">
              <div v-if="categoryOpen" class="custom-options">
                <div
                  class="custom-option"
                  :class="{ selected: !productCategory }"
                  @click="selectCategory('')"
                >
                  {{ ui.categoryPh }}
                </div>
                <div
                  v-for="c in categories"
                  :key="c"
                  class="custom-option"
                  :class="{ selected: productCategory === c }"
                  @click="selectCategory(c)"
                >
                  {{ c }}
                </div>
              </div>
            </transition>
          </div>
        </div>

        <div class="field">
          <div class="label">{{ ui.material }}</div>
          <input
            v-model="material"
            class="control"
            type="text"
            :placeholder="ui.materialPh"
            :disabled="loading"
          />
        </div>

        <div class="card-divider"></div>
        <div class="card-title">{{ ui.visualStyle }}</div>

        <div class="field">
          <div class="label">{{ ui.designElements }}</div>
          <div class="chips-row" v-if="designElements.length">
            <div
              v-for="tag in designElements"
              :key="tag"
              class="chip active"
              @click="toggleDesignElement(tag)"
            >
              {{ tag }} ×
            </div>
          </div>
          <div class="tag-add-row">
            <input
              v-model="newDesignElement"
              class="control"
              type="text"
              :placeholder="ui.add + '...'"
              :disabled="loading"
              @keydown.enter.prevent="addDesignElement"
            />
            <button class="ghost" @click="addDesignElement" :disabled="loading">+</button>
          </div>
        </div>

        <div class="field">
          <div class="label">{{ ui.style }}</div>
          <div class="chips-row" v-if="styles.length">
            <div v-for="tag in styles" :key="tag" class="chip active" @click="toggleStyle(tag)">
              {{ tag }} ×
            </div>
          </div>
          <div class="tag-add-row">
            <input
              v-model="newStyle"
              class="control"
              type="text"
              :placeholder="ui.add + '...'"
              :disabled="loading"
              @keydown.enter.prevent="addStyle"
            />
            <button class="ghost" @click="addStyle" :disabled="loading">+</button>
          </div>
        </div>

        <div class="field">
          <div class="label">{{ ui.colorScheme }}</div>
          <div class="chips-row" v-if="colors.length">
            <div v-for="tag in colors" :key="tag" class="chip active" @click="toggleColor(tag)">
              {{ tag }} ×
            </div>
          </div>
          <div class="tag-add-row">
            <input
              v-model="newColor"
              class="control"
              type="text"
              :placeholder="ui.add + '...'"
              :disabled="loading"
              @keydown.enter.prevent="addColor"
            />
            <button class="ghost" @click="addColor" :disabled="loading">+</button>
          </div>
        </div>

        <div v-show="false">
          <div class="card-divider"></div>
          <div class="card-title">{{ ui.brandAssets }}</div>

          <div class="field">
            <div class="label">{{ ui.logoFile }}</div>
            <div class="file-input-wrapper">
              <input
                type="file"
                accept="image/png,image/svg+xml"
                @change="onLogoChange"
                :disabled="loading"
              />
              <div class="file-trigger" :class="{ 'has-file': logoFileName }">
                <span v-if="logoFileName" class="file-name">{{ logoFileName }}</span>
                <span v-else class="placeholder">{{ ui.logoUploadPh }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="side-footer">
      <button class="primary side-action-btn" @click="emit('primary')" :disabled="!canPrimary">
        <span v-if="loading" class="loading-spinner"></span>
        <span v-else>{{ primaryText }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAgentImgSettingsStore } from '@/agentImg/stores/settings';

defineProps<{
  ui: any;
  isOpen: boolean;
  loading: boolean;
  canPrimary: boolean;
  primaryText: string;
  categories: string[];
}>();

const emit = defineEmits<{
  (e: 'primary'): void;
}>();

const settingsStore = useAgentImgSettingsStore();
const {
  productName,
  productCategory,
  material,
  brandName,
  logoFileName,
  designElements,
  styles,
  colors
} = storeToRefs(settingsStore);
const { toggleDesignElement, toggleStyle, toggleColor, setLogoFile } = settingsStore;

const newDesignElement = ref('');
const newStyle = ref('');
const newColor = ref('');
const categoryOpen = ref(false);

const toggleCategoryDropdown = () => {
  categoryOpen.value = !categoryOpen.value;
};

const closeCategoryDropdown = () => {
  categoryOpen.value = false;
};

const selectCategory = (c: string) => {
  productCategory.value = c;
  closeCategoryDropdown();
};

const vClickOutside = {
  mounted(el: any, binding: any) {
    el.clickOutsideEvent = (event: Event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value(event);
      }
    };
    document.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el: any) {
    document.removeEventListener('click', el.clickOutsideEvent);
  }
};

const addDesignElement = () => {
  if (newDesignElement.value.trim()) {
    toggleDesignElement(newDesignElement.value.trim());
    newDesignElement.value = '';
  }
};

const addStyle = () => {
  if (newStyle.value.trim()) {
    toggleStyle(newStyle.value.trim());
    newStyle.value = '';
  }
};

const addColor = () => {
  if (newColor.value.trim()) {
    toggleColor(newColor.value.trim());
    newColor.value = '';
  }
};

const onLogoChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    setLogoFile(input.files[0]);
  }
};
</script>

<style scoped>
/* Scoped styles for ProductSidebar if needed */

/* Custom Select Styles */
.custom-select {
  position: relative;
  width: 100%;
}

.custom-select-trigger {
  width: 100%;
  height: 48px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  padding: 0 12px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.custom-select-trigger:hover:not(.disabled) {
  border-color: rgba(204, 255, 0, 0.5);
  background: rgba(255, 255, 255, 0.02);
}

.custom-select-trigger.is-open {
  border-color: var(--primary);
  background: rgba(204, 255, 0, 0.05);
}

.custom-select-trigger.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.selected-text.placeholder {
  color: var(--text-muted);
}

.arrow-icon {
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.2s;
}

.custom-select-trigger.is-open .arrow-icon {
  transform: rotate(180deg);
  color: var(--primary);
}

.custom-options {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #111; /* Deep dark background */
  border: 1px solid var(--border-color);
  border-radius: 8px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 999;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
}

.custom-option {
  padding: 8px 12px;
  font-size: 16px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.custom-option:hover {
  background: rgba(204, 255, 0, 0.1);
  color: var(--text-main);
}

.custom-option.selected {
  background: rgba(204, 255, 0, 0.15);
  color: var(--primary);
  font-weight: 600;
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 500px) {
  .card-title {
    font-size: 14px !important;
    margin-bottom: 12px !important;
  }

  .label {
    font-size: 12px !important;
    margin-bottom: 6px !important;
  }

  .control {
    height: 36px !important;
    font-size: 13px !important;
    padding: 0 10px !important;
  }

  .custom-select-trigger {
    height: 36px !important;
    font-size: 13px !important;
    padding: 0 10px !important;
  }

  .custom-option {
    font-size: 13px !important;
    padding: 6px 10px !important;
  }

  .chip {
    height: 24px !important;
    font-size: 12px !important;
    padding: 0 8px !important;
  }
}
</style>
