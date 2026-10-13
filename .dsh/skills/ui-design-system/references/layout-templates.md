# Layout Templates Reference

## Dashboard Layout (Material 3 Canonical)

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>

<div class="app-shell">
  <!-- Side Navigation -->
  <aside class="nav-drawer">
    <div class="nav-drawer__header">
      <div class="brand">
        <div class="brand__icon">◈</div>
        <span class="brand__name">AppName</span>
      </div>
    </div>
    <nav class="nav-list">
      <a href="#" class="nav-link active">
        <svg class="nav-link__icon" viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        </svg>
        <span>Dashboard</span>
      </a>
      <!-- more links -->
    </nav>
  </aside>

  <!-- Main Content -->
  <div class="main-content">
    <!-- Top Bar -->
    <header class="top-bar">
      <h1 class="page-title">Overview</h1>
      <div class="top-bar__actions">
        <button class="icon-btn">🔔</button>
        <div class="avatar">JD</div>
      </div>
    </header>

    <!-- Content Area -->
    <main class="content-area">
      <!-- Stats Row -->
      <div class="stats-grid">
        <!-- stat cards here -->
      </div>
      <!-- Charts -->
      <div class="charts-grid">
        <!-- chart cards here -->
      </div>
    </main>
  </div>
</div>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --primary: #6750A4;
  --primary-container: #EADDFF;
  --on-primary-container: #21005D;
  --secondary-container: #E8DEF8;
  --surface: #FFFBFE;
  --surface-container: #F3EDF7;
  --surface-container-low: #F7F2FA;
  --on-surface: #1C1B1F;
  --on-surface-variant: #49454F;
  --outline: #79747E;
  --outline-variant: #CAC4D0;
  --nav-width: 256px;
}

body {
  font-family: 'Manrope', system-ui, sans-serif;
  background: var(--surface-container-low);
  color: var(--on-surface);
  min-height: 100vh;
}

.app-shell {
  display: flex;
  min-height: 100vh;
}

/* Nav Drawer */
.nav-drawer {
  width: var(--nav-width);
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--surface-container-low);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--outline-variant);
  padding: 16px 12px;
  flex-shrink: 0;
}

.nav-drawer__header { padding: 8px 12px 24px; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand__icon {
  width: 40px; height: 40px;
  background: var(--primary);
  color: white;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 20px;
}
.brand__name { font-size: 18px; font-weight: 700; color: var(--on-surface); }

.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 28px;
  text-decoration: none;
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 500;
  transition: background 150ms, color 150ms;
  margin-bottom: 4px;
}
.nav-link:hover { background: rgba(103,80,164,0.08); color: var(--on-surface); }
.nav-link.active {
  background: var(--secondary-container);
  color: var(--on-surface);
  font-weight: 700;
}
.nav-link__icon { width: 20px; height: 20px; flex-shrink: 0; }

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-bar {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  background: var(--surface-container-low);
  border-bottom: 1px solid var(--outline-variant);
  position: sticky;
  top: 0;
  z-index: 10;
}
.page-title { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
.top-bar__actions { display: flex; align-items: center; gap: 8px; }

.avatar {
  width: 36px; height: 36px;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.content-area { padding: 32px; overflow-y: auto; flex: 1; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.charts-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

@media (max-width: 768px) {
  .nav-drawer { display: none; }
  .charts-grid { grid-template-columns: 1fr; }
}
</style>
```

---

## Landing Page Layout

```html
<!-- Hero Section -->
<section class="hero">
  <div class="hero__container">
    <div class="hero__eyebrow">
      <span class="badge-pill">New →</span>
      <span>Introducing v2.0</span>
    </div>
    <h1 class="hero__headline">
      Build beautiful apps<br>
      <span class="hero__gradient-text">10x faster</span>
    </h1>
    <p class="hero__description">
      The design system that scales with your team.
      Beautiful by default, customizable by design.
    </p>
    <div class="hero__ctas">
      <a href="#" class="btn btn--primary btn--lg">Get Started Free</a>
      <a href="#" class="btn btn--ghost btn--lg">View Demo ↗</a>
    </div>
    <div class="hero__social-proof">
      <div class="avatar-stack">
        <img src="..." alt="">
        <img src="..." alt="">
        <img src="..." alt="">
        <img src="..." alt="">
      </div>
      <p><strong>2,000+</strong> teams already building</p>
    </div>
  </div>
  <div class="hero__visual">
    <!-- Product Screenshot / Illustration -->
  </div>
</section>

<style>
.hero {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 64px;
  padding: 80px clamp(24px, 5vw, 80px);
  max-width: 1280px;
  margin: 0 auto;
}
.hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--on-surface-variant);
  margin-bottom: 24px;
}
.badge-pill {
  background: var(--primary-container);
  color: var(--on-primary-container);
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.hero__headline {
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.05;
  color: var(--on-surface);
  margin-bottom: 24px;
}
.hero__gradient-text {
  background: linear-gradient(135deg, var(--primary), var(--tertiary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero__description {
  font-size: clamp(16px, 2vw, 20px);
  line-height: 1.6;
  color: var(--on-surface-variant);
  max-width: 48ch;
  margin-bottom: 40px;
}
.hero__ctas {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 40px;
}
.btn--lg { height: 52px; padding: 0 32px; font-size: 16px; }
.btn--ghost {
  background: transparent;
  color: var(--on-surface);
  border: 1.5px solid var(--outline-variant);
  border-radius: 26px;
}
.btn--ghost:hover { background: var(--surface-variant); }
.hero__social-proof {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--on-surface-variant);
}
.avatar-stack {
  display: flex;
}
.avatar-stack img {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  margin-right: -8px;
  object-fit: cover;
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
    text-align: center;
    min-height: auto;
    padding-top: 100px;
  }
  .hero__visual { display: none; }
  .hero__ctas { justify-content: center; }
  .hero__social-proof { justify-content: center; }
}
</style>
```

---

## Mobile App Layout (iOS-like)

```html
<div class="app">
  <!-- Status Bar placeholder -->
  <div class="status-bar"></div>
  
  <!-- Content -->
  <main class="app-content">
    <!-- Large Title (iOS style) -->
    <div class="large-title-area">
      <h1 class="large-title">My Library</h1>
      <button class="circle-btn">+</button>
    </div>

    <!-- Search Bar (iOS style) -->
    <div class="search-bar">
      <span class="search-icon">🔍</span>
      <input type="search" placeholder="Search" class="search-input">
    </div>

    <!-- Horizontal Scroll Section -->
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">Featured</h2>
        <a href="#" class="see-all">See All</a>
      </div>
      <div class="h-scroll">
        <!-- cards -->
      </div>
    </section>
  </main>

  <!-- Tab Bar (iOS style) -->
  <nav class="tab-bar">
    <button class="tab-item active">
      <svg class="tab-icon"><!-- icon --></svg>
      <span class="tab-label">Home</span>
    </button>
    <button class="tab-item">
      <svg class="tab-icon"><!-- icon --></svg>
      <span class="tab-label">Explore</span>
    </button>
    <button class="tab-item">
      <svg class="tab-icon"><!-- icon --></svg>
      <span class="tab-label">Library</span>
    </button>
    <button class="tab-item">
      <svg class="tab-icon"><!-- icon --></svg>
      <span class="tab-label">Profile</span>
    </button>
  </nav>
</div>

<style>
.app {
  width: 390px; /* iPhone 14 width */
  height: 844px;
  background: var(--bg-primary, #F2F2F7);
  border-radius: 44px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: 0 32px 80px rgba(0,0,0,0.3);
  font-family: -apple-system, 'SF Pro Display', system-ui;
}
.status-bar {
  height: 47px;
  background: transparent;
  flex-shrink: 0;
}
.app-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px;
  -webkit-overflow-scrolling: touch;
}
.app-content::-webkit-scrollbar { display: none; }
.large-title-area {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 8px 0 20px;
}
.large-title {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--apple-label, #000);
}
.circle-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--apple-fill, rgba(120,120,128,0.2));
  border: none;
  font-size: 22px;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--apple-blue, #007AFF);
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(118, 118, 128, 0.12);
  border-radius: 10px;
  padding: 0 12px;
  height: 36px;
  margin-bottom: 24px;
}
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 17px;
  color: var(--apple-label, #000);
}
.section { margin-bottom: 32px; }
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}
.section-title { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
.see-all { font-size: 15px; color: var(--apple-blue, #007AFF); text-decoration: none; }
.h-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  margin: 0 -20px;
  padding: 0 20px 4px;
  scrollbar-width: none;
}
.h-scroll::-webkit-scrollbar { display: none; }

/* Tab Bar */
.tab-bar {
  height: 83px;
  background: rgba(249, 249, 249, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 0.5px solid rgba(0,0,0,0.12);
  display: flex;
  align-items: flex-start;
  padding: 8px 0 0;
  flex-shrink: 0;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  color: var(--apple-gray1, #8E8E93);
  transition: color 150ms;
}
.tab-item.active { color: var(--apple-blue, #007AFF); }
.tab-icon { width: 26px; height: 26px; }
.tab-label { font-size: 10px; font-weight: 500; letter-spacing: -0.01em; }
</style>
```
