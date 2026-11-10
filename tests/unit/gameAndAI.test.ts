import { describe, expect, it } from 'vitest';
import { WORD_DICTIONARY, ALL_CATEGORIES } from '../../src/shared/words';
import {
  calculateMaxGuesses,
  DEFAULT_ROOM_RULES,
  evaluateCardGuess,
  generateGameBoard,
  sanitizeBoardForViewer,
  validateClue,
} from '../../src/shared/rulesEngine';
import {
  generateLocalOperativeDecision,
  generateLocalSpymasterClue,
} from '../../src/shared/semanticEngine';
import {
  requestAIOperativeDecision,
  requestAISpymasterClue,
} from '../../src/server/aiProvider';
import { RoomManager } from '../../src/server/roomManager';

describe('一、800+ 繁體中文詞庫與分類結構測試', () => {
  it('至少包含 800 個不重複的原創繁體中文代號並涵蓋 17 大分類', () => {
    expect(WORD_DICTIONARY.length).toBeGreaterThanOrEqual(800);
    const uniqueSet = new Set(WORD_DICTIONARY.map((w) => w.word));
    expect(uniqueSet.size).toBe(WORD_DICTIONARY.length);

    for (const cat of ALL_CATEGORIES) {
      const countInCat = WORD_DICTIONARY.filter((w) => w.category === cat).length;
      expect(countInCat).toBeGreaterThanOrEqual(30);
    }
  });
});

describe('二、遊戲核心規則測試 (1-12)', () => {
  it('1-6. 每次必定產生 25 張不重複代號，先攻 9 張、後攻 8 張、路人 7 張、殺手 1 張', () => {
    for (let i = 0; i < 10; i++) {
      const gen = generateGameBoard();
      expect(gen.board.length).toBe(25);

      const words = new Set(gen.board.map((c) => c.word));
      expect(words.size).toBe(25);

      const startCount = gen.board.filter((c) => c.type === gen.startingTeam).length;
      const otherTeam = gen.startingTeam === 'red' ? 'blue' : 'red';
      const secondCount = gen.board.filter((c) => c.type === otherTeam).length;
      const bystanderCount = gen.board.filter((c) => c.type === 'bystander').length;
      const assassinCount = gen.board.filter((c) => c.type === 'assassin').length;

      expect(startCount).toBe(9);
      expect(secondCount).toBe(8);
      expect(bystanderCount).toBe(7);
      expect(assassinCount).toBe(1);
    }
  });

  it('7 & 10. 正確猜測可以繼續，且猜滿線索數量 N 後可再多猜 1 張 (上限 N+1)', () => {
    const gen = generateGameBoard('red');
    const maxGuesses = calculateMaxGuesses(2);
    expect(maxGuesses).toBe(3); // N + 1 = 3

    const redIndices = gen.board
      .filter((c) => c.type === 'red')
      .map((c) => c.index);

    // 1st correct guess -> can continue
    const res1 = evaluateCardGuess(gen.board, redIndices[0], 'red', 1, 0, maxGuesses);
    expect(res1.outcome).toBe('correct');
    expect(res1.canContinueGuessing).toBe(true);
    expect(res1.turnEnded).toBe(false);

    // 2nd correct guess (matches clue count 2) -> can still make +1 bonus guess!
    const res2 = evaluateCardGuess(gen.board, redIndices[1], 'red', 1, 1, maxGuesses);
    expect(res2.outcome).toBe('correct');
    expect(res2.canContinueGuessing).toBe(true);
    expect(res2.turnEnded).toBe(false);

    // 3rd correct guess (reaches N + 1 = 3 limit) -> turn automatically ends
    const res3 = evaluateCardGuess(gen.board, redIndices[2], 'red', 1, 2, maxGuesses);
    expect(res3.outcome).toBe('correct');
    expect(res3.canContinueGuessing).toBe(false);
    expect(res3.turnEnded).toBe(true);
  });

  it('8. 錯誤猜測（路人或敵方特務）會立即結束回合', () => {
    const gen = generateGameBoard('red');
    const bystanderIdx = gen.board.find((c) => c.type === 'bystander')!.index;
    const blueIdx = gen.board.find((c) => c.type === 'blue')!.index;

    const bRes = evaluateCardGuess(gen.board, bystanderIdx, 'red', 1, 0, 3);
    expect(bRes.outcome).toBe('bystander');
    expect(bRes.turnEnded).toBe(true);
    expect(bRes.canContinueGuessing).toBe(false);

    const eRes = evaluateCardGuess(gen.board, blueIdx, 'red', 2, 0, 3);
    expect(eRes.outcome).toBe('enemy');
    expect(eRes.turnEnded).toBe(true);
    expect(eRes.canContinueGuessing).toBe(false);
  });

  it('9. 猜中殺手會立即落敗並由對方獲勝', () => {
    const gen = generateGameBoard('red');
    const assassinIdx = gen.board.find((c) => c.type === 'assassin')!.index;

    const aRes = evaluateCardGuess(gen.board, assassinIdx, 'red', 1, 0, 3);
    expect(aRes.outcome).toBe('assassin');
    expect(aRes.gameEnded).toBe(true);
    expect(aRes.winnerTeam).toBe('blue');
    expect(aRes.winReason).toBe('assassin_revealed');
  });

  it('11 & 12. 最後一名特務被找出（包含被對手誤翻）時立即判定勝負，且支援主動結束回合', () => {
    const rm = new RoomManager({ persistToDb: false, stepDelayMultiplier: 0 });
    const room = rm.createRoom({
      hostId: 'p1',
      hostName: 'Host',
      mode: 'multiplayer',
      hostTeam: 'red',
      hostRole: 'spymaster',
    });
    rm.joinRoom({ roomCode: room.roomCode, playerId: 'p2', playerName: 'RedOp' });
    rm.updateSeat({
      roomCode: room.roomCode,
      requesterId: 'p1',
      targetPlayerId: 'p2',
      team: 'red',
      role: 'operative',
    });
    rm.joinRoom({ roomCode: room.roomCode, playerId: 'p3', playerName: 'BlueSpy' });
    rm.updateSeat({
      roomCode: room.roomCode,
      requesterId: 'p1',
      targetPlayerId: 'p3',
      team: 'blue',
      role: 'spymaster',
    });
    rm.joinRoom({ roomCode: room.roomCode, playerId: 'p4', playerName: 'BlueOp' });
    rm.updateSeat({
      roomCode: room.roomCode,
      requesterId: 'p1',
      targetPlayerId: 'p4',
      team: 'blue',
      role: 'operative',
    });

    rm.startGame(room.roomCode, 'p1', 'red');

    // Submit legal clue
    const aiClue = generateLocalSpymasterClue(
      room.board,
      'red',
      'normal',
      'analytical',
      room.rules
    );
    rm.submitClue({
      roomCode: room.roomCode,
      playerId: 'p1',
      word: aiClue.word,
      count: 2,
    });

    // Voluntarily end turn -> switches to Blue team
    rm.endTurn({ roomCode: room.roomCode, playerId: 'p2' });
    expect(room.currentTurnTeam).toBe('blue');

    // Reveal 8 of Red's 9 agents first, then have Blue accidentally flip Red's 9th agent!
    const redCards = room.board.filter((c) => c.type === 'red');
    for (let i = 0; i < 8; i++) {
      redCards[i].revealed = true;
    }
    const lastRedCard = redCards[8];

    const blueClue = generateLocalSpymasterClue(
      room.board,
      'blue',
      'normal',
      'analytical',
      room.rules
    );
    rm.submitClue({
      roomCode: room.roomCode,
      playerId: 'p3',
      word: blueClue.word,
      count: 1,
    });

    // Blue operative accidentally flips Red's last unrevealed agent -> Red wins immediately!
    rm.makeGuess({
      roomCode: room.roomCode,
      playerId: 'p4',
      cardIndex: lastRedCard.index,
    });

    expect(room.status).toBe('finished');
    expect(room.winnerTeam).toBe('red');
    expect(room.winReason).toBe('opponent_revealed_last_agent');
  });

  it('線索合法性檢查器能阻擋桌面代號與同字變形，並放行合理語意線索', () => {
    const gen = generateGameBoard('red');
    const firstWord = gen.board[0].word;

    // Exact match forbidden
    const exactCheck = validateClue(firstWord, 1, gen.board, DEFAULT_ROOM_RULES);
    expect(exactCheck.valid).toBe(false);

    // Character overlap forbidden in standard mode
    const charOverlap = validateClue(
      `${firstWord[0]}系`,
      1,
      gen.board,
      DEFAULT_ROOM_RULES
    );
    expect(charOverlap.valid).toBe(false);

    // Positional meta clue forbidden
    const metaCheck = validateClue('第一排', 2, gen.board, DEFAULT_ROOM_RULES);
    expect(metaCheck.valid).toBe(false);
  });
});

describe('三、AI 系統與資訊隔離測試 (1-7)', () => {
  it('1 & 2. AI 領袖能產生有效合法線索，且絕不使用桌面代號當線索', () => {
    for (let i = 0; i < 5; i++) {
      const gen = generateGameBoard('red');
      const clue = generateLocalSpymasterClue(
        gen.board,
        'red',
        'hard',
        'analytical',
        DEFAULT_ROOM_RULES
      );
      expect(clue.word.length).toBeGreaterThan(0);
      const v = validateClue(clue.word, clue.count, gen.board, DEFAULT_ROOM_RULES);
      expect(v.valid).toBe(true);
    }
  });

  it('3. AI 隊員嚴格遵守資訊隔離，若傳入未過濾的秘密卡片將立即拋出安全例外', async () => {
    const gen = generateGameBoard('red');
    const sanitized = sanitizeBoardForViewer(gen.board, false, false);

    // Verify sanitized board has no `type` on unrevealed cards
    expect(sanitized.every((c) => c.type === undefined)).toBe(true);

    const decision = await requestAIOperativeDecision({
      publicBoard: sanitized,
      currentClue: {
        id: 'c1',
        turnNumber: 1,
        team: 'red',
        word: '海洋',
        count: 2,
        spymasterName: 'Spy',
        isAI: true,
        timestamp: Date.now(),
      },
      guessesMadeThisTurn: 0,
      maxGuessesThisTurn: 3,
      difficulty: 'normal',
      personality: 'analytical',
      teamClueHistory: [],
      forceFallback: true,
    });
    expect(decision.action).toBe('guess');
    expect(decision.cardIndex).toBeDefined();

    // Now test passing unsanitized board -> must throw SECURITY_VIOLATION
    await expect(
      requestAIOperativeDecision({
        publicBoard: gen.board as any,
        currentClue: {
          id: 'c1',
          turnNumber: 1,
          team: 'red',
          word: '海洋',
          count: 2,
          spymasterName: 'Spy',
          isAI: true,
          timestamp: Date.now(),
        },
        guessesMadeThisTurn: 0,
        maxGuessesThisTurn: 3,
        difficulty: 'normal',
        personality: 'analytical',
        teamClueHistory: [],
      })
    ).rejects.toThrow(/SECURITY_VIOLATION/);
  });

  it('4 & 5. 不同難度與個性決策具有差異，且 LLM 失敗或未設定時自動無縫退回本機 AI', async () => {
    const gen = generateGameBoard('red');
    const easyCautious = generateLocalSpymasterClue(
      gen.board,
      'red',
      'easy',
      'cautious',
      DEFAULT_ROOM_RULES
    );
    const hardRisky = generateLocalSpymasterClue(
      gen.board,
      'red',
      'hard',
      'risky',
      DEFAULT_ROOM_RULES
    );

    expect(easyCautious.publicReasoning).toContain('簡單');
    expect(hardRisky.publicReasoning).toContain('困難');

    // Test fallback when Gemini key is invalid/absent
    const res = await requestAISpymasterClue({
      board: gen.board,
      team: 'red',
      difficulty: 'normal',
      personality: 'associative',
      rules: DEFAULT_ROOM_RULES,
      usedClueWords: [],
      forceFallback: true,
    });
    expect(res.provider).toBe('local');
    expect(res.word.length).toBeGreaterThan(0);
  });

  it('6 & 7. 全 AI 對戰能不卡死並完整完成整場遊戲分出勝負', () => {
    const gen = generateGameBoard('red');
    let currentTeam = gen.startingTeam;
    let turnNumber = 1;
    let gameEnded = false;
    let winner: string | null = null;
    const usedClues: string[] = [];

    while (!gameEnded && turnNumber <= 40) {
      const spymasterDecision = generateLocalSpymasterClue(
        gen.board,
        currentTeam,
        'normal',
        'analytical',
        DEFAULT_ROOM_RULES,
        usedClues
      );
      usedClues.push(spymasterDecision.word);

      const clueObj = {
        id: `clue-${turnNumber}`,
        turnNumber,
        team: currentTeam,
        word: spymasterDecision.word,
        count: spymasterDecision.count,
        spymasterName: 'AI Spy',
        isAI: true,
        timestamp: Date.now(),
      };

      const maxGuesses = calculateMaxGuesses(clueObj.count);
      let guessesMade = 0;
      let turnEnded = false;

      while (!turnEnded && !gameEnded) {
        const publicBoard = sanitizeBoardForViewer(gen.board, false, false);
        const opDecision = generateLocalOperativeDecision(
          publicBoard,
          clueObj,
          guessesMade,
          maxGuesses,
          'normal',
          'analytical',
          [clueObj]
        );

        if (opDecision.action === 'end_turn' && guessesMade > 0) {
          turnEnded = true;
          break;
        }

        const evalRes = evaluateCardGuess(
          gen.board,
          opDecision.cardIndex!,
          currentTeam,
          turnNumber,
          guessesMade,
          maxGuesses
        );
        guessesMade++;

        if (evalRes.gameEnded) {
          gameEnded = true;
          winner = evalRes.winnerTeam;
        } else if (evalRes.turnEnded) {
          turnEnded = true;
        }
      }

      currentTeam = currentTeam === 'red' ? 'blue' : 'red';
      turnNumber++;
    }

    expect(gameEnded).toBe(true);
    expect(winner === 'red' || winner === 'blue').toBe(true);
  });
});

describe('四、多人房間、權限安全與斷線重連測試 (1-10)', () => {
  it('支援建立房間、加入、AI 補位、斷線重連恢復身份、嚴格權限隔離與跨房間互不干擾', () => {
    const rm = new RoomManager({ persistToDb: false, stepDelayMultiplier: 0 });

    // 1. 建立兩個不同房間測試隔離
    const roomA = rm.createRoom({
      hostId: 'host-a',
      hostName: '隊長A',
      mode: 'multiplayer',
      hostTeam: 'red',
      hostRole: 'spymaster',
    });
    const roomB = rm.createRoom({
      hostId: 'host-b',
      hostName: '隊長B',
      mode: 'multiplayer',
      hostTeam: 'blue',
      hostRole: 'spymaster',
    });
    expect(roomA.roomCode).not.toBe(roomB.roomCode);

    // 2. 加入房間與 AI 自動補位開局
    rm.joinRoom({
      roomCode: roomA.roomCode,
      playerId: 'op-a',
      playerName: '隊員A',
    });
    rm.updateSeat({
      roomCode: roomA.roomCode,
      requesterId: 'host-a',
      targetPlayerId: 'op-a',
      team: 'red',
      role: 'operative',
    });

    rm.startGame(roomA.roomCode, 'host-a', 'red');

    // AI 自動補齊藍隊領袖與藍隊隊員
    expect(roomA.players.some((p) => p.team === 'blue' && p.role === 'spymaster' && p.isAI)).toBe(true);
    expect(roomA.players.some((p) => p.team === 'blue' && p.role === 'operative' && p.isAI)).toBe(true);

    // 3. 秘密資料權限：領袖收到完整 type，隊員收到的未翻開卡片 type 為 undefined
    const spyView = rm.sanitizeRoomForViewer(roomA, 'host-a');
    const opView = rm.sanitizeRoomForViewer(roomA, 'op-a');

    expect(spyView.viewerIsSpymaster).toBe(true);
    expect(spyView.board.every((c) => c.type !== undefined)).toBe(true);

    expect(opView.viewerIsSpymaster).toBe(false);
    expect(opView.board.every((c) => c.type === undefined)).toBe(true);

    // 4. 防止越權操作：隊員不可提交線索
    expect(() =>
      rm.submitClue({
        roomCode: roomA.roomCode,
        playerId: 'op-a',
        word: '測試',
        count: 1,
      })
    ).toThrow(/只有間諜領袖/);

    // 5. 斷線與重新連線後恢復原本角色與陣營
    rm.markPlayerDisconnected(roomA.roomCode, 'op-a');
    expect(roomA.players.find((p) => p.id === 'op-a')?.isConnected).toBe(false);

    rm.joinRoom({
      roomCode: roomA.roomCode,
      playerId: 'op-a',
      playerName: '隊員A',
    });
    const reconnected = roomA.players.find((p) => p.id === 'op-a')!;
    expect(reconnected.isConnected).toBe(true);
    expect(reconnected.team).toBe('red');
    expect(reconnected.role).toBe('operative');
  });
});
