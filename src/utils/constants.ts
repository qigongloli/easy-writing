// 书籍分类列表
export const BOOK_CATEGORIES = [
  '玄幻脑洞',
  '都市高武',
  '历史古代',
  '仙侠修真',
  '科幻未来',
  '悬疑灵异'
];

// 分类对应的 Tag 类型 (Element Plus)
export const CATEGORY_TAG_MAP: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
  '玄幻脑洞': 'primary',
  '都市高武': 'success',
  '历史古代': 'warning',
  '仙侠修真': 'danger',
  '科幻未来': 'info',
  '悬疑灵异': 'info',
  // 兼容旧数据
  '长篇': 'primary',
  '短篇': 'success',
  '剧本': 'warning',
  '视频': 'danger'
};
