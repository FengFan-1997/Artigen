<template>
  <div class="agent-debug-page">
    <header class="header">
      <div class="title">
        <h1>Agent Debug</h1>
        <div class="sub">用于调试 Agent 参数与状态（实时快照）</div>
      </div>
      <div class="header-actions">
        <router-link class="btn" to="/">返回首页</router-link>
        <button class="btn" :disabled="!hasDebug" @click="exportFeedback">导出反馈包</button>
        <button class="btn" @click="refresh">手动刷新</button>
      </div>
    </header>

    <div class="grid">
      <section class="panel">
        <div class="panel-title">连接状态</div>
        <div class="kv">
          <div class="k">window.__agentDebug</div>
          <div class="v" :class="{ bad: !hasDebug, ok: hasDebug }">
            {{ hasDebug ? '已连接' : '未连接（请确保页面上已渲染 Agent）' }}
          </div>
        </div>
        <div class="btn-row" style="margin-top: 8px">
          <button v-if="!hasDebug" class="btn" @click="enableDebugBridgeAndReload">
            启用调试桥并刷新
          </button>
          <button v-else class="btn danger" @click="disableDebugBridgeAndReload">
            关闭调试桥并刷新
          </button>
        </div>
        <div class="kv">
          <div class="k">采集状态</div>
          <div class="v" :class="{ ok: captureEnabled, bad: !captureEnabled }">
            {{ captureEnabled ? '开启（会记录事件与日志）' : '关闭（不记录）' }}
          </div>
        </div>
        <div class="kv">
          <div class="k">info 日志</div>
          <div
            class="v"
            :class="{ ok: consoleCaptureInfoEnabled, bad: !consoleCaptureInfoEnabled }"
          >
            {{
              consoleCaptureInfoEnabled ? '开启（log/info 会记录）' : '关闭（只记录 warn/error）'
            }}
          </div>
        </div>
        <div class="btn-row" style="margin-top: 8px">
          <button class="btn" :disabled="!hasDebug" @click="toggleCapture">
            {{ captureEnabled ? '关闭采集' : '开启采集' }}
          </button>
          <button class="btn" :disabled="!hasDebug" @click="toggleConsoleInfoCapture">
            {{ consoleCaptureInfoEnabled ? '关闭 info 日志' : '开启 info 日志' }}
          </button>
          <button class="btn" :disabled="!hasDebug" @click="clearCapture">清空采集</button>
        </div>
        <div class="kv" v-if="hasDebug">
          <div class="k">路由</div>
          <div class="v">{{ snapshot?.route || '' }}</div>
        </div>
        <div class="kv" v-if="hasDebug">
          <div class="k">时间</div>
          <div class="v">{{ snapshot?.ts ? new Date(snapshot.ts).toLocaleString() : '' }}</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">反馈包预览</div>
        <div class="kv">
          <div class="k">事件数</div>
          <div class="v">{{ feedbackPreview?.counts?.events ?? 0 }}</div>
        </div>
        <div class="kv">
          <div class="k">日志数</div>
          <div class="v">{{ feedbackPreview?.counts?.logs ?? 0 }}</div>
        </div>
        <div class="kv">
          <div class="k">导出大小</div>
          <div class="v">{{ feedbackPreview?.approxBytes ?? 0 }} bytes</div>
        </div>
        <div class="kv">
          <div class="k">本地记录</div>
          <div class="v">
            {{ feedbackPackHistoryCount }}
            {{
              feedbackPackHistoryLastSavedAt ? `（最近：${feedbackPackHistoryLastSavedAt}）` : ''
            }}
          </div>
        </div>
        <div class="form-row" style="grid-template-columns: 140px 1fr 72px">
          <label class="label">原因/场景</label>
          <input
            v-model="feedbackReason"
            class="input"
            type="text"
            placeholder="例如：VRM 抽动/卡顿/接口报错"
          />
          <button class="btn" :disabled="!hasDebug" @click="exportFeedback">导出</button>
        </div>
        <div class="btn-row">
          <button class="btn" :disabled="!hasDebug" @click="saveFeedbackPackToLocalNow">
            保存到本地
          </button>
          <button class="btn danger" @click="clearLocalFeedbackPacks">清空本地</button>
        </div>
        <pre class="pre">{{ pretty(feedbackPreview) }}</pre>
      </section>

      <section class="panel">
        <div class="panel-title">参数</div>

        <div class="form-row">
          <label class="label">漫游开关</label>
          <input v-model="roamEnabled" class="input" type="checkbox" />
          <button class="btn" :disabled="!hasDebug" @click="applyParam('roamEnabled', roamEnabled)">
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">闲置动作开关</label>
          <input v-model="idleTalkEnabled" class="input" type="checkbox" />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleTalkEnabled', idleTalkEnabled)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Idle AI 开关</label>
          <input v-model="idleAiEnabled" class="input" type="checkbox" />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleAiEnabled', idleAiEnabled)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">漫游间隔 (ms)</label>
          <input
            v-model.number="moveIntervalMs"
            class="input"
            type="number"
            min="5000"
            max="600000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('moveIntervalMs', moveIntervalMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">闲置动作间隔 (ms)</label>
          <input
            v-model.number="idleTalkIntervalMs"
            class="input"
            type="number"
            min="3000"
            max="600000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleTalkIntervalMs', idleTalkIntervalMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">跟随平滑 (lerp)</label>
          <input
            v-model.number="lerpFactor"
            class="input"
            type="number"
            min="0.01"
            max="0.35"
            step="0.01"
          />
          <button class="btn" :disabled="!hasDebug" @click="applyParam('lerpFactor', lerpFactor)">
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">鼠标偏移 X</label>
          <input
            v-model.number="mouseFollowOffsetX"
            class="input"
            type="number"
            min="-300"
            max="300"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('mouseFollowOffsetX', mouseFollowOffsetX)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">鼠标偏移 Y</label>
          <input
            v-model.number="mouseFollowOffsetY"
            class="input"
            type="number"
            min="-300"
            max="300"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('mouseFollowOffsetY', mouseFollowOffsetY)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Chat 自动关闭 (ms)</label>
          <input
            v-model.number="chatAutoCloseMs"
            class="input"
            type="number"
            min="0"
            max="600000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('chatAutoCloseMs', chatAutoCloseMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">UI 最大消息数</label>
          <input v-model.number="maxUiMessages" class="input" type="number" min="20" max="800" />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('maxUiMessages', maxUiMessages)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">动态缩放</label>
          <input
            v-model.number="dynamicScale"
            class="input"
            type="number"
            min="0.06"
            max="1.6"
            step="0.01"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('dynamicScale', dynamicScale)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">移动过渡 (ms)</label>
          <input
            v-model.number="moveTransitionMs"
            class="input"
            type="number"
            min="80"
            max="20000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('moveTransitionMs', moveTransitionMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Max Energy</label>
          <input v-model.number="maxEnergy" class="input" type="number" min="10" max="2000" />
          <button class="btn" :disabled="!hasDebug" @click="applyParam('maxEnergy', maxEnergy)">
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Energy Decay</label>
          <input
            v-model.number="energyDecayRate"
            class="input"
            type="number"
            min="0"
            max="5"
            step="0.01"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('energyDecayRate', energyDecayRate)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Energy Recover</label>
          <input
            v-model.number="energyRecoverRate"
            class="input"
            type="number"
            min="0"
            max="5"
            step="0.01"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('energyRecoverRate', energyRecoverRate)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">疲劳阈值</label>
          <input v-model.number="tiredThreshold" class="input" type="number" min="0" max="2000" />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('tiredThreshold', tiredThreshold)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Idle AI 最小闲置 (ms)</label>
          <input
            v-model.number="idleAiMinIdleMs"
            class="input"
            type="number"
            min="3000"
            max="600000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleAiMinIdleMs', idleAiMinIdleMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Idle AI 冷却 (ms)</label>
          <input
            v-model.number="idleAiCooldownMs"
            class="input"
            type="number"
            min="0"
            max="900000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleAiCooldownMs', idleAiCooldownMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Idle AI 概率</label>
          <input
            v-model.number="idleAiChance"
            class="input"
            type="number"
            min="0"
            max="1"
            step="0.01"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleAiChance', idleAiChance)"
          >
            应用
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">AI 调用</div>
        <div class="form-row">
          <label class="label">Transport 覆盖</label>
          <select v-model="transportOverride" class="input">
            <option value="">（不覆盖）</option>
            <option value="proxy">proxy</option>
            <option value="direct">direct</option>
          </select>
          <button class="btn" @click="applyTransport">应用</button>
        </div>
        <div class="panel-sub" style="margin-top: 10px">RAG 索引</div>
        <div class="form-row" style="grid-template-columns: 110px 1fr 120px">
          <label class="label">语言</label>
          <select v-model="embedDocsLang" class="input">
            <option value="zh">zh</option>
            <option value="en">en</option>
          </select>
          <button class="btn" @click="embedDocs">构建 doc/read/docs</button>
        </div>
        <pre class="pre">{{ pretty(embedDocsResult) }}</pre>
        <pre class="pre">{{ pretty(aiState) }}</pre>
      </section>

      <section class="panel">
        <div class="panel-title">Usage Ledger</div>
        <div class="form-row" style="grid-template-columns: 90px 1fr 90px 1fr">
          <label class="label">userId</label>
          <input v-model="usageUserId" class="input" type="text" placeholder="guest_ 或 user_xxx" />
          <label class="label">projectId</label>
          <input v-model="usageProjectId" class="input" type="text" placeholder="默认取 host" />
        </div>
        <div class="form-row" style="grid-template-columns: 90px 1fr 90px 1fr">
          <label class="label">sessionId</label>
          <input
            v-model="usageSessionId"
            class="input"
            type="text"
            placeholder="默认取 sessionStorage"
          />
          <label class="label">groupBy</label>
          <select v-model="usageGroupBy" class="input">
            <option value="day">day</option>
            <option value="trigger">trigger</option>
            <option value="model">model</option>
            <option value="projectId">projectId</option>
            <option value="sessionId">sessionId</option>
          </select>
        </div>
        <div class="form-row" style="grid-template-columns: 90px 1fr 90px 1fr">
          <label class="label">trigger</label>
          <input
            v-model="usageTrigger"
            class="input"
            type="text"
            placeholder="chat/task/idle/..."
          />
          <label class="label">model</label>
          <input v-model="usageModel" class="input" type="text" placeholder="gemini-xxx" />
        </div>
        <div class="form-row" style="grid-template-columns: 90px 1fr 90px 1fr">
          <label class="label">from</label>
          <input
            v-model="usageFrom"
            class="input"
            type="text"
            placeholder="timestamp 或 2026-01-01"
          />
          <label class="label">to</label>
          <input
            v-model="usageTo"
            class="input"
            type="text"
            placeholder="timestamp 或 2026-01-06"
          />
        </div>
        <div class="form-row" style="grid-template-columns: 90px 1fr 90px 1fr">
          <label class="label">limit</label>
          <input v-model.number="usageLimit" class="input" type="number" min="1" max="2000" />
          <label class="label">offset</label>
          <input v-model.number="usageOffset" class="input" type="number" min="0" max="2000000" />
        </div>
        <div class="btn-row" style="margin-top: 8px">
          <button class="btn" @click="loadUsageSummary">拉取 summary</button>
          <button class="btn" @click="loadUsageLedger">拉取 ledger</button>
        </div>
        <pre class="pre">{{ pretty(usageSummaryResult) }}</pre>
        <pre class="pre">{{ pretty(usageLedgerResult) }}</pre>
      </section>

      <section class="panel">
        <div class="panel-title">模型加载链路</div>
        <div class="btn-row" style="margin-bottom: 8px">
          <button class="btn" @click="loadBackendHealth">刷新 /api/health</button>
          <button class="btn" @click="runHfHeadTest">HF HEAD</button>
          <button class="btn" @click="runHfRangeTest">HF Range</button>
        </div>

        <div class="form-row" style="grid-template-columns: 90px 1fr 90px 1fr">
          <label class="label">owner</label>
          <input v-model="hfOwner" class="input" type="text" />
          <label class="label">repo</label>
          <input v-model="hfRepo" class="input" type="text" />
        </div>
        <div class="form-row" style="grid-template-columns: 90px 1fr 90px 1fr">
          <label class="label">ref</label>
          <input v-model="hfRef" class="input" type="text" />
          <label class="label">preferBase</label>
          <select v-model="hfPreferBase" class="input">
            <option value="">（不指定）</option>
            <option value="mirror">mirror</option>
            <option value="hf">hf</option>
            <option value="huggingface">huggingface</option>
          </select>
        </div>
        <div class="form-row" style="grid-template-columns: 90px 1fr 72px">
          <label class="label">path</label>
          <input v-model="hfPath" class="input" type="text" />
          <button class="btn" @click="copyText(hfTestUrl)">复制 URL</button>
        </div>

        <pre class="pre">{{ pretty(backendHealth) }}</pre>
        <pre class="pre">{{ pretty(hfTestResult) }}</pre>
      </section>

      <section class="panel wide">
        <div class="panel-title">自动测试</div>
        <div class="toolbar">
          <label class="toolbar-item">
            <input v-model="autoTestEnabled" type="checkbox" />
            启用
          </label>
          <label class="toolbar-item">
            间隔(ms)
            <input
              v-model.number="autoTestIntervalMs"
              class="input input-sm"
              type="number"
              min="1000"
              max="600000"
            />
          </label>
          <label class="toolbar-item">
            保留条数
            <input
              v-model.number="autoTestMaxRecords"
              class="input input-sm"
              type="number"
              min="20"
              max="2000"
            />
          </label>
          <button class="btn" :disabled="autoTestRunning" @click="runAutoTestOnce">
            立即跑一次
          </button>
          <button
            class="btn"
            :disabled="autoTestRecords.length === 0"
            @click="exportAutoTestRecords"
          >
            导出 JSON
          </button>
          <button
            class="btn"
            :disabled="autoTestRecords.length === 0"
            @click="clearAutoTestRecords"
          >
            清空
          </button>
        </div>

        <div class="btn-row" style="margin-bottom: 8px">
          <label class="toolbar-item">
            <input v-model="autoTestCheckSnapshot" type="checkbox" />
            snapshot
          </label>
          <label class="toolbar-item">
            <input v-model="autoTestCheckDiagnostics" type="checkbox" />
            diagnostics
          </label>
          <label class="toolbar-item">
            <input v-model="autoTestCheckHealth" type="checkbox" />
            /api/health
          </label>
          <label class="toolbar-item">
            <input v-model="autoTestCheckUsage" type="checkbox" />
            usage
          </label>
          <label class="toolbar-item">
            <input v-model="autoTestCheckChat" type="checkbox" />
            chat
          </label>
        </div>

        <div
          class="form-row"
          v-if="autoTestCheckChat"
          style="grid-template-columns: 90px 1fr 90px 1fr"
        >
          <label class="label">message</label>
          <input v-model="autoTestChatMessage" class="input" type="text" placeholder="例如：ping" />
          <label class="label">group</label>
          <input v-model="autoTestChatGroup" class="input" type="text" placeholder="例如：debug" />
        </div>

        <div class="split">
          <div class="col">
            <div class="panel-sub">状态</div>
            <pre class="pre">{{ pretty(autoTestStatusView) }}</pre>
          </div>
          <div class="col">
            <div class="panel-sub">最近记录（尾部）</div>
            <pre class="pre">{{ pretty(autoTestRecentView) }}</pre>
          </div>
        </div>
      </section>

      <section class="panel wide">
        <div class="panel-title">压力测试（批量 chat）</div>
        <div class="toolbar">
          <label class="toolbar-item">
            <input v-model="loadTestEnabled" type="checkbox" />
            启用
          </label>
          <label class="toolbar-item">
            间隔(ms)
            <input
              v-model.number="loadTestIntervalMs"
              class="input input-sm"
              type="number"
              min="200"
              max="600000"
            />
          </label>
          <label class="toolbar-item">
            每次发送(条)
            <input
              v-model.number="loadTestBurstCount"
              class="input input-sm"
              type="number"
              min="1"
              max="200"
            />
          </label>
          <label class="toolbar-item">
            最大并发
            <input
              v-model.number="loadTestMaxInflight"
              class="input input-sm"
              type="number"
              min="1"
              max="12"
            />
          </label>
          <label class="toolbar-item">
            group
            <input
              v-model="loadTestGroup"
              class="input input-sm"
              type="text"
              placeholder="loadtest"
            />
          </label>
          <label class="toolbar-item">
            模式
            <select v-model="loadTestMode" class="input input-sm">
              <option value="random">random</option>
              <option value="sequence">sequence</option>
            </select>
          </label>
          <button class="btn" :disabled="loadTestRunning || !hasDebug" @click="runLoadTestOnce">
            立即发一轮
          </button>
          <button
            class="btn"
            :disabled="loadTestRecords.length === 0"
            @click="exportLoadTestRecords"
          >
            导出 JSON
          </button>
          <button
            class="btn danger"
            :disabled="loadTestRecords.length === 0"
            @click="clearLoadTestRecords"
          >
            清空
          </button>
        </div>

        <div class="form-row" style="grid-template-columns: 120px 1fr">
          <label class="label">测试内容（每行一条）</label>
          <textarea
            v-model="loadTestMessagesRaw"
            class="input textarea"
            rows="5"
            placeholder="例如：ping&#10;给一个简短回复&#10;给我一个 wave 动作"
          />
        </div>

        <div class="split">
          <div class="col">
            <div class="panel-sub">状态</div>
            <pre class="pre">{{ pretty(loadTestStatusView) }}</pre>
          </div>
          <div class="col">
            <div class="panel-sub">最近记录（尾部）</div>
            <pre class="pre">{{ pretty(loadTestRecentView) }}</pre>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">VRM 调试</div>
        <div class="kv">
          <div class="k">window.vrmDebug</div>
          <div class="v" :class="{ bad: !vrmDebugAvailable, ok: vrmDebugAvailable }">
            {{ vrmDebugAvailable ? '已连接' : '未连接（需处于 VRM 模式并已加载模型）' }}
          </div>
        </div>
        <div class="btn-row" style="margin-top: 8px">
          <button class="btn" :disabled="!vrmDebugAvailable" @click="vrmRefit">重新适配视野</button>
          <button class="btn" :disabled="!vrmDebugAvailable" @click="vrmReadBox">读取包围盒</button>
          <button class="btn" :disabled="!vrmDebugAvailable" @click="vrmReadBones">
            读取骨骼点
          </button>
          <button class="btn" :disabled="!vrmDebugAvailable" @click="vrmReadFrame">读取投影</button>
        </div>
        <div class="kv" v-if="vrmDebugError">
          <div class="k">错误</div>
          <div class="v bad">{{ vrmDebugError }}</div>
        </div>
        <pre class="pre">{{ pretty(vrmDebugBox) }}</pre>
        <pre class="pre">{{ pretty(vrmDebugBones) }}</pre>
        <pre class="pre">{{ pretty(vrmDebugFrame) }}</pre>
      </section>

      <section class="panel">
        <div class="panel-title">AI Reply 测试</div>
        <div class="btn-row">
          <button class="btn" :disabled="!hasDebug" @click="fillMock('missing')">
            缺失 avatarPlan
          </button>
          <button class="btn" :disabled="!hasDebug" @click="fillMock('bad_json')">
            avatarPlan 非法 JSON
          </button>
          <button class="btn" :disabled="!hasDebug" @click="fillMock('multiline')">
            avatarPlan 多行
          </button>
          <button class="btn" :disabled="!hasDebug" @click="fillMock('envelope')">
            Envelope(JSON)
          </button>
        </div>
        <textarea
          v-model="mockAiReplyText"
          class="input textarea"
          rows="8"
          placeholder="粘贴 AI 原始回复（rawResponse）"
        />
        <div class="btn-row">
          <button class="btn" :disabled="!hasDebug" @click="parseMock">解析</button>
          <button class="btn primary" :disabled="!hasDebug" @click="applyMock">应用到 Agent</button>
          <button class="btn" @click="mockAiReplyText = ''">清空</button>
        </div>
        <pre class="pre">{{ pretty(mockParseResult) }}</pre>
      </section>

      <section class="panel">
        <div class="panel-title">操作</div>
        <div class="btn-row">
          <button class="btn" :disabled="!hasDebug" @click="act('toggleChat')">切换聊天</button>
          <button class="btn" :disabled="!hasDebug" @click="act('openChat')">打开聊天</button>
          <button class="btn" :disabled="!hasDebug" @click="act('closeChat')">关闭聊天</button>
          <button class="btn" :disabled="!hasDebug" @click="act('cancelAi')">取消所有 AI</button>
          <button class="btn" :disabled="!hasDebug" @click="act('taskNext')">任务继续</button>
          <button class="btn" :disabled="!hasDebug" @click="act('taskStop')">任务停止</button>
          <button class="btn" :disabled="!hasDebug" @click="act('reloadMemory')">重载记忆</button>
          <button class="btn danger" :disabled="!hasDebug" @click="act('clearLocalMemory')">
            清空本地记忆
          </button>
        </div>
      </section>

      <section class="panel wide">
        <div class="panel-title">数据视图</div>
        <div class="split">
          <div class="col">
            <div class="panel-sub">性能</div>
            <pre class="pre">{{ pretty(perfView) }}</pre>

            <div class="panel-sub">聊天（最近）</div>
            <div class="form-row">
              <label class="label">过滤</label>
              <input v-model="chatFilter" class="input" type="text" placeholder="role/text 包含" />
              <button class="btn" @click="chatFilter = ''">清空</button>
            </div>
            <div class="form-row">
              <label class="label">条数</label>
              <input v-model.number="chatLimit" class="input" type="number" min="5" max="200" />
              <button class="btn" :disabled="!hasDebug" @click="refresh">刷新</button>
            </div>
            <pre class="pre">{{ pretty(chatView) }}</pre>

            <div class="panel-sub" style="margin-top: 10px">任务</div>
            <pre class="pre">{{ pretty(taskView) }}</pre>
          </div>
          <div class="col">
            <div class="panel-sub">记忆 Facts</div>
            <pre class="pre">{{ pretty(factsView) }}</pre>
            <div class="panel-sub" style="margin-top: 10px">本地记忆（最近）</div>
            <pre class="pre">{{ pretty(memoryItemsView) }}</pre>
          </div>
        </div>
      </section>

      <section class="panel wide">
        <div class="panel-title">诊断与反馈</div>
        <div class="toolbar">
          <label class="toolbar-item">
            <input v-model="autoRefreshEnabled" type="checkbox" />
            自动刷新
          </label>
          <label class="toolbar-item">
            间隔(ms)
            <input
              v-model.number="refreshIntervalMs"
              class="input input-sm"
              type="number"
              min="120"
              max="60000"
            />
          </label>
          <button class="btn" @click="refresh">立即刷新</button>
          <button class="btn" :disabled="!hasDebug" @click="clearDiag">清空诊断</button>
          <button class="btn" :disabled="!hasDebug" @click="saveFeedbackPackToLocalNow">
            保存到本地
          </button>
          <button class="btn" :disabled="!hasDebug" @click="downloadFeedbackPack">
            导出反馈包
          </button>
          <button class="btn" :disabled="!hasDebug" @click="copyFeedbackSummary">复制摘要</button>
          <button class="btn" :disabled="!hasDebug" @click="copyFeedbackPackJson">
            复制反馈 JSON
          </button>
        </div>

        <div class="split">
          <div class="col">
            <div class="panel-sub">错误/警告（最近）</div>
            <div class="form-row">
              <label class="label">条数</label>
              <input v-model.number="diagLimit" class="input" type="number" min="10" max="400" />
              <button class="btn" :disabled="!hasDebug" @click="applyDiagMax">应用</button>
            </div>
            <pre class="pre">{{ pretty(diagErrorsView) }}</pre>
          </div>
          <div class="col">
            <div class="panel-sub">AI 请求追踪（最近）</div>
            <pre class="pre">{{ pretty(diagAiRequestsView) }}</pre>
          </div>
        </div>

        <div class="panel-sub" style="margin-top: 10px">事件流（最近）</div>
        <div class="form-row">
          <label class="label">过滤</label>
          <input v-model="diagQuery" class="input" type="text" placeholder="kind/message 包含" />
          <button class="btn" @click="diagQuery = ''">清空</button>
        </div>
        <div class="form-row">
          <label class="label">Level</label>
          <select v-model="diagLevel" class="input">
            <option value="">（全部）</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
          </select>
          <button class="btn" @click="diagLevel = ''">重置</button>
        </div>
        <pre class="pre">{{ pretty(diagItemsView) }}</pre>
      </section>

      <section class="panel wide">
        <div class="panel-title">快照</div>
        <div class="split">
          <div class="col">
            <div class="panel-sub">概览</div>
            <pre class="pre">{{ pretty(summaryView) }}</pre>
          </div>
          <div class="col">
            <div class="panel-sub">完整 JSON</div>
            <pre class="pre">{{ pretty(snapshot) }}</pre>
          </div>
        </div>
      </section>
    </div>

    <Agent class="pinned-agent" :is-pinned="true" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Agent from '../agent/components/Agent.vue';
import {
  getAiRuntimeState,
  getAiTransportOverride,
  sendMessageToAI,
  setAiTransportOverride
} from '../agent/services/aiService';
import { getAuthToken, getUserId } from '../agent/utils/user';
import { buildApiUrl } from '../utils/api';

const snapshot = ref<any>(null);
const aiState = ref<any>(null);
const diagState = ref<any>(null);
const transportOverride = ref<string>(getAiTransportOverride() || '');
const feedbackReason = ref<string>('');
const diagQuery = ref<string>('');
const diagLevel = ref<string>('');
const mockAiReplyText = ref<string>('');
const mockParseResult = ref<any>(null);

const hasDebug = ref<boolean>(false);
const vrmDebugAvailable = ref<boolean>(false);
const vrmDebugBox = ref<any>(null);
const vrmDebugBones = ref<any>(null);
const vrmDebugFrame = ref<any>(null);
const vrmDebugError = ref<string>('');

const backendHealth = ref<any>(null);
const hfTestResult = ref<any>(null);
const hfOwner = ref<string>('Feng1997');
const hfRepo = ref<string>('ModelDoc');
const hfRef = ref<string>('main');
const hfPath = ref<string>('model/Genshin/all/YaeMiko.vrm');
const hfPreferBase = ref<string>('mirror');

const embedDocsResult = ref<any>(null);
const embedDocsLang = ref<string>('zh');

const usageUserId = ref<string>('');
const usageProjectId = ref<string>('');
const usageSessionId = ref<string>('');
const usageTrigger = ref<string>('');
const usageModel = ref<string>('');
const usageFrom = ref<string>('');
const usageTo = ref<string>('');
const usageGroupBy = ref<string>('day');
const usageLimit = ref<number>(200);
const usageOffset = ref<number>(0);
const usageLedgerResult = ref<any>(null);
const usageSummaryResult = ref<any>(null);

try {
  usageUserId.value = String(getUserId() || '').trim();
  usageProjectId.value = String(window.localStorage.getItem('agent_project_id_v1') || '').trim();
  usageSessionId.value = String(window.sessionStorage.getItem('agent_session_id_v1') || '').trim();
} catch {}

const hfTestUrl = computed(() => {
  const o = String(hfOwner.value || '').trim();
  const r = String(hfRepo.value || '').trim();
  const rf = String(hfRef.value || '').trim();
  const p = String(hfPath.value || '')
    .trim()
    .replace(/^\/+/, '');
  if (!o || !r || !rf || !p) return '';
  const base = buildApiUrl(`/api/hf/${o}/${r}/resolve/${rf}/${p}`);
  const q = String(hfPreferBase.value || '').trim();
  return q ? `${base}?preferBase=${encodeURIComponent(q)}` : base;
});

const AGENT_DEBUG_ENABLE_KEY = 'agent_debug_enable_v1';

const setDebugBridgeEnabled = (enabled: boolean) => {
  try {
    if (enabled) window.localStorage.setItem(AGENT_DEBUG_ENABLE_KEY, '1');
    else window.localStorage.removeItem(AGENT_DEBUG_ENABLE_KEY);
  } catch {}
};

const enableDebugBridgeAndReload = () => {
  setDebugBridgeEnabled(true);
  window.location.reload();
};

const disableDebugBridgeAndReload = () => {
  setDebugBridgeEnabled(false);
  window.location.reload();
};

const computeHasDebug = () => {
  const w = window as any;
  return !!w.__agentDebug && typeof w.__agentDebug.getSnapshot === 'function';
};

const captureEnabled = computed(() => {
  const s = diagState.value;
  return typeof s?.enabled === 'boolean' ? s.enabled : true;
});

const consoleCaptureInfoEnabled = computed(() => {
  const s = diagState.value;
  return typeof s?.consoleCaptureInfo === 'boolean' ? s.consoleCaptureInfo : false;
});

const getVrmDebugApi = () => {
  const w = window as any;
  return w.vrmDebug || null;
};

const refresh = () => {
  const w = window as any;
  hasDebug.value = computeHasDebug();
  if (w.__agentDebug?.getSnapshot) snapshot.value = w.__agentDebug.getSnapshot();
  if (w.__agentDebug?.getDiagnosticsSnapshot)
    diagState.value = w.__agentDebug.getDiagnosticsSnapshot();
  aiState.value = getAiRuntimeState();
  const vrmApi = getVrmDebugApi();
  vrmDebugAvailable.value = !!vrmApi && typeof vrmApi.refit === 'function';
};

const vrmRefit = () => {
  vrmDebugError.value = '';
  const api = getVrmDebugApi();
  try {
    if (api?.refit) api.refit();
  } catch (e: any) {
    vrmDebugError.value = typeof e?.message === 'string' ? e.message : String(e);
  }
  refresh();
};

const vrmReadBox = () => {
  vrmDebugError.value = '';
  const api = getVrmDebugApi();
  try {
    vrmDebugBox.value = api?.box ? api.box() : null;
  } catch (e: any) {
    vrmDebugError.value = typeof e?.message === 'string' ? e.message : String(e);
  }
};

const vrmReadBones = () => {
  vrmDebugError.value = '';
  const api = getVrmDebugApi();
  try {
    vrmDebugBones.value = api?.bones ? api.bones() : null;
  } catch (e: any) {
    vrmDebugError.value = typeof e?.message === 'string' ? e.message : String(e);
  }
};

const vrmReadFrame = () => {
  vrmDebugError.value = '';
  const api = getVrmDebugApi();
  try {
    vrmDebugFrame.value = api?.frame ? api.frame() : null;
  } catch (e: any) {
    vrmDebugError.value = typeof e?.message === 'string' ? e.message : String(e);
  }
};

const applyParam = (key: string, value: any) => {
  const w = window as any;
  if (w.__agentDebug?.setParam) w.__agentDebug.setParam(key, value);
  refresh();
};

const act = (name: string) => {
  const w = window as any;
  if (w.__agentDebug?.action) w.__agentDebug.action(name);
  refresh();
};

const parseMock = () => {
  const w = window as any;
  try {
    mockParseResult.value = w.__agentDebug?.parseAiReply
      ? w.__agentDebug.parseAiReply(mockAiReplyText.value)
      : null;
  } catch (e: any) {
    mockParseResult.value = { error: typeof e?.message === 'string' ? e.message : String(e) };
  }
};

const applyMock = async () => {
  const w = window as any;
  if (!w.__agentDebug?.applyAiReply) return;
  await w.__agentDebug.applyAiReply(mockAiReplyText.value, {
    displayInChat: false,
    speakText: false,
    suppressMemorySave: true
  });
  refresh();
};

const fillMock = (kind: string) => {
  const langIsZh = true;
  if (kind === 'missing') {
    mockAiReplyText.value = langIsZh
      ? '喂……你、你一直盯着我干嘛啦。[HAPPY]'
      : 'H-Hey... w-what are you staring at? [HAPPY]';
  } else if (kind === 'bad_json') {
    mockAiReplyText.value = langIsZh
      ? '哼，才不是为了你呢。[ANGRY]\navatarPlan: [{"type":"motion","motion":"wave",}]'
      : 'Hmph. Not for you. [ANGRY]\navatarPlan: [{"type":"motion","motion":"wave",}]';
  } else if (kind === 'multiline') {
    mockAiReplyText.value =
      '好吧…就一下下。[SHY]\navatarPlan:\n[\n  {"type":"motion","motion":"wave","duration":900},\n  {"type":"expression","expression":"shy","duration":900}\n]';
  } else if (kind === 'envelope') {
    mockAiReplyText.value = JSON.stringify(
      {
        v: '1',
        decision: {
          kind: 'chat',
          text: langIsZh ? '哼…就回答你一次。 [HAPPY]' : 'Hmph... fine. [HAPPY]'
        },
        avatarPlan: [{ type: 'motion', motion: 'nod', duration: 900 }]
      },
      null,
      2
    );
  }
  parseMock();
};

const applyTransport = () => {
  const v =
    transportOverride.value === 'proxy' || transportOverride.value === 'direct'
      ? transportOverride.value
      : '';
  setAiTransportOverride(v as any);
  refresh();
};

const clearDiag = () => {
  const w = window as any;
  if (w.__agentDebug?.clearDiagnostics) w.__agentDebug.clearDiagnostics();
  refresh();
};

const toggleCapture = () => {
  const w = window as any;
  const next = !captureEnabled.value;
  if (w.__agentDebug?.setDiagnosticsEnabled) w.__agentDebug.setDiagnosticsEnabled(next);
  refresh();
};

const toggleConsoleInfoCapture = () => {
  const w = window as any;
  const next = !consoleCaptureInfoEnabled.value;
  if (w.__agentDebug?.setConsoleCaptureInfoEnabled)
    w.__agentDebug.setConsoleCaptureInfoEnabled(next);
  refresh();
};

const clearCapture = () => {
  clearDiag();
};

const diagLimit = ref<number>(200);
const applyDiagMax = () => {
  const w = window as any;
  const n = Math.max(20, Math.min(2000, Number(diagLimit.value) || 200));
  if (w.__agentDebug?.setDiagnosticsMaxItems) w.__agentDebug.setDiagnosticsMaxItems(n);
  refresh();
};

const pretty = (v: any) => {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
};

const loadBackendHealth = async () => {
  const startedAt = performance.now();
  const url = buildApiUrl('/api/health');
  try {
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    backendHealth.value = {
      ok: res.ok,
      status: res.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      url,
      body: json
    };
  } catch (e: any) {
    backendHealth.value = {
      ok: false,
      status: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      url,
      error: typeof e?.message === 'string' ? e.message : String(e)
    };
  }
};

const readLocal = (key: string) => {
  try {
    return String(window.localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
};

const readSession = (key: string) => {
  try {
    return String(window.sessionStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
};

const buildAuthHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
};

const buildUrlWithQuery = (base: string, query: Record<string, any>) => {
  const entries = Object.entries(query).filter(
    ([, v]) => v !== undefined && v !== null && String(v).trim()
  );
  if (entries.length === 0) return base;
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${base}?${qs}`;
};

const fillUsageDefaults = () => {
  const uid = String(getUserId() || '').trim();
  if (!usageUserId.value) usageUserId.value = uid;
  if (!usageProjectId.value) usageProjectId.value = readLocal('agent_project_id_v1');
  if (!usageSessionId.value) usageSessionId.value = readSession('agent_session_id_v1');
};

const loadUsageLedger = async () => {
  fillUsageDefaults();
  const startedAt = performance.now();
  const url = buildUrlWithQuery(buildApiUrl('/api/usage/ledger'), {
    userId: usageUserId.value,
    projectId: usageProjectId.value,
    sessionId: usageSessionId.value,
    trigger: usageTrigger.value,
    model: usageModel.value,
    from: usageFrom.value,
    to: usageTo.value,
    limit: usageLimit.value,
    offset: usageOffset.value
  });
  try {
    const res = await fetch(url, { headers: buildAuthHeaders() });
    const json = await res.json().catch(() => null);
    usageLedgerResult.value = {
      ok: res.ok,
      status: res.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      url,
      body: json
    };
  } catch (e: any) {
    usageLedgerResult.value = {
      ok: false,
      status: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      url,
      error: typeof e?.message === 'string' ? e.message : String(e)
    };
  }
};

const loadUsageSummary = async () => {
  fillUsageDefaults();
  const startedAt = performance.now();
  const url = buildUrlWithQuery(buildApiUrl('/api/usage/summary'), {
    userId: usageUserId.value,
    from: usageFrom.value,
    to: usageTo.value,
    groupBy: usageGroupBy.value
  });
  try {
    const res = await fetch(url, { headers: buildAuthHeaders() });
    const json = await res.json().catch(() => null);
    usageSummaryResult.value = {
      ok: res.ok,
      status: res.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      url,
      body: json
    };
  } catch (e: any) {
    usageSummaryResult.value = {
      ok: false,
      status: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      url,
      error: typeof e?.message === 'string' ? e.message : String(e)
    };
  }
};

const embedDocs = async () => {
  const startedAt = performance.now();
  const url = buildApiUrl('/api/embed/fs');
  const lang = embedDocsLang.value === 'en' ? 'en' : 'zh';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, roots: ['doc/read/docs'] })
    });
    const json = await res.json().catch(() => null);
    embedDocsResult.value = {
      ok: res.ok,
      status: res.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      url,
      body: json
    };
  } catch (e: any) {
    embedDocsResult.value = {
      ok: false,
      status: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      url,
      error: typeof e?.message === 'string' ? e.message : String(e)
    };
  }
};

const runHfHeadTest = async () => {
  const url = hfTestUrl.value;
  if (!url) return;
  const startedAt = performance.now();
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const headers = Object.fromEntries(Array.from(res.headers.entries()));
    hfTestResult.value = {
      ok: res.ok,
      status: res.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      method: 'HEAD',
      url,
      headers
    };
  } catch (e: any) {
    hfTestResult.value = {
      ok: false,
      status: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      method: 'HEAD',
      url,
      error: typeof e?.message === 'string' ? e.message : String(e)
    };
  }
};

const runHfRangeTest = async () => {
  const url = hfTestUrl.value;
  if (!url) return;
  const startedAt = performance.now();
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
    const headers = Object.fromEntries(Array.from(res.headers.entries()));
    const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    hfTestResult.value = {
      ok: res.ok,
      status: res.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      method: 'GET',
      range: 'bytes=0-1023',
      url,
      bytes: buf.byteLength,
      headers
    };
  } catch (e: any) {
    hfTestResult.value = {
      ok: false,
      status: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      method: 'GET',
      range: 'bytes=0-1023',
      url,
      error: typeof e?.message === 'string' ? e.message : String(e)
    };
  }
};

const autoRefreshEnabled = ref<boolean>(true);
const refreshIntervalMs = ref<number>(800);

type AutoTestRecord = {
  id: string;
  ts: number;
  durationMs: number;
  ok: boolean;
  reason: 'timer' | 'manual';
  checks: Record<string, any>;
};

const AUTO_TEST_STORAGE_KEY = 'agent_debug_autotest_v1';
const FEEDBACK_PACK_STORAGE_KEY = 'agent_feedback_pack_history_v1';
const LOAD_TEST_STORAGE_KEY = 'agent_debug_loadtest_v1';

const autoTestEnabled = ref<boolean>(false);
const autoTestIntervalMs = ref<number>(15000);
const autoTestMaxRecords = ref<number>(400);
const autoTestCheckSnapshot = ref<boolean>(true);
const autoTestCheckDiagnostics = ref<boolean>(true);
const autoTestCheckHealth = ref<boolean>(true);
const autoTestCheckUsage = ref<boolean>(false);
const autoTestCheckChat = ref<boolean>(false);
const autoTestChatMessage = ref<string>('ping');
const autoTestChatGroup = ref<string>('debug');
const autoTestRecords = ref<AutoTestRecord[]>([]);
const autoTestRunning = ref<boolean>(false);
const autoTestLastError = ref<string>('');

const safeJsonParse = <T,>(raw: string, fallback: T): T => {
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
};

type LoadTestRecord = {
  id: string;
  ts: number;
  ok: boolean;
  elapsedMs: number;
  group: string;
  message: string;
  replyPreview?: string;
  error?: string;
};

const loadTestEnabled = ref<boolean>(true);
const loadTestIntervalMs = ref<number>(900);
const loadTestBurstCount = ref<number>(30);
const loadTestMaxInflight = ref<number>(3);
const loadTestGroup = ref<string>('loadtest');
const loadTestMode = ref<'random' | 'sequence'>('random');
const loadTestMessagesRaw = ref<string>('ping\n给一个简短回复\n给我一个 wave 动作\n只输出 OK');
const loadTestRecords = ref<LoadTestRecord[]>([]);
const loadTestRunning = ref<boolean>(false);
const loadTestLastError = ref<string>('');
const loadTestInflight = ref<number>(0);
const loadTestSent = ref<number>(0);
const loadTestOk = ref<number>(0);
const loadTestFail = ref<number>(0);
let loadTestTimer: number | null = null;
let loadTestSequenceIndex = 0;
let loadTestHasKickedOff = false;
let loadTestKickoffTimer: number | null = null;

const loadTestMessages = computed(() => {
  const raw = String(loadTestMessagesRaw.value || '');
  const lines = raw
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x);
  return lines.length ? lines : ['ping'];
});

const pickLoadTestMessage = () => {
  const list = loadTestMessages.value;
  if (list.length === 0) return 'ping';
  if (loadTestMode.value === 'sequence') {
    const i = Math.max(0, loadTestSequenceIndex) % list.length;
    loadTestSequenceIndex += 1;
    return list[i];
  }
  return list[Math.floor(Math.random() * list.length)];
};

const loadLoadTestState = () => {
  try {
    const raw = String(localStorage.getItem(LOAD_TEST_STORAGE_KEY) || '');
    if (!raw.trim()) return;
    const parsed = safeJsonParse<any>(raw, null);
    const cfg = parsed?.config && typeof parsed.config === 'object' ? parsed.config : {};
    loadTestEnabled.value = !!cfg.enabled;
    if (typeof cfg.intervalMs === 'number') loadTestIntervalMs.value = cfg.intervalMs;
    if (typeof cfg.burstCount === 'number') loadTestBurstCount.value = cfg.burstCount;
    if (typeof cfg.maxInflight === 'number') loadTestMaxInflight.value = cfg.maxInflight;
    if (typeof cfg.group === 'string') loadTestGroup.value = cfg.group;
    if (cfg.mode === 'random' || cfg.mode === 'sequence') loadTestMode.value = cfg.mode;
    if (typeof cfg.messagesRaw === 'string') loadTestMessagesRaw.value = cfg.messagesRaw;
    const list = Array.isArray(parsed?.records) ? parsed.records : [];
    loadTestRecords.value = list
      .filter((x: any) => typeof x?.id === 'string' && typeof x?.ts === 'number')
      .slice(-400);
  } catch {}
};

const persistLoadTestState = () => {
  try {
    const payload = {
      v: 1,
      updatedAt: Date.now(),
      config: {
        enabled: loadTestEnabled.value,
        intervalMs: Math.max(200, Math.min(600000, Number(loadTestIntervalMs.value) || 800)),
        burstCount: Math.max(1, Math.min(200, Number(loadTestBurstCount.value) || 12)),
        maxInflight: Math.max(1, Math.min(12, Number(loadTestMaxInflight.value) || 3)),
        group: String(loadTestGroup.value || '')
          .trim()
          .slice(0, 60),
        mode: loadTestMode.value,
        messagesRaw: String(loadTestMessagesRaw.value || '').slice(0, 12000)
      },
      records: loadTestRecords.value.slice(-400)
    };
    localStorage.setItem(LOAD_TEST_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
};

const pushLoadTestRecord = (r: LoadTestRecord) => {
  loadTestRecords.value = [...loadTestRecords.value, r].slice(-400);
};

const clearLoadTestRecords = () => {
  loadTestRecords.value = [];
  loadTestLastError.value = '';
  loadTestSent.value = 0;
  loadTestOk.value = 0;
  loadTestFail.value = 0;
  persistLoadTestState();
};

const exportLoadTestRecords = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadJson(`agent_loadtest_${stamp}.json`, {
    exportedAt: new Date().toISOString(),
    config: {
      enabled: loadTestEnabled.value,
      intervalMs: loadTestIntervalMs.value,
      burstCount: loadTestBurstCount.value,
      maxInflight: loadTestMaxInflight.value,
      group: loadTestGroup.value,
      mode: loadTestMode.value,
      messages: loadTestMessages.value
    },
    stats: {
      sent: loadTestSent.value,
      ok: loadTestOk.value,
      fail: loadTestFail.value
    },
    records: loadTestRecords.value
  });
};

const runLoadTestOnceInternal = async (reason: 'timer' | 'manual') => {
  if (loadTestRunning.value) return;
  if (!computeHasDebug()) return;
  loadTestHasKickedOff = true;
  loadTestRunning.value = true;
  loadTestLastError.value = '';
  const group = String(loadTestGroup.value || '').trim() || 'loadtest';
  const burst = Math.max(1, Math.min(200, Number(loadTestBurstCount.value) || 12));
  const maxInflight = Math.max(1, Math.min(12, Number(loadTestMaxInflight.value) || 3));
  let remaining = burst;

  const worker = async () => {
    while (remaining > 0) {
      remaining -= 1;
      const message = pickLoadTestMessage();
      const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      const t0 = performance.now();
      loadTestInflight.value += 1;
      loadTestSent.value += 1;
      try {
        const reply = await sendMessageToAI(
          message,
          [],
          { trigger: `admin-loadtest:${reason}`, suppressMemorySave: true },
          { group, cancelLowerPriority: false, dropIfHigherPriorityActive: false }
        );
        loadTestOk.value += 1;
        pushLoadTestRecord({
          id,
          ts: Date.now(),
          ok: true,
          elapsedMs: Math.round(performance.now() - t0),
          group,
          message,
          replyPreview: String(reply || '').slice(0, 240)
        });
      } catch (e: any) {
        loadTestFail.value += 1;
        const err = typeof e?.message === 'string' ? e.message : String(e);
        loadTestLastError.value = err;
        pushLoadTestRecord({
          id,
          ts: Date.now(),
          ok: false,
          elapsedMs: Math.round(performance.now() - t0),
          group,
          message,
          error: err
        });
      } finally {
        loadTestInflight.value = Math.max(0, loadTestInflight.value - 1);
      }
    }
  };

  try {
    const workers = Array.from({ length: Math.min(maxInflight, burst) }, () => worker());
    await Promise.all(workers);
  } finally {
    loadTestRunning.value = false;
    persistLoadTestState();
  }
};

const runLoadTestOnce = async () => {
  await runLoadTestOnceInternal('manual');
};

const restartLoadTestTimer = () => {
  if (loadTestTimer) window.clearInterval(loadTestTimer);
  loadTestTimer = null;
  if (!loadTestEnabled.value) return;
  const ms = Math.max(200, Math.min(600000, Number(loadTestIntervalMs.value) || 800));
  loadTestTimer = window.setInterval(() => {
    void runLoadTestOnceInternal('timer');
  }, ms);
};

const tryKickoffLoadTest = () => {
  if (loadTestHasKickedOff) return;
  if (!loadTestEnabled.value) return;
  if (!computeHasDebug()) return;
  void runLoadTestOnceInternal('timer');
};

const startLoadTestKickoffLoop = () => {
  if (loadTestKickoffTimer) window.clearInterval(loadTestKickoffTimer);
  loadTestKickoffTimer = window.setInterval(() => {
    tryKickoffLoadTest();
    if (loadTestHasKickedOff) {
      if (loadTestKickoffTimer) window.clearInterval(loadTestKickoffTimer);
      loadTestKickoffTimer = null;
    }
  }, 300);
  window.setTimeout(() => {
    if (!loadTestKickoffTimer) return;
    window.clearInterval(loadTestKickoffTimer);
    loadTestKickoffTimer = null;
  }, 12000);
};

const loadTestStatusView = computed(() => {
  return {
    enabled: loadTestEnabled.value,
    running: loadTestRunning.value,
    inflight: loadTestInflight.value,
    intervalMs: loadTestIntervalMs.value,
    burstCount: loadTestBurstCount.value,
    maxInflight: loadTestMaxInflight.value,
    group: loadTestGroup.value,
    mode: loadTestMode.value,
    messages: loadTestMessages.value.length,
    stats: {
      sent: loadTestSent.value,
      ok: loadTestOk.value,
      fail: loadTestFail.value
    },
    lastError: loadTestLastError.value || ''
  };
});

const loadTestRecentView = computed(() => {
  return loadTestRecords.value.slice(-40);
});

type FeedbackPackHistoryItem = {
  id: string;
  ts: number;
  reason: string;
  pack: any;
};
const feedbackPackHistory = ref<FeedbackPackHistoryItem[]>([]);
const feedbackPackHistoryCount = computed(() => feedbackPackHistory.value.length);
const feedbackPackHistoryLastSavedAt = computed(() => {
  const last = feedbackPackHistory.value.slice(-1)[0];
  if (!last?.ts) return '';
  try {
    return new Date(last.ts).toLocaleString();
  } catch {
    return '';
  }
});

const loadFeedbackPackHistory = () => {
  try {
    const raw = String(localStorage.getItem(FEEDBACK_PACK_STORAGE_KEY) || '');
    if (!raw.trim()) return;
    const parsed = safeJsonParse<any>(raw, null);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    feedbackPackHistory.value = items
      .filter((x: any) => typeof x?.id === 'string' && typeof x?.ts === 'number')
      .slice(-50);
  } catch {}
};

const persistFeedbackPackHistory = () => {
  try {
    const items = feedbackPackHistory.value.slice(-50);
    localStorage.setItem(
      FEEDBACK_PACK_STORAGE_KEY,
      JSON.stringify({ v: 1, updatedAt: Date.now(), items })
    );
  } catch {}
};

const saveFeedbackPackToLocal = (pack: any) => {
  const reason = String(feedbackReason.value || '').slice(0, 600);
  const ts = Date.now();
  const id = `${ts}_${Math.random().toString(16).slice(2)}`;
  feedbackPackHistory.value = [...feedbackPackHistory.value, { id, ts, reason, pack }].slice(-50);
  persistFeedbackPackHistory();
};

const clearLocalFeedbackPacks = () => {
  feedbackPackHistory.value = [];
  try {
    localStorage.removeItem(FEEDBACK_PACK_STORAGE_KEY);
  } catch {}
};

const loadAutoTestState = () => {
  try {
    const raw = String(localStorage.getItem(AUTO_TEST_STORAGE_KEY) || '');
    if (!raw.trim()) return;
    const parsed = safeJsonParse<any>(raw, null);
    const cfg = parsed?.config && typeof parsed.config === 'object' ? parsed.config : {};
    autoTestEnabled.value = !!cfg.enabled;
    if (typeof cfg.intervalMs === 'number') autoTestIntervalMs.value = cfg.intervalMs;
    if (typeof cfg.maxRecords === 'number') autoTestMaxRecords.value = cfg.maxRecords;
    if (typeof cfg.checkSnapshot === 'boolean') autoTestCheckSnapshot.value = cfg.checkSnapshot;
    if (typeof cfg.checkDiagnostics === 'boolean')
      autoTestCheckDiagnostics.value = cfg.checkDiagnostics;
    if (typeof cfg.checkHealth === 'boolean') autoTestCheckHealth.value = cfg.checkHealth;
    if (typeof cfg.checkUsage === 'boolean') autoTestCheckUsage.value = cfg.checkUsage;
    if (typeof cfg.checkChat === 'boolean') autoTestCheckChat.value = cfg.checkChat;
    if (typeof cfg.chatMessage === 'string') autoTestChatMessage.value = cfg.chatMessage;
    if (typeof cfg.chatGroup === 'string') autoTestChatGroup.value = cfg.chatGroup;
    const list = Array.isArray(parsed?.records) ? parsed.records : [];
    autoTestRecords.value = list
      .filter((x: any) => typeof x?.id === 'string' && typeof x?.ts === 'number')
      .slice(-Math.max(20, Math.min(2000, Number(cfg.maxRecords) || 400)));
  } catch {}
};

const persistAutoTestState = () => {
  try {
    const max = Math.max(20, Math.min(2000, Number(autoTestMaxRecords.value) || 400));
    const payload = {
      v: 1,
      updatedAt: Date.now(),
      config: {
        enabled: autoTestEnabled.value,
        intervalMs: Math.max(1000, Math.min(600000, Number(autoTestIntervalMs.value) || 15000)),
        maxRecords: max,
        checkSnapshot: autoTestCheckSnapshot.value,
        checkDiagnostics: autoTestCheckDiagnostics.value,
        checkHealth: autoTestCheckHealth.value,
        checkUsage: autoTestCheckUsage.value,
        checkChat: autoTestCheckChat.value,
        chatMessage: String(autoTestChatMessage.value || '').slice(0, 600),
        chatGroup: String(autoTestChatGroup.value || '').slice(0, 60)
      },
      records: autoTestRecords.value.slice(-max)
    };
    localStorage.setItem(AUTO_TEST_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
};

const autoTestStatusView = computed(() => {
  const last = autoTestRecords.value.length
    ? autoTestRecords.value[autoTestRecords.value.length - 1]
    : null;
  return {
    enabled: autoTestEnabled.value,
    running: autoTestRunning.value,
    intervalMs: autoTestIntervalMs.value,
    records: autoTestRecords.value.length,
    last: last
      ? {
          ts: last.ts,
          ok: last.ok,
          durationMs: last.durationMs,
          reason: last.reason
        }
      : null,
    lastError: autoTestLastError.value || ''
  };
});

const autoTestRecentView = computed(() => {
  const list = autoTestRecords.value.slice(-12);
  return list.map((r) => ({
    ts: r.ts,
    ok: r.ok,
    durationMs: r.durationMs,
    reason: r.reason,
    checks: Object.keys(r.checks || {})
  }));
});

let autoTestTimer: number | null = null;
const restartAutoTestTimer = () => {
  if (autoTestTimer) window.clearInterval(autoTestTimer);
  autoTestTimer = null;
  if (!autoTestEnabled.value) return;
  const ms = Math.max(1000, Math.min(600000, Number(autoTestIntervalMs.value) || 15000));
  autoTestTimer = window.setInterval(() => {
    void runAutoTestOnceInternal('timer');
  }, ms);
};

const pushAutoTestRecord = (record: AutoTestRecord) => {
  const max = Math.max(20, Math.min(2000, Number(autoTestMaxRecords.value) || 400));
  autoTestRecords.value.push(record);
  if (autoTestRecords.value.length > max) autoTestRecords.value = autoTestRecords.value.slice(-max);
};

const pickSnapshotForRecord = (s: any) => {
  const perf = s?.perf || {};
  const agent = s?.agent || {};
  return {
    route: s?.route || '',
    ts: typeof s?.ts === 'number' ? s.ts : Date.now(),
    perf: {
      fps: perf?.fps,
      avgFrameMs: perf?.avgFrameMs,
      frameMs: perf?.frameMs,
      longFrames60: perf?.longFrames60,
      heapUsedBytes: perf?.heapUsedBytes
    },
    agent: {
      type: agent?.type || '',
      energy: agent?.energy,
      emotions: agent?.emotions || {},
      flags: agent?.flags || {}
    }
  };
};

const pickDiagnosticsForRecord = (diag: any) => {
  const items = Array.isArray(diag?.items) ? diag.items : [];
  const reqs = Array.isArray(diag?.aiRequests) ? diag.aiRequests : [];
  const lastError = items.filter((x: any) => x?.level === 'error').slice(-1)[0] || null;
  const lastAiError = reqs.filter((x: any) => x?.ok === false).slice(-1)[0] || null;
  return {
    enabled: typeof diag?.enabled === 'boolean' ? diag.enabled : true,
    items: items.length,
    aiRequests: reqs.length,
    lastError: lastError
      ? { ts: lastError.ts, kind: lastError.kind, message: lastError.message }
      : null,
    lastAiError: lastAiError
      ? {
          ts: lastAiError.ts,
          kind: lastAiError.kind,
          group: lastAiError.group,
          status: lastAiError.status,
          errorMessage: lastAiError.errorMessage
        }
      : null
  };
};

const pickBackendHealthForRecord = (h: any) => {
  const body = h?.body && typeof h.body === 'object' ? h.body : null;
  const hf = body?.hf && typeof body.hf === 'object' ? body.hf : null;
  const gemini = body?.gemini && typeof body.gemini === 'object' ? body.gemini : null;
  const siliconflow =
    body?.siliconflow && typeof body.siliconflow === 'object' ? body.siliconflow : null;
  return {
    ok: typeof h?.ok === 'boolean' ? h.ok : undefined,
    status: typeof h?.status === 'number' ? h.status : undefined,
    elapsedMs: typeof h?.elapsedMs === 'number' ? h.elapsedMs : undefined,
    body: body
      ? {
          ok: body?.ok,
          serverTime: body?.serverTime,
          textProvider: body?.textProvider,
          gemini: gemini
            ? {
                timeoutMs: gemini?.timeoutMs,
                reactionTimeoutMs: gemini?.reactionTimeoutMs,
                proxyConfigured: gemini?.proxyConfigured
              }
            : null,
          hf: hf
            ? {
                resolveBases: Array.isArray(hf?.resolveBases) ? hf.resolveBases.slice(0, 6) : [],
                apiBases: Array.isArray(hf?.apiBases) ? hf.apiBases.slice(0, 6) : [],
                baseHealth: Array.isArray(hf?.baseHealth) ? hf.baseHealth.slice(0, 12) : []
              }
            : null,
          siliconflow: siliconflow
            ? {
                baseUrl: siliconflow?.baseUrl,
                ok: siliconflow?.ok
              }
            : null
        }
      : null
  };
};

const pickUsageResultForRecord = (r: any) => {
  const body = r?.body;
  const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : null;
  const last = items && items.length ? items[items.length - 1] : null;
  return {
    ok: typeof r?.ok === 'boolean' ? r.ok : undefined,
    status: typeof r?.status === 'number' ? r.status : undefined,
    elapsedMs: typeof r?.elapsedMs === 'number' ? r.elapsedMs : undefined,
    url: typeof r?.url === 'string' ? r.url : '',
    items: items ? items.length : undefined,
    last: last
      ? {
          ts: last?.ts,
          requestId: last?.requestId,
          trigger: last?.trigger,
          model: last?.model,
          creditsDelta: last?.creditsDelta,
          status: last?.status
        }
      : null,
    error: typeof r?.error === 'string' ? r.error : undefined
  };
};

const runAutoTestOnceInternal = async (reason: 'timer' | 'manual') => {
  if (autoTestRunning.value) return;
  autoTestRunning.value = true;
  autoTestLastError.value = '';
  const startedAt = performance.now();
  const checks: Record<string, any> = {};
  let ok = true;
  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  try {
    refresh();
    if (autoTestCheckHealth.value) {
      await loadBackendHealth();
      checks.health = pickBackendHealthForRecord(backendHealth.value);
      if (backendHealth.value && backendHealth.value.ok === false) ok = false;
    }
    if (autoTestCheckUsage.value) {
      await loadUsageSummary();
      await loadUsageLedger();
      checks.usageSummary = pickUsageResultForRecord(usageSummaryResult.value);
      checks.usageLedger = pickUsageResultForRecord(usageLedgerResult.value);
      if (usageSummaryResult.value && usageSummaryResult.value.ok === false) ok = false;
      if (usageLedgerResult.value && usageLedgerResult.value.ok === false) ok = false;
    }
    if (autoTestCheckChat.value) {
      const msg = String(autoTestChatMessage.value || '').trim();
      const group = String(autoTestChatGroup.value || '').trim() || 'debug';
      if (msg) {
        const t0 = performance.now();
        try {
          const reply = await sendMessageToAI(
            msg,
            [],
            { trigger: 'admin-test', suppressMemorySave: true },
            {
              group,
              cancelLowerPriority: false,
              dropIfHigherPriorityActive: false
            }
          );
          checks.chat = {
            ok: true,
            elapsedMs: Math.round(performance.now() - t0),
            replyPreview: String(reply || '').slice(0, 240)
          };
        } catch (e: any) {
          ok = false;
          checks.chat = {
            ok: false,
            elapsedMs: Math.round(performance.now() - t0),
            error: typeof e?.message === 'string' ? e.message : String(e)
          };
        }
      }
    }
    refresh();
    if (autoTestCheckSnapshot.value) {
      checks.snapshot = pickSnapshotForRecord(snapshot.value);
    }
    if (autoTestCheckDiagnostics.value) {
      checks.diagnostics = pickDiagnosticsForRecord(diagState.value);
    }
  } catch (e: any) {
    ok = false;
    autoTestLastError.value = typeof e?.message === 'string' ? e.message : String(e);
    checks.error = autoTestLastError.value;
  } finally {
    const record: AutoTestRecord = {
      id,
      ts: Date.now(),
      durationMs: Math.round(performance.now() - startedAt),
      ok,
      reason,
      checks
    };
    pushAutoTestRecord(record);
    persistAutoTestState();
    autoTestRunning.value = false;
  }
};

const runAutoTestOnce = async () => {
  await runAutoTestOnceInternal('manual');
};

const exportAutoTestRecords = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadJson(`agent_autotest_${stamp}.json`, {
    exportedAt: new Date().toISOString(),
    location: window.location.href,
    config: {
      enabled: autoTestEnabled.value,
      intervalMs: autoTestIntervalMs.value,
      maxRecords: autoTestMaxRecords.value,
      checkSnapshot: autoTestCheckSnapshot.value,
      checkDiagnostics: autoTestCheckDiagnostics.value,
      checkHealth: autoTestCheckHealth.value,
      checkUsage: autoTestCheckUsage.value,
      checkChat: autoTestCheckChat.value,
      chatMessage: autoTestChatMessage.value,
      chatGroup: autoTestChatGroup.value
    },
    records: autoTestRecords.value
  });
};

const clearAutoTestRecords = () => {
  autoTestRecords.value = [];
  persistAutoTestState();
};

const maxUiMessages = ref<number>(120);
const chatAutoCloseMs = ref<number>(5000);
const dynamicScale = ref<number>(1.0);
const moveTransitionMs = ref<number>(3000);
const roamEnabled = ref<boolean>(true);
const idleTalkEnabled = ref<boolean>(true);
const idleAiEnabled = ref<boolean>(true);
const moveIntervalMs = ref<number>(60000);
const idleTalkIntervalMs = ref<number>(30000);
const lerpFactor = ref<number>(0.06);
const mouseFollowOffsetX = ref<number>(20);
const mouseFollowOffsetY = ref<number>(20);
const maxEnergy = ref<number>(100);
const energyDecayRate = ref<number>(0.03);
const energyRecoverRate = ref<number>(0.02);
const tiredThreshold = ref<number>(20);
const idleAiMinIdleMs = ref<number>(65000);
const idleAiCooldownMs = ref<number>(120000);
const idleAiChance = ref<number>(0.22);

const chatFilter = ref<string>('');
const chatLimit = ref<number>(40);

watch(
  snapshot,
  (s) => {
    const p = s?.params;
    if (!p) return;
    if (typeof p.maxUiMessages === 'number') maxUiMessages.value = p.maxUiMessages;
    if (typeof p.chatAutoCloseMs === 'number') chatAutoCloseMs.value = p.chatAutoCloseMs;
    if (typeof p.dynamicScale === 'number') dynamicScale.value = p.dynamicScale;
    if (typeof p.moveTransitionMs === 'number') moveTransitionMs.value = p.moveTransitionMs;
    if (typeof p.roamEnabled === 'boolean') roamEnabled.value = p.roamEnabled;
    if (typeof p.idleTalkEnabled === 'boolean') idleTalkEnabled.value = p.idleTalkEnabled;
    if (typeof p.idleAiEnabled === 'boolean') idleAiEnabled.value = p.idleAiEnabled;
    if (typeof p.moveIntervalMs === 'number') moveIntervalMs.value = p.moveIntervalMs;
    if (typeof p.idleTalkIntervalMs === 'number') idleTalkIntervalMs.value = p.idleTalkIntervalMs;
    if (typeof p.lerpFactor === 'number') lerpFactor.value = p.lerpFactor;
    if (typeof p.mouseFollowOffset?.x === 'number')
      mouseFollowOffsetX.value = p.mouseFollowOffset.x;
    if (typeof p.mouseFollowOffset?.y === 'number')
      mouseFollowOffsetY.value = p.mouseFollowOffset.y;
    if (typeof p.maxEnergy === 'number') maxEnergy.value = p.maxEnergy;
    if (typeof p.energyDecayRate === 'number') energyDecayRate.value = p.energyDecayRate;
    if (typeof p.energyRecoverRate === 'number') energyRecoverRate.value = p.energyRecoverRate;
    if (typeof p.tiredThreshold === 'number') tiredThreshold.value = p.tiredThreshold;
    if (typeof p.idleAiMinIdleMs === 'number') idleAiMinIdleMs.value = p.idleAiMinIdleMs;
    if (typeof p.idleAiCooldownMs === 'number') idleAiCooldownMs.value = p.idleAiCooldownMs;
    if (typeof p.idleAiChance === 'number') idleAiChance.value = p.idleAiChance;
  },
  { deep: false }
);

const chatView = computed(() => {
  const s = snapshot.value;
  const raw = Array.isArray(s?.chat?.messages) ? s.chat.messages : [];
  const take = Math.max(5, Math.min(200, Number(chatLimit.value) || 40));
  const q = String(chatFilter.value || '')
    .trim()
    .toLowerCase();
  const normalized = raw
    .slice(-take)
    .map((m: any) => ({ role: m?.role || '', text: m?.text || '' }))
    .filter((m: any) => (m.text || '').trim());
  if (!q) return normalized;
  return normalized.filter((m: any) => `${m.role} ${m.text}`.toLowerCase().includes(q));
});

const factsView = computed(() => {
  const s = snapshot.value;
  const facts = Array.isArray(s?.memory?.facts) ? s.memory.facts : [];
  return facts.slice(-60);
});

const memoryItemsView = computed(() => {
  const s = snapshot.value;
  const items = Array.isArray(s?.memory?.recentItems) ? s.memory.recentItems : [];
  return items.slice(-60);
});

const taskView = computed(() => {
  const s = snapshot.value;
  const task = s?.task || null;
  return task;
});

const perfView = computed(() => {
  const s = snapshot.value;
  const p = s?.perf || null;
  return p;
});

const summaryView = computed(() => {
  const s = snapshot.value;
  if (!s) return null;
  return {
    route: s.route,
    perf: s.perf,
    agent: s.agent,
    chat: {
      open: s.chat?.open,
      isLoading: s.chat?.isLoading,
      isMuted: s.chat?.isMuted,
      messagesCount: Array.isArray(s.chat?.messages) ? s.chat.messages.length : 0
    },
    memory: {
      itemCount: s.memory?.itemCount,
      summaryChars: typeof s.memory?.summary === 'string' ? s.memory.summary.length : 0,
      factsCount: Array.isArray(s.memory?.facts) ? s.memory.facts.length : 0
    },
    task: s.task,
    params: s.params
  };
});

const diagErrorsView = computed(() => {
  const s = diagState.value;
  const items = Array.isArray(s?.items) ? s.items : [];
  const filtered = items.filter((x: any) => x?.level === 'error' || x?.level === 'warn');
  return filtered.slice(-60);
});

const diagAiRequestsView = computed(() => {
  const s = diagState.value;
  const items = Array.isArray(s?.aiRequests) ? s.aiRequests : [];
  return items.slice(-80);
});

const diagItemsView = computed(() => {
  const s = diagState.value;
  const items = Array.isArray(s?.items) ? s.items : [];
  const q = String(diagQuery.value || '')
    .trim()
    .toLowerCase();
  const level = String(diagLevel.value || '')
    .trim()
    .toLowerCase();
  const filtered = items.filter((x: any) => {
    if (level && String(x?.level || '').toLowerCase() !== level) return false;
    if (!q) return true;
    const kind = String(x?.kind || '');
    const msg = String(x?.message || '');
    return `${kind} ${msg}`.toLowerCase().includes(q);
  });
  return filtered.slice(-120);
});

const downloadJson = (filename: string, data: any) => {
  const text = pretty(data);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const buildFeedbackPack = () => {
  return {
    exportedAt: new Date().toISOString(),
    location: window.location.href,
    reason: String(feedbackReason.value || '').slice(0, 600),
    agentSnapshot: snapshot.value,
    aiService: aiState.value,
    diagnostics: diagState.value,
    backendHealth: backendHealth.value,
    hfTestResult: hfTestResult.value
  };
};

const downloadFeedbackPack = () => {
  refresh();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const pack = buildFeedbackPack();
  saveFeedbackPackToLocal(pack);
  downloadJson(`agent_feedback_${stamp}.json`, pack);
};

const feedbackPreview = computed(() => {
  const diag = diagState.value;
  const items = Array.isArray(diag?.items) ? diag.items : [];
  const reqs = Array.isArray(diag?.aiRequests) ? diag.aiRequests : [];
  const approxBytes = (() => {
    try {
      return JSON.stringify(buildFeedbackPack()).length;
    } catch {
      return 0;
    }
  })();
  return {
    approxBytes,
    counts: {
      events: items.length,
      logs: items.filter((x: any) => String(x?.kind || '').startsWith('console_')).length,
      aiRequests: reqs.length
    },
    lastError: items.filter((x: any) => x?.level === 'error').slice(-1)[0] || null,
    lastAiError: reqs.filter((x: any) => x?.ok === false).slice(-1)[0] || null
  };
});

const exportFeedback = () => {
  downloadFeedbackPack();
};

const saveFeedbackPackToLocalNow = () => {
  refresh();
  saveFeedbackPackToLocal(buildFeedbackPack());
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

const copyFeedbackSummary = async () => {
  const s = snapshot.value;
  const perf = s?.perf || {};
  const diag = diagState.value;
  const lastErr = (() => {
    const items = Array.isArray(diag?.items) ? diag.items : [];
    const e = items.filter((x: any) => x?.level === 'error').slice(-1)[0];
    if (!e) return '';
    const ts = typeof e.ts === 'number' ? new Date(e.ts).toISOString() : '';
    return `${ts} ${e.kind || 'error'} ${e.message || ''}`.trim();
  })();
  const summary = [
    `route=${s?.route || ''}`,
    `agentType=${s?.agent?.type || ''}`,
    `fps=${typeof perf?.fps === 'number' ? perf.fps.toFixed(1) : ''}`,
    `avgFrameMs=${typeof perf?.avgFrameMs === 'number' ? perf.avgFrameMs.toFixed(2) : ''}`,
    `aiTransport=${aiState.value?.transport || ''}`,
    lastErr ? `lastError=${lastErr}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  await copyText(summary);
};

const copyFeedbackPackJson = async () => {
  refresh();
  const payload = buildFeedbackPack();
  await copyText(pretty(payload));
};

let timer: number | null = null;
const restartTimer = () => {
  if (timer) window.clearInterval(timer);
  timer = null;
  if (!autoRefreshEnabled.value) return;
  const ms = Math.max(120, Math.min(60000, Number(refreshIntervalMs.value) || 800));
  timer = window.setInterval(() => {
    refresh();
  }, ms);
};
onMounted(() => {
  loadAutoTestState();
  loadFeedbackPackHistory();
  loadLoadTestState();
  refresh();
  restartTimer();
  restartAutoTestTimer();
  restartLoadTestTimer();
  startLoadTestKickoffLoop();
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
  timer = null;
  if (autoTestTimer) window.clearInterval(autoTestTimer);
  autoTestTimer = null;
  if (loadTestTimer) window.clearInterval(loadTestTimer);
  loadTestTimer = null;
  if (loadTestKickoffTimer) window.clearInterval(loadTestKickoffTimer);
  loadTestKickoffTimer = null;
});

watch([autoRefreshEnabled, refreshIntervalMs], () => {
  restartTimer();
});

watch(
  [
    autoTestEnabled,
    autoTestIntervalMs,
    autoTestMaxRecords,
    autoTestCheckSnapshot,
    autoTestCheckDiagnostics,
    autoTestCheckHealth,
    autoTestCheckUsage,
    autoTestCheckChat,
    autoTestChatMessage,
    autoTestChatGroup
  ],
  () => {
    restartAutoTestTimer();
    persistAutoTestState();
  }
);

watch(
  [
    loadTestEnabled,
    loadTestIntervalMs,
    loadTestBurstCount,
    loadTestMaxInflight,
    loadTestGroup,
    loadTestMode
  ],
  () => {
    restartLoadTestTimer();
    persistLoadTestState();
  }
);

watch(loadTestMessagesRaw, () => {
  persistLoadTestState();
});
</script>

<style scoped>
.agent-debug-page {
  min-height: 100vh;
  background: #0b1220;
  color: #e2e8f0;
  padding: 18px;
}

.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.title h1 {
  margin: 0;
  font-size: 22px;
  letter-spacing: 0.3px;
}

.sub {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.7);
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.panel {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  padding: 12px;
}

.wide {
  grid-column: 1 / -1;
}

.panel-title {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 10px;
  color: rgba(226, 232, 240, 0.95);
}

.panel-sub {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 8px;
  color: rgba(226, 232, 240, 0.85);
}

.kv {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.15);
}

.kv:last-child {
  border-bottom: none;
}

.k {
  color: rgba(226, 232, 240, 0.68);
  font-size: 12px;
}

.v {
  font-size: 12px;
  word-break: break-all;
}

.v.ok {
  color: rgba(34, 197, 94, 0.9);
}

.v.bad {
  color: rgba(248, 113, 113, 0.9);
}

.form-row {
  display: grid;
  grid-template-columns: 140px 1fr 72px;
  gap: 8px;
  align-items: center;
  margin: 8px 0;
}

.label {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.75);
}

.input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(2, 6, 23, 0.55);
  color: #e2e8f0;
  padding: 8px 10px;
  outline: none;
}

.input-sm {
  padding: 6px 8px;
  font-size: 11px;
}

.btn {
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.85);
  color: #e2e8f0;
  padding: 8px 10px;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  font-size: 12px;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn.danger {
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.12);
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.col {
  min-width: 0;
}

.pre {
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(2, 6, 23, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  padding: 10px;
  font-size: 11px;
  line-height: 1.35;
  max-height: 420px;
  overflow: auto;
}

.textarea {
  width: 100%;
  min-height: 140px;
  resize: vertical;
}

.pinned-agent {
  position: fixed;
  right: 10px;
  bottom: 10px;
  z-index: 9999;
}

@media (max-width: 920px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
