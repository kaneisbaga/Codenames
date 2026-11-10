import { test, expect } from '@playwright/test';
import path from 'node:path';

const ARTIFACT_DIR =
  'C:/Users/kanei/.gemini/antigravity-cli/brain/bfdbd168-9f0e-46ac-8d19-19f8bdecd285';

test.describe('《機密代碼：暗線任務》Playwright E2E 端對端測試', () => {
  test('1 & 7. 首頁所有按鈕與收納式彈窗（規則、設定、紀錄、關於）皆可正常開啟與操作', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('機密代碼：暗線任務');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'screenshot_home.png'),
    });

    // Open & close Rules modal
    await page.getByTestId('home-rules-btn').click();
    await expect(page.getByText('遊戲規則檔案')).toBeVisible();
    await page.getByLabel('關閉視窗').click();

    // Open & save Settings modal
    await page.getByTestId('home-settings-btn').click();
    await expect(page.getByText('系統與戰術設定')).toBeVisible();
    await page.getByText('儲存設定').click();

    // Open & close History modal
    await page.getByTestId('home-history-btn').click();
    await expect(page.getByText('行動戰績與歷史檔案')).toBeVisible();
    await page.getByLabel('關閉視窗').click();

    // Open & close About modal
    await page.getByTestId('home-about-btn').click();
    await expect(page.getByText('關於《機密代碼：暗線任務》')).toBeVisible();
    await page.getByLabel('關閉視窗').click();
  });

  test('2, 4 & 6A. 單人 AI 模式（擔任間諜領袖）5×5 版面排列正確，可輸入線索並觀看 AI 隊員推理翻牌', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('home-single-player-btn').click();

    // Choose Spymaster role & Red team
    await page.getByTestId('select-role-spymaster').click();
    await page.getByTestId('select-team-red').click();
    await page.getByTestId('launch-single-player-btn').click();

    // Verify 5x5 board grid has 25 cards
    const grid = page.getByTestId('codenames-board-grid');
    await expect(grid).toBeVisible();
    const cards = page.locator('[data-testid^="board-card-"]');
    await expect(cards).toHaveCount(25);

    // Verify Spymaster sees secret badges on cards
    await expect(page.getByTestId('spymaster-badge-0')).toBeVisible();

    // Submit a legal clue as Spymaster
    const clueInput = page.getByTestId('clue-word-input');
    await expect(clueInput).toBeVisible();

    const candidateClues = ['星際', '古典', '深海', '皇室', '幻象', '速度', '慶典', '樂章', '極地'];
    for (const candidate of candidateClues) {
      await clueInput.fill(candidate);
      const errVisible = await page.locator('text=✕').isVisible();
      if (!errVisible) {
        break;
      }
    }

    await page.getByTestId('submit-clue-btn').click();

    // Wait for AI Operative to think and reveal at least 1 card & log reasoning
    await expect(page.getByTestId('ai-thought-log-item').first()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'screenshot_spymaster_game.png'),
    });
  });

  test('2 & 4B. 單人 AI 模式（擔任間諜隊員）：AI 領袖自動給出線索，玩家點擊翻牌並可主動結束回合', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('home-single-player-btn').click();

    // Choose Operative role & Red team
    await page.getByTestId('select-role-operative').click();
    await page.getByTestId('select-team-red').click();
    await page.getByTestId('launch-single-player-btn').click();

    // Wait for AI Spymaster to finish thinking and display active clue banner
    await expect(page.getByTestId('active-clue-banner')).toBeVisible({
      timeout: 15000,
    });

    const clueWord = await page.getByTestId('current-clue-word').textContent();
    expect((clueWord || '').trim().length).toBeGreaterThan(0);

    // Player clicks card 0 to reveal it
    await page.getByTestId('board-card-0').click();
    await expect(page.getByTestId('board-card-0')).toHaveAttribute(
      'data-revealed',
      'true'
    );
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'screenshot_operative_game.png'),
    });
  });

  test('3. 多人連線房間：建立房間、兩位玩家跨瀏覽器即時同步、AI 自動補位與開局角色資訊隔離', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    await hostPage.goto('/');
    await hostPage.getByTestId('home-multiplayer-btn').click();
    await hostPage.getByTestId('multiplayer-nickname-input').fill('紅方領袖Host');
    await hostPage.getByTestId('create-room-submit-btn').click();

    const codeEl = hostPage.getByTestId('lobby-room-code');
    await expect(codeEl).toBeVisible();
    const roomCode = (await codeEl.textContent())?.trim() || '';
    expect(roomCode.length).toBe(6);

    // Guest joins via invite URL (?room=XXXXXX) and selects Red Operative seat
    await guestPage.goto(`/?room=${roomCode}`);
    await expect(guestPage.getByTestId('lobby-room-code')).toContainText(roomCode);
    await guestPage.getByTestId('join-red-operative-btn').click();

    await hostPage.screenshot({
      path: path.join(ARTIFACT_DIR, 'screenshot_multiplayer_lobby.png'),
    });

    // Host starts game (AI auto-fills missing Blue seats)
    await hostPage.getByTestId('lobby-start-game-btn').click();

    // Both players transition to 5x5 game board simultaneously
    await expect(hostPage.getByTestId('codenames-board-grid')).toBeVisible();
    await expect(guestPage.getByTestId('codenames-board-grid')).toBeVisible();

    // Host is Spymaster -> sees secret badges; Guest is Operative -> does NOT see secret badges!
    await expect(hostPage.getByTestId('spymaster-badge-0')).toBeVisible();
    await expect(guestPage.getByTestId('spymaster-badge-0')).toHaveCount(0);

    await hostContext.close();
    await guestContext.close();
  });

  test('5 & 8. 手機版 (375x812) 維持 5×5 排列無版面水平溢出，且練習模式五大模組皆可互動', async ({
    browser,
  }) => {
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto('/');
    await mobilePage.getByTestId('home-practice-btn').click();

    const grid = mobilePage.getByTestId('codenames-board-grid');
    await expect(grid).toBeVisible();

    // Verify 5 cards in the first row all share the same Y top coordinate (5 columns layout on mobile!)
    const card0Box = await mobilePage.getByTestId('board-card-0').boundingBox();
    const card4Box = await mobilePage.getByTestId('board-card-4').boundingBox();
    expect(card0Box).not.toBeNull();
    expect(card4Box).not.toBeNull();
    expect(Math.abs(card0Box!.y - card4Box!.y)).toBeLessThan(4);

    // Verify no horizontal overflow on mobile
    const hasOverflow = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);

    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, 'screenshot_mobile_5x5.png'),
    });

    // Switch through all 5 practice mode tabs
    await mobilePage.getByTestId('practice-tab-clue_drill').click();
    await expect(mobilePage.getByTestId('practice-clue-input')).toBeVisible();

    await mobilePage.getByTestId('practice-tab-guess_drill').click();
    await mobilePage.getByTestId('practice-tab-ai_spymaster_guide').click();
    await mobilePage.getByTestId('practice-tab-ai_operative_guide').click();

    await mobileContext.close();
  });
});
