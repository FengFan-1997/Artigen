<template>
  <div class="image-editor-page">
    <div ref="editorShellRef" class="editor-shell">
      <div class="editor-topbar">
        <div class="topbar-left">
          <button class="topbar-btn" type="button" @click="goBack" :title="ui.back">
            <ArrowLeftOutlined />
          </button>
          <div class="topbar-title">
            <span class="topbar-title-main">{{ ui.title }}</span>
            <span class="topbar-badge">BETA</span>
          </div>
        </div>

        <div class="topbar-center">
          <button
            class="topbar-btn"
            type="button"
            :disabled="!canUndo"
            @click="undo"
            :title="ui.undo"
          >
            <UndoOutlined />
          </button>
          <button
            class="topbar-btn"
            type="button"
            :disabled="!canRedo"
            @click="redo"
            :title="ui.redo"
          >
            <RedoOutlined />
          </button>
        </div>

        <div class="topbar-right">
          <input
            ref="fileInputRef"
            class="file-input"
            type="file"
            accept="image/*"
            @change="onPick"
          />
          <button class="topbar-btn" type="button" @click="triggerPick" :title="ui.import">
            <UploadOutlined />
          </button>
          <button
            class="topbar-btn"
            type="button"
            :disabled="!hasLayers"
            @click="exportImage"
            :title="ui.export"
          >
            <DownloadOutlined />
          </button>
          <button
            class="topbar-btn mobile-only"
            type="button"
            @click="toggleMobilePanel('layers')"
            :title="ui.layers"
          >
            <BarsOutlined />
          </button>
          <button
            class="topbar-btn mobile-only"
            type="button"
            @click="toggleMobilePanel('tools')"
            :title="ui.tools"
          >
            <AppstoreOutlined />
          </button>
        </div>
      </div>
      <div v-if="editorTip" class="editor-tip">{{ editorTip }}</div>
      <div v-if="mobilePanel" class="mobile-panel-mask" @click="closeMobilePanel"></div>

      <div class="editor-body">
        <aside class="panel left" :class="{ 'mobile-panel-open': mobilePanel === 'layers' }">
          <div class="panel-header">
            <div class="panel-title">{{ ui.layers }}</div>
            <button
              class="panel-btn"
              type="button"
              :disabled="!hasLayers"
              @click="removeSelected"
              :title="ui.delete"
            >
              <DeleteOutlined />
            </button>
          </div>

          <div class="layers-list">
            <div
              v-for="layer in layers"
              :key="layer.id"
              class="layer-item"
              :class="{ active: layer.id === selectedLayerId }"
              role="button"
              tabindex="0"
              @click="selectLayer(layer.id)"
              @keydown.enter.prevent="selectLayer(layer.id)"
              @keydown.space.prevent="selectLayer(layer.id)"
            >
              <div class="layer-thumb">
                <img
                  v-if="layer.type === 'image'"
                  class="layer-thumb-img"
                  :src="layer.src"
                  alt=""
                />
              </div>
              <div class="layer-meta">
                <div class="layer-name">{{ layer.name }}</div>
                <div class="layer-sub">
                  {{ layer.type.toUpperCase() }}
                  <span v-if="layer.naturalWidth && layer.naturalHeight">
                    · {{ layer.naturalWidth }}×{{ layer.naturalHeight }}
                  </span>
                </div>
              </div>
              <div class="layer-actions">
                <button
                  class="icon-btn"
                  type="button"
                  :aria-label="ui.layerMenu"
                  @click.stop="toggleLayerMenu(layer.id, $event)"
                >
                  <MoreOutlined />
                </button>
                <button
                  class="icon-btn"
                  type="button"
                  :aria-label="layer.visible ? ui.hide : ui.show"
                  @click.stop="toggleVisible(layer.id)"
                >
                  <EyeOutlined v-if="layer.visible" />
                  <EyeInvisibleOutlined v-else />
                </button>
                <button
                  class="icon-btn"
                  type="button"
                  :aria-label="layer.locked ? ui.unlock : ui.lock"
                  @click.stop="toggleLocked(layer.id)"
                >
                  <LockOutlined v-if="layer.locked" />
                  <UnlockOutlined v-else />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main class="stage-wrap">
          <div
            ref="stageRef"
            class="stage"
            :class="{ 'pan-mode': spacePressed || isPanMode, panning: isPanning }"
            @dragover.prevent
            @drop.prevent="onStageDrop"
            @wheel.prevent="onStageWheel"
            @pointerdown="onStagePointerDown"
            @pointermove="onStagePointerMove"
            @pointerup="onStagePointerUp"
            @pointercancel="onStagePointerUp"
            @pointerleave="onStagePointerUp"
          >
            <div v-if="!hasLayers" class="stage-empty">
              <div class="stage-empty-title">{{ ui.emptyTitle }}</div>
              <div class="stage-empty-sub">{{ ui.emptySub }}</div>
              <button class="empty-btn" type="button" @click="triggerPick">{{ ui.import }}</button>
            </div>

            <template v-else>
              <div class="viewport" :style="viewportStyle">
                <div class="canvas-host">
                  <div class="canvas-root" :style="canvasBoundaryStyle">
                    <img
                      v-for="layer in renderLayers"
                      :key="layer.id"
                      class="stage-image"
                      :class="{ active: layer.id === selectedLayerId }"
                      :src="layer.src"
                      :style="layerStyle(layer)"
                      alt=""
                      draggable="false"
                      @pointerdown.stop="onLayerPointerDown($event, layer.id)"
                    />
                    <div
                      v-if="toolMode === 'crop'"
                      ref="cropOverlayRef"
                      class="crop-overlay"
                      @pointerdown="onCropOverlayPointerDown"
                      @pointermove="onCropOverlayPointerMove"
                      @pointerup="onCropOverlayPointerUp"
                      @pointercancel="onCropOverlayPointerUp"
                      @pointerleave="onCropOverlayPointerUp"
                    >
                      <div class="crop-mask" :style="cropMaskTopStyle"></div>
                      <div class="crop-mask" :style="cropMaskLeftStyle"></div>
                      <div class="crop-mask" :style="cropMaskRightStyle"></div>
                      <div class="crop-mask" :style="cropMaskBottomStyle"></div>
                      <div
                        v-if="cropRect"
                        class="crop-rect"
                        :style="cropRectStyle"
                        @pointerdown.stop="onCropRectPointerDown"
                      >
                        <div
                          v-for="h in cropHandles"
                          :key="h"
                          class="crop-handle"
                          :class="`h-${h}`"
                          :style="cropHandleStyle(h)"
                          @pointerdown.stop="onCropHandlePointerDown($event, h)"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="view-controls" @pointerdown.stop>
                <div class="view-control-row">
                  <button
                    class="view-btn"
                    type="button"
                    :disabled="!hasLayers"
                    @click="fitView"
                    :title="ui.fitView"
                  >
                    <CompressOutlined />
                  </button>
                  <button
                    class="view-btn"
                    type="button"
                    :disabled="!hasLayers"
                    @click="resetView"
                    :title="ui.resetView"
                  >
                    <ReloadOutlined />
                  </button>
                  <button
                    class="view-btn"
                    type="button"
                    :disabled="!hasLayers"
                    @click="zoomStep(1.1)"
                    :title="ui.zoomIn"
                  >
                    <ZoomInOutlined />
                  </button>
                  <button
                    class="view-btn"
                    type="button"
                    :disabled="!hasLayers"
                    @click="zoomStep(0.9)"
                    :title="ui.zoomOut"
                  >
                    <ZoomOutOutlined />
                  </button>
                </div>
                <div class="mode-toggle">
                  <button
                    class="mode-btn"
                    type="button"
                    :class="{ active: interactionMode === 'pan' }"
                    @click="interactionMode = 'pan'"
                    :title="ui.panMode"
                  >
                    <DragOutlined />
                  </button>
                  <button
                    class="mode-btn"
                    type="button"
                    :class="{ active: interactionMode === 'select' }"
                    @click="interactionMode = 'select'"
                    :title="ui.selectMode"
                  >
                    <SelectOutlined />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </main>

        <aside class="panel right" :class="{ 'mobile-panel-open': mobilePanel === 'tools' }">
          <div class="panel-header">
            <div class="panel-title">{{ ui.tools }}</div>
          </div>

          <div class="tools-body">
            <div class="tool-section">
              <div class="tool-section-title">{{ ui.quickTools }}</div>
              <div class="tool-row">
                <button
                  class="tool-btn"
                  type="button"
                  :disabled="!hasSelection"
                  @click="fitToCanvas"
                  :title="ui.fit"
                >
                  <BlockOutlined />
                </button>
                <button
                  class="tool-btn"
                  type="button"
                  :disabled="!hasSelection"
                  @click="centerOnCanvas"
                  :title="ui.center"
                >
                  <AimOutlined />
                </button>
              </div>
            </div>

            <div class="tool-section">
              <div class="tool-section-title">{{ ui.image }}</div>
              <div v-if="selectedLayer" class="image-inspector">
                <div class="group-title">
                  <span>{{ ui.size }}</span>
                  <button
                    class="tiny-icon"
                    type="button"
                    :aria-label="aspectLocked ? ui.unlockAspect : ui.lockAspect"
                    @click="toggleAspectLock"
                    :title="aspectLocked ? ui.unlockAspect : ui.lockAspect"
                  >
                    <LockOutlined v-if="aspectLocked" />
                    <UnlockOutlined v-else />
                  </button>
                </div>

                <div class="size-row">
                  <div class="size-field">
                    <div class="size-label">W</div>
                    <input
                      v-model.number="layerWidthMm"
                      class="control"
                      type="number"
                      step="0.01"
                      min="0"
                      @focus="beginBatchEdit"
                      @blur="endBatchEdit"
                    />
                    <div class="size-unit">mm</div>
                  </div>
                  <div class="size-field">
                    <div class="size-label">H</div>
                    <input
                      v-model.number="layerHeightMm"
                      class="control"
                      type="number"
                      step="0.01"
                      min="0"
                      @focus="beginBatchEdit"
                      @blur="endBatchEdit"
                    />
                    <div class="size-unit">mm</div>
                  </div>
                </div>

                <div class="group-title">{{ ui.fill }}</div>
                <div class="fill-row">
                  <div class="fill-left">
                    <div class="fill-thumb">
                      <img
                        class="fill-thumb-img"
                        :src="selectedLayer.src"
                        alt=""
                        draggable="false"
                      />
                    </div>
                    <div class="fill-name">{{ ui.fillImage }}</div>
                  </div>
                  <div class="fill-right">
                    <input
                      v-model.number="layerOpacityPercent"
                      class="control"
                      type="number"
                      min="0"
                      max="100"
                      @focus="beginBatchEdit"
                      @blur="endBatchEdit"
                    />
                    <div class="size-unit">%</div>
                  </div>
                </div>

                <div class="action-row">
                  <button
                    class="action-icon"
                    type="button"
                    :disabled="!hasSelection"
                    @click="duplicateSelected"
                    :title="ui.duplicate"
                  >
                    <CopyOutlined />
                  </button>
                  <button
                    class="action-icon"
                    type="button"
                    :disabled="!hasSelection"
                    @click="toggleFlipMenu"
                    :title="ui.flip"
                  >
                    <SwapOutlined />
                  </button>
                  <button
                    class="action-icon"
                    type="button"
                    :disabled="!hasSelection"
                    @click="toggleOrderMenu"
                    :title="ui.order"
                  >
                    <OrderedListOutlined />
                  </button>
                  <button
                    class="action-icon"
                    type="button"
                    :disabled="!hasSelection"
                    @click="toggleLockedSelected"
                    :title="selectedLayer.locked ? ui.unlock : ui.lock"
                  >
                    <LockOutlined v-if="selectedLayer.locked" />
                    <UnlockOutlined v-else />
                  </button>
                  <button
                    class="action-icon danger"
                    type="button"
                    :disabled="!hasSelection"
                    @click="removeSelected"
                    :title="ui.delete"
                  >
                    <DeleteOutlined />
                  </button>

                  <div v-if="flipMenuOpen" class="popover" @click.stop>
                    <button class="menu-item" type="button" @click="flipHorizontal">
                      <SwapOutlined /> {{ ui.flipH }}
                    </button>
                    <button class="menu-item" type="button" @click="flipVertical">
                      <SwapOutlined :rotate="90" /> {{ ui.flipV }}
                    </button>
                  </div>

                  <div v-if="orderMenuOpen" class="popover" @click.stop>
                    <button class="menu-item" type="button" @click="moveSelected('top')">
                      <VerticalAlignTopOutlined /> {{ ui.moveTop }}
                    </button>
                    <button class="menu-item" type="button" @click="moveSelected('up')">
                      <ArrowUpOutlined /> {{ ui.moveUp }}
                    </button>
                    <button class="menu-item" type="button" @click="moveSelected('down')">
                      <ArrowDownOutlined /> {{ ui.moveDown }}
                    </button>
                    <button class="menu-item" type="button" @click="moveSelected('bottom')">
                      <VerticalAlignBottomOutlined /> {{ ui.moveBottom }}
                    </button>
                  </div>
                </div>

                <div class="group-title">{{ ui.position }}</div>
                <div class="kv2">
                  <div class="kv">
                    <div class="k">{{ ui.x }}</div>
                    <input
                      v-model.number="selectedX"
                      class="control"
                      type="number"
                      @focus="beginBatchEdit"
                      @blur="endBatchEdit"
                    />
                  </div>
                  <div class="kv">
                    <div class="k">{{ ui.y }}</div>
                    <input
                      v-model.number="selectedY"
                      class="control"
                      type="number"
                      @focus="beginBatchEdit"
                      @blur="endBatchEdit"
                    />
                  </div>
                </div>

                <div class="kv2">
                  <div class="kv">
                    <div class="k">{{ ui.rotate }}</div>
                    <input
                      v-model.number="selectedRotate"
                      class="control"
                      type="number"
                      step="1"
                      @focus="beginBatchEdit"
                      @blur="endBatchEdit"
                    />
                  </div>
                  <div class="kv">
                    <div class="k">{{ ui.scale }}</div>
                    <input
                      v-model.number="layerScale"
                      class="control"
                      type="number"
                      step="0.01"
                      @focus="beginBatchEdit"
                      @blur="endBatchEdit"
                    />
                  </div>
                </div>

                <div class="kv">
                  <div class="k">{{ ui.name }}</div>
                  <input
                    v-model="selectedName"
                    class="control"
                    @focus="beginBatchEdit"
                    @blur="endBatchEdit"
                  />
                </div>
              </div>
              <div v-else class="inspector-empty">{{ ui.noSelection }}</div>
            </div>

            <div class="tool-section">
              <div class="tool-section-title">{{ ui.smartEditing }}</div>
              <div class="smart-grid">
                <button
                  class="smart-btn"
                  type="button"
                  :disabled="!hasSelection"
                  @click="smartAction('restyle')"
                  :title="ui.restyle"
                >
                  <BgColorsOutlined />
                  <span class="mobile-text-hidden">{{ ui.restyle }}</span>
                </button>
                <button
                  class="smart-btn"
                  type="button"
                  :disabled="!hasSelection"
                  @click="smartAction('cutout')"
                  :title="ui.cutout"
                >
                  <ScissorOutlined />
                  <span class="mobile-text-hidden">{{ ui.cutout }}</span>
                </button>
                <button
                  class="smart-btn"
                  type="button"
                  :disabled="!hasSelection || isUpscaling"
                  @click="smartAction('upscale')"
                  :title="ui.upscale"
                >
                  <ExpandOutlined />
                  <span class="mobile-text-hidden">{{ ui.upscale }}</span>
                </button>
                <button
                  class="smart-btn"
                  type="button"
                  :disabled="!hasSelection"
                  @click="smartAction('erase')"
                  :title="ui.erase"
                >
                  <GoldOutlined />
                  <span class="mobile-text-hidden">{{ ui.erase }}</span>
                </button>
                <button
                  class="smart-btn"
                  type="button"
                  :disabled="!hasSelection"
                  @click="smartAction('retouch')"
                  :title="ui.retouch"
                >
                  <FormatPainterOutlined />
                  <span class="mobile-text-hidden">{{ ui.retouch }}</span>
                </button>
                <button
                  class="smart-btn"
                  type="button"
                  :disabled="!hasSelection"
                  @click="smartAction('crop')"
                  :title="ui.crop"
                >
                  <GatewayOutlined />
                  <span class="mobile-text-hidden">{{ ui.crop }}</span>
                </button>
                <button
                  class="smart-btn"
                  type="button"
                  :disabled="!hasSelection"
                  @click="smartAction('straighten')"
                  :title="ui.straighten"
                >
                  <RotateRightOutlined />
                  <span class="mobile-text-hidden">{{ ui.straighten }}</span>
                </button>
              </div>
              <div v-if="smartHint" class="smart-hint">{{ smartHint }}</div>
              <div v-if="toolMode === 'crop'" class="smart-inline">
                <button
                  class="tool-btn"
                  type="button"
                  :disabled="!cropRect"
                  @click="applyCrop"
                  :title="ui.apply"
                >
                  <CheckOutlined />
                  <span class="mobile-text-hidden">{{ ui.apply }}</span>
                </button>
                <button class="tool-btn" type="button" @click="cancelCrop" :title="ui.cancel">
                  <CloseOutlined />
                  <span class="mobile-text-hidden">{{ ui.cancel }}</span>
                </button>
              </div>
              <div v-if="toolMode === 'straighten'" class="straighten-panel">
                <div class="straighten-row">
                  <input
                    v-model.number="straightenAngle"
                    class="straighten-range"
                    type="range"
                    min="-45"
                    max="45"
                    step="0.1"
                    @input="onStraightenInput"
                  />
                  <input
                    v-model.number="straightenAngle"
                    class="control straighten-input"
                    type="number"
                    step="0.1"
                    min="-45"
                    max="45"
                    @input="onStraightenInput"
                  />
                </div>
                <div class="smart-inline">
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="!hasSelection"
                    @click="autoStraighten"
                    :title="ui.auto"
                  >
                    <RobotOutlined />
                    <span class="mobile-text-hidden">{{ ui.auto }}</span>
                  </button>
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="!hasSelection"
                    @click="applyStraighten"
                    :title="ui.apply"
                  >
                    <CheckOutlined />
                    <span class="mobile-text-hidden">{{ ui.apply }}</span>
                  </button>
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="!hasSelection"
                    @click="bakeStraighten"
                    :title="ui.bake"
                  >
                    <FileDoneOutlined />
                    <span class="mobile-text-hidden">{{ ui.bake }}</span>
                  </button>
                  <button
                    class="tool-btn"
                    type="button"
                    @click="cancelStraighten"
                    :title="ui.cancel"
                  >
                    <CloseOutlined />
                    <span class="mobile-text-hidden">{{ ui.cancel }}</span>
                  </button>
                </div>
              </div>
              <div v-if="toolMode === 'cutout'" class="straighten-panel">
                <div class="kv">
                  <div class="k">{{ ui.cutoutThreshold }}</div>
                  <input
                    v-model.number="cutoutThreshold"
                    class="straighten-range"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                  />
                  <input
                    v-model.number="cutoutThreshold"
                    class="control"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                  />
                </div>
                <div class="smart-inline">
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="!hasSelection || isCutoutProcessing"
                    @click="applyCutoutRemove"
                    :title="ui.cutoutRemove"
                  >
                    <DeleteOutlined />
                    <span class="mobile-text-hidden">{{ ui.cutoutRemove }}</span>
                  </button>
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="!hasSelection || isCutoutProcessing"
                    @click="applyCutoutSplit"
                    :title="ui.cutoutSplit"
                  >
                    <SplitCellsOutlined />
                    <span class="mobile-text-hidden">{{ ui.cutoutSplit }}</span>
                  </button>
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="isCutoutProcessing"
                    @click="cancelCutout"
                    :title="ui.cancel"
                  >
                    <CloseOutlined />
                    <span class="mobile-text-hidden">{{ ui.cancel }}</span>
                  </button>
                </div>
              </div>
              <div v-if="toolMode === 'restore'" class="straighten-panel">
                <div class="kv">
                  <div class="k">{{ ui.restoreStrength }}</div>
                  <input
                    v-model.number="restoreStrength"
                    class="straighten-range"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    @input="onRestoreInput"
                  />
                  <input
                    v-model.number="restoreStrength"
                    class="control"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    @input="onRestoreInput"
                  />
                </div>
                <div class="kv">
                  <div class="k">{{ ui.restoreDenoise }}</div>
                  <input
                    v-model.number="restoreDenoise"
                    class="straighten-range"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    @input="onRestoreInput"
                  />
                  <input
                    v-model.number="restoreDenoise"
                    class="control"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    @input="onRestoreInput"
                  />
                </div>
                <div class="smart-inline">
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="!hasSelection || isRestoring"
                    @click="applyRestore"
                    :title="ui.apply"
                  >
                    <CheckOutlined />
                    <span class="mobile-text-hidden">{{ ui.apply }}</span>
                  </button>
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="isRestoring"
                    @click="resetRestore"
                    :title="ui.restoreReset"
                  >
                    <ReloadOutlined />
                    <span class="mobile-text-hidden">{{ ui.restoreReset }}</span>
                  </button>
                  <button
                    class="tool-btn"
                    type="button"
                    :disabled="isRestoring"
                    @pointerdown="compareRestoreStart"
                    @pointerup="compareRestoreEnd"
                    @pointercancel="compareRestoreEnd"
                    @pointerleave="compareRestoreEnd"
                    @lostpointercapture="compareRestoreEnd"
                    :title="ui.restoreCompare"
                  >
                    <EyeOutlined />
                    <span class="mobile-text-hidden">{{ ui.restoreCompare }}</span>
                  </button>
                  <button class="tool-btn" type="button" @click="cancelRestore" :title="ui.cancel">
                    <CloseOutlined />
                    <span class="mobile-text-hidden">{{ ui.cancel }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <div v-if="layerMenuOpenId" class="layer-menu-float" :style="layerMenuStyle" @click.stop>
        <button class="menu-item" type="button" @click="moveLayer(layerMenuOpenId, 'top')">
          <VerticalAlignTopOutlined /> {{ ui.moveTop }}
        </button>
        <button class="menu-item" type="button" @click="moveLayer(layerMenuOpenId, 'up')">
          <ArrowUpOutlined /> {{ ui.moveUp }}
        </button>
        <button class="menu-item" type="button" @click="moveLayer(layerMenuOpenId, 'down')">
          <ArrowDownOutlined /> {{ ui.moveDown }}
        </button>
        <button class="menu-item" type="button" @click="moveLayer(layerMenuOpenId, 'bottom')">
          <VerticalAlignBottomOutlined /> {{ ui.moveBottom }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  ArrowLeftOutlined,
  UndoOutlined,
  RedoOutlined,
  UploadOutlined,
  DownloadOutlined,
  BarsOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  LockOutlined,
  UnlockOutlined,
  MoreOutlined,
  CompressOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  DragOutlined,
  SelectOutlined,
  ScissorOutlined,
  BgColorsOutlined,
  ColumnWidthOutlined,
  ColumnHeightOutlined,
  FontSizeOutlined,
  GatewayOutlined,
  GoldOutlined,
  BlockOutlined,
  FileImageOutlined,
  PictureOutlined,
  BuildOutlined,
  FormatPainterOutlined,
  AimOutlined,
  ExpandOutlined,
  RotateRightOutlined,
  SwapOutlined,
  OrderedListOutlined,
  CopyOutlined,
  CheckOutlined,
  CloseOutlined,
  RobotOutlined,
  FileDoneOutlined,
  SplitCellsOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined
} from '@ant-design/icons-vue';
import { useLanguageStore } from '@/stores/language';
import { buildApiUrl, getApiBaseUrl } from '@/utils/api';
import { getAuthToken } from '@/login/session';
import { scaleAroundScreenPoint } from '../logic/viewportMath';
import {
  clampCropRect,
  clampNumber,
  detectTiltAngle,
  isPointInRect,
  normalizeCropRect,
  removeBackgroundAlgorithm1,
  restoreImageAlgorithm1,
  rotatedRectWithMaxArea,
  splitLayersAlgorithm1
} from '../logic/editorMath';

type ImageLayer = {
  id: string;
  type: 'image';
  name: string;
  src: string;
  visible: boolean;
  locked: boolean;
  flipX: boolean;
  flipY: boolean;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  opacity: number;
};

type EditorStateSnapshot = {
  layers: ImageLayer[];
  selectedLayerId: string | null;
};

const router = useRouter();
const route = useRoute();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() => {
  const en = currentLang.value === 'en';
  return {
    title: en ? 'Image Editor' : '图片编辑',
    back: en ? 'Back' : '返回',
    undo: en ? 'Undo' : '撤销',
    redo: en ? 'Redo' : '重做',
    import: en ? 'Import' : '导入图片',
    export: en ? 'Export' : '导出',
    layers: en ? 'Layers' : '分层',
    tools: en ? 'Tools' : '工具',
    delete: en ? 'Delete' : '删除',
    duplicate: en ? 'Duplicate' : '复制',
    flip: en ? 'Flip' : '翻转',
    order: en ? 'Order' : '层级',
    hide: en ? 'Hide layer' : '隐藏图层',
    show: en ? 'Show layer' : '显示图层',
    lock: en ? 'Lock layer' : '锁定图层',
    unlock: en ? 'Unlock layer' : '解锁图层',
    layerMenu: en ? 'Layer menu' : '图层菜单',
    emptyTitle: en ? 'Drop an image here' : '把图片拖进来或点右上角导入',
    emptySub: en
      ? 'Start with a single image. Layers and tools will appear.'
      : '先做第一版：导入图片 + 分层 + 拖拽定位',
    quickTools: en ? 'Quick' : '快捷操作',
    fit: en ? 'Fit' : '适配画布',
    center: en ? 'Center' : '居中',
    image: en ? 'Image' : '图片',
    size: en ? 'Size' : '尺寸',
    fill: en ? 'Fill' : '填充',
    fillImage: en ? 'Image' : '图片',
    position: en ? 'Position' : '位置',
    lockAspect: en ? 'Lock aspect' : '锁定比例',
    unlockAspect: en ? 'Unlock aspect' : '解除锁定',
    flipH: en ? 'Flip horizontally' : '水平翻转',
    flipV: en ? 'Flip vertically' : '垂直翻转',
    moveTop: en ? 'Move to top' : '移到最上层',
    moveUp: en ? 'Move up one level' : '上移一层',
    moveDown: en ? 'Move down one level' : '下移一层',
    moveBottom: en ? 'Move to bottom' : '移到最下层',
    smartEditing: en ? 'Smart Editing' : '智能编辑',
    restyle: en ? 'Restyle' : '风格化',
    cutout: en ? 'Cut out' : '抠图',
    upscale: en ? '2× Upscale' : '2× 放大',
    erase: en ? 'Erase' : '消除',
    retouch: en ? 'Restore' : '还原',
    crop: en ? 'Crop' : '裁剪',
    straighten: en ? 'Straighten' : '拉直',
    cutoutThreshold: en ? 'Bg Threshold' : '背景阈值',
    cutoutRemove: en ? 'Remove BG' : '去背景',
    cutoutSplit: en ? 'Split Layers' : '分层',
    cutoutProcessing: en ? 'Processing...' : '处理中...',
    cutoutHint: en
      ? 'Algorithm 1: edge flood fill + color threshold.'
      : '算法1：边界泛洪 + 颜色阈值。',
    restoreStrength: en ? 'Strength' : '强度',
    restoreDenoise: en ? 'Denoise' : '去噪',
    restoreReset: en ? 'Reset' : '重置',
    restoreCompare: en ? 'Compare' : '按住对比',
    restoreProcessing: en ? 'Processing...' : '处理中...',
    restoreHint: en ? 'Algorithm 1: unsharp mask + mild denoise.' : '算法1：反锐化 + 轻度去噪。',
    noSelection: en ? 'Select a layer to edit its properties.' : '选择一个图层后可调整属性',
    name: en ? 'Name' : '名称',
    opacity: en ? 'Opacity' : '透明度',
    x: en ? 'X' : 'X',
    y: en ? 'Y' : 'Y',
    scale: en ? 'Scale' : '缩放',
    rotate: en ? 'Rotate' : '旋转',
    apply: en ? 'Apply' : '应用',
    cancel: en ? 'Cancel' : '取消',
    auto: en ? 'Auto' : '自动',
    bake: en ? 'Bake' : '烘焙',
    cropHint: en
      ? 'Drag to create a crop box. Drag handles to resize.'
      : '拖拽生成裁剪框，拖动边角调整大小。',
    straightenHint: en
      ? 'Auto-detect horizon or use the slider.'
      : '自动检测水平线，或用滑杆微调。',
    fitView: en ? 'Fit view' : '适配视图',
    resetView: en ? 'Reset view' : '重置视图',
    zoomIn: en ? 'Zoom +' : '放大',
    zoomOut: en ? 'Zoom -' : '缩小',
    panMode: en ? 'Pan view' : '拖拽视角',
    selectMode: en ? 'Select' : '选择',
    importFailed: en
      ? 'Import failed. Please check the link or permissions.'
      : '导入失败，请检查链接或权限。'
  };
});

const fileInputRef = ref<HTMLInputElement | null>(null);
const editorShellRef = ref<HTMLDivElement | null>(null);
const stageRef = ref<HTMLDivElement | null>(null);
const cropOverlayRef = ref<HTMLDivElement | null>(null);
const mobilePanel = ref<'layers' | 'tools' | ''>('');
const editorTip = ref('');
let editorTipTimer: number | null = null;

const interactionMode = ref<'select' | 'pan'>('select');
const isPanMode = computed(() => interactionMode.value === 'pan');

const layers = ref<ImageLayer[]>([]);
const selectedLayerId = ref<string | null>(null);

const history = ref<EditorStateSnapshot[]>([]);
const redoStack = ref<EditorStateSnapshot[]>([]);

const ownedObjectUrls = new Set<string>();

const trackOwnedUrl = (url: string) => {
  const key = String(url || '');
  if (key.startsWith('blob:')) ownedObjectUrls.add(key);
};

const gcObjectUrls = () => {
  const used = new Set<string>();
  const add = (src: string | null | undefined) => {
    const key = String(src || '');
    if (ownedObjectUrls.has(key)) used.add(key);
  };

  for (const l of layers.value) add(l.src);
  for (const snap of history.value) for (const l of snap.layers) add(l.src);
  for (const snap of redoStack.value) for (const l of snap.layers) add(l.src);
  add(originalLayerSrc.value);
  add(restorePreviewSrc.value);

  for (const url of Array.from(ownedObjectUrls)) {
    if (used.has(url)) continue;
    try {
      URL.revokeObjectURL(url);
    } catch {}
    ownedObjectUrls.delete(url);
  }
};

const hasLayers = computed(() => layers.value.length > 0);
const hasSelection = computed(() => !!selectedLayerId.value);

const selectedLayer = computed(() => {
  const id = selectedLayerId.value;
  if (!id) return null;
  return layers.value.find((l) => l.id === id) || null;
});

const renderLayers = computed(() => layers.value.filter((l) => l.visible));

const canUndo = computed(() => history.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

const CANVAS_W = 1200;
const CANVAS_H = 700;
const MM_PER_PX = 25.4 / 96;

const viewportScale = ref(1);
const viewportOffset = ref({ x: 0, y: 0 });
const viewportDrag = ref<{
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: { x: number; y: number };
} | null>(null);
const spacePressed = ref(false);

const panRafId = ref<number | null>(null);
const pendingViewportOffset = ref<{ x: number; y: number } | null>(null);

const scheduleViewportOffset = (next: { x: number; y: number }) => {
  pendingViewportOffset.value = next;
  if (panRafId.value !== null) return;
  panRafId.value = requestAnimationFrame(() => {
    panRafId.value = null;
    const v = pendingViewportOffset.value;
    pendingViewportOffset.value = null;
    if (v) viewportOffset.value = v;
  });
};

const flushViewportOffset = () => {
  if (panRafId.value !== null) {
    cancelAnimationFrame(panRafId.value);
    panRafId.value = null;
  }
  const v = pendingViewportOffset.value;
  pendingViewportOffset.value = null;
  if (v) viewportOffset.value = v;
};

const isPanning = computed(() => !!viewportDrag.value?.active);
const viewportStyle = computed(() => {
  return {
    transform: `translate(${viewportOffset.value.x}px, ${viewportOffset.value.y}px) scale(${viewportScale.value})`
  };
});

const canvasBoundaryStyle = computed(() => {
  return {
    width: `${CANVAS_W}px`,
    height: `${CANVAS_H}px`
  };
});

const goBack = () => {
  router.push('/artigen/image-workshop');
};

const triggerPick = () => {
  fileInputRef.value?.click();
};

const toggleMobilePanel = (next: 'layers' | 'tools') => {
  mobilePanel.value = mobilePanel.value === next ? '' : next;
};

const closeMobilePanel = () => {
  mobilePanel.value = '';
};

const showEditorTip = (msg: string) => {
  const m = String(msg || '').trim();
  if (!m) return;
  editorTip.value = m;
  if (editorTipTimer) window.clearTimeout(editorTipTimer);
  editorTipTimer = window.setTimeout(() => {
    editorTipTimer = null;
    editorTip.value = '';
  }, 2600);
};

const clearImportQuery = () => {
  if (Object.keys(route.query || {}).length === 0) return;
  router.replace({ path: '/artigen/image-editor', query: {} });
};

const snapshotState = (): EditorStateSnapshot => {
  return {
    layers: layers.value.map((l) => ({ ...l })),
    selectedLayerId: selectedLayerId.value
  };
};

const restoreState = (snap: EditorStateSnapshot) => {
  layers.value = snap.layers.map((l) => ({ ...l }));
  selectedLayerId.value = snap.selectedLayerId;
  gcObjectUrls();
};

const pushHistory = () => {
  history.value.push(snapshotState());
  if (history.value.length > 80) history.value = history.value.slice(-80);
  redoStack.value = [];
};

const undo = () => {
  if (!canUndo.value) return;
  const snap = history.value.pop() || null;
  if (!snap) return;
  redoStack.value.push(snapshotState());
  restoreState(snap);
};

const redo = () => {
  if (!canRedo.value) return;
  const snap = redoStack.value.pop() || null;
  if (!snap) return;
  history.value.push(snapshotState());
  restoreState(snap);
};

const genId = () => `layer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const loadImageMeta = (src: string) =>
  new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 });
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    img.src = src;
  });

const onPick = async (e: Event) => {
  const input = e.target as HTMLInputElement | null;
  try {
    const list = Array.from(input?.files || []);
    await importFiles(list);
  } finally {
    try {
      if (input) input.value = '';
    } catch {}
  }
};

const onStageDrop = async (e: DragEvent) => {
  const list = Array.from(e.dataTransfer?.files || []);
  if (!list.length) return;
  await importFiles(list);
  await nextTick();
};

const selectLayer = (id: string) => {
  selectedLayerId.value = id;
};

const toggleVisible = (id: string) => {
  pushHistory();
  layers.value = layers.value.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
};

const toggleLocked = (id: string) => {
  pushHistory();
  layers.value = layers.value.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l));
};

const removeSelected = () => {
  const id = selectedLayerId.value;
  if (!id) return;
  pushHistory();
  layers.value = layers.value.filter((l) => l.id !== id);
  selectedLayerId.value = layers.value.length ? layers.value[layers.value.length - 1].id : null;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const onStageWheel = (e: WheelEvent) => {
  const rect = stageRef.value?.getBoundingClientRect();
  if (!rect) return;
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const pointX = e.clientX - rect.left;
  const pointY = e.clientY - rect.top;
  const next = scaleAroundScreenPoint(
    { scale: viewportScale.value, offset: viewportOffset.value },
    viewportScale.value * delta,
    { x: pointX, y: pointY }
  );
  viewportScale.value = next.scale;
  viewportOffset.value = next.offset;
};

const resetView = () => {
  viewportScale.value = 1;
  viewportOffset.value = { x: 0, y: 0 };
};

const fitView = () => {
  const rect = stageRef.value?.getBoundingClientRect();
  if (!rect) return;
  const pad = 40;
  const maxW = Math.max(1, rect.width - pad * 2);
  const maxH = Math.max(1, rect.height - pad * 2);
  const target = clamp(Math.min(maxW / CANVAS_W, maxH / CANVAS_H), 0.1, 6);
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const next = scaleAroundScreenPoint({ scale: 1, offset: { x: 0, y: 0 } }, target, {
    x: cx,
    y: cy
  });
  viewportScale.value = next.scale;
  viewportOffset.value = next.offset;
};

const zoomStep = (mul: number) => {
  const rect = stageRef.value?.getBoundingClientRect();
  if (!rect) return;
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const next = scaleAroundScreenPoint(
    { scale: viewportScale.value, offset: viewportOffset.value },
    viewportScale.value * mul,
    { x: cx, y: cy }
  );
  viewportScale.value = next.scale;
  viewportOffset.value = next.offset;
};

const calcFitScale = (w: number, h: number) => {
  if (w <= 0 || h <= 0) return 1;
  const pad = 40;
  const maxW = Math.max(1, CANVAS_W - pad * 2);
  const maxH = Math.max(1, CANVAS_H - pad * 2);
  return clamp(Math.min(maxW / w, maxH / h), 0.02, 20);
};

const canvasToOwnedUrl = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) return canvas.toDataURL('image/png');
  const url = URL.createObjectURL(blob);
  trackOwnedUrl(url);
  return url;
};

const importFiles = async (files: File[]) => {
  const valid = files.filter((f) => (f?.type || '').startsWith('image/'));
  if (!valid.length) return;

  const newLayers: ImageLayer[] = [];
  for (const file of valid) {
    const name =
      String(file.name || '').trim() || `image-${layers.value.length + newLayers.length + 1}`;
    const srcUrl = URL.createObjectURL(file);
    trackOwnedUrl(srcUrl);
    const meta = await loadImageMeta(srcUrl).catch(() => ({ w: 0, h: 0 }));
    const img = await decodeImage(srcUrl);
    const w = Math.max(0, Math.trunc(meta.w || img?.naturalWidth || 0));
    const h = Math.max(0, Math.trunc(meta.h || img?.naturalHeight || 0));
    const s = calcFitScale(w, h);
    const baseLayer = {
      type: 'image' as const,
      visible: true,
      locked: false,
      flipX: false,
      flipY: false,
      naturalWidth: w,
      naturalHeight: h,
      x: Math.round(CANVAS_W / 2),
      y: Math.round(CANVAS_H / 2),
      scaleX: s,
      scaleY: s,
      rotate: 0,
      opacity: 1
    };
    if (!img || !w || !h) {
      newLayers.push({
        id: genId(),
        name,
        src: srcUrl,
        ...baseLayer
      });
      continue;
    }
    if (w * h > AUTO_SPLIT_MAX_PIXELS) {
      newLayers.push({
        id: genId(),
        name,
        src: srcUrl,
        ...baseLayer
      });
      continue;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        newLayers.push({
          id: genId(),
          name,
          src: srcUrl,
          ...baseLayer
        });
        continue;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const out = splitLayersAlgorithm1(
        { width: w, height: h, data: imageData.data },
        { threshold: CUTOUT_DEFAULT_THRESHOLD, feather: 0.6 }
      );

      ctx.putImageData(new ImageData(out.foreground, w, h), 0, 0);
      const fgUrl = await canvasToOwnedUrl(canvas);
      ctx.putImageData(new ImageData(out.background, w, h), 0, 0);
      const bgUrl = await canvasToOwnedUrl(canvas);

      newLayers.push(
        {
          id: genId(),
          name: `${name}-BG`,
          src: bgUrl,
          ...baseLayer
        },
        {
          id: genId(),
          name: `${name}-FG`,
          src: fgUrl,
          ...baseLayer
        }
      );
    } catch {
      newLayers.push({
        id: genId(),
        name,
        src: srcUrl,
        ...baseLayer
      });
    }
  }

  pushHistory();
  layers.value = [...layers.value, ...newLayers];
  selectedLayerId.value = newLayers[newLayers.length - 1]?.id || null;
  gcObjectUrls();
};

const extFromMime = (mime: string) => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
};

const dataUrlToFile = (dataUrl: string): File | null => {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:')) return null;
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = String(m[1] || '').trim() || 'image/png';
  const b64 = String(m[2] || '');
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = extFromMime(mime);
    return new File([bytes], `import_${Date.now().toString(36)}.${ext}`, { type: mime });
  } catch {
    return null;
  }
};

const resolveEditorUrl = (raw: string) => {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('data:')) return u;
  const base = getApiBaseUrl();
  const built = (() => {
    if (u.startsWith('/')) {
      if (u.startsWith('/files/')) {
        if (!base) return u;
        if (base.endsWith('/api')) return `${base.slice(0, -4)}${u}`;
        return `${base}${u}`;
      }
      return buildApiUrl(u);
    }
    return u;
  })();
  const token = String(getAuthToken() || '').trim();
  if (!token) return built;
  try {
    const url = new URL(built, window.location.origin);
    if (!url.pathname.startsWith('/files/')) return built;
    if (!url.searchParams.get('token')) url.searchParams.set('token', token);
    return url.toString();
  } catch {
    if (!built.includes('/files/')) return built;
    const join = built.includes('?') ? '&' : '?';
    if (built.includes('token=')) return built;
    return `${built}${join}token=${encodeURIComponent(token)}`;
  }
};

const tryFetchImageBlob = async (
  url: string,
  headers?: Record<string, string>
): Promise<Blob | null> => {
  try {
    const res = await fetch(url, { headers: headers || undefined });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (
      !String(blob.type || '')
        .toLowerCase()
        .startsWith('image/')
    )
      return null;
    return blob;
  } catch {
    return null;
  }
};

const importImageFromPrefill = async (raw: string) => {
  const s = String(raw || '').trim();
  if (!s) return false;
  const direct = dataUrlToFile(s);
  if (direct) {
    await importFiles([direct]);
    await nextTick();
    fitView();
    return true;
  }
  const resolved = resolveEditorUrl(s);
  let blob = await tryFetchImageBlob(resolved || s);
  if (!blob && resolved && resolved !== s) blob = await tryFetchImageBlob(s);
  if (!blob) {
    const token = String(getAuthToken() || '').trim();
    const target = resolved || s;
    if (token && target.includes('/files/')) {
      blob = await tryFetchImageBlob(target, { Authorization: `Bearer ${token}` });
    }
  }
  if (!blob && /^https?:\/\//i.test(s)) {
    const proxyUrl = buildApiUrl(`/api/proxy/image?url=${encodeURIComponent(s)}`);
    blob = await tryFetchImageBlob(proxyUrl);
  }
  if (!blob) return false;
  const ext = extFromMime(blob.type);
  const file = new File([blob], `import_${Date.now().toString(36)}.${ext}`, { type: blob.type });
  await importFiles([file]);
  await nextTick();
  fitView();
  return true;
};

const fitToCanvas = () => {
  const layer = selectedLayer.value;
  if (!layer) return;
  if (layer.locked) return;
  const w = layer.naturalWidth || 0;
  const h = layer.naturalHeight || 0;
  if (w <= 0 || h <= 0) {
    centerOnCanvas();
    return;
  }
  pushHistory();
  const pad = 40;
  const maxW = Math.max(1, CANVAS_W - pad * 2);
  const maxH = Math.max(1, CANVAS_H - pad * 2);
  const s = Math.min(maxW / w, maxH / h);
  layers.value = layers.value.map((l) =>
    l.id === layer.id
      ? {
          ...l,
          x: Math.round(CANVAS_W / 2),
          y: Math.round(CANVAS_H / 2),
          scaleX: clamp(s, 0.02, 20),
          scaleY: clamp(s, 0.02, 20)
        }
      : l
  );
};

const centerOnCanvas = () => {
  const layer = selectedLayer.value;
  if (!layer) return;
  if (layer.locked) return;
  pushHistory();
  layers.value = layers.value.map((l) =>
    l.id === layer.id ? { ...l, x: Math.round(CANVAS_W / 2), y: Math.round(CANVAS_H / 2) } : l
  );
};

const layerStyle = (layer: ImageLayer) => {
  const w = layer.naturalWidth || 0;
  const h = layer.naturalHeight || 0;
  const sx = Number.isFinite(layer.scaleX) ? layer.scaleX : 1;
  const sy = Number.isFinite(layer.scaleY) ? layer.scaleY : 1;
  const rot = Number.isFinite(layer.rotate) ? layer.rotate : 0;
  const op = Number.isFinite(layer.opacity) ? layer.opacity : 1;
  const left = Number.isFinite(layer.x) ? layer.x : 0;
  const top = Number.isFinite(layer.y) ? layer.y : 0;
  const fx = layer.flipX ? -1 : 1;
  const fy = layer.flipY ? -1 : 1;
  const ww = Math.max(1, w);
  const hh = Math.max(1, h);
  return {
    width: `${ww}px`,
    height: `${hh}px`,
    left: `${left}px`,
    top: `${top}px`,
    transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${sx * fx}, ${sy * fy})`,
    opacity: String(clamp(op, 0, 1))
  };
};

const exportImage = async () => {
  flushLayerMove();
  flushCropRect();
  const w = CANVAS_W;
  const h = CANVAS_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const visibleLayers = layers.value.filter((l) => l.visible);
  const predecoded = new Map<string, Promise<HTMLImageElement | null>>();
  for (const l of visibleLayers) {
    const key = String(l.src || '');
    if (!predecoded.has(key)) predecoded.set(key, decodeImage(key));
  }

  ctx.clearRect(0, 0, w, h);
  for (const layer of visibleLayers) {
    const op = clamp(Number.isFinite(layer.opacity) ? layer.opacity : 1, 0, 1);
    const key = String(layer.src || '');
    const p = predecoded.get(key);
    const img = p ? await p : await decodeImage(key);

    ctx.save();
    ctx.globalAlpha = op;
    await drawLayerToContext(ctx, layer, img);
    ctx.restore();
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `image_editor_${Date.now()}.png`;
  a.click();
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, 1000);
};

const dragState = ref<{
  active: boolean;
  layerId: string | null;
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
} | null>(null);

const layerDragRafId = ref<number | null>(null);
const pendingLayerMove = ref<{ id: string; x: number; y: number } | null>(null);

const scheduleLayerMove = (id: string, x: number, y: number) => {
  pendingLayerMove.value = { id, x, y };
  if (layerDragRafId.value !== null) return;
  layerDragRafId.value = requestAnimationFrame(() => {
    layerDragRafId.value = null;
    const m = pendingLayerMove.value;
    pendingLayerMove.value = null;
    if (!m) return;
    layers.value = layers.value.map((l) => (l.id === m.id ? { ...l, x: m.x, y: m.y } : l));
  });
};

const flushLayerMove = () => {
  if (layerDragRafId.value !== null) {
    cancelAnimationFrame(layerDragRafId.value);
    layerDragRafId.value = null;
  }
  const m = pendingLayerMove.value;
  pendingLayerMove.value = null;
  if (!m) return;
  layers.value = layers.value.map((l) => (l.id === m.id ? { ...l, x: m.x, y: m.y } : l));
};

const aspectLocked = ref(true);
const flipMenuOpen = ref(false);
const orderMenuOpen = ref(false);
const layerMenuOpenId = ref<string | null>(null);
const layerMenuPosition = ref({ x: 0, y: 0 });
const layerMenuStyle = computed(() => ({
  left: `${layerMenuPosition.value.x}px`,
  top: `${layerMenuPosition.value.y}px`
}));
const smartHint = ref('');

const closeMenus = () => {
  flipMenuOpen.value = false;
  orderMenuOpen.value = false;
  layerMenuOpenId.value = null;
};

const toolMode = ref<'none' | 'crop' | 'straighten' | 'restore' | 'cutout'>('none');
const RESTORE_DEFAULT_STRENGTH = 0.6;
const RESTORE_DEFAULT_DENOISE = 0.15;
const CUTOUT_DEFAULT_THRESHOLD = 0.35;
const AUTO_SPLIT_MAX_PIXELS = 6_000_000;
const cropRect = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const cropHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const straightenAngle = ref(0);
const restoreStrength = ref(RESTORE_DEFAULT_STRENGTH);
const restoreDenoise = ref(RESTORE_DEFAULT_DENOISE);
const cutoutThreshold = ref(CUTOUT_DEFAULT_THRESHOLD);
const straightenBaseRotate = ref<number | null>(null);
const cropTargetLayerId = ref<string | null>(null);
const straightenTargetLayerId = ref<string | null>(null);
const isRestoring = ref(false);
const originalLayerSrc = ref<string | null>(null);
const restoreTargetLayerId = ref<string | null>(null);
const restorePreviewSrc = ref<string | null>(null);
const restoreDebounceTimer = ref<number | null>(null);
const restoreJobId = ref(0);
const restoreComparing = ref(false);
const restoreDirty = ref(false);
const isCutoutProcessing = ref(false);
const cutoutJobId = ref(0);
const cutoutTargetLayerId = ref<string | null>(null);
const isUpscaling = ref(false);
const upscaleJobId = ref(0);

type LayerPixelCache = {
  layerId: string;
  src: string;
  w: number;
  h: number;
  data: Uint8ClampedArray;
};

const restoreBasePixels = ref<LayerPixelCache | null>(null);
const cutoutBasePixels = ref<LayerPixelCache | null>(null);
const scratchCanvasRef = ref<HTMLCanvasElement | null>(null);

const cropRafId = ref<number | null>(null);
const pendingCropRect = ref<{ x: number; y: number; w: number; h: number } | null>(null);

const scheduleCropRect = (next: { x: number; y: number; w: number; h: number }) => {
  pendingCropRect.value = next;
  if (cropRafId.value !== null) return;
  cropRafId.value = requestAnimationFrame(() => {
    cropRafId.value = null;
    const r = pendingCropRect.value;
    pendingCropRect.value = null;
    if (r) cropRect.value = r;
  });
};

const flushCropRect = () => {
  if (cropRafId.value !== null) {
    cancelAnimationFrame(cropRafId.value);
    cropRafId.value = null;
  }
  const r = pendingCropRect.value;
  pendingCropRect.value = null;
  if (r) cropRect.value = r;
};

const batchEditActive = ref(false);
const batchHistoryPushed = ref(false);

const beginBatchEdit = () => {
  batchEditActive.value = true;
  batchHistoryPushed.value = false;
};

const endBatchEdit = () => {
  batchEditActive.value = false;
  batchHistoryPushed.value = false;
};

const ensureEditHistory = () => {
  if (batchEditActive.value) {
    if (batchHistoryPushed.value) return;
    pushHistory();
    batchHistoryPushed.value = true;
    return;
  }
  pushHistory();
};

const updateLayerById = (id: string, updater: (l: ImageLayer) => ImageLayer) => {
  layers.value = layers.value.map((l) => (l.id === id ? updater(l) : l));
};

const cropDrag = ref<{
  active: boolean;
  mode: 'draw' | 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  base: { x: number; y: number; w: number; h: number } | null;
  handle: (typeof cropHandles)[number] | null;
} | null>(null);

const isTextInput = (t: EventTarget | null) => {
  if (!t || !(t instanceof HTMLElement)) return false;
  const tag = t.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return t.isContentEditable;
};

const onKeyDown = (e: KeyboardEvent) => {
  if (isTextInput(e.target)) return;
  const cmd = e.ctrlKey || e.metaKey;
  if (cmd) {
    const k = String(e.key || '').toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (k === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === '0') {
      e.preventDefault();
      resetView();
      return;
    }
    if (e.key === '1') {
      e.preventDefault();
      fitView();
      return;
    }
    if (e.key === '+' || e.key === '=' || e.code === 'Equal') {
      e.preventDefault();
      zoomStep(1.1);
      return;
    }
    if (e.key === '-' || e.code === 'Minus') {
      e.preventDefault();
      zoomStep(0.9);
      return;
    }
  }
  if (e.key === 'Escape') {
    if (toolMode.value === 'crop') {
      e.preventDefault();
      cancelCrop();
      return;
    }
    if (toolMode.value === 'straighten') {
      e.preventDefault();
      cancelStraighten();
      return;
    }
    if (toolMode.value === 'restore') {
      e.preventDefault();
      cancelRestore();
      return;
    }
    if (toolMode.value === 'cutout') {
      e.preventDefault();
      cancelCutout();
      return;
    }
  }
  if (e.key === 'Enter') {
    if (toolMode.value === 'crop') {
      e.preventDefault();
      applyCrop();
      return;
    }
    if (toolMode.value === 'straighten') {
      e.preventDefault();
      applyStraighten();
      return;
    }
    if (toolMode.value === 'restore') {
      e.preventDefault();
      applyRestore();
      return;
    }
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (toolMode.value !== 'none') return;
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    e.preventDefault();
    removeSelected();
    return;
  }
  if (toolMode.value === 'none') {
    const layer = selectedLayer.value;
    if (layer && !layer.locked) {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        pushHistory();
        updateLayerById(layer.id, (l) => ({ ...l, x: (Number.isFinite(l.x) ? l.x : 0) - step }));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        pushHistory();
        updateLayerById(layer.id, (l) => ({ ...l, x: (Number.isFinite(l.x) ? l.x : 0) + step }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        pushHistory();
        updateLayerById(layer.id, (l) => ({ ...l, y: (Number.isFinite(l.y) ? l.y : 0) - step }));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        pushHistory();
        updateLayerById(layer.id, (l) => ({ ...l, y: (Number.isFinite(l.y) ? l.y : 0) + step }));
        return;
      }
    }
  }
  if (e.code !== 'Space') return;
  e.preventDefault();
  spacePressed.value = true;
};

const onKeyUp = (e: KeyboardEvent) => {
  if (e.code !== 'Space') return;
  spacePressed.value = false;
};

const onWindowBlur = () => {
  spacePressed.value = false;
};

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  const qImg = String(route.query?.img || route.query?.image || '').trim();
  const usePrefill = String(route.query?.prefill || '').trim() === '1';
  if (qImg) {
    void importImageFromPrefill(qImg)
      .then((ok) => {
        if (!ok) showEditorTip(ui.value.importFailed);
      })
      .finally(() => clearImportQuery());
    return;
  }
  if (!usePrefill) return;
  try {
    const raw = window.localStorage.getItem('imageEditor:prefill_v1');
    if (!raw) return;
    window.localStorage.removeItem('imageEditor:prefill_v1');
    const parsed = JSON.parse(raw);
    const v = String(parsed?.value || '').trim();
    if (v)
      void importImageFromPrefill(v)
        .then((ok) => {
          if (!ok) showEditorTip(ui.value.importFailed);
        })
        .finally(() => clearImportQuery());
  } catch {}
  clearImportQuery();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onWindowBlur);
  if (editorTipTimer) window.clearTimeout(editorTipTimer);
  editorTipTimer = null;
  if (restoreDebounceTimer.value) window.clearTimeout(restoreDebounceTimer.value);
  restoreDebounceTimer.value = null;
  restoreJobId.value += 1;
  cutoutJobId.value += 1;
  for (const url of Array.from(ownedObjectUrls)) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  ownedObjectUrls.clear();
});

const getCropPoint = (e: PointerEvent) => {
  const el = cropOverlayRef.value;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) * (CANVAS_W / Math.max(1, r.width));
  const py = (e.clientY - r.top) * (CANVAS_H / Math.max(1, r.height));
  return { x: clampNumber(px, 0, CANVAS_W), y: clampNumber(py, 0, CANVAS_H) };
};

const cropRectStyle = computed(() => {
  const r = cropRect.value;
  if (!r) return {};
  return { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` };
});

const cropMaskTopStyle = computed(() => {
  const r = cropRect.value;
  if (!r) return { left: '0px', top: '0px', width: `${CANVAS_W}px`, height: `${CANVAS_H}px` };
  return { left: '0px', top: '0px', width: `${CANVAS_W}px`, height: `${r.y}px` };
});
const cropMaskLeftStyle = computed(() => {
  const r = cropRect.value;
  if (!r) return { display: 'none' };
  return { left: '0px', top: `${r.y}px`, width: `${r.x}px`, height: `${r.h}px` };
});
const cropMaskRightStyle = computed(() => {
  const r = cropRect.value;
  if (!r) return { display: 'none' };
  return {
    left: `${r.x + r.w}px`,
    top: `${r.y}px`,
    width: `${CANVAS_W - (r.x + r.w)}px`,
    height: `${r.h}px`
  };
});
const cropMaskBottomStyle = computed(() => {
  const r = cropRect.value;
  if (!r) return { display: 'none' };
  return {
    left: '0px',
    top: `${r.y + r.h}px`,
    width: `${CANVAS_W}px`,
    height: `${CANVAS_H - (r.y + r.h)}px`
  };
});

const cropHandleStyle = (h: (typeof cropHandles)[number]) => {
  const r = cropRect.value;
  if (!r) return {};
  const left = 0;
  const right = r.w;
  const top = 0;
  const bottom = r.h;
  const cx = r.w / 2;
  const cy = r.h / 2;
  const map: Record<(typeof cropHandles)[number], { x: number; y: number; cursor: string }> = {
    nw: { x: left, y: top, cursor: 'nwse-resize' },
    n: { x: cx, y: top, cursor: 'ns-resize' },
    ne: { x: right, y: top, cursor: 'nesw-resize' },
    e: { x: right, y: cy, cursor: 'ew-resize' },
    se: { x: right, y: bottom, cursor: 'nwse-resize' },
    s: { x: cx, y: bottom, cursor: 'ns-resize' },
    sw: { x: left, y: bottom, cursor: 'nesw-resize' },
    w: { x: left, y: cy, cursor: 'ew-resize' }
  };
  const p = map[h];
  return { left: `${p.x}px`, top: `${p.y}px`, cursor: p.cursor };
};

const beginCrop = () => {
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  cropTargetLayerId.value = layer.id;
  const iw = Math.max(0, layer.naturalWidth || 0);
  const ih = Math.max(0, layer.naturalHeight || 0);
  if (!iw || !ih) return;
  const sx = Math.abs(Number.isFinite(layer.scaleX) ? layer.scaleX : 1);
  const sy = Math.abs(Number.isFinite(layer.scaleY) ? layer.scaleY : 1);
  const rot = ((Number.isFinite(layer.rotate) ? layer.rotate : 0) * Math.PI) / 180;
  const w = iw * sx;
  const h = ih * sy;
  const bw = Math.abs(w * Math.cos(rot)) + Math.abs(h * Math.sin(rot));
  const bh = Math.abs(w * Math.sin(rot)) + Math.abs(h * Math.cos(rot));
  const cx = clampNumber(Number.isFinite(layer.x) ? layer.x : CANVAS_W / 2, 0, CANVAS_W);
  const cy = clampNumber(Number.isFinite(layer.y) ? layer.y : CANVAS_H / 2, 0, CANVAS_H);
  const rw = clampNumber(bw, 24, CANVAS_W);
  const rh = clampNumber(bh, 24, CANVAS_H);
  cropRect.value = clampCropRect(
    { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh },
    { w: CANVAS_W, h: CANVAS_H }
  );
  toolMode.value = 'crop';
  smartHint.value = ui.value.cropHint;
  closeMenus();
};

const beginStraighten = () => {
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  closeMenus();
  cropRect.value = null;
  cropDrag.value = null;
  toolMode.value = 'straighten';
  const base = Number.isFinite(layer.rotate) ? layer.rotate : 0;
  straightenBaseRotate.value = base;
  straightenAngle.value = clampNumber(base, -45, 45);
  straightenTargetLayerId.value = layer.id;
  smartHint.value = ui.value.straightenHint;
};

const cancelCrop = () => {
  toolMode.value = 'none';
  cropRect.value = null;
  cropDrag.value = null;
  cropTargetLayerId.value = null;
  smartHint.value = '';
};

const cancelStraighten = () => {
  const id = straightenTargetLayerId.value;
  const base = straightenBaseRotate.value;
  if (id && base !== null) {
    const target = layers.value.find((l) => l.id === id) || null;
    if (target && !target.locked) updateLayerById(id, (l) => ({ ...l, rotate: base }));
  }
  toolMode.value = 'none';
  straightenBaseRotate.value = null;
  straightenTargetLayerId.value = null;
  smartHint.value = '';
};

watch(selectedLayerId, () => {
  closeMenus();
  smartHint.value = '';
  if (toolMode.value === 'crop') cancelCrop();
  if (toolMode.value === 'straighten') cancelStraighten();
  if (toolMode.value === 'restore') cancelRestore();
  if (toolMode.value === 'cutout') cancelCutout();
});

const onStraightenInput = () => {
  const id = straightenTargetLayerId.value;
  if (!id) return;
  const layer = layers.value.find((l) => l.id === id) || null;
  if (!layer || layer.locked) return;
  const angle = clampNumber(Number(straightenAngle.value), -45, 45);
  straightenAngle.value = angle;
  updateLayerById(layer.id, (l) => ({ ...l, rotate: angle }));
};

const applyStraighten = () => {
  const id = straightenTargetLayerId.value;
  const base = straightenBaseRotate.value;
  if (!id) return;
  const layer = layers.value.find((l) => l.id === id) || null;
  if (!layer || layer.locked) return;
  if (base !== null) {
    updateLayerById(layer.id, (l) => ({ ...l, rotate: base }));
  }
  pushHistory();
  const angle = clampNumber(Number(straightenAngle.value), -45, 45);
  updateLayerById(layer.id, (l) => ({ ...l, rotate: angle }));
  toolMode.value = 'none';
  straightenBaseRotate.value = null;
  straightenTargetLayerId.value = null;
  smartHint.value = '';
};

const bakeStraighten = async () => {
  const id = straightenTargetLayerId.value;
  if (!id) return;
  const layer = layers.value.find((l) => l.id === id) || null;
  if (!layer || layer.locked) return;

  const img = await decodeImage(layer.src);
  if (!img) return;
  const iw = layer.naturalWidth || img.naturalWidth || 0;
  const ih = layer.naturalHeight || img.naturalHeight || 0;
  if (!iw || !ih) return;

  const angleDeg = Number.isFinite(layer.rotate) ? layer.rotate : 0;
  const angle = (angleDeg * Math.PI) / 180;
  const absSin = Math.abs(Math.sin(angle));
  const absCos = Math.abs(Math.cos(angle));
  const bw = Math.max(1, Math.ceil(iw * absCos + ih * absSin));
  const bh = Math.max(1, Math.ceil(iw * absSin + ih * absCos));

  const rot = document.createElement('canvas');
  rot.width = bw;
  rot.height = bh;
  const rctx = rot.getContext('2d');
  if (!rctx) return;
  rctx.clearRect(0, 0, bw, bh);
  rctx.translate(bw / 2, bh / 2);
  rctx.rotate(angle);
  rctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);

  const ins = rotatedRectWithMaxArea(iw, ih, angle);
  const cw = Math.max(1, Math.min(bw, ins.w));
  const ch = Math.max(1, Math.min(bh, ins.h));
  const sx = Math.max(0, Math.floor((bw - cw) / 2));
  const sy = Math.max(0, Math.floor((bh - ch) / 2));

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const octx = out.getContext('2d');
  if (!octx) return;
  octx.clearRect(0, 0, cw, ch);
  octx.drawImage(rot, sx, sy, cw, ch, 0, 0, cw, ch);
  const url = out.toDataURL('image/png');

  const prevSx = Number.isFinite(layer.scaleX) ? layer.scaleX : 1;
  const prevSy = Number.isFinite(layer.scaleY) ? layer.scaleY : 1;
  const nextScaleX = clamp((prevSx * iw) / cw, 0.02, 20);
  const nextScaleY = clamp((prevSy * ih) / ch, 0.02, 20);

  pushHistory();
  updateLayerById(layer.id, (l) => ({
    ...l,
    src: url,
    naturalWidth: cw,
    naturalHeight: ch,
    rotate: 0,
    scaleX: nextScaleX,
    scaleY: nextScaleY
  }));

  toolMode.value = 'none';
  straightenBaseRotate.value = null;
  straightenTargetLayerId.value = null;
  smartHint.value = '';
};

const autoStraighten = async () => {
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  const img = await decodeImage(layer.src);
  if (!img) return;
  const iw = layer.naturalWidth || img.naturalWidth || 0;
  const ih = layer.naturalHeight || img.naturalHeight || 0;
  if (!iw || !ih) return;
  const maxSide = 560;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const dw = Math.max(8, Math.round(iw * scale));
  const dh = Math.max(8, Math.round(ih * scale));
  const c = document.createElement('canvas');
  c.width = dw;
  c.height = dh;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, dw, dh);
  ctx.drawImage(img, 0, 0, iw, ih, 0, 0, dw, dh);
  const data = ctx.getImageData(0, 0, dw, dh);
  const tilt = detectTiltAngle(data);
  const target = clampNumber(-tilt, -45, 45);
  straightenAngle.value = Math.round((target + Number.EPSILON) * 10) / 10;
  onStraightenInput();
};

const onCropOverlayPointerDown = (e: PointerEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const pt = getCropPoint(e);
  if (!pt) return;
  closeMenus();
  const pid = typeof e.pointerId === 'number' ? e.pointerId : 0;
  const base = cropRect.value;
  if (base && isPointInRect(pt, base)) {
    cropDrag.value = {
      active: true,
      mode: 'move',
      pointerId: pid,
      startX: pt.x,
      startY: pt.y,
      base: { ...base },
      handle: null
    };
  } else {
    cropDrag.value = {
      active: true,
      mode: 'draw',
      pointerId: pid,
      startX: pt.x,
      startY: pt.y,
      base: null,
      handle: null
    };
    cropRect.value = clampCropRect(
      { x: pt.x, y: pt.y, w: 12, h: 12 },
      { w: CANVAS_W, h: CANVAS_H }
    );
  }
  try {
    cropOverlayRef.value?.setPointerCapture?.(pid);
  } catch {}
};

const onCropRectPointerDown = (e: PointerEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const pt = getCropPoint(e);
  if (!pt || !cropRect.value) return;
  const pid = typeof e.pointerId === 'number' ? e.pointerId : 0;
  cropDrag.value = {
    active: true,
    mode: 'move',
    pointerId: pid,
    startX: pt.x,
    startY: pt.y,
    base: { ...cropRect.value },
    handle: null
  };
  try {
    cropOverlayRef.value?.setPointerCapture?.(pid);
  } catch {}
};

const onCropHandlePointerDown = (e: PointerEvent, h: (typeof cropHandles)[number]) => {
  e.preventDefault();
  e.stopPropagation();
  const pt = getCropPoint(e);
  if (!pt || !cropRect.value) return;
  const pid = typeof e.pointerId === 'number' ? e.pointerId : 0;
  cropDrag.value = {
    active: true,
    mode: 'resize',
    pointerId: pid,
    startX: pt.x,
    startY: pt.y,
    base: { ...cropRect.value },
    handle: h
  };
  try {
    cropOverlayRef.value?.setPointerCapture?.(pid);
  } catch {}
};

const onCropOverlayPointerMove = (e: PointerEvent) => {
  const st = cropDrag.value;
  if (!st?.active) return;
  if (typeof e.pointerId === 'number' && e.pointerId !== st.pointerId) return;
  const pt = getCropPoint(e);
  if (!pt) return;
  const dx = pt.x - st.startX;
  const dy = pt.y - st.startY;
  if (st.mode === 'move' && st.base) {
    scheduleCropRect(
      clampCropRect(
        { x: st.base.x + dx, y: st.base.y + dy, w: st.base.w, h: st.base.h },
        { w: CANVAS_W, h: CANVAS_H }
      )
    );
    return;
  }
  if (st.mode === 'draw') {
    scheduleCropRect(
      clampCropRect(normalizeCropRect({ x: st.startX, y: st.startY }, pt), {
        w: CANVAS_W,
        h: CANVAS_H
      })
    );
    return;
  }
  if (st.mode === 'resize' && st.base && st.handle) {
    let left = st.base.x;
    let right = st.base.x + st.base.w;
    let top = st.base.y;
    let bottom = st.base.y + st.base.h;
    const h = st.handle;
    if (h.includes('w')) left = st.base.x + dx;
    if (h.includes('e')) right = st.base.x + st.base.w + dx;
    if (h.includes('n')) top = st.base.y + dy;
    if (h.includes('s')) bottom = st.base.y + st.base.h + dy;
    const next = clampCropRect(
      {
        x: Math.min(left, right),
        y: Math.min(top, bottom),
        w: Math.abs(right - left),
        h: Math.abs(bottom - top)
      },
      { w: CANVAS_W, h: CANVAS_H }
    );
    scheduleCropRect(next);
  }
};

const onCropOverlayPointerUp = (e: PointerEvent) => {
  flushCropRect();
  const st = cropDrag.value;
  if (!st?.active) {
    cropDrag.value = null;
    return;
  }
  if (typeof e.pointerId === 'number' && e.pointerId !== st.pointerId) return;
  cropDrag.value = null;
};

const decodeImage = (() => {
  const cache = new Map<string, Promise<HTMLImageElement | null>>();
  return (src: string) => {
    const key = String(src || '');
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const p = new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      try {
        (el as any).decoding = 'async';
      } catch {}
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = key;
    });
    cache.set(key, p);
    if (cache.size > 128) {
      const first = cache.keys().next().value as string | undefined;
      if (first) cache.delete(first);
    }
    return p;
  };
})();

const readPixelsForLayer = async (layer: ImageLayer, src: string) => {
  const img = await decodeImage(src);
  const w = Math.max(0, Math.trunc(layer.naturalWidth || img?.naturalWidth || 0));
  const h = Math.max(0, Math.trunc(layer.naturalHeight || img?.naturalHeight || 0));
  if (!img || !w || !h) return null;

  const canvas = scratchCanvasRef.value || document.createElement('canvas');
  scratchCanvasRef.value = canvas;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return { w, h, data: new Uint8ClampedArray(imageData.data) };
};

const drawLayerToContext = async (
  ctx: CanvasRenderingContext2D,
  layer: ImageLayer,
  image?: HTMLImageElement | null
) => {
  const img = image ?? (await decodeImage(layer.src));
  if (!img) return false;
  const iw = layer.naturalWidth || img.naturalWidth || 0;
  const ih = layer.naturalHeight || img.naturalHeight || 0;
  if (!iw || !ih) return false;
  ctx.imageSmoothingEnabled = true;
  try {
    ctx.imageSmoothingQuality = 'high';
  } catch {}
  const sx = Number.isFinite(layer.scaleX) ? layer.scaleX : 1;
  const sy = Number.isFinite(layer.scaleY) ? layer.scaleY : 1;
  const rot = ((Number.isFinite(layer.rotate) ? layer.rotate : 0) * Math.PI) / 180;
  const x = Number.isFinite(layer.x) ? layer.x : 0;
  const y = Number.isFinite(layer.y) ? layer.y : 0;
  const fx = layer.flipX ? -1 : 1;
  const fy = layer.flipY ? -1 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sx * fx, sy * fy);
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
  return true;
};

const applyCrop = async () => {
  flushCropRect();
  const id = cropTargetLayerId.value;
  const r = cropRect.value;
  if (!id || !r) return;
  const layer = layers.value.find((l) => l.id === id) || null;
  if (!layer || layer.locked) return;
  const w = Math.max(1, Math.round(r.w));
  const h = Math.max(1, Math.round(r.h));
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return;
  octx.clearRect(0, 0, w, h);
  octx.save();
  octx.translate(-x, -y);
  const ok = await drawLayerToContext(octx, layer);
  octx.restore();
  if (!ok) return;
  const url = await canvasToOwnedUrl(out);
  const nx = x + w / 2;
  const ny = y + h / 2;
  pushHistory();
  layers.value = layers.value.map((l) =>
    l.id === layer.id
      ? {
          ...l,
          src: url,
          naturalWidth: w,
          naturalHeight: h,
          x: nx,
          y: ny,
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
          flipX: false,
          flipY: false
        }
      : l
  );
  cancelCrop();
  gcObjectUrls();
};

const layerWidthMm = computed<number>({
  get() {
    const layer = selectedLayer.value;
    if (!layer) return 0;
    const s = Number.isFinite(layer.scaleX) ? layer.scaleX : 1;
    const wPx = (layer.naturalWidth || 0) * s;
    return Math.max(0, Math.round((wPx * MM_PER_PX + Number.EPSILON) * 100) / 100);
  },
  set(v) {
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    const wPx = n / MM_PER_PX;
    const base = layer.naturalWidth || 0;
    if (base <= 0) return;
    ensureEditHistory();
    const s = clamp(wPx / base, 0.02, 20);
    layers.value = layers.value.map((l) =>
      l.id === layer.id ? { ...l, scaleX: s, scaleY: aspectLocked.value ? s : l.scaleY } : l
    );
  }
});

const layerHeightMm = computed<number>({
  get() {
    const layer = selectedLayer.value;
    if (!layer) return 0;
    const s = Number.isFinite(layer.scaleY) ? layer.scaleY : 1;
    const hPx = (layer.naturalHeight || 0) * s;
    return Math.max(0, Math.round((hPx * MM_PER_PX + Number.EPSILON) * 100) / 100);
  },
  set(v) {
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    const hPx = n / MM_PER_PX;
    const base = layer.naturalHeight || 0;
    if (base <= 0) return;
    ensureEditHistory();
    const s = clamp(hPx / base, 0.02, 20);
    layers.value = layers.value.map((l) =>
      l.id === layer.id ? { ...l, scaleY: s, scaleX: aspectLocked.value ? s : l.scaleX } : l
    );
  }
});

const layerScale = computed<number>({
  get() {
    const layer = selectedLayer.value;
    if (!layer) return 1;
    const sx = Number.isFinite(layer.scaleX) ? layer.scaleX : 1;
    const sy = Number.isFinite(layer.scaleY) ? layer.scaleY : 1;
    return Math.round(((sx + sy) / 2 + Number.EPSILON) * 1000) / 1000;
  },
  set(v) {
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    ensureEditHistory();
    const s = clamp(n, 0.02, 20);
    layers.value = layers.value.map((l) =>
      l.id === layer.id ? { ...l, scaleX: s, scaleY: s } : l
    );
  }
});

const toggleAspectLock = () => {
  const next = !aspectLocked.value;
  aspectLocked.value = next;
  const layer = selectedLayer.value;
  if (!next || !layer || layer.locked) return;
  const sx = Number.isFinite(layer.scaleX) ? layer.scaleX : 1;
  const sy = Number.isFinite(layer.scaleY) ? layer.scaleY : 1;
  const s = clamp((sx + sy) / 2, 0.02, 20);
  pushHistory();
  layers.value = layers.value.map((l) => (l.id === layer.id ? { ...l, scaleX: s, scaleY: s } : l));
};

const layerOpacityPercent = computed<number>({
  get() {
    const layer = selectedLayer.value;
    if (!layer) return 100;
    const op = Number.isFinite(layer.opacity) ? layer.opacity : 1;
    return clamp(Math.round(op * 100), 0, 100);
  },
  set(v) {
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    ensureEditHistory();
    layers.value = layers.value.map((l) =>
      l.id === layer.id ? { ...l, opacity: clamp(n / 100, 0, 1) } : l
    );
  }
});

const selectedX = computed<number>({
  get() {
    const layer = selectedLayer.value;
    if (!layer) return 0;
    return Number.isFinite(layer.x) ? layer.x : 0;
  },
  set(v) {
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    ensureEditHistory();
    updateLayerById(layer.id, (l) => ({ ...l, x: n }));
  }
});

const selectedY = computed<number>({
  get() {
    const layer = selectedLayer.value;
    if (!layer) return 0;
    return Number.isFinite(layer.y) ? layer.y : 0;
  },
  set(v) {
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    ensureEditHistory();
    updateLayerById(layer.id, (l) => ({ ...l, y: n }));
  }
});

const selectedRotate = computed<number>({
  get() {
    const layer = selectedLayer.value;
    if (!layer) return 0;
    return Number.isFinite(layer.rotate) ? layer.rotate : 0;
  },
  set(v) {
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    ensureEditHistory();
    updateLayerById(layer.id, (l) => ({ ...l, rotate: n }));
  }
});

const selectedName = computed<string>({
  get() {
    const layer = selectedLayer.value;
    return String(layer?.name || '');
  },
  set(v) {
    const layer = selectedLayer.value;
    if (!layer || layer.locked) return;
    ensureEditHistory();
    updateLayerById(layer.id, (l) => ({ ...l, name: String(v ?? '') }));
  }
});

const toggleFlipMenu = () => {
  if (!hasSelection.value) return;
  orderMenuOpen.value = false;
  flipMenuOpen.value = !flipMenuOpen.value;
};

const toggleOrderMenu = () => {
  if (!hasSelection.value) return;
  flipMenuOpen.value = false;
  orderMenuOpen.value = !orderMenuOpen.value;
};

const toggleLayerMenu = (id: string, event?: MouseEvent) => {
  if (layerMenuOpenId.value === id) {
    layerMenuOpenId.value = null;
    return;
  }
  layerMenuOpenId.value = id;
  const shell = editorShellRef.value;
  const target = event?.currentTarget as HTMLElement | undefined;
  if (!shell || !target) return;
  const shellRect = shell.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const menuWidth = 190;
  const menuHeight = 190;
  const x = clampNumber(
    targetRect.right - shellRect.left - menuWidth,
    12,
    Math.max(12, shellRect.width - menuWidth - 12)
  );
  const y = clampNumber(
    targetRect.bottom - shellRect.top + 8,
    12,
    Math.max(12, shellRect.height - menuHeight - 12)
  );
  layerMenuPosition.value = { x, y };
};

const duplicateSelected = () => {
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  pushHistory();
  const id = genId();
  layers.value = [
    ...layers.value,
    {
      ...layer,
      id,
      name: `${layer.name || 'Layer'} copy`,
      x: layer.x + 20,
      y: layer.y + 20
    }
  ];
  selectedLayerId.value = id;
};

const toggleLockedSelected = () => {
  const layer = selectedLayer.value;
  if (!layer) return;
  toggleLocked(layer.id);
};

const flipHorizontal = () => {
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  pushHistory();
  layers.value = layers.value.map((l) => (l.id === layer.id ? { ...l, flipX: !l.flipX } : l));
  flipMenuOpen.value = false;
};

const flipVertical = () => {
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  pushHistory();
  layers.value = layers.value.map((l) => (l.id === layer.id ? { ...l, flipY: !l.flipY } : l));
  flipMenuOpen.value = false;
};

const moveLayer = (id: string, dir: 'top' | 'up' | 'down' | 'bottom') => {
  const idx = layers.value.findIndex((l) => l.id === id);
  if (idx < 0) return;
  const next = [...layers.value];
  const [it] = next.splice(idx, 1);
  if (!it) return;
  let to = idx;
  if (dir === 'top') to = next.length;
  if (dir === 'bottom') to = 0;
  if (dir === 'up') to = Math.min(next.length, idx + 1);
  if (dir === 'down') to = Math.max(0, idx - 1);
  next.splice(to, 0, it);
  pushHistory();
  layers.value = next;
  layerMenuOpenId.value = null;
  orderMenuOpen.value = false;
};

const moveSelected = (dir: 'top' | 'up' | 'down' | 'bottom') => {
  const id = selectedLayerId.value;
  if (!id) return;
  moveLayer(id, dir);
};

const smartAction = (id: string) => {
  const en = currentLang.value === 'en';
  if (id === 'crop') {
    beginCrop();
    return;
  }
  if (id === 'straighten') {
    beginStraighten();
    return;
  }
  if (id === 'cutout') {
    beginCutout();
    return;
  }
  if (id === 'upscale') {
    applyUpscale2x();
    return;
  }
  if (id === 'retouch') {
    beginRestore();
    return;
  }
  if (id === 'restyle') {
    applyRestyle();
    return;
  }
  if (id === 'erase') {
    applyErase();
    return;
  }
  toolMode.value = 'none';
  cropRect.value = null;
  cropDrag.value = null;
  smartHint.value = en
    ? `“${id}” is queued. This section will be implemented next.`
    : `「${id}」已进入待办，下一步会把这里逐个补齐。`;
};

const applyRestyle = async () => {
  closeMenus();
  toolMode.value = 'none';
  cropRect.value = null;
  cropDrag.value = null;
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  const src = layer.src;
  if (!src) return;
  const base = await readPixelsForLayer(layer, src);
  if (!base) return;
  const w = base.w;
  const h = base.h;
  const out = new Uint8ClampedArray(base.data.length);
  const sat = 1.18;
  const contrast = 1.12;
  const warmR = 12;
  const warmG = 6;
  const warmB = -8;
  for (let i = 0; i < base.data.length; i += 4) {
    const a = base.data[i + 3];
    if (a === 0) {
      out[i] = base.data[i];
      out[i + 1] = base.data[i + 1];
      out[i + 2] = base.data[i + 2];
      out[i + 3] = 0;
      continue;
    }
    const r = base.data[i];
    const g = base.data[i + 1];
    const b = base.data[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let rr = luma + (r - luma) * sat;
    let gg = luma + (g - luma) * sat;
    let bb = luma + (b - luma) * sat;
    rr = (rr - 128) * contrast + 128 + warmR;
    gg = (gg - 128) * contrast + 128 + warmG;
    bb = (bb - 128) * contrast + 128 + warmB;
    out[i] = clamp(rr, 0, 255);
    out[i + 1] = clamp(gg, 0, 255);
    out[i + 2] = clamp(bb, 0, 255);
    out[i + 3] = a;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
  const url = await canvasToOwnedUrl(canvas);
  pushHistory();
  layers.value = layers.value.map((l) =>
    l.id === layer.id ? { ...l, src: url, naturalWidth: w, naturalHeight: h } : l
  );
  gcObjectUrls();
  showEditorTip(currentLang.value === 'en' ? 'Restyle applied.' : '风格化已应用');
};

const applyErase = async () => {
  closeMenus();
  toolMode.value = 'none';
  cropRect.value = null;
  cropDrag.value = null;
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  const src = layer.src;
  if (!src) return;
  const base = await readPixelsForLayer(layer, src);
  if (!base) return;
  const w = base.w;
  const h = base.h;
  const threshold = clampNumber(cutoutThreshold.value + 0.2, 0.05, 0.95);
  const out = removeBackgroundAlgorithm1(
    { width: w, height: h, data: base.data },
    { threshold, feather: 0.8 }
  );
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.putImageData(new ImageData(out.data, w, h), 0, 0);
  const url = await canvasToOwnedUrl(canvas);
  pushHistory();
  layers.value = layers.value.map((l) =>
    l.id === layer.id ? { ...l, src: url, naturalWidth: w, naturalHeight: h } : l
  );
  gcObjectUrls();
  showEditorTip(currentLang.value === 'en' ? 'Erase applied.' : '消除已应用');
};

const applyUpscale2x = async () => {
  if (isUpscaling.value) return;
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  const job = (upscaleJobId.value += 1);
  isUpscaling.value = true;
  smartHint.value = currentLang.value === 'en' ? 'Processing...' : '处理中...';
  await nextTick();
  try {
    const img = await decodeImage(layer.src);
    if (!img) return;
    const w0 = layer.naturalWidth || img.naturalWidth || 0;
    const h0 = layer.naturalHeight || img.naturalHeight || 0;
    if (!w0 || !h0) return;
    const w = Math.max(1, Math.min(16384, w0 * 2));
    const h = Math.max(1, Math.min(16384, h0 * 2));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    try {
      ctx.imageSmoothingQuality = 'high';
    } catch {}
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const sharpened = restoreImageAlgorithm1(
      { width: w, height: h, data: imageData.data },
      { strength: 0.25, denoise: 0.04 }
    );
    ctx.putImageData(new ImageData(sharpened.data, w, h), 0, 0);
    const url = await canvasToOwnedUrl(canvas);
    if (upscaleJobId.value !== job) return;
    pushHistory();
    updateLayerById(layer.id, (l) => ({
      ...l,
      src: url,
      naturalWidth: w,
      naturalHeight: h,
      scaleX: (Number.isFinite(l.scaleX) ? l.scaleX : 1) / 2,
      scaleY: (Number.isFinite(l.scaleY) ? l.scaleY : 1) / 2
    }));
    gcObjectUrls();
  } finally {
    if (upscaleJobId.value === job) {
      isUpscaling.value = false;
      smartHint.value = '';
    }
  }
};

const beginCutout = () => {
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;
  closeMenus();
  toolMode.value = 'cutout';
  cropRect.value = null;
  cropDrag.value = null;
  cutoutBasePixels.value = null;
  cutoutTargetLayerId.value = layer.id;
  smartHint.value = ui.value.cutoutHint;
};

const cancelCutout = () => {
  isCutoutProcessing.value = false;
  cutoutJobId.value += 1;
  cutoutBasePixels.value = null;
  cutoutTargetLayerId.value = null;
  toolMode.value = 'none';
  smartHint.value = '';
};

const applyCutoutRemove = async () => {
  if (isCutoutProcessing.value) return;
  if (toolMode.value !== 'cutout') return;
  const id = cutoutTargetLayerId.value;
  if (!id) return;
  const layer = layers.value.find((l) => l.id === id) || null;
  if (!layer || layer.locked) return;
  const job = (cutoutJobId.value += 1);
  isCutoutProcessing.value = true;
  smartHint.value = ui.value.cutoutProcessing;
  await nextTick();

  try {
    const src = layer.src;
    const w = Math.max(0, Math.trunc(layer.naturalWidth || 0));
    const h = Math.max(0, Math.trunc(layer.naturalHeight || 0));
    if (!src || !w || !h) return;
    const hit = cutoutBasePixels.value;
    const base =
      hit && hit.layerId === layer.id && hit.src === src && hit.w === w && hit.h === h
        ? hit
        : await (async () => {
            const r = await readPixelsForLayer(layer, src);
            if (!r) return null;
            const next = { layerId: layer.id, src, w: r.w, h: r.h, data: r.data };
            cutoutBasePixels.value = next;
            return next;
          })();
    if (!base) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const out = removeBackgroundAlgorithm1(
      { width: w, height: h, data: base.data },
      { threshold: cutoutThreshold.value, feather: 0.6 }
    );
    ctx.putImageData(new ImageData(out.data, w, h), 0, 0);
    const url = await canvasToOwnedUrl(canvas);
    if (cutoutJobId.value !== job) return;
    if (toolMode.value !== 'cutout') return;
    if (cutoutTargetLayerId.value !== id) return;
    pushHistory();
    layers.value = layers.value.map((l) =>
      l.id === layer.id ? { ...l, src: url, naturalWidth: w, naturalHeight: h } : l
    );
    gcObjectUrls();
  } finally {
    if (cutoutJobId.value === job) {
      isCutoutProcessing.value = false;
      smartHint.value = ui.value.cutoutHint;
    }
  }
};

const applyCutoutSplit = async () => {
  if (isCutoutProcessing.value) return;
  if (toolMode.value !== 'cutout') return;
  const id = cutoutTargetLayerId.value;
  if (!id) return;
  const layer = layers.value.find((l) => l.id === id) || null;
  if (!layer || layer.locked) return;
  const job = (cutoutJobId.value += 1);
  isCutoutProcessing.value = true;
  smartHint.value = ui.value.cutoutProcessing;
  await nextTick();

  try {
    const src = layer.src;
    const w = Math.max(0, Math.trunc(layer.naturalWidth || 0));
    const h = Math.max(0, Math.trunc(layer.naturalHeight || 0));
    if (!src || !w || !h) return;
    const hit = cutoutBasePixels.value;
    const base =
      hit && hit.layerId === layer.id && hit.src === src && hit.w === w && hit.h === h
        ? hit
        : await (async () => {
            const r = await readPixelsForLayer(layer, src);
            if (!r) return null;
            const next = { layerId: layer.id, src, w: r.w, h: r.h, data: r.data };
            cutoutBasePixels.value = next;
            return next;
          })();
    if (!base) return;

    const out = splitLayersAlgorithm1(
      { width: w, height: h, data: base.data },
      { threshold: cutoutThreshold.value, feather: 0.6 }
    );

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.putImageData(new ImageData(out.foreground, w, h), 0, 0);
    const fgUrl = await canvasToOwnedUrl(canvas);
    ctx.putImageData(new ImageData(out.background, w, h), 0, 0);
    const bgUrl = await canvasToOwnedUrl(canvas);

    if (cutoutJobId.value !== job) return;
    if (toolMode.value !== 'cutout') return;
    if (cutoutTargetLayerId.value !== id) return;
    const idx = layers.value.findIndex((l) => l.id === layer.id);
    if (idx < 0) return;
    const fgLayer: ImageLayer = {
      ...layer,
      id: genId(),
      name: `${layer.name || 'Layer'}-FG`,
      src: fgUrl,
      naturalWidth: w,
      naturalHeight: h
    };
    const bgLayer: ImageLayer = {
      ...layer,
      id: genId(),
      name: `${layer.name || 'Layer'}-BG`,
      src: bgUrl,
      naturalWidth: w,
      naturalHeight: h
    };
    pushHistory();
    const next = [...layers.value];
    next.splice(idx, 1, bgLayer, fgLayer);
    layers.value = next;
    selectedLayerId.value = fgLayer.id;
    gcObjectUrls();
  } finally {
    if (cutoutJobId.value === job) {
      isCutoutProcessing.value = false;
      smartHint.value = ui.value.cutoutHint;
    }
  }
};

const runRestorePreview = async () => {
  if (toolMode.value !== 'restore') return;
  const id = restoreTargetLayerId.value;
  if (!id) return;
  const layer = layers.value.find((l) => l.id === id) || null;
  if (!layer || layer.locked) return;

  const baseSrc = originalLayerSrc.value || layer.src;
  if (!baseSrc) return;
  originalLayerSrc.value = baseSrc;

  const job = (restoreJobId.value += 1);
  isRestoring.value = true;
  smartHint.value = ui.value.restoreProcessing;
  await nextTick();

  try {
    const hit = restoreBasePixels.value;
    const base =
      hit && hit.layerId === layer.id && hit.src === baseSrc
        ? hit
        : await (async () => {
            const r = await readPixelsForLayer(layer, baseSrc);
            if (!r) return null;
            const next = { layerId: layer.id, src: baseSrc, w: r.w, h: r.h, data: r.data };
            restoreBasePixels.value = next;
            return next;
          })();
    if (!base) return;
    const w = base.w;
    const h = base.h;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const restored = restoreImageAlgorithm1(
      { width: w, height: h, data: base.data },
      { strength: restoreStrength.value, denoise: restoreDenoise.value }
    );
    ctx.putImageData(new ImageData(restored.data, w, h), 0, 0);
    const url = await canvasToOwnedUrl(canvas);

    if (restoreJobId.value !== job) return;
    if (toolMode.value !== 'restore') return;
    if (restoreTargetLayerId.value !== id) return;

    restorePreviewSrc.value = url;
    if (!restoreComparing.value) {
      updateLayerById(id, (l) => ({ ...l, src: url, naturalWidth: w, naturalHeight: h }));
    }
    gcObjectUrls();
  } finally {
    if (restoreJobId.value === job) {
      isRestoring.value = false;
      smartHint.value = ui.value.restoreHint;
    }
  }
};

const onRestoreInput = () => {
  if (toolMode.value !== 'restore') return;
  if (restoreComparing.value) {
    restoreDirty.value = true;
    return;
  }
  if (restoreDebounceTimer.value) window.clearTimeout(restoreDebounceTimer.value);
  restoreDebounceTimer.value = window.setTimeout(() => {
    runRestorePreview();
  }, 150);
};

const beginRestore = () => {
  const layer = selectedLayer.value;
  if (!layer || layer.locked) return;

  closeMenus();
  toolMode.value = 'restore';
  cropRect.value = null;
  cropDrag.value = null;
  smartHint.value = ui.value.restoreHint;

  restoreTargetLayerId.value = layer.id;
  originalLayerSrc.value = layer.src;
  restorePreviewSrc.value = null;
  restoreComparing.value = false;
  restoreDirty.value = false;
  restoreBasePixels.value = null;
  if (restoreDebounceTimer.value) window.clearTimeout(restoreDebounceTimer.value);

  runRestorePreview();
};

const cancelRestore = () => {
  if (restoreDebounceTimer.value) window.clearTimeout(restoreDebounceTimer.value);
  restoreDebounceTimer.value = null;
  restoreJobId.value += 1;
  isRestoring.value = false;
  restoreComparing.value = false;
  restoreDirty.value = false;
  restoreBasePixels.value = null;

  const id = restoreTargetLayerId.value;
  const orig = originalLayerSrc.value;
  if (id && orig) {
    updateLayerById(id, (l) => ({ ...l, src: orig }));
  }

  restoreTargetLayerId.value = null;
  originalLayerSrc.value = null;
  restorePreviewSrc.value = null;
  toolMode.value = 'none';
  smartHint.value = '';
  gcObjectUrls();
};

const resetRestore = () => {
  restoreStrength.value = RESTORE_DEFAULT_STRENGTH;
  restoreDenoise.value = RESTORE_DEFAULT_DENOISE;
  restoreDirty.value = false;
  runRestorePreview();
};

const applyRestore = async () => {
  if (isRestoring.value) return;
  const id = restoreTargetLayerId.value;
  const orig = originalLayerSrc.value;
  if (!id || !orig) return;

  restoreComparing.value = false;
  restoreDirty.value = false;
  const preview = restorePreviewSrc.value;
  if (preview) {
    updateLayerById(id, (l) => ({ ...l, src: preview }));
  } else {
    await runRestorePreview();
  }

  const finalPreview = restorePreviewSrc.value;
  if (!finalPreview || finalPreview === orig) {
    restoreTargetLayerId.value = null;
    originalLayerSrc.value = null;
    restorePreviewSrc.value = null;
    toolMode.value = 'none';
    smartHint.value = ui.value.restoreHint;
    return;
  }

  const snap = snapshotState();
  const layerInSnap = snap.layers.find((l) => l.id === id) || null;
  if (layerInSnap) layerInSnap.src = orig;
  history.value.push(snap);
  if (history.value.length > 80) history.value = history.value.slice(-80);
  redoStack.value = [];

  restoreTargetLayerId.value = null;
  originalLayerSrc.value = null;
  restorePreviewSrc.value = null;
  toolMode.value = 'none';
  smartHint.value = ui.value.restoreHint;
};

const compareRestoreStart = () => {
  const id = restoreTargetLayerId.value;
  const orig = originalLayerSrc.value;
  if (!id || !orig) return;
  restoreComparing.value = true;
  if (restoreDebounceTimer.value) window.clearTimeout(restoreDebounceTimer.value);
  restoreDebounceTimer.value = null;
  updateLayerById(id, (l) => ({ ...l, src: orig }));
};

const compareRestoreEnd = () => {
  const id = restoreTargetLayerId.value;
  if (!id) return;
  if (!restoreComparing.value) return;
  restoreComparing.value = false;
  if (restoreDirty.value) {
    restoreDirty.value = false;
    runRestorePreview();
    return;
  }
  const preview = restorePreviewSrc.value;
  if (preview) {
    updateLayerById(id, (l) => ({ ...l, src: preview }));
    return;
  }
  runRestorePreview();
};

const onLayerPointerDown = (e: PointerEvent, layerId: string) => {
  if (spacePressed.value || isPanMode.value || e.button === 1) {
    closeMenus();
    flushLayerMove();
    const pid = typeof e.pointerId === 'number' ? e.pointerId : 0;
    viewportDrag.value = {
      active: true,
      pointerId: pid,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: { ...viewportOffset.value }
    };
    dragState.value = null;
    try {
      stageRef.value?.setPointerCapture?.(pid);
    } catch {}
    return;
  }
  const layer = layers.value.find((l) => l.id === layerId) || null;
  if (!layer || layer.locked || !layer.visible) return;
  selectedLayerId.value = layerId;
  closeMenus();
  pushHistory();
  viewportDrag.value = null;
  flushLayerMove();
  const pid = typeof e.pointerId === 'number' ? e.pointerId : 0;
  dragState.value = {
    active: true,
    layerId,
    pointerId: pid,
    startX: e.clientX,
    startY: e.clientY,
    baseX: layer.x,
    baseY: layer.y
  };
  try {
    stageRef.value?.setPointerCapture?.(pid);
  } catch {}
};

const onStagePointerDown = (e: PointerEvent) => {
  dragState.value = null;
  flushViewportOffset();
  flushLayerMove();
  if (spacePressed.value || isPanMode.value || e.button === 1) {
    closeMenus();
    const pid = typeof e.pointerId === 'number' ? e.pointerId : 0;
    viewportDrag.value = {
      active: true,
      pointerId: pid,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: { ...viewportOffset.value }
    };
    try {
      stageRef.value?.setPointerCapture?.(pid);
    } catch {}
    return;
  }
  viewportDrag.value = null;
  closeMenus();
};

const onStagePointerMove = (e: PointerEvent) => {
  const vp = viewportDrag.value;
  if (vp?.active) {
    if (typeof e.pointerId === 'number' && e.pointerId !== vp.pointerId) return;
    scheduleViewportOffset({
      x: vp.startOffset.x + (e.clientX - vp.startX),
      y: vp.startOffset.y + (e.clientY - vp.startY)
    });
    return;
  }
  const st = dragState.value;
  if (!st?.active || !st.layerId) return;
  if (typeof e.pointerId === 'number' && e.pointerId !== st.pointerId) return;
  const s = Math.max(0.0001, viewportScale.value);
  const dx = (e.clientX - st.startX) / s;
  const dy = (e.clientY - st.startY) / s;
  scheduleLayerMove(st.layerId, st.baseX + dx, st.baseY + dy);
};

const onStagePointerUp = (e: PointerEvent) => {
  const vp = viewportDrag.value;
  if (vp?.active) {
    if (typeof e.pointerId === 'number' && e.pointerId !== vp.pointerId) return;
    flushViewportOffset();
    viewportDrag.value = null;
    return;
  }
  const st = dragState.value;
  if (!st?.active || !st.layerId) {
    dragState.value = null;
    return;
  }
  if (typeof e.pointerId === 'number' && e.pointerId !== st.pointerId) return;
  flushLayerMove();
  dragState.value = null;
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;700;900&display=swap');
@import '../styles/cyberpunk.css';

.image-editor-page {
  position: fixed;
  inset: 0;
  min-height: 100vh;
  background-color: #050505;
  color: #fff;
  font-family: 'Inter', sans-serif;
  display: flex;
  flex-direction: column;
  z-index: 2000;
}

.editor-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.editor-topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 12, 12, 0.6);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.topbar-left,
.topbar-center,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-center {
  justify-content: center;
}

.topbar-right {
  justify-content: flex-end;
}

.topbar-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.topbar-title-main {
  font-weight: 900;
  letter-spacing: 0.02em;
}

.topbar-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(204, 255, 0, 0.35);
  color: #ccff00;
}

.topbar-btn {
  font-family: 'JetBrains Mono', monospace;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e5e7eb;
  padding: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.topbar-btn:hover:enabled {
  border-color: rgba(204, 255, 0, 0.35);
  background: rgba(204, 255, 0, 0.08);
}

.topbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.topbar-btn.primary {
  border-color: rgba(204, 255, 0, 0.45);
  color: #ccff00;
}

.file-input {
  display: none;
}

.mobile-only {
  display: none;
}

.editor-tip {
  position: fixed;
  top: 74px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 140;
  max-width: min(680px, 92vw);
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
  color: rgba(248, 113, 113, 0.95);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  text-align: center;
}

.mobile-panel-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  z-index: 120;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px 1fr 340px;
}

.panel {
  min-height: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.65);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
}

.panel.right {
  border-right: none;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-header {
  padding: 14px 14px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #ccff00;
  letter-spacing: 0.08em;
}

.panel-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
  cursor: pointer;
}

.panel-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.layers-list {
  padding: 10px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 140px;
}

.layer-item {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  cursor: pointer;
  text-align: left;
  position: relative;
}

.layer-item.active {
  border-color: rgba(204, 255, 0, 0.4);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.18) inset;
}

.layer-thumb {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.layer-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.layer-name {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(148, 163, 184, 0.95);
}

.layer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.layer-menu-float {
  position: absolute;
  width: 190px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 10, 10, 0.92);
  border-radius: 14px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 200;
  box-shadow: 0 18px 30px rgba(0, 0, 0, 0.45);
}

.menu-item {
  width: 100%;
  text-align: left;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
  padding: 10px 10px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-item:hover {
  border-color: rgba(204, 255, 0, 0.35);
  background: rgba(204, 255, 0, 0.08);
}

.stage-wrap {
  min-height: 0;
  background:
    radial-gradient(circle at 30% 20%, rgba(204, 255, 0, 0.06), transparent 55%),
    radial-gradient(circle at 70% 80%, rgba(0, 200, 255, 0.05), transparent 55%), #050505;
}

.stage {
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  touch-action: none;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.04) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.04) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.04) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.04) 75%);
  background-size: 30px 30px;
  background-position:
    0 0,
    0 15px,
    15px -15px,
    -15px 0px;
}

.stage.pan-mode {
  cursor: grab;
}

.stage.pan-mode.panning {
  cursor: grabbing;
}

.viewport {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
}

.canvas-host {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.view-controls {
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 40;
}

.view-control-row {
  display: flex;
  gap: 8px;
}

.mode-toggle {
  display: flex;
  gap: 8px;
}

.view-btn {
  font-family: 'JetBrains Mono', monospace;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(229, 231, 235, 0.9);
  padding: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: all 0.2s;
}

.view-btn:hover:enabled {
  border-color: rgba(204, 255, 0, 0.35);
  background: rgba(204, 255, 0, 0.1);
  color: #ccff00;
}

.view-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mode-btn {
  font-family: 'JetBrains Mono', monospace;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(229, 231, 235, 0.9);
  padding: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: all 0.2s;
}

.mode-btn.active,
.mode-btn:hover {
  border-color: rgba(204, 255, 0, 0.35);
  background: rgba(204, 255, 0, 0.1);
  color: #ccff00;
}

.canvas-root {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5) inset;
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

.crop-overlay {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transform: none;
  z-index: 24;
  touch-action: none;
}

.crop-mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

.crop-rect {
  position: absolute;
  border: 2px solid rgba(204, 255, 0, 0.85);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.55) inset,
    0 10px 40px rgba(0, 0, 0, 0.35);
  background: rgba(204, 255, 0, 0.05);
  cursor: move;
}

.crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border-radius: 4px;
  border: 2px solid rgba(204, 255, 0, 0.85);
  background: rgba(5, 5, 5, 0.95);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
}

.stage-empty {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  width: min(520px, 90%);
  padding: 28px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
}

.stage-empty-title {
  font-size: 18px;
  font-weight: 900;
  margin-bottom: 10px;
}

.stage-empty-sub {
  font-size: 13px;
  color: rgba(148, 163, 184, 0.95);
  margin-bottom: 18px;
  line-height: 1.55;
}

.empty-btn {
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(204, 255, 0, 0.45);
  background: rgba(204, 255, 0, 0.08);
  color: #ccff00;
  padding: 10px 14px;
  border-radius: 12px;
  cursor: pointer;
}

.stage-image {
  position: absolute;
  user-select: none;
  -webkit-user-drag: none;
  border-radius: 6px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
}

.stage-image.active {
  outline: 2px solid rgba(204, 255, 0, 0.55);
  outline-offset: 2px;
}

.tools-body {
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
  flex: 1;
}

.tool-section {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 16px;
  padding: 12px;
}

.tool-section-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.95);
  margin-bottom: 10px;
}

.image-inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(229, 231, 235, 0.95);
}

.tiny-icon {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.size-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.size-field {
  display: grid;
  grid-template-columns: 18px 1fr 32px;
  gap: 8px;
  align-items: center;
}

.size-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.95);
}

.size-unit {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.95);
  text-align: right;
}

.fill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.fill-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.fill-thumb {
  width: 34px;
  height: 26px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
}

.fill-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.fill-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #e5e7eb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fill-right {
  display: grid;
  grid-template-columns: 1fr 18px;
  gap: 6px;
  align-items: center;
  width: 120px;
}

.action-row {
  display: flex;
  gap: 10px;
  position: relative;
  flex-wrap: wrap;
}

.action-icon {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.action-icon.danger {
  border-color: rgba(255, 80, 80, 0.35);
  background: rgba(255, 80, 80, 0.1);
}

.action-icon:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.popover {
  position: absolute;
  top: 46px;
  left: 0;
  width: 220px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 10, 10, 0.92);
  border-radius: 14px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 40;
}

.smart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
}

.smart-btn {
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
  padding: 0 12px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  gap: 8px;
}

.smart-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.smart-hint {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.95);
  line-height: 1.5;
}

.smart-inline {
  margin-top: 12px;
  display: flex;
  gap: 10px;
}

.straighten-panel {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.straighten-row {
  display: grid;
  grid-template-columns: 1fr 92px;
  gap: 10px;
  align-items: center;
}

.straighten-range {
  width: 100%;
}

.straighten-input {
  text-align: center;
}

.tool-row {
  display: flex;
  gap: 10px;
}

.tool-btn {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
  padding: 0 10px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  gap: 6px;
}

.tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inspector-empty {
  color: rgba(148, 163, 184, 0.95);
  font-size: 13px;
  line-height: 1.6;
}

.kv {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 10px;
  align-items: center;
}

.kv2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.kv2 .kv {
  grid-template-columns: 28px 1fr;
}

.k {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.95);
}

.v {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(229, 231, 235, 0.9);
  min-width: 44px;
  text-align: right;
}

.control {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  padding: 8px 10px;
  outline: none;
}

@media (max-width: 1024px) {
  .mobile-text-hidden {
    display: none;
  }
  .smart-grid {
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  }
  .editor-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .topbar-left {
    order: 1;
  }
  .topbar-center {
    order: 2;
  }
  .topbar-right {
    order: 3;
  }
  .mobile-only {
    display: inline-flex;
  }
  .editor-tip {
    top: 74px;
    font-size: 11px;
    max-width: 90vw;
  }
  .editor-body {
    grid-template-columns: 1fr;
  }
  .panel.left,
  .panel.right {
    display: none;
  }
  .panel.mobile-panel-open {
    display: flex;
    position: fixed;
    top: 74px;
    left: 12px;
    right: 12px;
    bottom: 24px;
    z-index: 130;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  }

  /* Increase touch targets for mobile */
  .topbar-btn,
  .view-btn,
  .mode-btn,
  .tool-btn,
  .panel-btn,
  .smart-btn,
  .action-icon {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }

  .action-icon {
    font-size: 18px;
  }

  .view-controls {
    bottom: 24px;
    right: 16px;
  }
}

@media (max-width: 600px) {
  .editor-topbar {
    padding: 8px 10px;
    gap: 8px;
  }
  .topbar-title {
    display: none;
  }
  .topbar-center {
    flex: 1;
    justify-content: center;
  }
  .panel.mobile-panel-open {
    top: 70px;
    bottom: 80px;
  }
  .editor-tip {
    top: 80px;
  }
}
</style>
