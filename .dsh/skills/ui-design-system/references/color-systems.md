# Color Systems Reference

## Google Material Design 3 — Dynamic Color

### Tonal Palette 完整结构
Material 3 的色彩系统基于 HCT 色彩空间（Hue, Chroma, Tone）。

**Primary Tonal Palette（主色调）**
```
Tone 100: #FFFFFF  (最亮)
Tone 99:  极浅主色背景
Tone 95:  浅色主色容器
Tone 90:  Primary Container (Light Mode)
Tone 80:  Primary (Dark Mode)
Tone 70:  
Tone 60:  
Tone 50:  
Tone 40:  Primary (Light Mode)
Tone 30:  On Primary Container (Light)
Tone 20:  Primary Container (Dark)
Tone 10:  On Primary (Light / On Primary Container Dark)
Tone 0:   #000000 (最暗)
```

### 完整 Material 3 语义色 Token

```css
:root {
  /* === Light Mode === */

  /* Primary */
  --md-sys-color-primary: #6750A4;
  --md-sys-color-on-primary: #FFFFFF;
  --md-sys-color-primary-container: #EADDFF;
  --md-sys-color-on-primary-container: #21005D;

  /* Secondary */
  --md-sys-color-secondary: #625B71;
  --md-sys-color-on-secondary: #FFFFFF;
  --md-sys-color-secondary-container: #E8DEF8;
  --md-sys-color-on-secondary-container: #1D192B;

  /* Tertiary */
  --md-sys-color-tertiary: #7D5260;
  --md-sys-color-on-tertiary: #FFFFFF;
  --md-sys-color-tertiary-container: #FFD8E4;
  --md-sys-color-on-tertiary-container: #31111D;

  /* Error */
  --md-sys-color-error: #B3261E;
  --md-sys-color-on-error: #FFFFFF;
  --md-sys-color-error-container: #F9DEDC;
  --md-sys-color-on-error-container: #410E0B;

  /* Surface */
  --md-sys-color-surface: #FFFBFE;
  --md-sys-color-on-surface: #1C1B1F;
  --md-sys-color-surface-variant: #E7E0EC;
  --md-sys-color-on-surface-variant: #49454F;
  --md-sys-color-surface-container-lowest: #FFFFFF;
  --md-sys-color-surface-container-low: #F7F2FA;
  --md-sys-color-surface-container: #F3EDF7;
  --md-sys-color-surface-container-high: #ECE6F0;
  --md-sys-color-surface-container-highest: #E6E0E9;

  /* Outline */
  --md-sys-color-outline: #79747E;
  --md-sys-color-outline-variant: #CAC4D0;

  /* Inverse */
  --md-sys-color-inverse-surface: #313033;
  --md-sys-color-inverse-on-surface: #F4EFF4;
  --md-sys-color-inverse-primary: #D0BCFF;

  /* Background */
  --md-sys-color-background: #FFFBFE;
  --md-sys-color-on-background: #1C1B1F;

  /* Shadow & Scrim */
  --md-sys-color-shadow: #000000;
  --md-sys-color-scrim: #000000;
}

/* Dark Mode */
[data-theme="dark"] {
  --md-sys-color-primary: #D0BCFF;
  --md-sys-color-on-primary: #381E72;
  --md-sys-color-primary-container: #4F378B;
  --md-sys-color-on-primary-container: #EADDFF;
  --md-sys-color-secondary: #CCC2DC;
  --md-sys-color-on-secondary: #332D41;
  --md-sys-color-secondary-container: #4A4458;
  --md-sys-color-on-secondary-container: #E8DEF8;
  --md-sys-color-surface: #1C1B1F;
  --md-sys-color-on-surface: #E6E1E5;
  --md-sys-color-surface-container: #211F26;
  --md-sys-color-surface-container-high: #2B2930;
  --md-sys-color-surface-container-highest: #36343B;
  --md-sys-color-outline: #938F99;
  --md-sys-color-background: #1C1B1F;
  --md-sys-color-on-background: #E6E1E5;
}
```

---

## Apple HIG — System Colors

### iOS/macOS 系统色（完整集）
```css
:root {
  /* iOS System Colors (Light) */
  --apple-blue: #007AFF;
  --apple-green: #34C759;
  --apple-indigo: #5856D6;
  --apple-orange: #FF9500;
  --apple-pink: #FF2D55;
  --apple-purple: #AF52DE;
  --apple-red: #FF3B30;
  --apple-teal: #30B0C7;
  --apple-yellow: #FFCC00;
  --apple-cyan: #32ADE6;
  --apple-mint: #00C7BE;
  --apple-brown: #A2845E;

  /* iOS System Grays */
  --apple-gray1: #8E8E93;
  --apple-gray2: #AEAEB2;
  --apple-gray3: #C7C7CC;
  --apple-gray4: #D1D1D6;
  --apple-gray5: #E5E5EA;
  --apple-gray6: #F2F2F7;

  /* iOS System Backgrounds */
  --apple-bg-primary: #FFFFFF;
  --apple-bg-secondary: #F2F2F7;
  --apple-bg-tertiary: #FFFFFF;
  --apple-grouped-bg: #F2F2F7;
  --apple-grouped-bg-secondary: #FFFFFF;

  /* iOS Separators */
  --apple-separator: rgba(60, 60, 67, 0.29);
  --apple-separator-opaque: #C6C6C8;

  /* iOS Label Colors */
  --apple-label: #000000;
  --apple-label-secondary: rgba(60, 60, 67, 0.6);
  --apple-label-tertiary: rgba(60, 60, 67, 0.3);
  --apple-label-quaternary: rgba(60, 60, 67, 0.18);

  /* iOS Fill Colors */
  --apple-fill: rgba(120, 120, 128, 0.2);
  --apple-fill-secondary: rgba(120, 120, 128, 0.16);
  --apple-fill-tertiary: rgba(118, 118, 128, 0.12);
  --apple-fill-quaternary: rgba(116, 116, 128, 0.08);
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --apple-blue: #0A84FF;
    --apple-green: #30D158;
    --apple-indigo: #5E5CE6;
    --apple-orange: #FF9F0A;
    --apple-pink: #FF375F;
    --apple-purple: #BF5AF2;
    --apple-red: #FF453A;
    --apple-teal: #40CBE0;
    --apple-yellow: #FFD60A;
    --apple-cyan: #64D2FF;
    --apple-mint: #63E6E2;

    --apple-gray1: #8E8E93;
    --apple-gray2: #636366;
    --apple-gray3: #48484A;
    --apple-gray4: #3A3A3C;
    --apple-gray5: #2C2C2E;
    --apple-gray6: #1C1C1E;

    --apple-bg-primary: #000000;
    --apple-bg-secondary: #1C1C1E;
    --apple-bg-tertiary: #2C2C2E;

    --apple-label: #FFFFFF;
    --apple-label-secondary: rgba(235, 235, 245, 0.6);
    --apple-label-tertiary: rgba(235, 235, 245, 0.3);
  }
}
```

---

## 精选高级自定义色板

### 1. Midnight Studio（深色科技）
```css
:root {
  --primary: #7C3AED;        /* 紫罗兰主色 */
  --primary-light: #A78BFA;
  --primary-dark: #5B21B6;
  --accent: #10B981;         /* 翡翠绿强调 */
  --accent-warm: #F59E0B;    /* 琥珀暖色 */

  --bg: #09090B;             /* 近黑背景 */
  --bg-2: #18181B;           /* 卡片表面 */
  --bg-3: #27272A;           /* 悬浮层 */
  --border: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.15);

  --text-1: #FAFAFA;
  --text-2: #A1A1AA;
  --text-3: #71717A;

  --shadow-glow: 0 0 40px rgba(124, 58, 237, 0.3);
}
```

### 2. Linen & Oak（人文暖调）
```css
:root {
  --primary: #92400E;        /* 深琥珀 */
  --primary-light: #D97706;
  --accent: #047857;         /* 墨绿 */
  --accent-warm: #9D174D;    /* 酒红 */

  --bg: #FEFCE8;             /* 米黄背景 */
  --bg-2: #FFFBEB;
  --bg-3: #FEF3C7;
  --surface: #FFFFFF;
  --border: rgba(120, 80, 20, 0.12);

  --text-1: #1C1917;
  --text-2: #57534E;
  --text-3: #A8A29E;
}
```

### 3. Arctic Glass（冷感极简）
```css
:root {
  --primary: #0EA5E9;        /* 冰蓝 */
  --primary-light: #38BDF8;
  --primary-dark: #0284C7;
  --accent: #8B5CF6;         /* 淡紫强调 */

  --bg: #F8FAFC;             /* 极浅灰蓝背景 */
  --bg-2: #F1F5F9;
  --bg-3: #E2E8F0;
  --surface: #FFFFFF;
  --glass: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(148, 163, 184, 0.3);

  --text-1: #0F172A;
  --text-2: #475569;
  --text-3: #94A3B8;
}
```

### 4. Tokyo Night（暗色电影感）
```css
:root {
  --primary: #7AA2F7;        /* 东京蓝 */
  --secondary: #BB9AF7;      /* 东京紫 */
  --accent: #7DCFFF;         /* 青蓝 */
  --warn: #FF9E64;           /* 橙色警告 */
  --error: #F7768E;          /* 红色错误 */
  --success: #9ECE6A;        /* 绿色成功 */

  --bg: #1A1B26;             /* 东京暗背景 */
  --bg-2: #16161E;
  --bg-3: #24283B;
  --bg-highlight: #292E42;
  --border: #292E42;

  --text-1: #C0CAF5;
  --text-2: #9AA5CE;
  --text-3: #565F89;
}
```

### 5. Coral Sunrise（活力橙红）
```css
:root {
  --primary: #F97316;        /* 活力橙 */
  --primary-dark: #EA580C;
  --secondary: #EC4899;      /* 玫瑰粉 */
  --accent: #14B8A6;         /* 蒂芙尼绿 */

  --bg: #FFFAF0;             /* 象牙白背景 */
  --bg-2: #FFF7ED;
  --surface: #FFFFFF;
  --border: rgba(249, 115, 22, 0.15);

  --text-1: #1C1917;
  --text-2: #78716C;
  --text-3: #A8A29E;

  --gradient: linear-gradient(135deg, #F97316, #EC4899);
}
```

---

## WCAG 对比度检查速查

| 文字/背景组合 | 对比度 | 是否达标 AA |
|-------------|--------|------------|
| #000 / #FFF | 21:1   | ✅ AAA |
| #1C1B1F / #FFFBFE | 18.1:1 | ✅ AAA |
| #6750A4 / #FFF | 4.6:1 | ✅ AA |
| #8E8E93 / #FFF | 3.9:1 | ⚠️ 仅大文字 |
| #007AFF / #FFF | 4.5:1 | ✅ AA |

**规则提醒：**
- 正文 (≤18pt 非粗体): 最低 4.5:1
- 大文字 (≥18pt 或 ≥14pt 粗体): 最低 3:1
- UI 组件和图形: 最低 3:1
