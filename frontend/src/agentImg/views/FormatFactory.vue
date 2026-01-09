<template>
  <div class="format-factory-page">
    <header class="top-header">
      <div class="top-header-inner">
        <router-link to="/artigen" class="top-logo">
          <span class="top-logo-text">Artigen</span>
        </router-link>

        <nav class="top-nav">
          <router-link to="/artigen/format-factory" class="top-nav-item active"
            >格式工厂</router-link
          >
          <router-link to="/artigen/ai" class="top-nav-item">AI工坊</router-link>
          <router-link to="/artigen/market" class="top-nav-item">算力商城</router-link>
        </nav>

        <div class="top-actions">
          <router-link to="/" class="top-action-link">PORTFOLIO</router-link>
        </div>
      </div>
    </header>

    <div class="factory-header">
      <div class="badge-row">
        <span class="dot"></span>
        <span class="badge-text">格式工具</span>
      </div>

      <div class="title-row">
        <h1 class="main-title">格式 <span class="highlight">工厂</span></h1>
        <div class="secure-badge">
          <span class="icon">🔒</span>
          无需登录 · 免费使用
        </div>
      </div>

      <p class="subtitle">纯前端处理 · 隐私安全 · {{ tools.length }} 种格式工具</p>
    </div>

    <div class="tools-grid">
      <div
        v-for="tool in tools"
        :key="tool.id"
        class="tool-card"
        :class="{ disabled: tool.status !== 'ready' }"
        @click="handleToolClick(tool)"
      >
        <div class="card-status" v-if="tool.status === 'ready'"></div>

        <div class="icon-box">
          <span class="icon">{{ tool.icon }}</span>
        </div>

        <h3 class="tool-name">{{ tool.name }}</h3>
        <p class="tool-desc">{{ tool.description }}</p>

        <div class="card-footer">
          <span class="tag">{{ tool.tag }}</span>
          <span class="arrow">→</span>
        </div>
      </div>
    </div>

    <div class="security-note">// 所有转换均在浏览器本地完成，文件不会上传到服务器</div>

    <div v-if="soonTip" class="ff-toast">{{ soonTip }}</div>

    <GlobalFooter />

    <div class="modal-fade-wrap">
      <div v-if="activeTool" class="tool-modal" @mousedown.self="closeModal">
        <div class="tool-modal-panel">
          <div class="tool-modal-header">
            <div class="tool-modal-title">
              <span class="tool-modal-icon">{{ activeTool.icon }}</span>
              <div class="tool-modal-title-text">
                <div class="tool-modal-name">{{ activeTool.name }}</div>
                <div class="tool-modal-sub">{{ activeTool.description }}</div>
              </div>
            </div>
            <button class="tool-modal-close" @click="closeModal">×</button>
          </div>

          <div class="tool-modal-body">
            <div class="tool-grid">
              <div class="tool-card-panel">
                <div class="panel-title">
                  {{ activeTool.id === 'ingredient-list' ? '输入内容' : '输入文件' }}
                </div>
                <div class="panel-body">
                  <template v-if="activeTool.id === 'ingredient-list'">
                    <div class="field-row">
                      <div class="field-label">产品名（可选）</div>
                      <input
                        v-model="ingredientProductName"
                        class="control"
                        type="text"
                        placeholder="例如 Artigen Gummies"
                      />
                    </div>
                    <div class="field-row">
                      <div class="field-label">类型</div>
                      <select v-model="ingredientProductType" class="control">
                        <option value="Auto">自动</option>
                        <option value="Food">食品</option>
                        <option value="Dietary Supplement">膳食补充剂</option>
                        <option value="Cosmetic">化妆品</option>
                        <option value="Drug">药品</option>
                      </select>
                    </div>
                    <div class="field-row">
                      <div class="field-label">文本</div>
                      <textarea
                        v-model="ingredientText"
                        class="control"
                        rows="10"
                        placeholder="粘贴配料/配方/包装描述文本（支持中英文，自动转美式英文输出）"
                      ></textarea>
                    </div>
                  </template>
                  <template v-else>
                    <label
                      class="file-drop"
                      :class="{ active: isDragging }"
                      @dragover="onDragOver"
                      @dragleave="onDragLeave"
                      @drop="onDrop"
                    >
                      <input
                        type="file"
                        class="file-input"
                        :accept="acceptFor(activeTool.id)"
                        :multiple="
                          activeTool.id === 'img2pdf' ||
                          activeTool.id === 'webp' ||
                          activeTool.id === 'jpeg' ||
                          activeTool.id === 'ico'
                        "
                        @change="onFileChange"
                      />
                      <div class="file-drop-icon">📂</div>
                      <div class="file-drop-title">点击或拖拽文件到这里</div>
                      <div class="file-drop-sub">{{ acceptHintFor(activeTool.id) }}</div>
                    </label>
                  </template>

                  <div v-if="sourceMeta && activeTool.id !== 'ingredient-list'" class="meta-row">
                    <div class="meta-item">
                      <div class="meta-k">NAME</div>
                      <div class="meta-v">{{ sourceMeta.name }}</div>
                    </div>
                    <div class="meta-item">
                      <div class="meta-k">SIZE</div>
                      <div class="meta-v">{{ formatBytes(sourceMeta.size) }}</div>
                    </div>
                    <div class="meta-item" v-if="sourceMeta.dimensions">
                      <div class="meta-k">DIM</div>
                      <div class="meta-v">{{ sourceMeta.dimensions }}</div>
                    </div>
                  </div>

                  <div v-if="sourceUrl && activeTool.id !== 'ingredient-list'" class="preview">
                    <div v-if="activeTool.id === 'watermark'" class="wm-stage">
                      <canvas ref="wmCanvasRef" class="wm-canvas"></canvas>
                      <canvas
                        ref="wmOverlayCanvasRef"
                        class="wm-canvas overlay"
                        @pointerdown="onWmPointerDown"
                        @pointermove="onWmPointerMove"
                        @pointerup="onWmPointerUp"
                        @pointercancel="onWmPointerUp"
                        @pointerleave="onWmPointerUp"
                      ></canvas>
                    </div>
                    <div v-else-if="activeTool.id === 'pdf'" class="help-box">
                      已选择 PDF{{ pdfPageCount ? ' · ' + pdfPageCount + ' 页' : '' }}
                    </div>
                    <video
                      v-else-if="activeTool.id === 'live'"
                      ref="liveVideoRef"
                      class="preview-video"
                      :src="sourceUrl"
                      controls
                      playsinline
                      @loadedmetadata="onLiveLoadedMeta"
                      @timeupdate="onLiveTimeUpdate"
                    ></video>
                    <video
                      v-else-if="activeTool.id === 'gif'"
                      class="preview-video"
                      :src="sourceUrl"
                      controls
                      playsinline
                    ></video>
                    <img v-else :src="sourceUrl" alt="preview" class="preview-img" />
                  </div>
                </div>
              </div>

              <div class="tool-card-panel">
                <div class="panel-title">参数</div>
                <div class="panel-body">
                  <template v-if="activeTool.id === 'webp'">
                    <div class="field-row">
                      <div class="field-label">输出格式</div>
                      <select v-model="webpOutFormat" class="control">
                        <option value="image/webp">WEBP</option>
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/png">PNG</option>
                      </select>
                    </div>

                    <div v-if="webpOutFormat !== 'image/png'" class="field-row">
                      <div class="field-label">质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="webpQuality"
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(webpQuality * 100) }}%</div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'jpeg'">
                    <div class="field-row">
                      <div class="field-label">质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="jpegQuality"
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(jpegQuality * 100) }}%</div>
                      </div>
                    </div>

                    <div class="field-row">
                      <div class="field-label">最长边(可选)</div>
                      <input
                        v-model="jpegMaxSide"
                        class="control"
                        type="number"
                        min="16"
                        placeholder="例如 1600"
                      />
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'resize'">
                    <div class="field-row">
                      <div class="field-label">宽度(px)</div>
                      <input
                        v-model="resizeWidth"
                        class="control"
                        type="number"
                        min="1"
                        placeholder="留空表示自动"
                      />
                    </div>

                    <div class="field-row">
                      <div class="field-label">高度(px)</div>
                      <input
                        v-model="resizeHeight"
                        class="control"
                        type="number"
                        min="1"
                        placeholder="留空表示自动"
                      />
                    </div>

                    <div class="field-row">
                      <div class="field-label">最长边(px)</div>
                      <input
                        v-model="resizeMaxSide"
                        class="control"
                        type="number"
                        min="16"
                        placeholder="仅在宽高都留空时生效"
                      />
                    </div>

                    <div class="field-row">
                      <div class="field-label">输出格式</div>
                      <select v-model="resizeOutFormat" class="control">
                        <option value="image/png">PNG</option>
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/webp">WEBP</option>
                      </select>
                    </div>

                    <div v-if="resizeOutFormat !== 'image/png'" class="field-row">
                      <div class="field-label">质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="resizeQuality"
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(resizeQuality * 100) }}%</div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'rotate'">
                    <div class="field-row">
                      <div class="field-label">旋转</div>
                      <select v-model.number="rotateDeg" class="control">
                        <option :value="0">0°</option>
                        <option :value="90">90°</option>
                        <option :value="180">180°</option>
                        <option :value="270">270°</option>
                      </select>
                    </div>

                    <div class="field-row">
                      <div class="field-label">翻转</div>
                      <div class="chips">
                        <label class="chip" :class="{ active: rotateFlipH }">
                          <input v-model="rotateFlipH" type="checkbox" style="display: none" />
                          水平镜像
                        </label>
                        <label class="chip" :class="{ active: rotateFlipV }">
                          <input v-model="rotateFlipV" type="checkbox" style="display: none" />
                          垂直镜像
                        </label>
                      </div>
                    </div>

                    <div class="field-row">
                      <div class="field-label">输出格式</div>
                      <select v-model="rotateOutFormat" class="control">
                        <option value="image/png">PNG</option>
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/webp">WEBP</option>
                      </select>
                    </div>

                    <div v-if="rotateOutFormat !== 'image/png'" class="field-row">
                      <div class="field-label">质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="rotateQuality"
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(rotateQuality * 100) }}%</div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'filter'">
                    <div class="field-row">
                      <div class="field-label">滤镜</div>
                      <select v-model="filterPreset" class="control">
                        <option value="grayscale">黑白</option>
                        <option value="sepia">复古</option>
                        <option value="invert">反色</option>
                      </select>
                    </div>

                    <div class="field-row">
                      <div class="field-label">强度</div>
                      <div class="range-row">
                        <input
                          v-model.number="filterIntensity"
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(filterIntensity * 100) }}%</div>
                      </div>
                    </div>

                    <div class="field-row">
                      <div class="field-label">输出格式</div>
                      <select v-model="filterOutFormat" class="control">
                        <option value="image/png">PNG</option>
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/webp">WEBP</option>
                      </select>
                    </div>

                    <div v-if="filterOutFormat !== 'image/png'" class="field-row">
                      <div class="field-label">质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="filterQuality"
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(filterQuality * 100) }}%</div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'ico'">
                    <div class="field-row">
                      <div class="field-label">尺寸</div>
                      <div class="chips">
                        <button
                          v-for="s in icoSizeOptions"
                          :key="s"
                          class="chip"
                          :class="{ active: icoSizes.includes(s) }"
                          @click="toggleIcoSize(s)"
                          type="button"
                        >
                          {{ s }}×{{ s }}
                        </button>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'watermark'">
                    <div class="field-row">
                      <div class="field-label">选择方式</div>
                      <div class="help-box">在左侧预览图中拖拽框选区域</div>
                    </div>

                    <div class="field-row">
                      <div class="field-label">处理方式</div>
                      <select v-model="wmMode" class="control">
                        <option value="blur">模糊</option>
                        <option value="pixelate">马赛克</option>
                        <option value="fill">纯色覆盖</option>
                      </select>
                    </div>

                    <div v-if="wmMode === 'blur'" class="field-row">
                      <div class="field-label">强度</div>
                      <div class="range-row">
                        <input
                          v-model.number="wmBlurPx"
                          type="range"
                          min="2"
                          max="24"
                          step="1"
                          class="range"
                        />
                        <div class="range-val">{{ wmBlurPx }}px</div>
                      </div>
                    </div>

                    <div v-else-if="wmMode === 'pixelate'" class="field-row">
                      <div class="field-label">颗粒</div>
                      <div class="range-row">
                        <input
                          v-model.number="wmPixelSize"
                          type="range"
                          min="4"
                          max="40"
                          step="1"
                          class="range"
                        />
                        <div class="range-val">{{ wmPixelSize }}px</div>
                      </div>
                    </div>

                    <div v-else class="field-row">
                      <div class="field-label">颜色</div>
                      <input
                        v-model="wmFillColor"
                        class="control"
                        type="text"
                        placeholder="#000000"
                      />
                    </div>

                    <div class="actions">
                      <button
                        class="btn primary"
                        :disabled="!wmCanApply || isProcessing"
                        type="button"
                        @click="applyWatermarkSelection"
                      >
                        应用到选区
                      </button>
                      <button
                        class="btn ghost"
                        :disabled="!wmCanUndo || isProcessing"
                        type="button"
                        @click="undoWatermark"
                      >
                        撤销
                      </button>
                      <button
                        class="btn ghost"
                        :disabled="!wmHasSelection || isProcessing"
                        type="button"
                        @click="clearWatermarkSelection"
                      >
                        清除选区
                      </button>
                    </div>

                    <div class="field-row">
                      <div class="field-label">导出格式</div>
                      <select v-model="wmOutFormat" class="control">
                        <option value="image/png">PNG</option>
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/webp">WEBP</option>
                      </select>
                    </div>

                    <div v-if="wmOutFormat !== 'image/png'" class="field-row">
                      <div class="field-label">导出质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="wmOutQuality"
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(wmOutQuality * 100) }}%</div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'live'">
                    <div class="field-row">
                      <div class="field-label">时间轴</div>
                      <div class="range-row">
                        <input
                          class="range"
                          type="range"
                          min="0"
                          :max="liveDuration"
                          step="0.05"
                          :value="liveTime"
                          :disabled="!liveDuration"
                          @input="onLiveSeekInput"
                        />
                        <div class="range-val">{{ formatTime(liveTime) }}</div>
                      </div>
                      <div class="help-box">
                        {{
                          liveDuration ? '总时长 ' + formatTime(liveDuration) : '加载视频元信息中…'
                        }}
                      </div>
                    </div>

                    <div class="field-row">
                      <div class="field-label">输出格式</div>
                      <select v-model="liveOutFormat" class="control">
                        <option value="image/png">PNG</option>
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/webp">WEBP</option>
                      </select>
                    </div>

                    <div v-if="liveOutFormat !== 'image/png'" class="field-row">
                      <div class="field-label">质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="liveOutQuality"
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(liveOutQuality * 100) }}%</div>
                      </div>
                    </div>

                    <div class="actions">
                      <button
                        class="btn primary"
                        :disabled="!sourceFile || isProcessing"
                        type="button"
                        @click="runTool"
                      >
                        截取当前帧
                      </button>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'pdf'">
                    <div class="field-row">
                      <div class="field-label">导出模式</div>
                      <select v-model="pdfMode" class="control">
                        <option value="stitch">长图拼接（多页）</option>
                        <option value="page">单页导出</option>
                      </select>
                    </div>

                    <div v-if="pdfMode === 'page'" class="field-row">
                      <div class="field-label">页码</div>
                      <input
                        v-model.number="pdfPageNumber"
                        class="control"
                        type="number"
                        min="1"
                        placeholder="例如 1"
                      />
                      <div class="help-box">
                        {{ pdfPageCount ? '共 ' + pdfPageCount + ' 页' : '读取页数中…' }}
                      </div>
                    </div>

                    <div v-else class="field-row">
                      <div class="field-label">最多页数</div>
                      <input
                        v-model.number="pdfMaxPages"
                        class="control"
                        type="number"
                        min="1"
                        max="50"
                        placeholder="例如 12"
                      />
                      <div class="help-box">页数过多会很慢，默认限制 12 页</div>
                    </div>

                    <div class="field-row">
                      <div class="field-label">清晰度</div>
                      <div class="range-row">
                        <input
                          v-model.number="pdfScale"
                          type="range"
                          min="0.8"
                          max="2.5"
                          step="0.1"
                          class="range"
                        />
                        <div class="range-val">{{ pdfScale.toFixed(1) }}x</div>
                      </div>
                    </div>

                    <div class="field-row">
                      <div class="field-label">输出格式</div>
                      <select v-model="pdfOutFormat" class="control">
                        <option value="image/png">PNG</option>
                        <option value="image/jpeg">JPEG</option>
                        <option value="image/webp">WEBP</option>
                      </select>
                    </div>

                    <div v-if="pdfOutFormat !== 'image/png'" class="field-row">
                      <div class="field-label">质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="pdfQuality"
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(pdfQuality * 100) }}%</div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'img2pdf'">
                    <div class="field-row">
                      <div class="field-label">页面尺寸</div>
                      <select v-model="img2pdfPageSize" class="control">
                        <option value="A4">A4</option>
                        <option value="auto">跟随图片尺寸</option>
                      </select>
                    </div>

                    <div class="field-row">
                      <div class="field-label">边距(mm)</div>
                      <input
                        v-model.number="img2pdfMarginMm"
                        class="control"
                        type="number"
                        min="0"
                        max="30"
                      />
                    </div>

                    <div class="field-row">
                      <div class="field-label">图片质量</div>
                      <div class="range-row">
                        <input
                          v-model.number="img2pdfQuality"
                          type="range"
                          min="0.3"
                          max="0.95"
                          step="0.01"
                          class="range"
                        />
                        <div class="range-val">{{ Math.round(img2pdfQuality * 100) }}%</div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeTool.id === 'gif'">
                    <div class="field-row">
                      <div class="field-label">开始(s)</div>
                      <input
                        v-model.number="gifStartSec"
                        class="control"
                        type="number"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div class="field-row">
                      <div class="field-label">时长(s)</div>
                      <input
                        v-model.number="gifDurationSec"
                        class="control"
                        type="number"
                        min="0.2"
                        max="10"
                        step="0.1"
                      />
                      <div class="help-box">最长 10s，建议文件小于 20MB</div>
                    </div>

                    <div class="field-row">
                      <div class="field-label">帧率</div>
                      <input
                        v-model.number="gifFps"
                        class="control"
                        type="number"
                        min="2"
                        max="24"
                      />
                    </div>

                    <div class="field-row">
                      <div class="field-label">宽度(px)</div>
                      <input
                        v-model.number="gifWidth"
                        class="control"
                        type="number"
                        min="120"
                        max="960"
                      />
                    </div>

                    <div class="field-row">
                      <div class="field-label">颜色数</div>
                      <input
                        v-model.number="gifMaxColors"
                        class="control"
                        type="number"
                        min="16"
                        max="256"
                      />
                    </div>
                  </template>

                  <div v-if="toolError" class="error-box">{{ toolError }}</div>
                </div>
              </div>

              <div class="tool-card-panel">
                <div class="panel-title">输出</div>
                <div class="panel-body">
                  <div class="actions">
                    <button
                      class="btn primary"
                      :disabled="
                        isProcessing ||
                        (activeTool.id === 'ingredient-list' ? !ingredientText.trim() : !sourceFile)
                      "
                      @click="runTool"
                    >
                      {{
                        isProcessing
                          ? '处理中...'
                          : activeTool.id === 'live'
                            ? '截取当前帧'
                            : activeTool.id === 'watermark'
                              ? '导出图片'
                              : '开始处理'
                      }}
                    </button>
                    <button
                      v-if="isProcessing"
                      class="btn danger"
                      type="button"
                      @click="cancelProcessing"
                    >
                      取消
                    </button>
                    <button
                      v-if="outputItems.length > 1"
                      class="btn ghost"
                      :disabled="outputItems.length === 0"
                      type="button"
                      @click="downloadAllOutputs"
                    >
                      下载全部
                    </button>
                    <button
                      v-else
                      class="btn ghost"
                      :disabled="!outputBlob"
                      type="button"
                      @click="downloadOutput"
                    >
                      下载
                    </button>
                    <button
                      v-if="outputUrl && (activeTool.id === 'img2pdf' || activeTool.id === 'ico')"
                      class="btn ghost"
                      type="button"
                      @click="openOutputPreview(outputUrl)"
                    >
                      预览
                    </button>
                    <button
                      class="btn ghost"
                      :disabled="!sourceFile && !outputBlob"
                      @click="resetTool"
                    >
                      重置
                    </button>
                  </div>

                  <div v-if="isProcessing && progress" class="progress-box">
                    <div class="progress-top">
                      <div class="progress-label">{{ progress.label || '处理中' }}</div>
                      <div class="progress-val">{{ progressPercent }}%</div>
                    </div>
                    <div class="progress-bar">
                      <div
                        class="progress-bar-inner"
                        :style="{ width: progressPercent + '%' }"
                      ></div>
                    </div>
                  </div>

                  <div v-if="outputMeta" class="meta-row">
                    <div class="meta-item">
                      <div class="meta-k">OUTPUT</div>
                      <div class="meta-v">{{ outputMeta.name }}</div>
                    </div>
                    <div class="meta-item">
                      <div class="meta-k">SIZE</div>
                      <div class="meta-v">{{ formatBytes(outputMeta.size) }}</div>
                    </div>
                  </div>

                  <div v-if="outputItems.length > 1" class="batch-list">
                    <div v-for="it in outputItems" :key="it.url" class="batch-item">
                      <div class="batch-name">{{ it.name }}</div>
                      <div class="batch-size">{{ formatBytes(it.size) }}</div>
                      <button class="btn ghost" type="button" @click="downloadOutputItem(it)">
                        下载
                      </button>
                    </div>
                  </div>
                  <div
                    v-else-if="outputUrl && outputMeta && outputMeta.name.endsWith('.pdf')"
                    class="ico-hint"
                  >
                    PDF 已生成，可下载或预览。
                  </div>
                  <div
                    v-else-if="outputUrl && outputMeta && outputMeta.name.endsWith('.ico')"
                    class="ico-hint"
                  >
                    ICO 已生成，可下载或预览。
                  </div>
                  <div v-else-if="outputUrl" class="preview">
                    <img :src="outputUrl" alt="output" class="preview-img" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import GlobalFooter from '../components/GlobalFooter.vue';
import { useFormatFactory } from '../composables/useFormatFactory';
import { formatTime } from '../logic/formatFactory/format';

const {
  tools,
  soonTip,
  activeTool,
  handleToolClick,
  closeModal,
  acceptFor,
  acceptHintFor,
  onFileChange,
  sourceMeta,
  sourceUrl,
  sourceFile,
  outputUrl,
  outputBlob,
  outputMeta,
  outputItems,
  isProcessing,
  toolError,
  webpOutFormat,
  webpQuality,
  jpegQuality,
  jpegMaxSide,
  resizeWidth,
  resizeHeight,
  resizeMaxSide,
  resizeOutFormat,
  resizeQuality,
  rotateDeg,
  rotateFlipH,
  rotateFlipV,
  rotateOutFormat,
  rotateQuality,
  filterPreset,
  filterIntensity,
  filterOutFormat,
  filterQuality,
  icoSizeOptions,
  icoSizes,
  toggleIcoSize,
  pdfPageCount,
  pdfMode,
  pdfPageNumber,
  pdfScale,
  pdfOutFormat,
  pdfQuality,
  pdfMaxPages,
  img2pdfPageSize,
  img2pdfMarginMm,
  img2pdfQuality,
  gifStartSec,
  gifDurationSec,
  gifFps,
  gifWidth,
  gifMaxColors,
  ingredientProductName,
  ingredientText,
  ingredientProductType,
  wmCanvasRef,
  wmOverlayCanvasRef,
  wmMode,
  wmBlurPx,
  wmPixelSize,
  wmFillColor,
  wmOutFormat,
  wmOutQuality,
  wmHasSelection,
  wmCanApply,
  wmCanUndo,
  onWmPointerDown,
  onWmPointerMove,
  onWmPointerUp,
  applyWatermarkSelection,
  undoWatermark,
  clearWatermarkSelection,
  liveVideoRef,
  liveDuration,
  liveTime,
  liveOutFormat,
  liveOutQuality,
  onLiveLoadedMeta,
  onLiveTimeUpdate,
  onLiveSeekInput,
  runTool,
  progress,
  progressPercent,
  cancelProcessing,
  downloadOutput,
  downloadAllOutputs,
  downloadOutputItem,
  openOutputPreview,
  resetTool,
  formatBytes,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop
} = useFormatFactory();
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .tool-modal-panel,
.modal-fade-leave-active .tool-modal-panel {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-fade-enter-from .tool-modal-panel,
.modal-fade-leave-to .tool-modal-panel {
  transform: scale(0.95) translateY(10px);
}

.ff-toast {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 50;
  padding: 10px 14px;
  border: 1px solid rgba(204, 255, 0, 0.35);
  background: rgba(10, 10, 10, 0.85);
  color: #ccff00;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.2px;
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.12);
  pointer-events: none;
}

.batch-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.batch-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.25);
}

.batch-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #e2e8f0;
}

.batch-size {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
}

.format-factory-page {
  min-height: 100vh;
  background-color: #050505;
  color: #f1f5f9;
  font-family: 'Inter', sans-serif;
  padding-top: 120px;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 50px 50px;
}

.top-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  background: rgba(5, 5, 5, 0.7);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.top-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.top-logo {
  text-decoration: none;
}

.top-logo-text {
  font-weight: 900;
  font-size: 18px;
  color: #ccff00;
  letter-spacing: -0.5px;
}

.top-nav {
  display: flex;
  gap: 18px;
  align-items: center;
}

.top-nav-item {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-nav-item:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.top-nav-item.active {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.6);
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.15);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-action-link {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-action-link:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.factory-header {
  max-width: 1200px;
  margin: 0 auto 60px;
  padding: 0 24px;
}

.badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.dot {
  width: 6px;
  height: 6px;
  background-color: #ccff00;
  border-radius: 50%;
  box-shadow: 0 0 8px #ccff00;
}

.badge-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #ccff00;
}

.title-row {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  margin-bottom: 16px;
}

.main-title {
  font-size: 64px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -2px;
}

.main-title .highlight {
  color: #ccff00;
}

.secure-badge {
  border: 1px solid rgba(147, 51, 234, 0.3);
  background: rgba(147, 51, 234, 0.1);
  color: #d8b4fe;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.subtitle {
  color: #94a3b8;
  font-size: 16px;
}

/* Grid Layout */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto 80px;
  padding: 0 24px;
}

.tool-card {
  background: rgba(20, 20, 20, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 24px;
  border-radius: 2px; /* Brutalist sharp corners */
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  height: 240px;
  display: flex;
  flex-direction: column;
}

.tool-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at top right, rgba(204, 255, 0, 0.1), transparent 60%);
  opacity: 0;
  transition: opacity 0.3s;
}

.tool-card:hover {
  background: rgba(30, 30, 30, 0.9);
  border-color: #ccff00;
  transform: translateY(-5px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
}

.tool-card:active {
  transform: translateY(-2px) scale(0.98);
}

.tool-card.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.tool-card.disabled:hover {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(20, 20, 20, 0.6);
  transform: none;
  box-shadow: none;
}

.tool-card.disabled .arrow {
  opacity: 0;
  transform: translateX(-10px);
}

.tool-card:hover::before {
  opacity: 1;
}

.tool-card:active {
  transform: translateY(-2px) scale(0.98);
}

.card-status {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  background: #ccff00;
  border-radius: 50%;
}

.icon-box {
  font-size: 32px;
  margin-bottom: 24px;
  color: #ccff00;
}

.tool-name {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #f1f5f9;
}

.tool-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  margin-bottom: auto;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
}

.arrow {
  color: #ccff00;
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.2s;
}

.tool-card:hover .arrow {
  opacity: 1;
  transform: translateX(0);
}

.security-note {
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 60px;
}

@media (max-width: 1024px) {
  .tools-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .tools-grid {
    grid-template-columns: 1fr;
  }

  .title-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .main-title {
    font-size: 48px;
  }
}

.tool-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.tool-modal-panel {
  width: min(1200px, 96%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: rgba(12, 12, 12, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 0 50px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  backdrop-filter: blur(20px);
}

.tool-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tool-modal-title {
  display: flex;
  gap: 12px;
  align-items: center;
}

.tool-modal-icon {
  font-size: 22px;
  color: #ccff00;
}

.tool-modal-name {
  font-size: 16px;
  font-weight: 800;
  color: #f1f5f9;
}

.tool-modal-sub {
  font-size: 12px;
  color: #94a3b8;
}

.tool-modal-close {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(20, 20, 20, 0.6);
  color: #f1f5f9;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tool-modal-close:hover {
  border-color: rgba(204, 255, 0, 0.4);
  color: #ccff00;
  transform: rotate(90deg);
}

.tool-modal-body {
  padding: 18px;
}

.tool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
}

.tool-card-panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.5);
}

.panel-title {
  padding: 12px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #ccff00;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-body {
  padding: 12px;
}

.file-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  padding: 32px 16px;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.25);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 4px;
}

.file-drop:hover {
  border-color: rgba(204, 255, 0, 0.4);
  background: rgba(204, 255, 0, 0.04);
}

.file-drop.active {
  border-color: #ccff00;
  background: rgba(204, 255, 0, 0.1);
  transform: scale(1.02);
}

.file-input {
  display: none;
}

.file-drop-icon {
  font-size: 32px;
  margin-bottom: 12px;
  filter: grayscale(1);
  opacity: 0.7;
  transition: all 0.3s;
}

.file-drop:hover .file-drop-icon,
.file-drop.active .file-drop-icon {
  filter: grayscale(0);
  opacity: 1;
  transform: translateY(-4px);
}

.file-drop-title {
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 6px;
  font-size: 14px;
}

.file-drop-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #64748b;
}

.meta-row {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px;
  background: rgba(0, 0, 0, 0.18);
}

.meta-k {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #94a3b8;
}

.meta-v {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #f1f5f9;
  text-align: right;
  word-break: break-all;
}

.preview {
  margin-top: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.preview-img {
  max-width: 100%;
  max-height: 240px;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.preview-video {
  width: 100%;
  height: 220px;
  display: block;
  object-fit: contain;
  background: #000;
}

.wm-stage {
  position: relative;
  width: 100%;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.wm-canvas {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  display: block;
  image-rendering: auto;
  touch-action: none;
}

.wm-canvas.overlay {
  position: absolute;
  inset: 0;
  margin: auto;
}

.help-box {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #64748b;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.18);
  padding: 10px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.field-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
}

.control {
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 10px 12px;
  color: #f1f5f9;
  outline: none;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  border-radius: 4px;
  transition: all 0.2s;
}

select.control {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 32px;
}

.control:hover {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.6);
}

.control:focus {
  border-color: rgba(204, 255, 0, 0.5);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.1);
  color: #ccff00;
}

.range-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.range {
  width: 100%;
  -webkit-appearance: none;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
}

.range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ccff00;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 0 10px rgba(204, 255, 0, 0.3);
}

.range::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.5);
}

.range-val {
  width: 64px;
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #f1f5f9;
}

.chips {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.chip {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.2);
  color: #94a3b8;
  padding: 8px 10px;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.chip.active {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.55);
  box-shadow: 0 0 20px rgba(204, 255, 0, 0.12);
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.4);
  color: #f1f5f9;
  padding: 10px 16px;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.8);
}

.btn.primary {
  background: rgba(204, 255, 0, 0.15);
  border-color: rgba(204, 255, 0, 0.4);
  color: #ccff00;
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.05);
}

.btn.primary:hover:not(:disabled) {
  background: rgba(204, 255, 0, 0.25);
  border-color: #ccff00;
  box-shadow: 0 0 20px rgba(204, 255, 0, 0.2);
  transform: translateY(-1px);
}

.btn.primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn.danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.2);
}

.btn.ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
}

.progress-box {
  margin-top: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.18);
  padding: 10px;
}

.progress-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
}

.progress-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-val {
  color: #ccff00;
}

.progress-bar {
  height: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.06);
}

.progress-bar-inner {
  height: 100%;
  background: rgba(204, 255, 0, 0.85);
  width: 0%;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 10px rgba(204, 255, 0, 0.2);
}

.error-box {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: #fecaca;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.ico-hint {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid rgba(204, 255, 0, 0.25);
  background: rgba(204, 255, 0, 0.06);
  color: #ccff00;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

@media (max-width: 980px) {
  .tool-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .top-header-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
