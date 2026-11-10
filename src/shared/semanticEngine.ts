import {
  AIDifficulty,
  AIPersonality,
  ClientBoardCard,
  Clue,
  ClueCount,
  RoomRulesConfig,
  ServerBoardCard,
  Team,
} from './types';
import { validateClue } from './rulesEngine';
import { WORD_MAP } from './words';

export interface ConceptDomain {
  id: string;
  label: string;
  clues: string[];
  tags: string[];
  morphemes: string[];
  keywords: string[];
}

/**
 * Rich multi-domain semantic thesaurus bridging human/AI clue words,
 * Chinese character morphemes, and Codenames board vocabulary.
 */
export const CONCEPT_THESAURUS: ConceptDomain[] = [
  {
    id: 'ocean_marine',
    label: '海洋與航海',
    clues: ['海洋', '深海', '航海', '大海', '水產', '水族', '海邊', '浪潮', '船隻', '海軍', '潛水'],
    tags: ['海洋', '水域', '游泳', '水生', '航行', '船隻'],
    morphemes: ['海', '洋', '水', '浪', '潮', '船', '艦', '港', '灣', '潛', '魚', '鯨', '鯊', '島', '泳'],
    keywords: ['珊瑚礁', '海溝', '暗流', '漩渦', '浪花', '鯨魚', '海豚', '鯊魚', '章魚', '水母', '海龜', '企鵝', '郵輪', '潛水艇', '帆船', '航空母艦', '燈塔', '船錨', '指南針', '海盜', '美人魚', '太平洋', '地中海', '夏威夷', '衝浪', '珍珠'],
  },
  {
    id: 'sky_flight_space',
    label: '天空、飛行與宇宙',
    clues: ['太空', '宇宙', '星空', '天文', '航空', '飛行', '高空', '天空', '翱翔', '羽翼', '星際'],
    tags: ['星空', '太空', '宇宙', '飛行', '天空', '鳥類', '羽翼', '高空'],
    morphemes: ['星', '空', '天', '宇', '宙', '飛', '航', '機', '翼', '雲', '月', '日', '陽', '鳥', '鷹', '鴿'],
    keywords: ['銀河', '彗星', '隕石', '黑洞', '星雲', '極光', '日蝕', '月光', '太陽系', '老鷹', '貓頭鷹', '天鵝', '白鴿', '飛機', '直升機', '熱氣球', '滑翔翼', '戰鬥機', '太空船', '火箭', '降落傘', '無人機', '太空人', '飛行員', '空服員', '天文台', '衛星', '望遠鏡'],
  },
  {
    id: 'royalty_palace_empire',
    label: '皇室、宮廷與帝國',
    clues: ['皇室', '宮廷', '王朝', '帝國', '貴族', '君主', '中世紀', '權威', '王國'],
    tags: ['皇家', '宮廷', '貴族', '權力', '歷史', '古典'],
    morphemes: ['王', '皇', '帝', '宮', '殿', '城', '堡', '爵', '冠', '璽', '聖', '廷'],
    keywords: ['國王', '女王', '王子', '公主', '皇帝', '將軍', '騎士', '貴族', '首相', '城堡', '宮殿', '神殿', '凱旋門', '皇冠', '權杖', '徽章', '玉璽', '聖杯', '紅寶石', '鑽石', '絲綢'],
  },
  {
    id: 'espionage_mystery_crime',
    label: '情報、偵探與暗線',
    clues: ['情報', '機密', '間諜', '破案', '懸疑', '推理', '潛伏', '暗夜', '特工', '行動'],
    tags: ['秘密', '機密', '偵探', '犯罪', '暗影', '資訊安全', '情報', '邏輯', '策略'],
    morphemes: ['密', '暗', '諜', '偵', '探', '特', '警', '鎖', '謎', '影', '潛', '駭', '盜', '刺'],
    keywords: ['特務', '間諜', '偵探', '忍者', '刺客', '保鑣', '警察', '檢察官', '駭客', '密室', '地下室', '金庫', '監獄', '密碼', '防火牆', '指紋', '虹膜', '加密', '雷達', '聲納', '鑰匙', '鎖頭', '保險箱', '放大鏡', '墨鏡', '手套', '面具', '披風', '秘密', '真相', '線索', '謎團', '陰謀', '陷阱', '暗號'],
  },
  {
    id: 'cold_winter_polar',
    label: '冰雪、極地與寒冬',
    clues: ['寒冬', '冰雪', '極地', '冬天', '冰冷', '嚴寒', '雪地', '冷凍'],
    tags: ['冰雪', '冬天', '極地', '寒冷'],
    morphemes: ['冰', '雪', '寒', '冬', '凍', '冷', '霜', '極', '雹'],
    keywords: ['冰山', '冰川', '北極熊', '企鵝', '海豹', '雪橇', '破冰船', '南極', '北極', '冰島', '阿爾卑斯', '暴風雪', '冰雹', '寒流', '白霜', '雪花', '冰柱', '冬天', '寒冬', '滑雪', '溜冰', '冰球', '雪板', '冰淇淋', '毛毯', '壁爐'],
  },
  {
    id: 'fire_heat_summer',
    label: '火焰、高溫與盛夏',
    clues: ['火焰', '高溫', '炎熱', '燃燒', '盛夏', '熱帶', '陽光', '點火'],
    tags: ['炎熱', '夏天', '能源', '光線'],
    morphemes: ['火', '熱', '炎', '陽', '夏', '燒', '熔', '岩', '燈', '燭', '漠'],
    keywords: ['火山', '岩漿', '溫泉', '沙漠', '撒哈拉', '赤道', '夏威夷', '太陽系', '太陽能', '消防車', '消防員', '火鍋', '辣椒', '煙火', '燈籠', '天燈', '蠟燭', '火柴', '打火機', '壁爐', '夏天', '熱浪', '乾旱', '紫外線', '熱情'],
  },
  {
    id: 'forest_plants_nature',
    label: '森林、花卉與植物園',
    clues: ['森林', '花園', '植物', '草木', '大自然', '春天', '綠意', '芬芳', '園藝', '盛開'],
    tags: ['植物', '花卉', '樹木', '森林', '花園', '農作', '綠意'],
    morphemes: ['花', '樹', '木', '林', '森', '草', '葉', '根', '芽', '種', '園', '竹', '松', '蘭', '菊', '梅'],
    keywords: ['雨林', '草原', '森林', '玫瑰', '向日葵', '鬱金香', '櫻花', '荷花', '蘭花', '薰衣草', '茉莉', '牡丹', '松樹', '竹子', '楓樹', '榕樹', '銀杏', '神木', '椰子樹', '柳樹', '仙人掌', '藤蔓', '蒲公英', '薄荷', '人參', '茶樹', '年輪', '樹根', '花瓣', '種子', '植物園', '溫室', '園丁', '農夫', '蝴蝶', '蜜蜂', '松鼠'],
  },
  {
    id: 'food_cuisine_sweet',
    label: '美食、甜點與飲品',
    clues: ['美食', '餐廳', '料理', '甜點', '下午茶', '烘焙', '水果', '飲料', '廚房', '小吃', '早餐'],
    tags: ['食物', '水果', '料理', '主食', '甜點', '烘焙', '下午茶', '飲料', '廚房', '餐飲'],
    morphemes: ['食', '飯', '麵', '肉', '餅', '糕', '糖', '茶', '酒', '果', '奶', '廚', '味', '甜', '湯', '豆'],
    keywords: ['蘋果', '香蕉', '草莓', '西瓜', '芒果', '鳳梨', '葡萄', '水蜜桃', '檸檬', '櫻桃', '牛排', '壽司', '披薩', '拉麵', '漢堡', '火鍋', '水餃', '炒飯', '咖哩', '義大利麵', '巧克力', '蛋糕', '冰淇淋', '甜甜圈', '馬卡龍', '布丁', '鬆餅', '可頌', '咖啡', '珍珠奶茶', '紅酒', '香檳', '威士忌', '啤酒', '綠茶', '起司', '奶油', '蜂蜜', '吐司', '雞蛋', '廚師', '甜點師', '調酒師', '咖啡師', '咖啡廳'],
  },
  {
    id: 'medicine_hospital_science',
    label: '醫療、生命與科學實驗',
    clues: ['醫院', '醫療', '救護', '診所', '醫學', '健康', '實驗室', '生物', '科學'],
    tags: ['醫療', '科學', '研究'],
    morphemes: ['醫', '護', '藥', '病', '院', '生', '命', '基', '因', '驗', '科'],
    keywords: ['救護車', '醫生', '護士', '藥師', '獸醫', '心理師', '科學家', '醫院', '實驗室', '顯微鏡', '基因', '病毒', '人參', '靈芝', '溫度'],
  },
  {
    id: 'music_stage_art',
    label: '音樂、劇場與表演藝術',
    clues: ['音樂', '樂器', '演奏', '交響樂', '樂團', '演唱會', '舞台', '劇場', '電影', '表演', '藝術'],
    tags: ['音樂', '樂器', '交響', '演奏', '舞台', '影視', '劇場', '表演', '藝術'],
    morphemes: ['音', '樂', '琴', '鼓', '笛', '歌', '曲', '譜', '奏', '唱', '劇', '演', '舞', '影'],
    keywords: ['鋼琴', '小提琴', '大提琴', '吉他', '貝斯', '豎琴', '長笛', '薩克斯風', '小號', '爵士鼓', '古箏', '琵琶', '二胡', '樂譜', '音符', '節奏', '旋律', '和弦', '交響曲', '搖滾', '爵士', '唱片', '黑膠', '錄音室', '節拍器', '指揮棒', '喇叭', '留聲機', '音樂盒', '耳機', '麥克風', '歌劇院', '電影院', '導演', '演員', '歌手', '指揮家', '電影', '舞台劇', '音樂劇', '演唱會'],
  },
  {
    id: 'sports_olympics_games',
    label: '運動競技與奧運賽場',
    clues: ['運動', '比賽', '奧運', '球類', '球場', '競技', '冠軍', '體育', '體能', '決賽'],
    tags: ['運動', '球類', '競技', '田徑', '奧運', '格鬥', '賽場'],
    morphemes: ['球', '賽', '跑', '跳', '泳', '拳', '劍', '射', '冠', '獎', '體'],
    keywords: ['籃球', '足球', '棒球', '網球', '羽球', '桌球', '排球', '高爾夫', '保齡球', '撞球', '馬拉松', '短跑', '跳遠', '跳高', '體操', '舉重', '攀岩', '拔河', '游泳', '跳水', '衝浪', '潛水', '滑雪', '溜冰', '拳擊', '擊劍', '射箭', '柔道', '跆拳道', '賽車', '金牌', '獎盃', '裁判', '哨子', '終點線', '計分板', '體育館', '冠軍'],
  },
  {
    id: 'digital_tech_ai',
    label: '數位科技、電腦與網路',
    clues: ['科技', '電腦', '數位', '網路', '資訊', '未來', '電子', '軟體', '硬體', '智慧'],
    tags: ['科技', '數位', '電腦', '人工智慧', '網路', '硬體', '電子', '通訊'],
    morphemes: ['電', '腦', '網', '數', '晶', '機', '器', '訊', '碼', '雲', '智', '線'],
    keywords: ['人工智慧', '機器人', '晶片', '演算法', '資料庫', '伺服器', '雲端', '虛擬實境', '區塊鏈', '程式碼', '電腦', '筆電', '智慧手機', '平板', '鍵盤', '滑鼠', '螢幕', '投影機', '印表機', '電池', '雷射', '全息投影', '感應器', '網路', '藍牙', '光纖', '工程師', '駭客', '電玩'],
  },
  {
    id: 'ancient_oriental_culture',
    label: '東方文化、古文明與歷史',
    clues: ['古風', '傳統', '歷史', '東方', '古文明', '國粹', '武俠', '江湖', '考古', '文物', '過年', '節慶'],
    tags: ['文化', '東方', '傳統', '古文明', '歷史', '文物', '節慶', '江湖'],
    morphemes: ['古', '書', '畫', '棋', '茶', '劍', '武', '俠', '龍', '獅', '燈', '廟', '瓷', '絲', '印'],
    keywords: ['書法', '水墨畫', '京劇', '臉譜', '太極', '武術', '茶道', '圍棋', '象棋', '折扇', '燈籠', '煙火', '春聯', '紅包', '舞龍', '舞獅', '天燈', '廟會', '青銅器', '瓷器', '絲綢', '卷軸', '古籍', '印章', '玉璽', '毛筆', '武士', '俠客', '忍者', '金字塔', '萬里長城', '古蹟', '考古學家', '博物館'],
  },
  {
    id: 'finance_wealth_commerce',
    label: '金融、財富與商業寶藏',
    clues: ['金融', '財富', '金錢', '銀行', '寶藏', '珠寶', '奢華', '投資', '商業', '富貴'],
    tags: ['金融', '商業', '財富', '寶石', '閃耀'],
    morphemes: ['金', '銀', '財', '富', '寶', '鑽', '珠', '玉', '錢', '行', '商', '賭'],
    keywords: ['鑽石', '紅寶石', '翡翠', '琥珀', '水晶', '珍珠', '礦脈', '富豪', '銀行家', '會計師', '珠寶商', '拍賣師', '銀行', '金庫', '賭場', '百貨公司', '保險箱', '錢包', '戒指', '項鍊', '皇冠', '彩券', '頭獎', '紅包', '財富', '區塊鏈'],
  },
  {
    id: 'fantasy_myth_magic',
    label: '神話、魔法與奇幻傳說',
    clues: ['神話', '奇幻', '魔法', '傳說', '童話', '魔幻', '超自然', '宗教', '神秘', '占卜'],
    tags: ['神話', '奇幻', '魔法', '傳說', '神秘', '宗教'],
    morphemes: ['神', '魔', '巫', '靈', '仙', '鬼', '怪', '聖', '咒', '命', '卜'],
    keywords: ['魔法師', '女巫', '精靈', '吸血鬼', '巨人', '美人魚', '天使', '惡魔', '幽靈', '外星人', '神殿', '教堂', '修道院', '神話', '傳說', '圖騰', '聖杯', '十字架', '護身符', '星座', '塔羅牌', '風水', '童話', '鬼屋', '魔術', '魔術師', '奇蹟', '命運', '夢境', '幻想'],
  },
  {
    id: 'time_light_optics',
    label: '時間、光影與鏡面觀測',
    clues: ['時間', '光影', '歲月', '光學', '時光', '鏡面', '計時', '日夜', '照明'],
    tags: ['時間', '光線', '光學', '玻璃', '四季'],
    morphemes: ['時', '鐘', '錶', '光', '影', '鏡', '燈', '照', '日', '夜', '曉', '昏', '年'],
    keywords: ['時鐘', '鬧鐘', '手錶', '懷錶', '沙漏', '日晷', '鐘錶匠', '鐘樓', '大笨鐘', '年輪', '時間', '永恆', '瞬間', '黎明', '黃昏', '正午', '午夜', '破曉', '鏡子', '放大鏡', '望遠鏡', '顯微鏡', '潛望鏡', '眼鏡', '墨鏡', '萬花筒', '攝影機', '檯燈', '手電筒', '聚光燈', '燈塔', '彩虹', '極光', '月光', '影子', '光影'],
  },
  {
    id: 'travel_transport_geography',
    label: '旅遊、地標與世界交通',
    clues: ['旅遊', '環遊世界', '出國', '渡假', '交通', '運輸', '通勤', '地標', '歐洲', '日本'],
    tags: ['交通', '旅遊', '地理', '歐洲', '亞洲', '鐵道', '旅途'],
    morphemes: ['車', '鐵', '路', '站', '旅', '遊', '票', '箱', '島', '山', '國', '城'],
    keywords: ['高鐵', '捷運', '火車', '公車', '計程車', '跑車', '飛機', '郵輪', '腳踏車', '摩托車', '纜車', '露營車', '高速公路', '隧道', '鐵軌', '月台', '登機證', '機場', '車站', '飯店', '行李箱', '背包', '遊客', '背包客', '導航', '巴黎', '倫敦', '東京', '紐約', '羅馬', '威尼斯', '雅典', '開羅', '夏威夷', '馬爾地夫', '富士山', '阿里山', '日月潭'],
  },
  {
    id: 'school_literature_office',
    label: '校園、文學與書房文具',
    clues: ['學校', '校園', '讀書', '文學', '文具', '書房', '寫作', '學術', '教育', '知識'],
    tags: ['學校', '學術', '文學', '文具', '書寫', '紙張', '智慧'],
    morphemes: ['書', '筆', '文', '字', '學', '校', '師', '教', '紙', '信', '讀', '詩'],
    keywords: ['教授', '老師', '學者', '哲學家', '作家', '詩人', '記者', '圖書館', '大學', '博物館', '鋼筆', '鉛筆', '毛筆', '筆記本', '日記', '信封', '郵票', '書籤', '古籍', '卷軸', '羊皮紙', '小說', '漫畫', '童話', '劇本', '謎語', '成語', '詩詞', '史詩', '書法', '智慧'],
  },
];

export interface SemanticScoreDetail {
  score: number; // 0.0 to 1.0
  reason: string;
}

/**
 * Computes semantic affinity between a clue word (from AI or Human) and a target board word.
 * Strictly relies on general linguistic/semantic knowledge, NEVER on secret card ownership.
 */
export function scoreWordAgainstClue(
  rawClue: string,
  targetWord: string
): SemanticScoreDetail {
  const clue = rawClue.trim();
  const entry = WORD_MAP.get(targetWord);

  if (!clue || !entry) {
    return { score: 0.05, reason: '無明顯語意關聯' };
  }

  let bestScore = 0.05;
  let bestReason = '基礎語意背景值';

  const updateBest = (score: number, reason: string) => {
    if (score > bestScore) {
      bestScore = score;
      bestReason = reason;
    }
  };

  // 1. Direct match in targetWord's curated relatedClues
  if (entry.relatedClues.includes(clue)) {
    updateBest(0.92, `「${targetWord}」的核心聯想詞直接對應線索「${clue}」`);
  }

  // 2. Direct match in targetWord's semantic tags or category
  if (entry.tags.includes(clue) || entry.category === clue) {
    updateBest(0.88, `「${targetWord}」屬於「${clue}」語意類別`);
  }

  // 3. Partial substring overlap between clue and targetWord's relatedClues / tags
  for (const rc of entry.relatedClues) {
    if (rc !== clue && (rc.includes(clue) || clue.includes(rc))) {
      updateBest(0.81, `「${targetWord}」的關聯概念「${rc}」與線索「${clue}」高度相近`);
    }
  }
  for (const tag of entry.tags) {
    if (tag !== clue && (tag.includes(clue) || clue.includes(tag))) {
      updateBest(0.78, `「${targetWord}」的屬性標籤「${tag}」與線索「${clue}」吻合`);
    }
  }

  // 4. If the clue itself is a known word in WORD_MAP, compare tag & relatedClue intersection
  const clueEntry = WORD_MAP.get(clue);
  if (clueEntry) {
    const sharedTags = entry.tags.filter((t) => clueEntry.tags.includes(t));
    const sharedClues = entry.relatedClues.filter((c) => clueEntry.relatedClues.includes(c));
    if (sharedTags.length > 0 || sharedClues.length > 0) {
      const overlapScore = Math.min(
        0.86,
        0.48 + sharedTags.length * 0.14 + sharedClues.length * 0.12
      );
      const conceptList = [...sharedTags, ...sharedClues].slice(0, 2).join('、');
      updateBest(overlapScore, `與「${clue}」共享【${conceptList}】語意特徵`);
    }
  }

  // 5. Concept Thesaurus domain matching (including morpheme analysis for arbitrary human clues!)
  const clueChars = Array.from(clue);
  for (const domain of CONCEPT_THESAURUS) {
    let clueMatchesDomain = 0;
    if (domain.clues.includes(clue) || domain.tags.includes(clue)) {
      clueMatchesDomain = 1.0;
    } else if (domain.clues.some((c) => c.includes(clue) || clue.includes(c))) {
      clueMatchesDomain = 0.85;
    } else {
      const matchingMorphemes = clueChars.filter((ch) => domain.morphemes.includes(ch));
      if (matchingMorphemes.length > 0) {
        clueMatchesDomain = Math.min(0.82, 0.55 + matchingMorphemes.length * 0.15);
      }
    }

    if (clueMatchesDomain > 0) {
      let targetMatchesDomain = 0;
      if (domain.keywords.includes(targetWord)) {
        targetMatchesDomain = 0.95;
      } else {
        const tagHits = entry.tags.filter((t) => domain.tags.includes(t)).length;
        const clueHits = entry.relatedClues.filter((c) => domain.clues.includes(c)).length;
        const targetMorphemeHits = Array.from(targetWord).filter((ch) =>
          domain.morphemes.includes(ch)
        ).length;
        if (tagHits > 0 || clueHits > 0 || targetMorphemeHits > 0) {
          targetMatchesDomain = Math.min(
            0.88,
            0.45 + tagHits * 0.16 + clueHits * 0.14 + targetMorphemeHits * 0.15
          );
        }
      }

      if (targetMatchesDomain > 0) {
        const combined = Number((clueMatchesDomain * targetMatchesDomain).toFixed(3));
        updateBest(
          combined,
          `透過【${domain.label}】語意網路連結「${clue}」與「${targetWord}」`
        );
      }
    }
  }

  // 6. Morpheme overlap between clue characters and targetWord's tags/relatedClues characters
  const metaChars = new Set(
    [...entry.tags.join(''), ...entry.relatedClues.join('')]
  );
  const sharedMetaChars = clueChars.filter((ch) => metaChars.has(ch));
  if (sharedMetaChars.length > 0) {
    const score = Math.min(0.74, 0.45 + sharedMetaChars.length * 0.15);
    updateBest(
      score,
      `線索字元「${sharedMetaChars.join('')}」對應「${targetWord}」的語意場`
    );
  }

  return {
    score: Number(bestScore.toFixed(3)),
    reason: bestReason,
  };
}

export interface SpymasterClueDecision {
  word: string;
  count: ClueCount;
  targetWords: string[];
  publicReasoning: string;
  secretReasoning: string;
  candidateScores: Array<{ word: string; score: number; reason: string }>;
}

/**
 * Generates an intelligent, legal clue for the AI Spymaster using the local semantic graph.
 * Spymaster has access to `ServerBoardCard[]` (secret keycard).
 */
export function generateLocalSpymasterClue(
  board: readonly ServerBoardCard[],
  team: Team,
  difficulty: AIDifficulty,
  personality: AIPersonality,
  rules: RoomRulesConfig,
  usedClueWords: readonly string[] = []
): SpymasterClueDecision {
  const unrevealed = board.filter((c) => !c.revealed);
  const myCards = unrevealed.filter((c) => c.type === team);
  const enemyCards = unrevealed.filter(
    (c) => c.type !== team && c.type !== 'bystander' && c.type !== 'assassin'
  );
  const bystanderCards = unrevealed.filter((c) => c.type === 'bystander');
  const assassinCard = unrevealed.find((c) => c.type === 'assassin');

  const usedSet = new Set(usedClueWords.map((w) => w.trim()));

  // Gather candidate clue pool from myCards' relatedClues, tags, and CONCEPT_THESAURUS
  const candidatePool = new Set<string>();
  for (const card of myCards) {
    const entry = WORD_MAP.get(card.word);
    if (entry) {
      entry.relatedClues.forEach((c) => candidatePool.add(c));
      entry.tags.forEach((t) => candidatePool.add(t));
    }
  }
  for (const domain of CONCEPT_THESAURUS) {
    domain.clues.forEach((c) => candidatePool.add(c));
  }
  // Additional high-versatility Codenames fallback clues
  const fallbackClues = [
    '海洋', '太空', '皇室', '機密', '寒冬', '火焰', '森林', '美食',
    '醫療', '音樂', '競技', '數位', '古風', '財富', '神話', '光影',
    '旅途', '學術', '夜晚', '速度', '高處', '典雅', '冒險', '自然',
    '都市', '藝術', '科學', '傳統', '現代', '奇幻', '慶典', '守護',
  ];
  fallbackClues.forEach((c) => candidatePool.add(c));

  // Difficulty & personality parameters
  const maxAllowedTargets =
    difficulty === 'easy'
      ? 2
      : difficulty === 'normal'
      ? personality === 'risky'
        ? 4
        : 3
      : personality === 'cautious'
      ? 3
      : 4;

  const minFriendlyAffinity =
    difficulty === 'easy' ? 0.52 : difficulty === 'normal' ? 0.46 : 0.42;

  const assassinPenaltyWeight =
    personality === 'cautious'
      ? 2.6
      : personality === 'risky'
      ? 1.5
      : difficulty === 'hard'
      ? 2.3
      : 1.9;

  const enemyPenaltyWeight =
    personality === 'cautious' ? 1.6 : personality === 'risky' ? 1.05 : 1.35;

  interface EvaluatedClue {
    clueWord: string;
    targets: Array<{ word: string; score: number; reason: string; category: string }>;
    utility: number;
    maxDangerScore: number;
    dangerWord: string;
  }

  const validEvaluations: EvaluatedClue[] = [];

  for (const candidate of candidatePool) {
    if (usedSet.has(candidate)) continue;
    const validation = validateClue(candidate, 1, board, rules);
    if (!validation.valid) continue;

    // Score against danger cards first
    const assassinScore = assassinCard
      ? scoreWordAgainstClue(candidate, assassinCard.word).score
      : 0;
    const maxEnemyScore = enemyCards.reduce(
      (max, c) => Math.max(max, scoreWordAgainstClue(candidate, c.word).score),
      0
    );
    const maxBystanderScore = bystanderCards.reduce(
      (max, c) => Math.max(max, scoreWordAgainstClue(candidate, c.word).score),
      0
    );

    const effectiveDangerCeiling = Math.max(
      assassinScore * 1.15,
      maxEnemyScore * 1.05,
      maxBystanderScore * 0.95
    );

    // Score all friendly unrevealed cards
    const scoredFriendly = myCards
      .map((c) => {
        const res = scoreWordAgainstClue(candidate, c.word);
        return {
          word: c.word,
          category: c.category,
          score: res.score,
          reason: res.reason,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Pick friendly targets that beat both minFriendlyAffinity and effectiveDangerCeiling
    const chosenTargets = scoredFriendly.filter(
      (item, idx) =>
        idx < maxAllowedTargets &&
        item.score >= minFriendlyAffinity &&
        item.score > effectiveDangerCeiling - (personality === 'risky' ? 0.08 : 0.0)
    );

    // Ensure at least the top friendly card is considered if no multi-target match
    const finalTargets =
      chosenTargets.length > 0
        ? chosenTargets
        : scoredFriendly.length > 0 && scoredFriendly[0].score >= 0.35
        ? [scoredFriendly[0]]
        : [];

    if (finalTargets.length === 0) continue;

    const sumScores = finalTargets.reduce((acc, t) => acc + t.score, 0);
    const minTargetScore = finalTargets[finalTargets.length - 1].score;
    const safetyMargin = minTargetScore - effectiveDangerCeiling;

    // Cross-category bonus for 'associative' personality & 'hard' difficulty
    const uniqueCategories = new Set(finalTargets.map((t) => t.category)).size;
    const crossCategoryBonus =
      (personality === 'associative' ? 0.28 : difficulty === 'hard' ? 0.16 : 0.06) *
      (uniqueCategories - 1);

    // Multi-word count bonus adjusted by personality
    const countMultiplier =
      personality === 'risky'
        ? 0.52
        : personality === 'cautious'
        ? 0.24
        : 0.38;

    const analyticalBonus =
      personality === 'analytical' ? safetyMargin * 1.4 : safetyMargin * 0.8;

    const intuitiveBonus =
      personality === 'intuitive' && finalTargets[0].score >= 0.85 ? 0.25 : 0;

    const dangerPenalty =
      assassinScore * assassinPenaltyWeight * 0.65 +
      maxEnemyScore * enemyPenaltyWeight * 0.45 +
      maxBystanderScore * 0.22;

    const utility =
      sumScores +
      (finalTargets.length - 1) * countMultiplier +
      crossCategoryBonus +
      analyticalBonus +
      intuitiveBonus -
      dangerPenalty;

    validEvaluations.push({
      clueWord: validation.normalizedWord,
      targets: finalTargets,
      utility,
      maxDangerScore: Math.max(assassinScore, maxEnemyScore, maxBystanderScore),
      dangerWord: assassinCard?.word ?? '',
    });
  }

  validEvaluations.sort((a, b) => b.utility - a.utility);

  // Easy AI slightly randomizes among top 4 valid choices so it feels more human/relaxed
  const pickIndex =
    difficulty === 'easy' && validEvaluations.length > 3
      ? Math.floor(Math.random() * 3)
      : 0;

  const chosen = validEvaluations[pickIndex];

  if (chosen) {
    const count: ClueCount = chosen.targets.length;
    const targetNames = chosen.targets.map((t) => `「${t.word}」`).join('、');
    const personalityLabel = getPersonalityLabel(personality);
    const difficultyLabel = getDifficultyLabel(difficulty);

    return {
      word: chosen.clueWord,
      count,
      targetWords: chosen.targets.map((t) => t.word),
      publicReasoning: `【${difficultyLabel}・${personalityLabel}】已完成桌面語意風險掃描，鎖定 ${count} 個高關聯目標並排除高風險干擾項。`,
      secretReasoning: `【領袖機密分析】以線索「${chosen.clueWord} : ${count}」串聯 ${targetNames}（最高語意強度 ${Math.round(
        chosen.targets[0].score * 100
      )}%），並避開殺手與敵方代號。`,
      candidateScores: chosen.targets.map((t) => ({
        word: t.word,
        score: t.score,
        reason: t.reason,
      })),
    };
  }

  // Emergency fallback: find ANY legal word not sharing characters with the board
  const emergencyFallbacks = ['概念', '印象', '現象', '領域', '元素', '核心', '特質', '記憶', '萬物'];
  for (const fb of emergencyFallbacks) {
    const v = validateClue(fb, 1, board, rules);
    if (v.valid) {
      const target = myCards[0];
      return {
        word: v.normalizedWord,
        count: 1,
        targetWords: target ? [target.word] : [],
        publicReasoning: '已完成桌面安全詞彙篩選，提供穩健單點線索。',
        secretReasoning: target
          ? `【領袖機密分析】桌面字元限制較多，以安全線索「${v.normalizedWord}」指向「${target.word}」。`
          : '安全備援線索。',
        candidateScores: target
          ? [{ word: target.word, score: 0.5, reason: '安全備援關聯' }]
          : [],
      };
    }
  }

  return {
    word: '目標',
    count: 1,
    targetWords: myCards[0] ? [myCards[0].word] : [],
    publicReasoning: '提供基礎戰術線索。',
    secretReasoning: '基礎戰術線索。',
    candidateScores: [],
  };
}

export interface OperativeGuessDecision {
  action: 'guess' | 'end_turn';
  cardIndex?: number;
  word?: string;
  confidence: number;
  reasoning: string;
  candidateScores: Array<{ word: string; score: number; reason: string }>;
}

/**
 * Generates an AI Operative decision (guess a card or end turn).
 * CRITICAL SECURITY REQUIREMENT:
 * Receives ONLY `ClientBoardCard[]` (no secret card types for unrevealed cards!)
 * and public clue history. Never reads secret answers.
 */
export function generateLocalOperativeDecision(
  publicBoard: readonly ClientBoardCard[],
  currentClue: Clue,
  guessesMadeThisTurn: number,
  maxGuessesThisTurn: number | 'unlimited',
  difficulty: AIDifficulty,
  personality: AIPersonality,
  teamClueHistory: readonly Clue[] = []
): OperativeGuessDecision {
  const unrevealed = publicBoard.filter((c) => !c.revealed);
  if (unrevealed.length === 0) {
    return {
      action: 'end_turn',
      confidence: 0,
      reasoning: '桌面已無未翻開的代號卡。',
      candidateScores: [],
    };
  }

  // Score every unrevealed card strictly using public word & currentClue.word
  const scoredCandidates = unrevealed.map((card) => {
    const primary = scoreWordAgainstClue(currentClue.word, card.word);
    let finalScore = primary.score;
    let finalReason = primary.reason;

    // For '0' clue: 0 means "avoid words related to this clue"!
    if (currentClue.count === 0) {
      finalScore = Number((1 - primary.score).toFixed(3));
      finalReason = `線索數量為 0（反向排除），「${card.word}」與「${currentClue.word}」關聯度最低`;
    } else if (difficulty === 'hard' && teamClueHistory.length > 1) {
      // Hard AI also cross-references earlier clues from its own spymaster
      const previousClues = teamClueHistory.filter(
        (c) => c.id !== currentClue.id && c.count !== 0
      );
      for (const prev of previousClues) {
        const prevMatch = scoreWordAgainstClue(prev.word, card.word);
        if (prevMatch.score >= 0.72 && finalScore < prevMatch.score * 0.9) {
          finalScore = Number(Math.max(finalScore, prevMatch.score * 0.88).toFixed(3));
          finalReason = `結合本回合「${currentClue.word}」與先前未完線索「${prev.word}」綜合推理`;
        }
      }
    }

    // Add slight human-like noise for 'easy' difficulty
    if (difficulty === 'easy') {
      const jitter = (Math.sin(card.index * 17 + guessesMadeThisTurn * 31) * 0.06);
      finalScore = Number(Math.max(0.05, Math.min(0.99, finalScore + jitter)).toFixed(3));
    }

    return {
      cardIndex: card.index,
      word: card.word,
      score: finalScore,
      reason: finalReason,
    };
  });

  scoredCandidates.sort((a, b) => b.score - a.score);
  const top3 = scoredCandidates.slice(0, 3).map((c) => ({
    word: c.word,
    score: c.score,
    reason: c.reason,
  }));

  const best = scoredCandidates[0];

  // Determine whether to stop guessing or continue (must make at least 1 guess per turn!)
  if (guessesMadeThisTurn > 0) {
    const numericClueCount =
      typeof currentClue.count === 'number' && currentClue.count > 0
        ? currentClue.count
        : 2;

    const isBonusGuess =
      typeof currentClue.count === 'number' &&
      currentClue.count > 0 &&
      guessesMadeThisTurn >= numericClueCount;

    // Base confidence threshold to keep guessing
    let stopThreshold =
      difficulty === 'easy'
        ? 0.58
        : difficulty === 'normal'
        ? 0.45
        : 0.38;

    if (personality === 'cautious') stopThreshold += 0.14;
    if (personality === 'risky') stopThreshold -= 0.14;
    if (personality === 'analytical') stopThreshold += 0.05;

    if (isBonusGuess) {
      // Bonus (+1) guess requires significantly higher confidence unless risky
      stopThreshold += personality === 'risky' ? 0.12 : 0.28;
    }

    if (best.score < stopThreshold) {
      return {
        action: 'end_turn',
        confidence: best.score,
        reasoning: `已猜中 ${guessesMadeThisTurn} 張代號，剩餘候選「${best.word}」信心度（${Math.round(
          best.score * 100
        )}%）低於${getPersonalityLabel(personality)}安全閾值，決定見好就收、結束回合。`,
        candidateScores: top3,
      };
    }
  }

  const runnerUp = scoredCandidates[1];
  const comparisonText = runnerUp
    ? `（優於次選「${runnerUp.word}」的 ${Math.round(runnerUp.score * 100)}%）`
    : '';

  return {
    action: 'guess',
    cardIndex: best.cardIndex,
    word: best.word,
    confidence: best.score,
    reasoning: `根據線索「${currentClue.word} : ${
      currentClue.count === 'unlimited' ? '∞' : currentClue.count
    }」，評估「${best.word}」關聯信心度達 ${Math.round(best.score * 100)}% ${comparisonText} — ${
      best.reason
    }。`,
    candidateScores: top3,
  };
}

export function getDifficultyLabel(difficulty: AIDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return '簡單';
    case 'normal':
      return '普通';
    case 'hard':
      return '困難';
  }
}

export function getPersonalityLabel(personality: AIPersonality): string {
  switch (personality) {
    case 'cautious':
      return '穩健型';
    case 'risky':
      return '冒險型';
    case 'associative':
      return '聯想型';
    case 'analytical':
      return '分析型';
    case 'intuitive':
      return '直覺型';
  }
}
