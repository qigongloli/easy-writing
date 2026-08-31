/**
 * 起点反爬字体（ttf）解码，移植自老服务端 statistics/service/rank/qidianFont.ts。
 *
 * 起点榜单页的月票数字用非常规 Unicode 字符渲染，真实数字由 @font-face 的 ttf 决定：
 * - cmap 表把这些 codepoint 映射到 glyphId；
 * - post 表（format 2.0）里 glyph 名是 zero/one/.../nine/period。
 * 只做最小可用的 TTF 解析（cmap format 12/4 + post 2.0），不引字体库。
 */

const DIGIT_NAME_TO_CHAR: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  period: '.',
}

// 标准 Mac glyph names（post format 2.0 nameIndex < 258 时使用；解码只关心数字名，
// 表保留完整以保证 nameIndex 对位正确）
const MAC_GLYPH_NAMES: string[] = [
  '.notdef', '.null', 'nonmarkingreturn', 'space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent', 'ampersand',
  'quotesingle', 'parenleft', 'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash', 'zero', 'one',
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'colon', 'semicolon', 'less', 'equal', 'greater',
  'question', 'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
  'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore',
  'grave', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
  'v', 'w', 'x', 'y', 'z', 'braceleft', 'bar', 'braceright', 'asciitilde', 'Adieresis', 'Aring', 'Ccedilla',
  'Eacute', 'Ntilde', 'Odieresis', 'Udieresis', 'aacute', 'agrave', 'acircumflex', 'adieresis', 'atilde', 'aring',
  'ccedilla', 'eacute', 'egrave', 'ecircumflex', 'edieresis', 'iacute', 'igrave', 'icircumflex', 'idieresis',
  'ntilde', 'oacute', 'ograve', 'ocircumflex', 'odieresis', 'otilde', 'uacute', 'ugrave', 'ucircumflex', 'udieresis',
  'dagger', 'degree', 'cent', 'sterling', 'section', 'bullet', 'paragraph', 'germandbls', 'registered', 'copyright',
  'trademark', 'acute', 'dieresis', 'notequal', 'AE', 'Oslash', 'infinity', 'plusminus', 'lessequal', 'greaterequal',
  'yen', 'mu', 'partialdiff', 'summation', 'product', 'pi', 'integral', 'ordfeminine', 'ordmasculine', 'Omega',
  'ae', 'oslash', 'questiondown', 'exclamdown', 'logicalnot', 'radical', 'florin', 'approxequal', 'Delta',
  'guillemotleft', 'guillemotright', 'ellipsis', 'nonbreakingspace', 'Agrave', 'Atilde', 'Otilde', 'OE', 'oe',
  'endash', 'emdash', 'quotedblleft', 'quotedblright', 'quoteleft', 'quoteright', 'divide', 'lozenge', 'ydieresis',
  'Ydieresis', 'fraction', 'currency', 'guilsinglleft', 'guilsinglright', 'fi', 'fl', 'daggerdbl', 'periodcentered',
  'quotesinglbase', 'quotedblbase', 'perthousand', 'Acircumflex', 'Ecircumflex', 'Aacute', 'Edieresis', 'Egrave',
  'Iacute', 'Icircumflex', 'Idieresis', 'Igrave', 'Oacute', 'Ocircumflex', 'apple', 'Ograve', 'Uacute', 'Ucircumflex',
  'Ugrave', 'dotlessi', 'circumflex', 'tilde', 'macron', 'breve', 'dotaccent', 'ring', 'cedilla', 'hungarumlaut',
  'ogonek', 'caron', 'Lslash', 'lslash', 'Scaron', 'scaron', 'Zcaron', 'zcaron', 'brokenbar', 'Eth', 'eth', 'Yacute',
  'yacute', 'Thorn', 'thorn', 'minus', 'multiply', 'onesuperior', 'twosuperior', 'threesuperior', 'onehalf',
  'onequarter', 'threequarters', 'franc', 'Gbreve', 'gbreve', 'Idotaccent', 'Scedilla', 'scedilla', 'Cacute',
  'cacute', 'Ccaron', 'ccaron', 'dcroat',
]

interface TtfTable {
  offset: number
  length: number
}

const u8 = (view: DataView, offset: number) => view.getUint8(offset)
const u16 = (view: DataView, offset: number) => view.getUint16(offset, false)
const i16 = (view: DataView, offset: number) => view.getInt16(offset, false)
const u32 = (view: DataView, offset: number) => view.getUint32(offset, false)

const latin1 = (view: DataView, offset: number, length: number) => {
  let out = ''
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(u8(view, offset + i))
  return out
}

const readTableDirectory = (view: DataView): Record<string, TtfTable> => {
  const numTables = u16(view, 4)
  let p = 12
  const tables: Record<string, TtfTable> = {}
  for (let i = 0; i < numTables; i += 1) {
    const tag = latin1(view, p, 4)
    tables[tag] = { offset: u32(view, p + 8), length: u32(view, p + 12) }
    p += 16
  }
  return tables
}

const parsePostGlyphNames = (view: DataView, tables: Record<string, TtfTable>): string[] => {
  const post = tables['post']
  if (!post) throw new Error('ttf 缺少 post 表')
  const off = post.offset
  const format = u32(view, off)
  if (format !== 0x00020000) throw new Error('仅支持 post format 2.0')

  const numberOfGlyphs = u16(view, off + 32)
  let p = off + 34
  const glyphNameIndex: number[] = []
  for (let i = 0; i < numberOfGlyphs; i += 1) {
    glyphNameIndex.push(u16(view, p))
    p += 2
  }

  const customNames: string[] = []
  const end = off + post.length
  while (p < end) {
    const len = u8(view, p)
    p += 1
    if (!len) continue
    customNames.push(latin1(view, p, len))
    p += len
  }

  const glyphNames: string[] = []
  for (let gid = 0; gid < numberOfGlyphs; gid += 1) {
    const idx = glyphNameIndex[gid] ?? 0
    glyphNames[gid] = idx < 258 ? MAC_GLYPH_NAMES[idx] || '' : customNames[idx - 258] || ''
  }
  return glyphNames
}

const cmapGlyphIdForCodepoint = (view: DataView, cmapOff: number, subtableOff: number, codepoint: number): number | null => {
  const subOff = cmapOff + subtableOff
  const format = u16(view, subOff)

  if (format === 12) {
    const nGroups = u32(view, subOff + 12)
    let p = subOff + 16
    for (let i = 0; i < nGroups; i += 1) {
      const startCharCode = u32(view, p)
      const endCharCode = u32(view, p + 4)
      const startGlyphId = u32(view, p + 8)
      if (codepoint >= startCharCode && codepoint <= endCharCode) {
        return startGlyphId + (codepoint - startCharCode)
      }
      p += 12
    }
    return null
  }

  if (format === 4) {
    const segCount = u16(view, subOff + 6) / 2
    const endCodeOff = subOff + 14
    const startCodeOff = endCodeOff + 2 * segCount + 2
    const idDeltaOff = startCodeOff + 2 * segCount
    const idRangeOffsetOff = idDeltaOff + 2 * segCount
    const glyphIdArrayOff = idRangeOffsetOff + 2 * segCount

    for (let i = 0; i < segCount; i += 1) {
      const endCode = u16(view, endCodeOff + 2 * i)
      const startCode = u16(view, startCodeOff + 2 * i)
      if (codepoint < startCode || codepoint > endCode) continue

      const idDelta = i16(view, idDeltaOff + 2 * i)
      const idRangeOffset = u16(view, idRangeOffsetOff + 2 * i)
      if (idRangeOffset === 0) {
        return (codepoint + idDelta) & 0xffff
      }
      const roPos = idRangeOffsetOff + 2 * i
      const glyphIndexOff = roPos + idRangeOffset + 2 * (codepoint - startCode)
      if (glyphIndexOff < glyphIdArrayOff || glyphIndexOff >= subOff + u16(view, subOff + 2)) return null
      const glyphId = u16(view, glyphIndexOff)
      if (glyphId === 0) return 0
      return (glyphId + idDelta) & 0xffff
    }
    return null
  }

  return null
}

/** 给定 ttf 字节与需要解码的 codepoints，返回 codepoint → '0'..'9'/'.' 的映射 */
export const buildQidianDigitMapFromTtf = (ttf: ArrayBuffer | Uint8Array, codepoints: number[]): Map<number, string> => {
  const bytes = ttf instanceof Uint8Array ? ttf : new Uint8Array(ttf)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const cps = Array.from(new Set((codepoints || []).filter(cp => Number.isFinite(cp) && cp > 0)))
  const tables = readTableDirectory(view)

  const glyphNames = parsePostGlyphNames(view, tables)
  const cmap = tables['cmap']
  if (!cmap) throw new Error('ttf 缺少 cmap 表')
  const cmapOff = cmap.offset
  const numTables = u16(view, cmapOff + 2)

  const subtables: Array<{ format: number; subOff: number }> = []
  let p = cmapOff + 4
  for (let i = 0; i < numTables; i += 1) {
    const subOff = u32(view, p + 4)
    subtables.push({ format: u16(view, cmapOff + subOff), subOff })
    p += 8
  }
  // 优先 format 12（起点混淆字符多在增补平面），再退 format 4
  subtables.sort((a, b) => (b.format === 12 ? 1 : 0) - (a.format === 12 ? 1 : 0))

  const map = new Map<number, string>()
  for (const cp of cps) {
    let gid: number | null = null
    for (const subtable of subtables) {
      gid = cmapGlyphIdForCodepoint(view, cmapOff, subtable.subOff, cp)
      if (gid !== null && gid !== undefined) break
    }
    if (gid === null || gid === undefined) continue
    const digit = DIGIT_NAME_TO_CHAR[glyphNames[gid] || '']
    if (digit) map.set(cp, digit)
  }
  return map
}

/** 用映射把混淆文本解回数字；映射外的字符丢弃（与老实现同口径） */
export const decodeQidianObfuscatedNumber = (text: string, digitMap?: Map<number, string>) => {
  const trimmed = String(text || '').trim()
  if (!trimmed) return { text: '', value: 0 }
  if (!digitMap || digitMap.size === 0) return { text: trimmed, value: 0 }
  let out = ''
  for (const char of trimmed) {
    const cp = char.codePointAt(0)
    if (!cp) continue
    out += digitMap.get(cp) ?? ''
  }
  const num = Number(out.replace(/[^\d.]/g, ''))
  return { text: out || trimmed, value: Number.isFinite(num) ? Math.trunc(num) : 0 }
}
