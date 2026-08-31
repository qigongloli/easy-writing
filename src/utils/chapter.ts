
// --- 中文数字转换工具 ---
const chnNumChar: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  十: 10, 百: 100, 千: 1000, 万: 10000
};

export const chineseToNumber = (chnStr: string): number => {
  let rtn = 0;
  let section = 0;
  let number = 0;
  const str = chnStr.split('');

  for (let i = 0; i < str.length; i++) {
    const num = chnNumChar[str[i]];
    if (typeof num !== 'undefined') {
      if (num === 10000) { // 万
        section += number;
        rtn += section * 10000;
        section = 0;
        number = 0;
      } else if (num >= 10) { // 十, 百, 千
        if (number === 0) number = 1;
        section += number * num;
        number = 0;
      } else {
        number = num;
      }
    }
  }
  return rtn + section + number;
};

const numberToChinese = (num: number): string => {
  const chnNumChar = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const chnUnitChar = ["", "十", "百", "千"];
  let str = "";
  let unitPos = 0;
  let zero = true;

  if (num === 0) return "零";

  while (num > 0) {
    const v = num % 10;
    if (v === 0) {
      if (!zero) {
        zero = true;
        str = chnNumChar[v] + str;
      }
    } else {
      zero = false;
      str = chnNumChar[v] + chnUnitChar[unitPos] + str;
    }
    unitPos++;
    num = Math.floor(num / 10);
  }

  if (str.startsWith("一十")) str = str.substring(1);
  return str;
};

/**
 * 根据现有章节列表，生成下一个章节标题
 * 规则：
 * 1. 扫描所有标题，提取“第X章”中的数字 X
 * 2. 找到最大值 Max
 * 3. 如果最大值存在，返回“第(Max+1)章” (保持原有的中文/数字格式)
 * 4. 如果没有匹配到任何格式，返回“新章节”
 * 5. 如果列表为空，返回“第1章”
 */
export const generateNextChapterTitle = (existingTitles: string[]): string => {
  if (!existingTitles || existingTitles.length === 0) {
    return '第1章';
  }

  let maxNum = 0;
  let useChinese = false; // 倾向于检测到的最大数字的格式
  let matchFound = false;

  const arabicRegex = /^第(\d+)章/;
  const chineseRegex = /^第([零一二三四五六七八九十百千]+)章/;

  existingTitles.forEach(title => {
    const aMatch = title.match(arabicRegex);
    const cMatch = title.match(chineseRegex);

    if (aMatch) {
      const num = parseInt(aMatch[1]);
      if (!isNaN(num)) {
        if (num > maxNum) {
          maxNum = num;
          useChinese = false;
          matchFound = true;
        }
      }
    } else if (cMatch) {
      const num = chineseToNumber(cMatch[1]);
      if (num > maxNum) {
        maxNum = num;
        useChinese = true;
        matchFound = true;
      }
    }
  });

  if (matchFound) {
    const nextNum = maxNum + 1;
    if (useChinese) {
      return `第${numberToChinese(nextNum)}章`;
    } else {
      return `第${nextNum}章`;
    }
  }

  // 如果完全没有匹配到 "第X章" 的格式，但有章节
  // 简单策略：如果都是乱起名，就追加 "新章节" 或者 "第(N+1)章"
  // 这里选择 "第(N+1)章" 作为兜底，比较符合网文习惯
  return `第${existingTitles.length + 1}章`;
};

/**
 * 根据现有分卷列表，生成下一个分卷标题
 * 规则同章节，但针对“第X卷”，且默认倾向于中文数字
 */
export const generateNextVolumeTitle = (existingTitles: string[]): string => {
  if (!existingTitles || existingTitles.length === 0) {
    return '第一卷';
  }

  let maxNum = 0;
  let useChinese = true; // 卷默认倾向于中文
  let matchFound = false;

  const arabicRegex = /^第(\d+)卷/;
  const chineseRegex = /^第([零一二三四五六七八九十百千]+)卷/;

  existingTitles.forEach(title => {
    const aMatch = title.match(arabicRegex);
    const cMatch = title.match(chineseRegex);

    if (aMatch) {
      const num = parseInt(aMatch[1]);
      if (!isNaN(num)) {
        if (num > maxNum) {
          maxNum = num;
          useChinese = false;
          matchFound = true;
        }
      }
    } else if (cMatch) {
      const num = chineseToNumber(cMatch[1]);
      if (num > maxNum) {
        maxNum = num;
        useChinese = true;
        matchFound = true;
      }
    }
  });

  if (matchFound) {
    const nextNum = maxNum + 1;
    if (useChinese) {
      return `第${numberToChinese(nextNum)}卷`;
    } else {
      return `第${nextNum}卷`;
    }
  }

  // 兜底：第(N+1)卷，默认中文
  return `第${numberToChinese(existingTitles.length + 1)}卷`;
};
