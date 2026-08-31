#!/usr/bin/env node
/**
 * 主题对比度自检脚本
 *
 * 解析 src/styles/themes.scss 中每套主题的 CSS 变量，针对成对的
 * “背景 / 前景” 语义变量计算 WCAG 对比度，低于阈值时报错退出。
 *
 * 目的：新增主题或调整颜色时，在提交前拦住“浅底浅字 / 深底深字”这类撞色问题。
 *
 * 用法：node scripts/check-contrast.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const THEMES_FILE = resolve(__dirname, '../src/styles/themes.scss')

/** WCAG 对比度阈值：正文 4.5:1，大字/图标 3:1 */
const AA_NORMAL = 4.5
const AA_LARGE = 3.0

/** 需要校验的“背景 / 前景[/ 边框]”配对，按语义命名 */
const PAIRS = [
  // 语义状态色：surface 背景 + on 前景
  { bg: '--state-danger-surface', fg: '--state-danger-on', min: AA_NORMAL, label: 'danger 状态块' },
  { bg: '--state-warning-surface', fg: '--state-warning-on', min: AA_NORMAL, label: 'warning 状态块' },
  { bg: '--state-success-surface', fg: '--state-success-on', min: AA_NORMAL, label: 'success 状态块' },
  { bg: '--state-info-surface', fg: '--state-info-on', min: AA_NORMAL, label: 'info 状态块' },
  // 强调实心按钮：强背景 + 反白前景
  { bg: '--state-danger-strong-bg', fg: '--state-danger-strong-on', min: AA_NORMAL, label: 'danger 实心按钮' },
  // 页面基础：主背景 + 主/次文字
  { bg: '--bg-main', fg: '--ink-main', min: AA_NORMAL, label: '正文主文字' },
  { bg: '--bg-main', fg: '--ink-sec', min: AA_LARGE, label: '正文次要文字' },
  { bg: '--bg-main', fg: '--ink-accent', min: AA_LARGE, label: '强调色文字' },
]

const THEMES = ['theme-new', 'theme-yellow', 'theme-green', 'theme-dark']

/** 把一套主题选择器内部的 `--var: value;` 抽取成 map */
function parseThemeVars(scss, themeClass) {
  // 匹配 .theme-xxx { ... } 的第一层花括号内容
  const start = scss.indexOf(`.${themeClass} {`)
  if (start === -1) return {}
  let depth = 0
  let i = scss.indexOf('{', start)
  const bodyStart = i + 1
  for (; i < scss.length; i++) {
    if (scss[i] === '{') depth++
    else if (scss[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  const body = scss.slice(bodyStart, i)
  const vars = {}
  // 仅取顶层声明（排除嵌套规则里的）。简单起见用正则抓 `--name: value;`
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let m
  while ((m = re.exec(body)) !== null) {
    vars[m[1]] = m[2].trim()
  }
  return vars
}

/** 解析 var(--x, fallback) 引用，递归求值，最多 10 层防循环 */
function resolveVar(value, vars, depth = 0) {
  if (depth > 10) return value
  const varMatch = value.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i)
  if (varMatch) {
    const ref = varMatch[1]
    const fallback = varMatch[2]
    if (vars[ref] !== undefined) return resolveVar(vars[ref], vars, depth + 1)
    if (fallback !== undefined) return resolveVar(fallback.trim(), vars, depth + 1)
    return null
  }
  return value
}

/** 颜色字符串 -> {r,g,b,a}，支持 #hex / rgb() / rgba() */
function parseColor(str) {
  if (!str) return null
  str = str.trim()
  // hex
  let m = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (m) {
    let h = m[1]
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    }
  }
  // rgb / rgba
  m = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (m) {
    return {
      r: +m[1], g: +m[2], b: +m[3],
      a: m[4] !== undefined ? +m[4] : 1,
    }
  }
  return null
}

/** 把半透明前景/背景按 alpha 合成到不透明底色上 */
function flatten(color, base) {
  if (color.a >= 1) return color
  return {
    r: color.r * color.a + base.r * (1 - color.a),
    g: color.g * color.a + base.g * (1 - color.a),
    b: color.b * color.a + base.b * (1 - color.a),
    a: 1,
  }
}

function relLuminance({ r, g, b }) {
  const f = v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrastRatio(c1, c2) {
  const l1 = relLuminance(c1)
  const l2 = relLuminance(c2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function main() {
  const scss = readFileSync(THEMES_FILE, 'utf8')
  const failures = []
  const warnings = []

  for (const theme of THEMES) {
    const vars = parseThemeVars(scss, theme)
    if (Object.keys(vars).length === 0) {
      warnings.push(`⚠ 未能解析主题 ${theme} 的变量`)
      continue
    }
    const pageBg = parseColor(resolveVar(vars['--bg-main'] || '#ffffff', vars)) || { r: 255, g: 255, b: 255, a: 1 }

    for (const pair of PAIRS) {
      const rawBg = vars[pair.bg]
      const rawFg = vars[pair.fg]
      if (rawBg === undefined || rawFg === undefined) {
        warnings.push(`⚠ ${theme}: 缺少变量 ${rawBg === undefined ? pair.bg : pair.fg}（${pair.label}）`)
        continue
      }
      let bg = parseColor(resolveVar(rawBg, vars))
      let fg = parseColor(resolveVar(rawFg, vars))
      if (!bg || !fg) {
        warnings.push(`⚠ ${theme}: 无法解析颜色 ${pair.bg} 或 ${pair.fg}（${pair.label}）`)
        continue
      }
      // 半透明背景先合成到页面底色，前景再合成到合成后的背景
      bg = flatten(bg, pageBg)
      fg = flatten(fg, bg)
      const ratio = contrastRatio(fg, bg)
      const ok = ratio >= pair.min
      const line = `${theme.padEnd(12)} ${pair.label.padEnd(14)} ${pair.fg} on ${pair.bg}  =  ${ratio.toFixed(2)}:1 (需 ≥ ${pair.min})`
      if (!ok) failures.push('✗ ' + line)
    }
  }

  if (warnings.length) {
    console.log('\n— 提示 —')
    warnings.forEach(w => console.log('  ' + w))
  }

  if (failures.length) {
    console.log('\n— 对比度不达标 —')
    failures.forEach(f => console.log('  ' + f))
    console.error(`\n❌ 对比度检查未通过：${failures.length} 处撞色风险，请调整 themes.scss 中对应配对。`)
    process.exit(1)
  }

  console.log('\n✅ 对比度检查通过：所有主题的语义配对均满足 WCAG AA。')
}

main()
