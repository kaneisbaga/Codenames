# 機密代碼：暗線任務 | CODENAMES: DARKLINE PROTOCOL

一款忠於《Codenames（機密代碼／機密代號）》核心規則、以 **Elegant Spy Agency（現代情報中心）** 為美學主軸打造的完整全端網頁桌遊。內建高質感生成式 AI 特務檔案美術、伺服器唯一權威狀態驗證、即時多人連線，以及「Gemini 結構化輸出 + 本機 860+ 繁中代號語意圖譜」雙軌智慧 AI 系統。

---

## 一、GitHub 與 GitHub Pages 上傳指南

本資料夾 (`codenames`) 已完成**靜態網頁預先打包**與**完整全端原始碼**雙重整理，並已排除 `node_modules`、`.env` 私密金鑰與 SQLite 暫存檔，可直接上傳至 GitHub：

1. **直接作為 GitHub Pages 靜態網頁遊玩（免架設後端伺服器）**：
   - 可直接將 `codenames` 資料夾放進您的 GitHub Pages 倉庫（例如 `https://<您的帳號>.github.io/codenames/`），或將本資料夾內容推送到獨立的 GitHub Repository 並在 **Settings → Pages** 選擇由分支根目錄 (`/` root) 或 **GitHub Actions** 部署。
   - 在 GitHub Pages 靜態環境下，網頁會自動切換為「**瀏覽器內建語意圖譜與房間引擎 (`localRoomEngine`)**」，無須後端伺服器即可直接遊玩單人 AI 對戰、跨分頁多人大廳、5 大練習模式與本地歷史戰績。
2. **完整全端 Node.js 伺服器啟動（本機或雲端主機）**：

### 1. Windows 一鍵啟動（推薦）
直接雙擊專案根目錄下的 **`START.bat`**：
- 自動偵測本機 Node.js 環境
- 若尚未建立 `.env`，自動由 `.env.example` 複製預設環境設定
- 若首次執行尚未安裝套件，自動執行 `npm install`
- 自動啟動全端伺服器並開啟瀏覽器前往 `http://localhost:3000`

### 2. 標準指令啟動
```bash
# 1. 安裝相依套件
npm install

# 2. 啟動開發模式（同時啟動 Express + Socket.IO + SQLite + Vite 前端）
npm run dev

# 3. 正式環境建置（前端打包至 dist/client + TypeScript 嚴格型別驗證）
npm run build

# 4. 啟動正式環境伺服器
npm start

# 5. 執行自動化單元與整合測試（規則、860+詞庫、AI推理、多人資訊隔離）
npm run test

# 6. 執行 Playwright 瀏覽器端對端 (E2E) 測試
npm run test:e2e
```

---

## 二、專案架構與目錄說明

```text
機密代號/
├── public/
│   └── assets/
│       └── art/                     # 生成式 AI 專屬高質感美術資產
│           ├── agency-crest.png     # 情報總部幾何金箔徽章
│           ├── bg-command-center.png# 指揮中心戰術桌面深色材質
│           ├── card-red-agent.png   # 紅方特務機密檔案插畫
│           ├── card-blue-agent.png  # 藍方特務機密檔案插畫
│           ├── card-bystander.png   # 中立路人檔案插畫
│           └── card-assassin.png    # 黑名單終局殺手插畫
├── src/
│   ├── shared/                      # 前後端共用核心邏輯與型別
│   │   ├── types.ts                 # 完整領域模型、Socket 狀態與權限介面
│   │   ├── words.ts                 # 862 個不重複原創繁體中文代號與 17 大分類詞庫
│   │   ├── rulesEngine.ts           # 5×5 牌局產生、線索合法性檢查、N+1 猜測與勝負狀態機
│   │   └── semanticEngine.ts        # 本機多層語意知識圖譜、漢字語素關聯與 AI 領袖/隊員決策引擎
│   ├── server/                      # Node.js + Express + Socket.IO + SQLite 權威後端
│   │   ├── index.ts                 # 伺服器入口、REST API、Socket.IO 事件與每個連線獨立權限過濾
│   │   ├── roomManager.ts           # 房間生命週期、AI 自動補位、混合組隊、斷線重連與過期清理
│   │   ├── aiProvider.ts            # Gemini API 結構化輸出整合 + 自動退回本機智慧 AI 備援機制
│   │   └── db.ts                    # SQLite 持久化（玩家設定、歷史戰績、房間狀態快照與恢復）
│   └── client/                      # React 19 + TypeScript + Tailwind CSS + Framer Motion 前端
│       ├── main.tsx                 # 前端入口
│       ├── App.tsx                  # 路由狀態、Socket.IO 即時同步與邀請網址解析 (?room=XXXXXX)
│       ├── index.css                # 現代情報中心深色主題與捲軸樣式
│       ├── utils/
│       │   ├── sound.ts             # Web Audio API 戰術合成音效引擎（零外部音檔依賴）
│       │   └── session.ts           # 特務識別碼與本地/伺服器設定同步
│       └── components/
│           ├── HomeScreen.tsx       # 極簡情報中心首頁與收納式次要入口
│           ├── BoardGrid.tsx        # 5×5 響應式代號卡陣列、3D 翻牌與生成式 AI 卡面展示
│           ├── GameScreen.tsx       # 遊戲主畫面、領袖指令台、隊員控制台、AI 推理摘要與即時聊天
│           ├── SinglePlayerSetup.tsx# 單人 AI 對戰配置（選任領袖/隊員、紅藍陣營、3 難度、5 個性）
│           ├── MultiplayerLobby.tsx # 多人房間大廳、代碼複製、邀請網址、人機混合編組與公開房間列表
│           ├── PracticeMode.tsx     # 五大練習模式（新手、線索、猜測、AI 領袖教學、AI 隊員教學）
│           └── Modals.tsx           # 收納式彈窗（規則、操作說明、設定、歷史戰績、關於）
├── tests/
│   ├── unit/
│   │   └── gameAndAI.test.ts        # Vitest 單元與整合測試（涵蓋規則、AI、詞庫、多人權限）
│   └── e2e/
│       └── app.spec.ts              # Playwright E2E 端對端瀏覽器測試（桌面與手機 5×5 驗證）
├── .env.example                     # 環境變數範本
├── START.bat                        # Windows 一鍵啟動腳本
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## 三、外部 API 金鑰與本機智慧 AI 說明

### 1. 需要外部 API 金鑰的功能（選填）
- **`GEMINI_API_KEY`**：設定於伺服器端 `.env` 後，`src/server/aiProvider.ts` 會優先使用 Google Gemini 模型（預設 `GEMINI_MODEL=gemini-2.5-flash`）進行結構化 JSON 線索生成與隊員猜測推理。
- **安全保證**：API 金鑰僅存在於 Node.js 伺服器環境變數中，絕不傳送至前端瀏覽器；且傳送給 AI 隊員的提示詞經過伺服器端 `sanitizeBoardForViewer` 嚴格過濾，未翻開卡片的秘密陣營絕不外洩。

### 2. 未設定外部 API 金鑰時的運作方式（預設全功能可用）
- 若未設定 `GEMINI_API_KEY`，或外部 API 發生網路超時／配額限制，系統會**自動且無縫使用內建的「本機語意圖譜智慧 AI 引擎」(`src/shared/semanticEngine.ts`)**。
- 本機 AI 結合 862 個繁體中文代號的 17 大分類、跨領域概念同義詞庫 (`CONCEPT_THESAURUS`)、漢字語素語意場、殺手風險懲罰權重、3 種難度（簡單／普通／困難）與 5 種決策個性（穩健型／冒險型／聯想型／分析型／直覺型），無須連網即可完整進行單人與多人 AI 遊戲。

---

## 四、多人公開連線與部署條件說明

1. **同一區域網路（LAN）多人連線**：
   - 啟動伺服器時，終端機會顯示區網 IP 網址（例如 `http://192.168.1.x:3000`）。
   - 確認 Windows 防火牆允許 Node.js 或連接埠 `3000` 連入，同一 Wi-Fi / 區網下的其他電腦或手機即可直接開啟該網址或點擊邀請連結加入同一房間。
2. **網際網路（Public Internet）公開連線部署**：
   - 可部署於支援 Node.js 常駐程序的雲端平台（如 Render、Railway、Fly.io、VPS 或 Docker 容器）。
   - **必要條件**：
     - 反向代理（如 Nginx / Cloudflare）必須開啟 **WebSocket Upgrade (`Upgrade: websocket`, `Connection: upgrade`)** 以支援 Socket.IO 雙向即時通訊。
     - 建議使用單一實例（或搭配 Redis Adapter）並掛載持久化磁碟目錄至 `./data`，以保留 SQLite 資料庫 (`darkline.sqlite`) 的房間狀態與歷史戰績。
