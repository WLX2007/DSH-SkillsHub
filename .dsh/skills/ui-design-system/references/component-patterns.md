# Component Patterns Library

## Navigation

### Top App Bar (Material 3 + Apple 混合风格)
```html
<header class="top-bar">
  <div class="top-bar__inner">
    <button class="icon-btn" aria-label="Menu">
      <svg><!-- hamburger --></svg>
    </button>
    <h1 class="top-bar__title">Page Title</h1>
    <div class="top-bar__actions">
      <button class="icon-btn" aria-label="Search">
        <svg><!-- search --></svg>
      </button>
      <button class="icon-btn" aria-label="More">
        <svg><!-- more --></svg>
      </button>
    </div>
  </div>
</header>

<style>
.top-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--surface);
  border-bottom: 1px solid var(--outline-variant);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: rgba(255, 251, 254, 0.8);
}
.top-bar__inner {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 64px;
  padding: 0 8px;
  max-width: 1280px;
  margin: 0 auto;
}
.top-bar__title {
  flex: 1;
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--on-surface);
}
.icon-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 150ms;
}
.icon-btn:hover { background: var(--on-surface-variant-8, rgba(73,69,79,0.08)); }
.icon-btn:active { background: var(--on-surface-variant-12, rgba(73,69,79,0.12)); }
</style>
```

### Side Navigation Rail (Material 3)
```html
<nav class="nav-rail">
  <div class="nav-rail__fab">
    <button class="fab-btn">+</button>
  </div>
  <ul class="nav-rail__list">
    <li class="nav-item active">
      <div class="nav-item__indicator">
        <svg class="nav-item__icon"><!-- icon --></svg>
      </div>
      <span class="nav-item__label">Home</span>
    </li>
    <!-- more items -->
  </ul>
</nav>

<style>
.nav-rail {
  width: 80px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  background: var(--surface);
}
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  cursor: pointer;
  min-width: 72px;
}
.nav-item__indicator {
  width: 56px;
  height: 32px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  transition: background 200ms;
}
.nav-item.active .nav-item__indicator {
  background: var(--secondary-container);
}
.nav-item:hover:not(.active) .nav-item__indicator {
  background: var(--on-surface-8);
}
.nav-item__label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--on-surface-variant);
}
.nav-item.active .nav-item__label {
  color: var(--on-surface);
  font-weight: 700;
}
</style>
```

---

## Cards

### Product Card (Pinterest 风格)
```html
<article class="product-card">
  <div class="product-card__img-wrap">
    <img class="product-card__img" src="..." alt="...">
    <button class="product-card__save">♡</button>
  </div>
  <div class="product-card__body">
    <p class="product-card__category">Category</p>
    <h3 class="product-card__title">Product Name</h3>
    <div class="product-card__footer">
      <span class="product-card__price">$99</span>
      <button class="product-card__cta">Add to Cart</button>
    </div>
  </div>
</article>

<style>
.product-card {
  border-radius: 16px;
  overflow: hidden;
  background: var(--surface);
  transition: transform 300ms var(--ease-spring), box-shadow 300ms;
  cursor: pointer;
}
.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.12);
}
.product-card__img-wrap {
  position: relative;
  aspect-ratio: 4/3;
  overflow: hidden;
}
.product-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 600ms var(--ease-decelerate);
}
.product-card:hover .product-card__img {
  transform: scale(1.04);
}
.product-card__save {
  position: absolute;
  top: 12px; right: 12px;
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(8px);
  border: none;
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 200ms, transform 200ms var(--ease-spring);
}
.product-card:hover .product-card__save {
  opacity: 1;
  transform: scale(1);
}
.product-card__body {
  padding: 16px;
}
.product-card__category {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary);
  margin-bottom: 4px;
}
.product-card__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--on-surface);
  margin-bottom: 12px;
  line-height: 1.3;
}
.product-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.product-card__price {
  font-size: 20px;
  font-weight: 700;
  color: var(--on-surface);
  letter-spacing: -0.02em;
}
.product-card__cta {
  padding: 8px 16px;
  border-radius: 20px;
  background: var(--primary);
  color: var(--on-primary);
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 150ms, transform 150ms;
}
.product-card__cta:hover { filter: brightness(1.1); }
.product-card__cta:active { transform: scale(0.96); }
</style>
```

### Stats Card (Dashboard)
```html
<div class="stat-card">
  <div class="stat-card__header">
    <span class="stat-card__label">Total Revenue</span>
    <div class="stat-card__icon-wrap">
      <svg><!-- icon --></svg>
    </div>
  </div>
  <p class="stat-card__value">$48,295</p>
  <div class="stat-card__change positive">
    <svg><!-- arrow up --></svg>
    <span>+12.5% from last month</span>
  </div>
</div>

<style>
.stat-card {
  background: var(--surface);
  border-radius: 20px;
  padding: 24px;
  border: 1px solid var(--outline-variant);
  transition: box-shadow 200ms;
}
.stat-card:hover {
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}
.stat-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}
.stat-card__label {
  font-size: 14px;
  color: var(--on-surface-variant);
  font-weight: 500;
}
.stat-card__icon-wrap {
  width: 40px; height: 40px;
  border-radius: 12px;
  background: var(--primary-container);
  display: grid;
  place-items: center;
  color: var(--primary);
}
.stat-card__value {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--on-surface);
  margin-bottom: 8px;
  font-feature-settings: 'tnum';
}
.stat-card__change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
}
.stat-card__change.positive { color: #16A34A; }
.stat-card__change.negative { color: #DC2626; }
</style>
```

---

## Forms

### Floating Label Input (Material 3)
```html
<div class="text-field">
  <div class="text-field__container">
    <input type="text" id="email" class="text-field__input" placeholder=" ">
    <label for="email" class="text-field__label">Email address</label>
    <fieldset class="text-field__border"><legend><span>Email address</span></legend></fieldset>
  </div>
  <span class="text-field__helper">We'll never share your email</span>
</div>

<style>
.text-field { display: flex; flex-direction: column; gap: 4px; }
.text-field__container {
  position: relative;
  height: 56px;
}
.text-field__input {
  width: 100%;
  height: 100%;
  padding: 16px 16px 0;
  font-size: 16px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--on-surface);
  z-index: 1;
  position: relative;
}
.text-field__label {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  color: var(--on-surface-variant);
  pointer-events: none;
  transition: all 150ms var(--ease-standard);
  z-index: 2;
  background: var(--surface);
  padding: 0 4px;
}
.text-field__input:focus + .text-field__label,
.text-field__input:not(:placeholder-shown) + .text-field__label {
  top: 0;
  font-size: 12px;
  font-weight: 500;
}
.text-field__input:focus + .text-field__label { color: var(--primary); }
.text-field__border {
  position: absolute;
  inset: 0;
  margin: 0;
  border: 1.5px solid var(--outline);
  border-radius: 4px;
  pointer-events: none;
  padding: 0 12px;
  transition: border-color 150ms, border-width 150ms;
}
.text-field__input:focus ~ .text-field__border {
  border-color: var(--primary);
  border-width: 2px;
}
.text-field__border legend { height: 0; font-size: 12px; font-weight: 500; padding: 0; }
.text-field__input:focus ~ .text-field__border legend,
.text-field__input:not(:placeholder-shown) ~ .text-field__border legend {
  padding: 0 4px;
}
.text-field__helper {
  font-size: 12px;
  color: var(--on-surface-variant);
  padding: 0 16px;
}
</style>
```

---

## Buttons — Complete System

```html
<!-- Primary (Filled) -->
<button class="btn btn--filled">Get Started</button>

<!-- Secondary (Filled Tonal) -->
<button class="btn btn--tonal">Learn More</button>

<!-- Outlined -->
<button class="btn btn--outlined">Cancel</button>

<!-- Text -->
<button class="btn btn--text">Skip</button>

<!-- Elevated -->
<button class="btn btn--elevated">Save Draft</button>

<!-- Icon + Label -->
<button class="btn btn--filled btn--icon">
  <svg><!-- icon --></svg>
  Add Item
</button>

<!-- Loading State -->
<button class="btn btn--filled btn--loading" disabled>
  <span class="btn__spinner"></span>
  Loading...
</button>

<style>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 24px;
  border-radius: 20px;  /* Material 3 全圆角 */
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.01em;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: all 150ms var(--ease-standard);
  position: relative;
  overflow: hidden;
}
.btn:disabled { opacity: 0.38; cursor: not-allowed; }
.btn:active:not(:disabled) { transform: scale(0.97); }

/* State layer */
.btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: currentColor;
  opacity: 0;
  transition: opacity 150ms;
}
.btn:hover::after { opacity: 0.08; }
.btn:active::after { opacity: 0.12; }

/* Variants */
.btn--filled { background: var(--primary); color: var(--on-primary); }
.btn--filled:hover { box-shadow: 0 1px 2px rgba(0,0,0,.1), 0 2px 6px rgba(0,0,0,.08); }

.btn--tonal { background: var(--secondary-container); color: var(--on-secondary-container); }
.btn--tonal:hover { box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 2px 6px rgba(0,0,0,.06); }

.btn--outlined {
  background: transparent;
  color: var(--primary);
  border: 1px solid var(--outline);
}
.btn--outlined:hover { background: rgba(103, 80, 164, 0.08); }

.btn--text { background: transparent; color: var(--primary); padding: 0 12px; }

.btn--elevated {
  background: var(--surface-container-low);
  color: var(--primary);
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.08);
}
.btn--elevated:hover { box-shadow: 0 2px 4px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.1); }

/* Spinner */
.btn__spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
```

---

## Feedback Components

### Toast / Snackbar (Material 3)
```html
<div class="snackbar" role="status">
  <span class="snackbar__message">Changes saved successfully</span>
  <button class="snackbar__action">Undo</button>
  <button class="snackbar__close" aria-label="Close">✕</button>
</div>

<style>
.snackbar {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 288px;
  max-width: 568px;
  background: var(--inverse-surface);
  color: var(--inverse-on-surface);
  border-radius: 4px;
  padding: 14px 16px;
  box-shadow: 0 3px 5px rgba(0,0,0,.1), 0 8px 24px rgba(0,0,0,.14);
  font-size: 14px;
  animation: snackbar-in 300ms var(--ease-decelerate) forwards;
}
@keyframes snackbar-in {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.snackbar__message { flex: 1; }
.snackbar__action {
  background: none; border: none;
  color: var(--inverse-primary);
  font-size: 14px; font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 150ms;
}
.snackbar__action:hover { background: rgba(255,255,255,0.1); }
.snackbar__close {
  background: none; border: none;
  color: var(--inverse-on-surface);
  cursor: pointer; font-size: 18px; line-height: 1;
  opacity: 0.7; transition: opacity 150ms;
}
</style>
```

### Badge
```css
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--error);
  color: var(--on-error);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}
.badge--dot {
  width: 8px; height: 8px;
  padding: 0; min-width: unset;
  border-radius: 50%;
}
.badge--large {
  min-width: 24px; height: 24px;
  border-radius: 12px;
  font-size: 12px;
  padding: 0 8px;
}
```

---

## Page Skeleton / Loading

```html
<div class="skeleton-card">
  <div class="skeleton skeleton--image"></div>
  <div class="skeleton-card__body">
    <div class="skeleton skeleton--line" style="width: 60%"></div>
    <div class="skeleton skeleton--line" style="width: 90%"></div>
    <div class="skeleton skeleton--line" style="width: 75%"></div>
  </div>
</div>

<style>
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-variant) 25%,
    var(--surface-container) 50%,
    var(--surface-variant) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}
.skeleton--image { width: 100%; aspect-ratio: 16/9; border-radius: 12px 12px 0 0; }
.skeleton--line { height: 14px; margin-bottom: 8px; border-radius: 7px; }
</style>
```
