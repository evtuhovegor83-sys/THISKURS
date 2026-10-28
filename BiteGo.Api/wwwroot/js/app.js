// ==========================================================================
// BiteGo («Быстрый Укус») — Главный SPA контроллер приложения
// ==========================================================================

import { api } from './api.js';
import { showToast, formatPrice, formatDate } from './ui.js';
import { 
    initCart, 
    addToCart, 
    updateQuantity, 
    clearCart, 
    getCartItems, 
    getCartSubtotal, 
    getBonusDiscount, 
    getFinalTotal, 
    setBonusUsage 
} from './cart.js';

let currentUser = null;
let activePollingInterval = null;
let debounceTimeout = null;

// ==========================================================================
// 1. ИНИЦИАЛИЗАЦИЯ И РОУТЕР
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    initCart();
    initCity();
    await checkAuth();
    loadDemoAccounts();
    handleRoute();

    window.addEventListener('hashchange', () => {
        if (activePollingInterval) {
            clearInterval(activePollingInterval);
            activePollingInterval = null;
        }
        if (trackerTimerInterval) {
            clearInterval(trackerTimerInterval);
            trackerTimerInterval = null;
        }
        handleRoute();
    });
});

export function navigateTo(path) {
    window.location.hash = path;
}
window.navigateTo = navigateTo;

function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const [path, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString || '');

    // Обновляем активные ссылки в шапке
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    if (path === '/' || path === '') {
        document.querySelector('.nav-links a:first-child')?.classList.add('active');
        renderHome();
    } else if (path === '/menu') {
        document.querySelector('.nav-links a:nth-child(2)')?.classList.add('active');
        const catId = params.get('cat') ? parseInt(params.get('cat')) : null;
        renderMenu(catId);
    } else if (path === '/about') {
        document.querySelector('.nav-links a:nth-child(3)')?.classList.add('active');
        renderAbout();
    } else if (path === '/profile') {
        document.querySelector('.nav-links a:nth-child(4)')?.classList.add('active');
        renderProfile();
    } else if (path === '/admin') {
        document.getElementById('adminNavLink')?.classList.add('active');
        renderAdmin();
    } else if (path === '/tracker') {
        const orderId = params.get('id') ? parseInt(params.get('id')) : null;
        renderTracker(orderId);
    } else {
        renderHome();
    }
}

// ==========================================================================
// 2. АУТЕНТИФИКАЦИЯ И ДЕМО-РЕЖИМ
// ==========================================================================

async function checkAuth() {
    const token = localStorage.getItem('token');
    const authBtnContainer = document.getElementById('authBtnContainer');
    const bonusBadge = document.getElementById('userBonusBadge');
    const bonusValue = document.getElementById('userBonusValue');
    const adminLink = document.getElementById('adminNavLink');

    if (!token) {
        currentUser = null;
        window.currentUser = null;
        if (authBtnContainer) {
            authBtnContainer.innerHTML = `
                <button class="btn-secondary" onclick="window.openAuthModal()">
                    <span>👤</span>
                    <span>Войти</span>
                </button>
            `;
        }
        if (bonusBadge) bonusBadge.style.display = 'none';
        if (adminLink) adminLink.style.display = 'none';
        return;
    }

    try {
        const res = await api.auth.getProfile();
        if (res.ok) {
            const data = await res.json();
            currentUser = data;
            window.currentUser = data;

            if (authBtnContainer) {
                authBtnContainer.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <button class="btn-secondary" onclick="window.navigateTo('/profile')">
                            <span>👤</span>
                            <span>${data.fullName.split(' ')[0]}</span>
                        </button>
                        <button class="btn-secondary" style="padding: 0.5rem 0.9rem; font-size: 0.85rem; font-weight: 600;" title="Выйти из аккаунта" onclick="window.handleLogout()">
                            Выйти
                        </button>
                    </div>
                `;
            }

            if (bonusBadge && bonusValue) {
                bonusBadge.style.display = 'flex';
                bonusValue.textContent = data.bonusPoints;
            }

            if (adminLink) {
                adminLink.style.display = data.role === 'admin' ? 'inline-block' : 'none';
            }
        } else {
            handleLogout();
        }
    } catch {
        // Оффлайн или ошибка связи
    }
}

export function handleLogout() {
    localStorage.removeItem('token');
    currentUser = null;
    clearCart();
    checkAuth();
    showToast('Вы вышли из системы');
    navigateTo('/');
}
window.handleLogout = handleLogout;

async function loadDemoAccounts() {
    try {
        const res = await fetch('/api/auth/demo-accounts');
        if (!res.ok) return;
        const accounts = await res.json();
        const container = document.getElementById('demoChipsContainer');
        if (!container) return;

        container.innerHTML = accounts.map(acc => `
            <button type="button" class="btn-secondary" style="font-size: 0.8rem; justify-content: space-between; padding: 0.45rem 0.85rem;" 
                    onclick="window.fillDemoAccount('${acc.phone}', '${acc.password}')">
                <span><strong>${acc.name}</strong></span>
                <span style="color: var(--primary);">Войти →</span>
            </button>
        `).join('');
    } catch {
        const section = document.getElementById('demoAccountsSection');
        if (section) section.style.display = 'none';
    }
}

window.fillDemoAccount = (phone, password) => {
    document.getElementById('loginPhone').value = phone;
    document.getElementById('loginPassword').value = password;
    showToast('Тестовые данные подставлены. Нажмите «Войти».', 'info');
};

window.openAuthModal = () => document.getElementById('authModal')?.classList.add('open');
window.closeAuthModal = () => document.getElementById('authModal')?.classList.remove('open');

window.switchAuthTab = (tab) => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLoginBtn');
    const tabRegister = document.getElementById('tabRegisterBtn');

    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        tabLogin.className = 'btn-primary';
        tabRegister.className = 'btn-secondary';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        tabLogin.className = 'btn-secondary';
        tabRegister.className = 'btn-primary';
    }
};

window.handleLoginSubmit = async (e) => {
    e.preventDefault();
    const phone = document.getElementById('loginPhone').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await api.auth.login(phone, password);
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            clearCart();
            window.closeAuthModal();
            await checkAuth();
            showToast(`С возвращением, ${data.user.fullName}!`, 'success');

            if (data.user.role === 'admin') {
                navigateTo('/admin');
            } else {
                navigateTo('/menu');
            }
        } else {
            showToast(data.message || 'Ошибка входа', 'error');
        }
    } catch (err) {
        showToast('Сервер недоступен: ' + err.message, 'error');
    }
};

window.handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
        const res = await api.auth.register({ fullName, phone, email, password });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            clearCart();
            window.closeAuthModal();
            await checkAuth();
            showToast(`Регистрация успешна! Вам начислено 100 бонусов.`, 'success');
            navigateTo('/menu');
        } else {
            showToast(data.message || 'Ошибка регистрации', 'error');
        }
    } catch (err) {
        showToast('Ошибка регистрации: ' + err.message, 'error');
    }
};

// ==========================================================================
// 3. СТРАНИЦА: ГЛАВНАЯ (HOME)
// ==========================================================================

async function renderHome() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <!-- HERO SECTION -->
        <section class="hero">
            <div class="hero-content">
                <div>
                    <div class="hero-tag">
                        <span>⚡</span>
                        <span>Быстрая доставка горячей еды в Балашове</span>
                    </div>
                    <h1 class="hero-title">
                        Вкус, ради которого стоит <span>укусить!</span>
                    </h1>
                    <p class="hero-desc">
                        Настоящая пицца на пышном тесте, сочные бургеры из мраморной говядины и свежие роллы. Доставка курьером до вашей двери всего за 35 минут.
                    </p>
                    <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                        <button class="btn-primary" style="padding: 0.85rem 1.8rem; font-size: 1.05rem;" onclick="window.navigateTo('/menu')">
                            Перейти в меню 🍕
                        </button>
                        <button class="btn-secondary" style="padding: 0.85rem 1.4rem;" onclick="window.navigateTo('/about')">
                            О сервисе
                        </button>
                    </div>
                    <div class="hero-features">
                        <div class="hero-feat-item">
                            <span>⏱️</span>
                            <span>До 35 минут</span>
                        </div>
                        <div class="hero-feat-item">
                            <span>💎</span>
                            <span>5% кэшбэк бонусами</span>
                        </div>
                        <div class="hero-feat-item">
                            <span>🌿</span>
                            <span>Свежие продукты</span>
                        </div>
                        <div class="hero-feat-item">
                            <span>🚗</span>
                            <span>Живой трекер курьера</span>
                        </div>
                    </div>
                </div>

                <div class="hero-card-preview">
                    <div class="hero-banner-card">
                        <div class="hero-banner-badge">ХИТ СЕЗОНА</div>
                        <img src="/assets/images/product-6.jpg" alt="Бургер Байт Шеф">
                        <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.35rem;">Бургер «Байт Шеф»</h3>
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Рубленая мраморная говядина, сыр чеддер, карамелизированный лук на бриошь булочке.</p>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 1.4rem; font-weight: 800; color: var(--primary);">480 ₽</span>
                            <button class="btn-primary" style="padding: 0.45rem 1rem;" onclick="window.openCustomizer(6)">Выбрать</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- POPULAR DISHES PREVIEW -->
        <section class="catalog-section">
            <div class="section-header">
                <div>
                    <h2>Популярные блюда BiteGo</h2>
                    <p style="color: var(--text-muted); font-size: 0.95rem;">То, что жители города заказывают чаще всего</p>
                </div>
                <button class="btn-secondary" onclick="window.navigateTo('/menu')">Смотреть всё меню →</button>
            </div>
            <div id="homePopularGrid" class="products-grid">
                <div style="padding: 2rem; color: var(--text-muted);">Загрузка популярных блюд...</div>
            </div>
        </section>

        <!-- PUBLIC REVIEWS SECTION -->
        <section class="catalog-section" style="margin-top: 1rem;">
            <div class="section-header" style="flex-wrap: wrap; gap: 0.75rem;">
                <div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                        <span style="color: #FBBF24; font-size: 1.15rem; letter-spacing: 2px;">★★★★★</span>
                        <strong style="color: #FFF; font-size: 1.05rem;" id="homeAvgRatingBadge">4.9 / 5</strong>
                        <span style="color: var(--text-muted); font-size: 0.82rem;">(на основе оценок реальных гостей)</span>
                    </div>
                    <h2>Отзывы наших покупателей</h2>
                    <p style="color: var(--text-muted); font-size: 0.92rem;">Реальные отзывы клиентов о вкусе блюд и скорости работы курьеров</p>
                </div>
            </div>
            <div id="homeReviewsGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem;">
                <div style="padding: 1.5rem; color: var(--text-muted);">Загрузка отзывов...</div>
            </div>
        </section>
    `;

    // Загружаем первые 4 популярных блюда
    try {
        const res = await api.menu.getProducts();
        if (res.ok) {
            const products = await res.json();
            const popular = products.slice(0, 4);
            const grid = document.getElementById('homePopularGrid');
            if (grid) {
                grid.innerHTML = popular.map(p => renderFoodCard(p)).join('');
            }
        }
    } catch {}

    // Загружаем публичные отзывы для гостей
    try {
        const rRes = await api.menu.getReviews();
        if (rRes.ok) {
            const data = await rRes.json();
            const badge = document.getElementById('homeAvgRatingBadge');
            if (badge && data.averageRating) badge.textContent = `${data.averageRating} / 5`;
            const rGrid = document.getElementById('homeReviewsGrid');
            if (rGrid && data.reviews && data.reviews.length > 0) {
                const avatarGradients = [
                    'linear-gradient(135deg, #FF5A1F, #FF8A4C)',
                    'linear-gradient(135deg, #EC4899, #8B5CF6)',
                    'linear-gradient(135deg, #3B82F6, #06B6D4)',
                    'linear-gradient(135deg, #10B981, #059669)',
                    'linear-gradient(135deg, #F59E0B, #D97706)'
                ];

                rGrid.innerHTML = data.reviews.map((r, idx) => {
                    const grad = avatarGradients[idx % avatarGradients.length];
                    const nameParts = (r.customerName || 'Гость').trim().split(/\s+/);
                    const initials = nameParts.length >= 2 
                        ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                        : (nameParts[0][0] || 'Г').toUpperCase();

                    return `
                        <div class="review-card">
                            <div style="position: absolute; right: 1rem; bottom: 0.5rem; font-size: 3.5rem; line-height: 1; color: rgba(255, 255, 255, 0.03); font-family: Georgia, serif; pointer-events: none; user-select: none;">❞</div>

                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.85rem; gap: 0.5rem;">
                                    <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
                                        <div class="review-avatar" style="background: ${grad};">
                                            ${initials}
                                        </div>
                                        <div style="min-width: 0;">
                                            <div style="font-weight: 700; font-size: 0.95rem; color: #FFFFFF; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                ${r.customerName}
                                            </div>
                                            <div class="review-verified-badge" style="margin-top: 0.2rem;">
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                                <span>Проверенный заказ</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span style="font-size: 0.75rem; color: var(--text-dim); white-space: nowrap; flex-shrink: 0; margin-top: 0.2rem;">
                                        ${formatDate(r.createdAt)}
                                    </span>
                                </div>

                                <div style="display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.65rem;">
                                    <div style="color: #FBBF24; font-size: 0.95rem; letter-spacing: 2px;">
                                        ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
                                    </div>
                                    <span style="font-size: 0.78rem; font-weight: 800; color: #FBBF24; background: rgba(251, 191, 36, 0.12); padding: 0.1rem 0.45rem; border-radius: var(--radius-full);">
                                        ${r.rating}.0
                                    </span>
                                </div>

                                ${r.orderedDishes && r.orderedDishes.length > 0 ? `
                                    <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem;">
                                        ${r.orderedDishes.map(d => `
                                            <span class="review-dish-chip">
                                                <span style="opacity: 0.75;">🍽️</span>
                                                <span>${d}</span>
                                            </span>
                                        `).join('')}
                                    </div>
                                ` : ''}

                                <p style="color: #E2E8F0; font-size: 0.88rem; line-height: 1.55; margin: 0; font-style: normal;">
                                    «${r.comment || 'Блюда очень понравились, доставка точно вовремя!'}»
                                </p>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch {}
}

// ==========================================================================
// 4. СТРАНИЦА: КАТАЛОГ И МЕНЮ (MENU)
// ==========================================================================

let allProductsCache = [];
let currentCategoryFilter = null;

async function renderMenu(initialCategoryId = null) {
    currentCategoryFilter = initialCategoryId;
    const content = document.getElementById('content');

    content.innerHTML = `
        <!-- CATEGORY STICKY BAR -->
        <div class="category-bar-wrapper">
            <div class="category-bar">
                <div id="categoryChipsList" class="category-chips">
                    <button class="category-chip ${!initialCategoryId ? 'active' : ''}" onclick="window.filterCategory(null)">
                        <span>✨</span>
                        <span>Все блюда</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- PRODUCTS GRID -->
        <section class="catalog-section">
            <div class="section-header">
                <div>
                    <h2 id="catalogCategoryTitle">Наше меню</h2>
                    <p id="catalogSubtitle" style="color: var(--text-muted); font-size: 0.95rem;">Свежие ингредиенты и порции ресторанного качества</p>
                </div>
            </div>
            <div id="menuProductsGrid" class="products-grid">
                <div style="padding: 2rem; color: var(--text-muted);">Загружаем блюда...</div>
            </div>
        </section>
    `;

    // Загружаем категории
    try {
        const catRes = await api.menu.getCategories();
        if (catRes.ok) {
            const categories = await catRes.json();
            const chipsEl = document.getElementById('categoryChipsList');
            if (chipsEl) {
                chipsEl.innerHTML = `
                    <button class="category-chip ${!currentCategoryFilter ? 'active' : ''}" onclick="window.filterCategory(null)">
                        <span>✨</span>
                        <span>Все блюда</span>
                    </button>
                    ${categories.map(c => `
                        <button class="category-chip ${currentCategoryFilter === c.id ? 'active' : ''}" onclick="window.filterCategory(${c.id})">
                            <span>${c.icon}</span>
                            <span>${c.name}</span>
                        </button>
                    `).join('')}
                `;
            }
        }
    } catch {}

    // Загружаем товары
    loadMenuProducts();
}

async function loadMenuProducts() {
    const grid = document.getElementById('menuProductsGrid');
    if (!grid) return;

    try {
        const res = await api.menu.getProducts(currentCategoryFilter);
        if (res.ok) {
            allProductsCache = await res.json();
            renderProductsList(allProductsCache);
        }
    } catch {
        grid.innerHTML = '<div style="color: var(--danger);">Ошибка загрузки меню. Проверьте подключение к базе данных.</div>';
    }
}

function renderProductsList(products) {
    const grid = document.getElementById('menuProductsGrid');
    if (!grid) return;

    if (products.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">🔍</div>
                <h3>Ничего не найдено</h3>
                <p>Попробуйте изменить поисковый запрос или выбрать другую категорию</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = products.map(p => renderFoodCard(p)).join('');
}

function renderFoodCard(p) {
    const isOut = p.stockQuantity <= 0;
    return `
        <div class="food-card ${isOut ? 'out-of-stock' : ''}">
            <div class="food-card-img-wrap" onclick="window.openCustomizer(${p.id})">
                <img src="${p.imageUrl}" class="food-card-img" alt="${p.name}" loading="lazy">
                
                ${isOut 
                    ? `<span class="stock-tag out">❌ Нет в наличии</span>` 
                    : `<span class="stock-tag in-stock">В наличии: ${p.stockQuantity} шт.</span>`
                }

                <span class="rating-tag">⭐ ${p.rating}</span>
                <span class="cooking-tag">⏱️ ${p.cookingTimeMinutes} мин</span>
            </div>

            <div class="food-card-body">
                <div class="food-card-title" onclick="window.openCustomizer(${p.id})">${p.name}</div>
                <div class="food-card-desc">${p.description}</div>

                <div class="food-card-footer">
                    <div>
                        <span class="food-price">${formatPrice(p.price)}</span>
                        <span class="food-weight">• ${p.weightGram} г</span>
                    </div>

                    ${isOut ? `
                        <button class="btn-secondary" disabled style="opacity: 0.6; cursor: not-allowed; font-size: 0.85rem;">
                            Закончилось
                        </button>
                    ` : `
                        <button class="btn-primary" style="padding: 0.45rem 1.1rem; font-size: 0.9rem;" onclick="window.openCustomizer(${p.id})">
                            Выбрать
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

window.filterCategory = (catId) => {
    currentCategoryFilter = catId;
    document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
    event?.currentTarget?.classList.add('active');
    loadMenuProducts();
};

window.handleMenuSearch = (query) => {
    const filtered = allProductsCache.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase()) || 
        p.description.toLowerCase().includes(query.toLowerCase())
    );
    renderProductsList(filtered);
};

// ==========================================================================
// 5. НАСТРОЙКА СОСТАВА БЛЮДА (CUSTOMIZER MODAL)
// ==========================================================================

let activeCustomizerProduct = null;
let activeExcludedIngredients = [];
let activeSelectedAddons = [];

window.openCustomizer = async (productId) => {
    const modal = document.getElementById('customizerModal');
    const body = document.getElementById('customizerBody');
    if (!modal || !body) return;

    body.innerHTML = '<div style="padding: 3rem; text-align: center; color: var(--text-muted);">Загружаем состав блюда...</div>';
    modal.classList.add('open');

    try {
        const res = await api.menu.getProduct(productId);
        if (!res.ok) {
            body.innerHTML = '<div style="padding: 2rem; color: var(--danger);">Не удалось загрузить блюдо</div>';
            return;
        }

        const data = await res.json();
        activeCustomizerProduct = data.product;
        activeExcludedIngredients = [];
        activeSelectedAddons = [];

        renderCustomizerModalContent(data);
    } catch (err) {
        body.innerHTML = `<div style="padding: 2rem; color: var(--danger);">${err.message}</div>`;
    }
};

window.closeCustomizer = () => {
    document.getElementById('customizerModal')?.classList.remove('open');
};

function renderCustomizerModalContent({ product, ingredients, addons }) {
    const body = document.getElementById('customizerBody');
    const isOut = product.stockQuantity <= 0;

    body.innerHTML = `
        <div class="customizer-header">
            <img src="${product.imageUrl}" class="customizer-img" alt="${product.name}">
            <div>
                <span class="stock-tag ${isOut ? 'out' : 'in-stock'}" style="position: static; display: inline-block; margin-bottom: 0.5rem;">
                    ${isOut ? '❌ Закончился на складе' : `Остаток на кухне: ${product.stockQuantity} порций`}
                </span>
                <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 0.5rem;">${product.name}</h2>
                <p style="color: var(--text-muted); font-size: 0.88rem; line-height: 1.4; margin-bottom: 0.75rem;">${product.description}</p>
                <div style="font-size: 0.82rem; color: var(--text-dim); display: flex; gap: 1rem;">
                    <span>⚖️ ${product.weightGram} г</span>
                    <span>🔥 ${product.caloriesKcal} ккал</span>
                    <span>⏱️ Приготовление: ~${product.cookingTimeMinutes} мин</span>
                </div>
            </div>
        </div>

        <!-- ИНГРЕДИЕНТЫ: УБРАТЬ ИЗ СОСТАВА -->
        ${ingredients && ingredients.length > 0 ? `
            <div class="customizer-section">
                <h4>
                    <span>🌿</span>
                    <span>Состав блюда (снимите галочку, чтобы исключить):</span>
                </h4>
                <div class="ingredients-grid">
                    ${ingredients.map(ing => `
                        <label class="custom-checkbox-label">
                            <input type="checkbox" checked onchange="window.toggleExcludeIngredient('${ing.name}', this.checked)">
                            <span>${ing.name} <small style="color: #48BB78; font-size: 0.75rem; font-weight: 700;">(-40 ₽)</small></span>
                        </label>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <!-- ДОПОЛНЕНИЯ: ДОБАВИТЬ ЗА ДОПЛАТУ -->
        ${addons && addons.length > 0 ? `
            <div class="customizer-section">
                <h4>
                    <span>🧀</span>
                    <span>Добавить по вкусу:</span>
                </h4>
                <div class="addons-grid">
                    ${addons.map(addon => `
                        <label class="custom-checkbox-label" id="addonLabel_${addon.id}">
                            <input type="checkbox" onchange="window.toggleAddon(${addon.id}, '${addon.name}', ${addon.price}, this.checked)">
                            <span>+ ${addon.name} (+${addon.price} ₽)</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <div class="customizer-footer">
            <div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Итого за порцию:</div>
                <div id="customizerCurrentPrice" style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">
                    ${formatPrice(product.price)}
                </div>
            </div>

            ${isOut ? `
                <button class="btn-secondary" disabled style="opacity: 0.6; cursor: not-allowed;">
                    Товара нет в наличии
                </button>
            ` : `
                <button class="btn-primary" style="padding: 0.75rem 1.75rem;" onclick="window.confirmAddToCart()">
                    Добавить в корзину
                </button>
            `}
        </div>
    `;
}

function updateCustomizerPrice() {
    if (!activeCustomizerProduct) return;
    const addonsTotal = activeSelectedAddons.reduce((sum, a) => sum + a.price, 0);
    const ingredientDiscount = activeExcludedIngredients.length * 40;
    const effectiveBasePrice = Math.max(150, activeCustomizerProduct.price - ingredientDiscount);
    const newPrice = effectiveBasePrice + addonsTotal;
    const priceEl = document.getElementById('customizerCurrentPrice');
    if (priceEl) priceEl.textContent = formatPrice(newPrice);
}

window.toggleExcludeIngredient = (name, isIncluded) => {
    if (!isIncluded) {
        if (!activeExcludedIngredients.includes(name)) activeExcludedIngredients.push(name);
    } else {
        activeExcludedIngredients = activeExcludedIngredients.filter(n => n !== name);
    }
    updateCustomizerPrice();
};

window.toggleAddon = (id, name, price, isChecked) => {
    const label = document.getElementById(`addonLabel_${id}`);
    if (isChecked) {
        activeSelectedAddons.push({ id, name, price });
        label?.classList.add('addon-checked');
    } else {
        activeSelectedAddons = activeSelectedAddons.filter(a => a.id !== id);
        label?.classList.remove('addon-checked');
    }

    updateCustomizerPrice();
};

window.confirmAddToCart = () => {
    if (!activeCustomizerProduct) return;
    addToCart(activeCustomizerProduct, 1, activeExcludedIngredients, activeSelectedAddons);
    window.closeCustomizer();
    showToast(`«${activeCustomizerProduct.name}» добавлено в корзину!`, 'success');
};

// ==========================================================================
// 6. КОРЗИНА И ОФОРМЛЕНИЕ ЗАКАЗА (CHECKOUT)
// ==========================================================================

window.openCart = () => document.getElementById('cartDrawerOverlay')?.classList.add('open');
window.closeCart = () => document.getElementById('cartDrawerOverlay')?.classList.remove('open');

window.changeCartQty = (idx, delta) => {
    updateQuantity(idx, delta);
};

window.openCheckout = () => {
    const items = getCartItems();
    if (items.length === 0) {
        showToast('Корзина пуста', 'error');
        return;
    }

    if (!currentUser) {
        showToast('Для оформления заказа войдите в аккаунт или зарегистрируйтесь', 'info');
        window.openAuthModal();
        return;
    }

    if (currentUser.role === 'admin') {
        alert('⚠️ Служебный аккаунт администратора: оформление заказов заблокировано политикой безопасности (Segregation of Duties).\n\nАдминистратор имеет доступ к смене статусов и управлению складом, поэтому для исключения злоупотреблений заказы оформляются исключительно через клиентские аккаунты.\n\nПожалуйста, войдите как покупатель (например, выбрав «Иван Смирнов» в Demo-входе).');
        return;
    }

    window.closeCart();
    const modal = document.getElementById('checkoutModal');
    if (modal) {
        modal.classList.add('open');
        const citySelect = document.getElementById('orderCity');
        if (citySelect && window.currentDeliveryCity) {
            citySelect.value = window.currentDeliveryCity;
        }
    }

    // Если у пользователя есть баллы, показываем блок списания
    const bonusBox = document.getElementById('bonusRedeemBox');
    const availBonus = document.getElementById('checkoutAvailableBonus');
    if (bonusBox && availBonus) {
        if (currentUser.bonusPoints > 0) {
            bonusBox.style.display = 'block';
            availBonus.textContent = `${currentUser.bonusPoints} ₽`;
        } else {
            bonusBox.style.display = 'none';
        }
    }
};

window.closeCheckout = () => {
    document.getElementById('checkoutModal')?.classList.remove('open');
};

// ==========================================================================
// ВЫБОР ГОРОДА (DODO PIZZA STYLE + ВСЕ ГОРОДА РОССИИ ЧЕРЕЗ DADATA)
// ==========================================================================

const POPULAR_CITIES = [
    { city: 'Балашов', region: 'Саратовская обл.' },
    { city: 'Саратов', region: 'Саратовская обл.' },
    { city: 'Москва', region: 'г. Москва' },
    { city: 'Санкт-Петербург', region: 'г. Санкт-Петербург' },
    { city: 'Энгельс', region: 'Саратовская обл.' },
    { city: 'Самара', region: 'Самарская обл.' },
    { city: 'Воронеж', region: 'Воронежская обл.' },
    { city: 'Казань', region: 'респ. Татарстан' },
    { city: 'Волгоград', region: 'Волгоградская обл.' }
];

window.currentDeliveryCity = localStorage.getItem('bitego_selected_city') || localStorage.getItem('deliveryCity') || 'Балашов';

function initCity() {
    const saved = localStorage.getItem('bitego_selected_city');
    const headerCity = document.getElementById('headerCityName');
    if (saved) {
        window.currentDeliveryCity = saved;
        if (headerCity) headerCity.textContent = 'г. ' + saved;
    } else {
        // Как в Додо Пицце: при первом заходе открываем модалку выбора города
        setTimeout(() => {
            window.openCityModal();
        }, 600);
    }
}

window.openCityModal = async () => {
    const modal = document.getElementById('citySelectModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.classList.add('active');

    // Отрисовка плашек популярных городов
    const chipsEl = document.getElementById('popularCitiesChips');
    if (chipsEl) {
        chipsEl.innerHTML = POPULAR_CITIES.map(c => `
            <button type="button" class="btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.82rem; border-radius: 20px; font-weight: 600;" onclick="window.selectCity('${c.city}', '${c.region}')">
                📍 ${c.city}
            </button>
        `).join('');
    }

    const input = document.getElementById('citySearchInput');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 120);
    }

    renderCitySearchResults(POPULAR_CITIES.map(c => ({
        city: c.city,
        region: c.region,
        displayName: c.region ? `г. ${c.city} (${c.region})` : `г. ${c.city}`
    })));
};

window.closeCityModal = () => {
    const modal = document.getElementById('citySelectModal');
    if (modal) {
        modal.classList.remove('open');
        modal.classList.remove('active');
    }
};

let citySearchDebounce = null;
window.handleCitySearch = (query) => {
    clearTimeout(citySearchDebounce);
    const container = document.getElementById('citySearchResultsList');
    if (!container) return;

    if (!query || query.trim().length === 0) {
        renderCitySearchResults(POPULAR_CITIES.map(c => ({
            city: c.city,
            region: c.region,
            displayName: c.region ? `г. ${c.city} (${c.region})` : `г. ${c.city}`
        })));
        return;
    }

    citySearchDebounce = setTimeout(async () => {
        container.innerHTML = '<div style="padding: 0.75rem; text-align: center; color: var(--text-dim); font-size: 0.85rem;">Ищем по базе всех городов России...</div>';
        try {
            const res = await api.address.searchCities(query.trim());
            if (res.ok) {
                const list = await res.json();
                renderCitySearchResults(list);
            }
        } catch {
            container.innerHTML = '<div style="padding: 0.75rem; text-align: center; color: var(--danger); font-size: 0.85rem;">Ошибка поиска города</div>';
        }
    }, 200);
};

function renderCitySearchResults(list) {
    const container = document.getElementById('citySearchResultsList');
    if (!container) return;

    if (!list || list.length === 0) {
        container.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Город не найден. Попробуйте уточнить название.</div>';
        return;
    }

    container.innerHTML = list.map(item => `
        <div class="suggest-item" style="cursor: pointer; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); border: 1px solid var(--border-color); margin-bottom: 0.25rem;" onclick="window.selectCity('${item.city.replace(/'/g, "\\'")}', '${(item.region || '').replace(/'/g, "\\'")}')">
            <div>
                <strong style="color: #FFF; font-size: 0.95rem;">г. ${item.city}</strong>
                ${item.region ? `<div style="font-size: 0.78rem; color: var(--text-muted);">${item.region}</div>` : ''}
            </div>
            <span style="color: var(--primary); font-size: 0.85rem; font-weight: 700;">Выбрать →</span>
        </div>
    `).join('');
}

window.selectCity = (cityName, regionName) => {
    let cleanName = (cityName || 'Балашов').replace(/^г\.?\s+/i, '').trim();
    window.currentDeliveryCity = cleanName;
    localStorage.setItem('bitego_selected_city', cleanName);
    localStorage.setItem('deliveryCity', cleanName);

    const headerCity = document.getElementById('headerCityName');
    if (headerCity) headerCity.textContent = 'г. ' + cleanName;

    const label = document.getElementById('orderStreetLabel');
    if (label) label.textContent = 'Улица в ' + (cleanName === 'Балашов' ? 'Балашове' : cleanName) + ' *';

    const streetInput = document.getElementById('orderStreet');
    if (streetInput) {
        streetInput.value = '';
        streetInput.placeholder = `Начните вводить улицу в г. ${cleanName}...`;
    }

    const orderCitySelect = document.getElementById('orderCity');
    if (orderCitySelect) {
        let found = false;
        for (let i = 0; i < orderCitySelect.options.length; i++) {
            if (orderCitySelect.options[i].value.toLowerCase() === cleanName.toLowerCase()) {
                orderCitySelect.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (!found) {
            const opt = document.createElement('option');
            opt.value = cleanName;
            opt.textContent = `📍 г. ${cleanName}${regionName ? ' (' + regionName + ')' : ''}`;
            opt.selected = true;
            orderCitySelect.prepend(opt);
        }
    }

    showToast(`Город доставки: г. ${cleanName}`, 'success');
    window.closeCityModal();
};

window.handleCityChange = (city) => {
    window.selectCity(city, '');
};

window.promptChangeCity = () => {
    window.openCityModal();
};

window.toggleBonusUse = (isChecked) => {
    setBonusUsage(isChecked, currentUser ? currentUser.bonusPoints : 0);
};

let currentAddressSuggestions = [];

// Подсказки адресов (DaData + Local Fallback с учетом выбранного города)
window.handleAddressInput = (query) => {
    clearTimeout(debounceTimeout);
    const dropdown = document.getElementById('addressSuggestions');

    if (!query || query.trim().length < 2) {
        if (dropdown) dropdown.style.display = 'none';
        return;
    }

    const city = document.getElementById('orderCity')?.value || window.currentDeliveryCity || 'Балашов';

    debounceTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/address/suggest?query=${encodeURIComponent(query.trim())}&city=${encodeURIComponent(city)}`);
            if (res.ok) {
                const list = await res.json();
                currentAddressSuggestions = list;
                if (list.length > 0 && dropdown) {
                    dropdown.style.display = 'block';
                    dropdown.innerHTML = list.map((item, idx) => `
                        <div class="suggest-item" onclick="window.selectAddressSuggestionByIndex(${idx})">
                            <div style="font-weight: 600;">${item.value}</div>
                            ${item.house ? `<small style="color: var(--primary); font-size: 0.75rem;">Номер дома: ${item.house} • </small>` : ''}
                            <small style="color: var(--text-dim); font-size: 0.72rem;">${item.source}</small>
                        </div>
                    `).join('');
                } else if (dropdown) {
                    dropdown.style.display = 'none';
                }
            }
        } catch {
            if (dropdown) dropdown.style.display = 'none';
        }
    }, 250);
};

window.selectAddressSuggestionByIndex = (idx) => {
    const item = currentAddressSuggestions[idx];
    if (!item) return;

    const streetInput = document.getElementById('orderStreet');
    const houseInput = document.getElementById('orderHouse');

    if (streetInput) {
        streetInput.value = item.street || item.value;
    }
    if (item.house && houseInput) {
        houseInput.value = item.house;
    }

    const dropdown = document.getElementById('addressSuggestions');
    if (dropdown) dropdown.style.display = 'none';
};

window.selectAddressSuggestion = (value) => {
    const input = document.getElementById('orderStreet');
    if (input) input.value = value;
    const dropdown = document.getElementById('addressSuggestions');
    if (dropdown) dropdown.style.display = 'none';
};

window.submitOrder = async (e) => {
    e.preventDefault();

    if (currentUser && currentUser.role === 'admin') {
        showToast('Оформление заказов администратором заблокировано', 'error');
        alert('⚠️ Служебный аккаунт администратора: оформление заказов отключено в целях безопасности.');
        return;
    }

    const submitBtn = document.getElementById('submitOrderBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Оформляем...';
    }

    const targetCity = document.getElementById('orderCity')?.value || window.currentDeliveryCity || 'Балашов';
    const rawStreet = document.getElementById('orderStreet').value.trim();
    const house = document.getElementById('orderHouse').value.trim();
    const apt = document.getElementById('orderApartment').value.trim();
    const entrance = document.getElementById('orderEntrance').value.trim();
    const floor = document.getElementById('orderFloor').value.trim();
    const intercom = document.getElementById('orderIntercom').value.trim();
    const note = document.getElementById('orderNote').value.trim();
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Card';
    const useBonuses = document.getElementById('useBonusesCheckbox')?.checked || false;

    // Очищаем от дублирования города и региона
    let cleanStreet = rawStreet
        .replace(/^Саратовская обл,?\s*/i, '')
        .replace(new RegExp(`^г\\.?\\s*${targetCity},?\\s*`, 'i'), '')
        .replace(new RegExp(`^г\\s*${targetCity},?\\s*`, 'i'), '')
        .trim();

    const addressParts = [`г. ${targetCity}`, cleanStreet];

    // Проверяем, есть ли уже номер дома в cleanStreet, чтобы не дублировать "д 6а, д. 6а"
    const hasHouseAlready = cleanStreet.match(/,\s*д\.?\s*\d+/i) || 
                            cleanStreet.match(/\s+д\.?\s*\d+/i) || 
                            (house && (cleanStreet.toLowerCase().endsWith(` ${house.toLowerCase()}`) || cleanStreet.toLowerCase().includes(`д. ${house.toLowerCase()}`)));

    if (house && !hasHouseAlready) {
        addressParts.push(`д. ${house}`);
    }

    if (apt) addressParts.push(`кв. ${apt}`);
    if (entrance) addressParts.push(`подъезд ${entrance}`);
    if (floor) addressParts.push(`этаж ${floor}`);
    if (intercom) addressParts.push(`домофон ${intercom}`);

    const fullAddress = addressParts.join(', ');

    const cartItems = getCartItems();
    const orderPayload = {
        deliveryAddressText: fullAddress,
        paymentMethod: paymentMethod,
        bonusPointsToUse: useBonuses ? getBonusDiscount() : 0,
        customerNote: note,
        items: cartItems.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            excludedIngredients: item.excludedIngredients,
            addonIds: item.addonIds
        }))
    };

    try {
        const res = await api.order.create(orderPayload);
        const data = await res.json();

        if (res.ok) {
            clearCart();
            window.closeCheckout();
            showToast(`Заказ ${data.orderNumber} успешно создан!`, 'success');
            await checkAuth(); // Обновляем баланс бонусов
            navigateTo(`/tracker?id=${data.id}`);
        } else {
            showToast(data.message || 'Ошибка оформления заказа', 'error');
        }
    } catch (err) {
        showToast('Сервер недоступен: ' + err.message, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Подтвердить заказ';
        }
    }
};

// ==========================================================================
// 7. ЖИВОЙ ТРЕКЕР ЗАКАЗА (ИННОВАЦИЯ!)
// ==========================================================================

let trackerSecondsRemaining = 0;
let trackerTimerInterval = null;

async function renderTracker(orderId) {
    const content = document.getElementById('content');
    if (activePollingInterval) clearInterval(activePollingInterval);
    if (trackerTimerInterval) clearInterval(trackerTimerInterval);

    if (!orderId) {
        content.innerHTML = `
            <div style="text-align: center; padding: 4rem 1rem;">
                <h2>Заказ не указан</h2>
                <button class="btn-primary" style="margin-top: 1rem;" onclick="window.navigateTo('/profile')">Перейти в мои заказы</button>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <section class="catalog-section">
            <div id="trackerContainer" class="tracker-card">
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    Подключаемся к системе отслеживания BiteGo...
                </div>
            </div>
        </section>
    `;

    // Первый запрос
    await pollOrderStatus(orderId);

    // Запускаем Polling статуса каждые 4 секунды
    activePollingInterval = setInterval(() => {
        pollOrderStatus(orderId);
    }, 4000);

    // Запускаем тикающий таймер каждую секунду (1000мс)
    trackerTimerInterval = setInterval(() => {
        if (currentTrackerOrder && (currentTrackerOrder.statusId >= 5 || currentTrackerOrder.statusId === 7 || currentTrackerOrder.statusId === 8)) {
            clearInterval(trackerTimerInterval);
            trackerTimerInterval = null;
            return;
        }

        if (trackerSecondsRemaining > 0) {
            trackerSecondsRemaining--;
            const timerEl = document.getElementById('liveOrderTimer');
            if (timerEl) {
                const m = Math.floor(trackerSecondsRemaining / 60);
                const s = trackerSecondsRemaining % 60;
                timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s} мин`;
            }
        }
    }, 1000);
}

let currentTrackerOrder = null;

async function pollOrderStatus(orderId) {
    const container = document.getElementById('trackerContainer');
    if (!container) return;

    try {
        const res = await api.order.getOrder(orderId);
        if (!res.ok) {
            container.innerHTML = `<div style="color: var(--danger);">Заказ #${orderId} не найден или у вас нет прав на его просмотр.</div>`;
            return;
        }

        const o = await res.json();
        currentTrackerOrder = o;

        // Если заказ уже завершен, доставлен или отменен — останавливаем таймер
        if (o.statusId >= 5 || o.statusId === 7 || o.statusId === 8) {
            if (trackerTimerInterval) {
                clearInterval(trackerTimerInterval);
                trackerTimerInterval = null;
            }
        } else if (typeof o.remainingSeconds === 'number') {
            trackerSecondsRemaining = o.remainingSeconds;
        }

        // Если заказ в терминальном статусе (получен, отменен или спор) — отключаем опрос!
        if (o.statusId === 6 || o.statusId === 7 || o.statusId === 8) {
            if (activePollingInterval) {
                clearInterval(activePollingInterval);
                activePollingInterval = null;
            }
        }

        renderTrackerDetails(o);
    } catch (err) {
        // Фоновая ошибка опроса
    }
}

function renderTrackerDetails(o) {
    const container = document.getElementById('trackerContainer');
    if (!container) return;

    // Сохраняем черновик текста отзыва, если клиент уже начал писать, чтобы он не пропал
    const draftReviewText = document.getElementById('reviewCommentText')?.value;

    const isDelivered = o.statusId === 5; // Доставлен (ждёт подтверждения)
    const isCompleted = o.statusId === 6; // Получен клиентом (финал)
    const isCancelled = o.statusId === 7;
    const isIssue = o.statusId === 8;

    // Рассчитываем форматированное время
    const totalMinutes = o.totalEstimatedMinutes || ((o.estimatedCookingMinutes || 15) + 20);
    const m = Math.floor(trackerSecondsRemaining / 60);
    const s = trackerSecondsRemaining % 60;
    const countdownDisplay = `${m}:${s < 10 ? '0' : ''}${s} мин`;

    let timerContentHtml = '';
    if (isCompleted) {
        timerContentHtml = `
            <div>
                <div style="font-size: 0.82rem; color: var(--text-muted);">Статус заказа:</div>
                <div id="liveOrderTimer" style="font-size: 1.35rem; font-weight: 900; color: #10B981;">✅ Доставлен и получен</div>
            </div>
        `;
    } else if (isDelivered) {
        timerContentHtml = `
            <div>
                <div style="font-size: 0.82rem; color: var(--text-muted);">Статус доставки:</div>
                <div id="liveOrderTimer" style="font-size: 1.35rem; font-weight: 900; color: #F59E0B;">🔔 Курьер на месте! Подтвердите получение</div>
            </div>
        `;
    } else if (isIssue) {
        timerContentHtml = `
            <div>
                <div style="font-size: 0.82rem; color: var(--text-muted);">Статус претензии:</div>
                <div id="liveOrderTimer" style="font-size: 1.35rem; font-weight: 900; color: #EF4444;">⚠️ Претензия на рассмотрении администратора</div>
            </div>
        `;
    } else if (isCancelled) {
        timerContentHtml = `
            <div>
                <div style="font-size: 0.82rem; color: var(--text-muted);">Статус заказа:</div>
                <div id="liveOrderTimer" style="font-size: 1.35rem; font-weight: 900; color: var(--danger);">❌ Заказ отменен</div>
            </div>
        `;
    } else {
        timerContentHtml = `
            <div>
                <div style="font-size: 0.82rem; color: var(--text-muted);">Расчетное время до вручения:</div>
                <div id="liveOrderTimer" style="font-size: 1.45rem; font-weight: 900; color: var(--primary); letter-spacing: -0.5px;">${countdownDisplay}</div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="tracker-header">
            <div>
                <span style="font-size: 0.85rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Отслеживание доставки</span>
                <h2 style="font-size: 1.6rem; font-weight: 800;">Заказ ${o.orderNumber}</h2>
                <div style="font-size: 0.85rem; color: var(--text-muted);">Создан: ${formatDate(o.createdAt)}</div>
            </div>
            <div style="text-align: right;">
                <span class="tracker-badge" style="background: ${getStatusBadgeBg(o.statusId)}; color: #FFF;">
                    ${o.statusName}
                </span>
                <div style="font-size: 1.3rem; font-weight: 800; color: var(--primary); margin-top: 0.35rem;">
                    ${formatPrice(o.totalAmount)}
                </div>
            </div>
        </div>

        ${!isCancelled ? `
            <!-- ANIMATED STEPPER -->
            <div class="timeline-stepper">
                <div class="timeline-progress-bar" style="width: ${o.progressPercent}%;"></div>

                <div class="timeline-step ${o.statusId >= 1 ? 'completed active' : ''}">
                    <div class="step-circle">📝</div>
                    <span class="step-title">Новый</span>
                </div>

                <div class="timeline-step ${o.statusId >= 2 ? 'completed active' : ''}">
                    <div class="step-circle">👨‍🍳</div>
                    <span class="step-title">Готовится</span>
                </div>

                <div class="timeline-step ${o.statusId >= 3 ? 'completed active' : ''}">
                    <div class="step-circle">📦</div>
                    <span class="step-title">Собран</span>
                </div>

                <div class="timeline-step ${o.statusId >= 4 ? 'completed active' : ''}">
                    <div class="step-circle">🚗</div>
                    <span class="step-title">В пути</span>
                </div>

                <div class="timeline-step ${o.statusId >= 6 ? 'completed' : isDelivered ? 'active' : ''}">
                    <div class="step-circle">✅</div>
                    <span class="step-title">Получен</span>
                </div>
            </div>

            <!-- COUNTDOWN / STATUS BANNER -->
            <div style="background: var(--bg-input); border-radius: var(--radius-md); padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.85rem;">
                    <span style="font-size: 2.2rem;">${isCompleted ? '🎉' : isDelivered ? '🔔' : isIssue ? '⚠️' : '⏱️'}</span>
                    ${timerContentHtml}
                </div>
                <div style="font-size: 0.88rem; color: var(--text-muted); text-align: right; max-width: 360px;">
                    <div style="font-weight: 700; color: #FFF; margin-bottom: 0.25rem;">${o.statusName}</div>
                    <div style="margin-bottom: 0.35rem;">${o.statusDescription}</div>
                    <div style="font-size: 0.78rem; color: var(--text-dim); border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.35rem;">
                        ⏱️ Приготовление: ~${o.estimatedCookingMinutes || 15} мин • Доставка: ~20 мин • Всего: ~${totalMinutes} мин
                    </div>
                </div>
            </div>
        ` : `
            <div style="background: var(--danger-bg); border: 1px solid var(--danger); border-radius: var(--radius-md); padding: 1.5rem; text-align: center; margin-bottom: 1.5rem;">
                <h3 style="color: var(--danger); font-size: 1.2rem; margin-bottom: 0.5rem;">Заказ отменен</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Причина: ${o.cancellationReason || 'Отменен оператором'}</p>
            </div>
        `}

        <!-- СОСТАВ ДОСТАВЛЯЕМОГО ЗАКАЗА -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>🛍️</span>
                <span>Состав заказа (${o.items.length} ${o.items.length === 1 ? 'позиция' : 'позиции'}):</span>
            </h3>
            <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                ${o.items.map(item => `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.65rem 0.85rem; background: var(--bg-input); border-radius: var(--radius-sm);">
                        <div style="display: flex; align-items: center; gap: 0.85rem;">
                            <img src="${item.productImage}" alt="${item.productName}" style="width: 48px; height: 48px; object-fit: cover; border-radius: var(--radius-sm);">
                            <div>
                                <div style="font-weight: 700; font-size: 0.95rem;">${item.productName} × ${item.quantity} шт.</div>
                                ${item.excludedIngredientsText ? `<div style="font-size: 0.78rem; color: #FF8A8A;">Без: ${item.excludedIngredientsText}</div>` : ''}
                                ${item.addedAddonsText ? `<div style="font-size: 0.78rem; color: #FFA477;">Доп: ${item.addedAddonsText}</div>` : ''}
                            </div>
                        </div>
                        <div style="font-weight: 800; color: var(--primary); font-size: 0.95rem; white-space: nowrap;">
                            ${formatPrice(item.totalPrice)}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- COURIER INFO CARD (ПОЯВЛЯЕТСЯ ПРИ СТАТУСЕ "В ПУТИ") -->
        ${o.courier ? `
            <div class="courier-info-card">
                <img src="${o.courier.photoUrl}" class="courier-avatar" alt="Курьер">
                <div style="flex: 1;">
                    <div style="font-size: 0.78rem; color: var(--primary); font-weight: 700; text-transform: uppercase;">Ваш курьер BiteGo</div>
                    <h3 style="font-size: 1.15rem; font-weight: 800; color: #FFF;">${o.courier.fullName}</h3>
                    <div style="font-size: 0.88rem; color: var(--text-muted);">Статус: 🟢 ${o.courier.status}</div>
                </div>
                <a href="tel:${o.courier.phone}" class="btn-secondary" style="border-radius: var(--radius-full); text-decoration: none;">
                    📞 Позвонить
                </a>
            </div>
        ` : ''}

        <!-- ДВУСТОРОННЕЕ ПОДТВЕРЖДЕНИЕ ДОСТАВКИ (ДЛЯ КОМИССИИ!) -->
        ${isDelivered ? `
            <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(26, 28, 34, 0.9)); border: 2px solid var(--success); border-radius: var(--radius-md); padding: 1.5rem; margin-top: 1.5rem; text-align: center;">
                <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFF; margin-bottom: 0.5rem;">Курьер доставил ваш заказ!</h3>
                <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1.25rem;">Пожалуйста, проверьте состав и подтвердите получение для начисления 5% бонусов.</p>
                <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                    <button class="btn-primary" style="background: var(--success); padding: 0.75rem 2rem;" onclick="window.confirmOrderDelivery(${o.id})">
                        ✅ Подтвердить получение (+${Math.round(o.totalAmount * 0.05)} бонусов)
                    </button>
                    <button class="btn-secondary" style="color: #EF4444; border-color: #EF4444;" onclick="window.openIssueModal(${o.id})">
                        ⚠️ Сообщить о проблеме
                    </button>
                </div>
            </div>
        ` : ''}

        <!-- ОТЗЫВ И ОЦЕНКА ЗАКАЗА (ПОСЛЕ ПОЛУЧЕНИЯ) -->
        ${isCompleted ? `
            ${o.review ? `
                <div style="background: rgba(255, 180, 0, 0.08); border: 1px solid rgba(255, 180, 0, 0.3); border-radius: var(--radius-md); padding: 1.25rem; margin-top: 1.5rem; text-align: center;">
                    <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Ваша оценка блюд и сервиса:</div>
                    <div style="font-size: 1.6rem; color: #FFB800; letter-spacing: 2px; margin-bottom: 0.35rem;">
                        ${'★'.repeat(o.review.rating)}${'☆'.repeat(5 - o.review.rating)}
                    </div>
                    <p style="font-style: italic; color: #FFF; font-size: 0.95rem; margin-bottom: 0.5rem;">«${o.review.comment || 'Оценка без текста'}»</p>
                    <small style="color: var(--text-dim); font-size: 0.78rem;">Спасибо за вашу обратную связь!</small>
                </div>
            ` : `
                <div id="reviewPromptCard" style="background: var(--bg-card); border: 1px solid rgba(255, 180, 0, 0.4); border-radius: var(--radius-md); padding: 1.5rem; margin-top: 1.5rem; text-align: center;">
                    <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 0.35rem;">⭐ Оцените качество блюд и доставку</h3>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Поставьте оценку от 1 до 5 звезд:</p>
                    <div style="display: flex; justify-content: center; gap: 0.6rem; font-size: 2.2rem; cursor: pointer; margin-bottom: 1rem; color: #FFB800;" id="starRatingContainer">
                        <span onclick="window.setReviewRating(1)">★</span>
                        <span onclick="window.setReviewRating(2)">★</span>
                        <span onclick="window.setReviewRating(3)">★</span>
                        <span onclick="window.setReviewRating(4)">★</span>
                        <span onclick="window.setReviewRating(5)">★</span>
                    </div>
                    <textarea id="reviewCommentText" rows="2" placeholder="Напишите ваш отзыв (что понравилось больше всего)..." style="width: 100%; max-width: 480px; background: var(--bg-input); border: 1px solid var(--border-color); color: #FFF; padding: 0.75rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-family: inherit; font-size: 0.9rem;"></textarea>
                    <div>
                        <button class="btn-primary" style="padding: 0.6rem 1.8rem;" onclick="window.submitOrderReview(${o.id})">⭐ Опубликовать отзыв</button>
                    </div>
                </div>
            `}
        ` : ''}

        <!-- КНОПКА КАССОВОГО ЧЕКА -->
        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div style="font-size: 0.88rem; color: var(--text-muted);">
                Адрес: <strong>${o.deliveryAddressText}</strong>
            </div>
            <button class="btn-secondary" onclick="window.showOrderReceipt(${o.id})">
                🧾 Электронный кассовый чек
            </button>
        </div>
    `;

    // Восстанавливаем черновик комментария отзыва, если он был
    if (draftReviewText) {
        const commentBox = document.getElementById('reviewCommentText');
        if (commentBox) commentBox.value = draftReviewText;
    }
}

function getStatusBadgeBg(statusId) {
    return statusId === 1 ? 'var(--info)' :
           statusId === 2 ? 'var(--warning)' :
           statusId === 3 ? '#8B5CF6' :
           statusId === 4 ? 'var(--primary)' :
           statusId === 5 ? '#059669' :
           statusId === 6 ? '#10B981' :
           statusId === 7 ? 'var(--danger)' :
           statusId === 8 ? '#EF4444' : 'var(--warning)';
}

window.selectedReviewStars = 5;

window.setReviewRating = (stars) => {
    window.selectedReviewStars = stars;
    const spans = document.querySelectorAll('#starRatingContainer span');
    spans.forEach((s, idx) => {
        s.textContent = idx < stars ? '★' : '☆';
        s.style.color = idx < stars ? '#FFB800' : '#4B5563';
    });
};

window.submitOrderReview = async (orderId) => {
    const comment = document.getElementById('reviewCommentText')?.value || '';
    try {
        const res = await api.order.addReview(orderId, window.selectedReviewStars, comment);
        const data = await res.json();
        if (res.ok) {
            showToast('Спасибо за отзыв! Ваша оценка сохранена.', 'success');
            pollOrderStatus(orderId);
        } else {
            showToast(data.message || 'Ошибка сохранения отзыва', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

window.confirmOrderDelivery = async (orderId) => {
    try {
        const res = await api.order.confirm(orderId);
        const data = await res.json();
        if (res.ok) {
            showToast(data.message, 'success');
            await checkAuth();
            pollOrderStatus(orderId);
        } else {
            showToast(data.message || 'Ошибка подтверждения', 'error');
        }
    } catch (err) {
        showToast('Сервер недоступен: ' + err.message, 'error');
    }
};

window.openIssueModal = (orderId) => {
    const type = prompt('Укажите тип проблемы:\n1 - Не доставлено\n2 - Не то блюдо\n3 - Повреждена упаковка\n4 - Другое', '1');
    if (!type) return;

    const issueTypes = { '1': 'Не доставлено', '2': 'Не то блюдо', '3': 'Повреждена упаковка', '4': 'Другое' };
    const comment = prompt('Опишите подробнее вашу претензию:');

    fetch(`/api/order/${orderId}/issue`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueType: issueTypes[type] || 'Другое', comment: comment || '' })
    }).then(r => r.json()).then(data => {
        showToast(data.message, 'info');
        pollOrderStatus(orderId);
    });
};

window.showOrderReceipt = async (orderId) => {
    try {
        const res = await fetch(`/api/order/${orderId}/receipt`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) {
            showToast('Чек пока не доступен', 'error');
            return;
        }

        const r = await res.json();
        const modal = document.getElementById('receiptModal');
        const content = document.getElementById('receiptContent');

        content.innerHTML = `
            <div style="text-align: center; margin-bottom: 0.75rem;">
                <div style="font-size: 1.3rem; font-weight: 800;">${r.company.name}</div>
                <div style="font-size: 0.75rem;">${r.company.legalName}</div>
                <div style="font-size: 0.72rem;">ИНН: ${r.company.inn} • ОГРН: ${r.company.ogrn}</div>
                <div style="font-size: 0.75rem;">${r.company.city}, ${r.company.address}</div>
                <div style="font-size: 0.75rem;">Тел: ${r.company.phone}</div>
            </div>

            <div class="receipt-divider"></div>

            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: bold;">
                <span>КАССОВЫЙ ЧЕК</span>
                <span>${r.orderNumber}</span>
            </div>
            <div style="font-size: 0.75rem; color: #555;">Дата: ${r.date}</div>
            <div style="font-size: 0.75rem; color: #555;">Курьер: ${r.courierName}</div>
            <div style="font-size: 0.75rem; color: #555;">Клиент: ${r.customerName} (${r.customerPhone})</div>
            <div style="font-size: 0.75rem; color: #555;">Адрес: ${r.deliveryAddress}</div>

            <div class="receipt-divider"></div>

            <div style="font-size: 0.75rem; margin-bottom: 0.5rem;">
                ${r.items.map(i => `
                    <div style="margin-bottom: 0.4rem;">
                        <div style="display: flex; justify-content: space-between; font-weight: 600;">
                            <span>${i.name}</span>
                            <span>${i.total} ₽</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: #666;">
                            <span>${i.quantity} шт. × ${i.price} ₽</span>
                            ${i.modifications ? `<span>(${i.modifications})</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="receipt-divider"></div>

            <div style="font-size: 0.78rem;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Подытог:</span>
                    <span>${r.subtotal} ₽</span>
                </div>
                ${r.bonusPointsDiscount > 0 ? `
                    <div style="display: flex; justify-content: space-between; color: #D97706;">
                        <span>Скидка (бонусы):</span>
                        <span>-${r.bonusPointsDiscount} ₽</span>
                    </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between;">
                    <span>Доставка:</span>
                    <span>0.00 ₽</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 800; margin-top: 0.4rem;">
                    <span>ИТОГО К ОПЛАТЕ:</span>
                    <span>${r.totalAmount} ₽</span>
                </div>
            </div>

            <div class="receipt-divider"></div>

            <div style="font-size: 0.75rem; text-align: center; color: #555;">
                <div>Способ расчета: ${r.paymentMethod}</div>
                <div>Статус: ${r.paymentStatus}</div>
                ${r.bonusPointsEarned > 0 ? `<div style="font-weight: 700; color: #059669; margin-top: 0.25rem;">Начислено бонусов: +${r.bonusPointsEarned} ₽</div>` : ''}
                <div style="margin-top: 0.6rem; font-size: 0.7rem;">СПАСИБО ЗА ЗАКАЗ В BITEGO!</div>
                <div style="font-size: 0.68rem;">www.bitego.ru • г. Балашов</div>
            </div>
        `;

        modal?.classList.add('open');
    } catch {
        showToast('Не удалось загрузить чек', 'error');
    }
};

window.closeReceipt = () => document.getElementById('receiptModal')?.classList.remove('open');
window.printReceipt = () => window.print();

// ==========================================================================
// 8. СТРАНИЦА: ЛИЧНЫЙ КАБИНЕТ И ИСТОРИЯ (PROFILE)
// ==========================================================================

async function renderProfile() {
    const content = document.getElementById('content');

    if (!currentUser) {
        content.innerHTML = `
            <div style="text-align: center; padding: 4rem 1rem;">
                <h2>Личный кабинет BiteGo</h2>
                <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Войдите в систему, чтобы просматривать историю заказов и баллы</p>
                <button class="btn-primary" onclick="window.openAuthModal()">Войти / Зарегистрироваться</button>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <section class="catalog-section">
            <div style="display: grid; grid-template-columns: 320px 1fr; gap: 2rem;">
                <!-- USER INFO CARD -->
                <div class="stat-widget" style="height: fit-content;">
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem;">
                        <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 800;">
                            ${currentUser.fullName.charAt(0)}
                        </div>
                        <div>
                            <h3 style="font-size: 1.15rem; font-weight: 800;">${currentUser.fullName}</h3>
                            <div style="font-size: 0.82rem; color: var(--text-muted);">${currentUser.phone}</div>
                        </div>
                    </div>

                    <div style="background: var(--bg-input); padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; border: 1px solid rgba(255, 90, 31, 0.3);">
                        <div style="font-size: 0.8rem; color: var(--text-muted);">Баланс программы лояльности:</div>
                        <div style="font-size: 1.6rem; font-weight: 800; color: #FFA477;">💎 ${currentUser.bonusPoints} баллов</div>
                        <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.25rem;">1 балл = 1 рубль. Оплачивайте до 30% заказа.</div>
                    </div>

                    <button class="btn-secondary" style="width: 100%; justify-content: center;" onclick="window.handleLogout()">
                        Выйти из аккаунта
                    </button>
                </div>

                <!-- ORDERS HISTORY -->
                <div>
                    <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 1.25rem;">История ваших заказов</h2>
                    <div id="profileOrdersList" style="display: flex; flex-direction: column; gap: 1rem;">
                        <div style="color: var(--text-muted);">Загружаем ваши заказы...</div>
                    </div>
                </div>
            </div>
        </section>
    `;

    try {
        const res = await api.order.getMyOrders();
        if (res.ok) {
            const orders = await res.json();
            const listEl = document.getElementById('profileOrdersList');
            if (listEl) {
                if (orders.length === 0) {
                    listEl.innerHTML = `
                        <div style="text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-md);">
                            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📦</div>
                            <h4>У вас пока нет заказов</h4>
                            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Самое время сделать первый вкусный заказ!</p>
                            <button class="btn-primary" onclick="window.navigateTo('/menu')">Открыть меню</button>
                        </div>
                    `;
                    return;
                }

                listEl.innerHTML = orders.map(o => `
                    <div class="stat-widget" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                            <div>
                                <strong style="font-size: 1.1rem;">${o.orderNumber}</strong>
                                <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">от ${formatDate(o.createdAt)}</span>
                            </div>
                            <span class="tracker-badge" style="background: ${getStatusBadgeBg(o.statusId)}; color: #FFF; font-size: 0.78rem;">
                                ${o.statusName}
                            </span>
                        </div>

                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                            Адрес: ${o.deliveryAddressText}
                        </div>

                        <div style="display: flex; gap: 0.5rem; overflow-x: auto; margin-bottom: 1rem; padding-bottom: 0.5rem;">
                            ${o.items.map(i => `
                                <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--bg-input); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.82rem; white-space: nowrap;">
                                    <span>${i.productName}</span>
                                    <span style="color: var(--primary); font-weight: 700;">×${i.quantity}</span>
                                </div>
                            `).join('')}
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                            <div>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Итого:</span>
                                <strong style="font-size: 1.15rem; color: #FFF; margin-left: 0.35rem;">${formatPrice(o.totalAmount)}</strong>
                            </div>
                            <div style="display: flex; gap: 0.6rem;">
                                <button class="btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.82rem;" onclick="window.navigateTo('/tracker?id=${o.id}')">
                                    Отследить
                                </button>
                                <button class="btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.82rem;" onclick="window.showOrderReceipt(${o.id})">
                                    Чек
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch {}
}

// ==========================================================================
// 9. СТРАНИЦА: ПАНЕЛЬ ОПЕРАТОРА / АДМИНИСТРАТОРА (ADMIN)
// ==========================================================================

let activeAdminTab = 'orders';

async function renderAdmin(tab = 'orders') {
    activeAdminTab = tab;
    const content = document.getElementById('content');

    if (!currentUser || currentUser.role !== 'admin') {
        content.innerHTML = `
            <div style="text-align: center; padding: 4rem 1rem;">
                <h2>Доступ ограничен</h2>
                <p style="color: var(--text-muted); margin-bottom: 1rem;">Этот раздел предназначен исключительно для оператора кухни и управляющего BiteGo.</p>
                <button class="btn-primary" onclick="window.openAuthModal()">Войти как администратор</button>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="admin-layout">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <div>
                    <span style="color: var(--primary); font-weight: 700; font-size: 0.85rem; text-transform: uppercase;">Служебная панель</span>
                    <h1 style="font-size: 1.8rem; font-weight: 900;">Управление BiteGo Балашов</h1>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-secondary" onclick="window.renderAdmin(window.activeAdminTab)">🔄 Обновить данные</button>
                </div>
            </div>

            <div class="admin-nav-tabs">
                <div class="admin-tab ${tab === 'orders' ? 'active' : ''}" onclick="window.switchAdminTab('orders')">📦 Заказы</div>
                <div class="admin-tab ${tab === 'stock' ? 'active' : ''}" onclick="window.switchAdminTab('stock')">🍔 Меню и склад</div>
                <div class="admin-tab ${tab === 'history' ? 'active' : ''}" onclick="window.switchAdminTab('history')">📜 Журнал склада (StockLog)</div>
                <div class="admin-tab ${tab === 'couriers' ? 'active' : ''}" onclick="window.switchAdminTab('couriers')">🚗 Курьеры</div>
                <div class="admin-tab ${tab === 'stats' ? 'active' : ''}" onclick="window.switchAdminTab('stats')">📈 Финансы и статистика</div>
                <div class="admin-tab ${tab === 'feedbacks' ? 'active' : ''}" onclick="window.switchAdminTab('feedbacks')">💬 Отзывы и жалобы</div>
            </div>

            <div id="adminTabContent">Загрузка данных...</div>
        </div>
    `;

    window.activeAdminTab = tab;
    if (tab === 'orders') loadAdminOrders();
    else if (tab === 'stock') loadAdminStock();
    else if (tab === 'history') loadAdminStockHistory();
    else if (tab === 'couriers') loadAdminCouriers();
    else if (tab === 'stats') loadAdminStats();
    else if (tab === 'feedbacks') loadAdminFeedbacks();
}
window.renderAdmin = renderAdmin;
window.switchAdminTab = (tab) => renderAdmin(tab);

// --- Вкладка: Заказы оператора ---
async function loadAdminOrders() {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    try {
        const res = await api.admin.getOrders();
        if (res.ok) {
            const orders = await res.json();
            container.innerHTML = `
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Номер</th>
                            <th>Время</th>
                            <th>Клиент</th>
                            <th>Адрес</th>
                            <th>Состав заказа</th>
                            <th>Сумма</th>
                            <th>Курьер</th>
                            <th class="status-cell">Статус</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orders.map(o => `
                            <tr>
                                <td><strong>${o.orderNumber}</strong></td>
                                <td>${formatDate(o.createdAt).split(' ')[1]}</td>
                                <td>
                                    <div>${o.customerName}</div>
                                    <small style="color: var(--text-dim);">${o.customerPhone}</small>
                                </td>
                                <td style="max-width: 200px; font-size: 0.82rem;">${o.deliveryAddressText}</td>
                                <td style="font-size: 0.82rem;">
                                    ${o.items.map(i => `${i.productName} ×${i.quantity}`).join(', ')}
                                </td>
                                <td><strong>${formatPrice(o.totalAmount)}</strong></td>
                                <td>
                                    ${o.courier 
                                        ? `<span style="color: #6EE7B7;">${o.courier.fullName}</span>` 
                                        : `<button class="btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.78rem;" onclick="window.openAssignCourierModal(${o.id})">Назначить</button>`
                                    }
                                </td>
                                <td class="status-cell">
                                    <span class="tracker-badge" style="background: ${getStatusBadgeBg(o.statusId)}; color: #FFF; font-size: 0.75rem;">
                                        ${o.statusName}
                                    </span>
                                </td>
                                <td style="white-space: nowrap;">
                                    ${(o.statusId === 6 || o.statusId === 7) ? `
                                        <span style="color: var(--text-dim); font-size: 0.8rem; font-weight: 600;">🔒 Завершен</span>
                                    ` : `
                                        <select onchange="window.handleAdminStatusChange(${o.id}, this.value)" style="background: var(--bg-input); color: #FFF; border: 1px solid var(--border-color); padding: 0.3rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">
                                            <option value="" disabled selected>Сменить</option>
                                            <option value="2">👨‍🍳 Готовится</option>
                                            <option value="3">📦 Собран</option>
                                            <option value="4">🚗 В пути</option>
                                            <option value="5">✅ Доставлен</option>
                                            <option value="7">❌ Отменить</option>
                                        </select>
                                    `}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    } catch {
        container.innerHTML = '<div style="color: var(--danger);">Ошибка загрузки заказов</div>';
    }
}

window.handleAdminStatusChange = async (orderId, newStatusId) => {
    try {
        const res = await fetch(`/api/admin/order/${orderId}/status`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ newStatusId: parseInt(newStatusId) })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message, 'success');
            loadAdminOrders();
        } else {
            showToast(data.message || 'Ошибка смены статуса', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

window.openAssignCourierModal = async (orderId) => {
    try {
        const res = await fetch('/api/admin/couriers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const couriers = await res.json();

        // Фильтруем курьеров
        const freeCouriers = couriers.filter(c => c.status === 'Свободен');
        if (freeCouriers.length === 0) {
            alert('Все курьеры сейчас заняты на доставке или не на смене! Назначение заблокировано системой.');
            return;
        }

        const courierListText = freeCouriers.map((c, i) => `${i + 1}. ${c.fullName} (телефон: ${c.phone})`).join('\n');
        const choice = prompt(`Выберите свободного курьера для заказа #${orderId}:\n\n${courierListText}\n\nВведите номер:`);
        if (!choice) return;

        const idx = parseInt(choice) - 1;
        if (freeCouriers[idx]) {
            const selectedCourier = freeCouriers[idx];
            const assignRes = await fetch(`/api/admin/order/${orderId}/assign-courier`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ courierId: selectedCourier.id })
            });
            const data = await assignRes.json();
            if (assignRes.ok) {
                showToast(data.message, 'success');
                loadAdminOrders();
            } else {
                showToast(data.message, 'error');
            }
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// --- Вкладка: Склад и Меню ---
async function loadAdminStock() {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    try {
        const res = await fetch('/api/admin/stock', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const products = await res.json();

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
                <div>
                    <h3 style="font-size: 1.15rem; font-weight: 800;">Управление позициями меню и остатками</h3>
                    <p style="font-size: 0.82rem; color: var(--text-muted);">Пополняйте сырье, снимайте с продажи (стоп-лист) или добавляйте новые блюда</p>
                </div>
                <button class="btn-primary" onclick="window.openAddProductModal()" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 1.25rem;">
                    <span style="font-size: 1.1rem;">➕</span>
                    <span>Добавить новое блюдо в меню</span>
                </button>
            </div>

            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Блюдо</th>
                        <th>Категория</th>
                        <th>Цена</th>
                        <th>Остаток на складе</th>
                        <th>Статус наличия</th>
                        <th>Управление</th>
                    </tr>
                </thead>
                <tbody>
                    ${products.map(p => `
                        <tr>
                            <td>
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <img src="${p.imageUrl}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover;">
                                    <strong>${p.name}</strong>
                                </div>
                            </td>
                            <td>${p.categoryName}</td>
                            <td>${formatPrice(p.price)}</td>
                            <td>
                                <strong style="font-size: 1.1rem; color: ${p.stockQuantity > 0 ? 'var(--success)' : 'var(--danger)'};">
                                    ${p.stockQuantity} шт.
                                </strong>
                            </td>
                            <td>
                                <span class="stock-tag ${p.stockQuantity > 0 ? 'in-stock' : 'out'}" style="position: static;">
                                    ${p.stockQuantity > 0 ? 'В наличии' : 'Стоп-лист'}
                                </span>
                            </td>
                            <td>
                                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                                    <button class="btn-primary" style="padding: 0.3rem 0.65rem; font-size: 0.78rem;" onclick="window.promptReplenish(${p.id}, '${p.name}')">
                                        + Пополнить
                                    </button>
                                    <button class="btn-secondary" style="padding: 0.3rem 0.55rem; font-size: 0.78rem;" onclick="window.promptStopList(${p.id}, '${p.name}')">
                                        В стоп-лист
                                    </button>
                                    <button class="btn-secondary" style="padding: 0.3rem 0.55rem; font-size: 0.78rem; color: #EF4444; border-color: rgba(239, 68, 68, 0.4);" title="Удалить из меню" onclick="window.deleteProduct(${p.id}, '${p.name}')">
                                        🗑️
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch {}
}

window.openAddProductModal = () => {
    const modal = document.getElementById('addProductModal');
    if (modal) {
        modal.classList.add('open');
        modal.classList.add('active');
        setTimeout(() => {
            document.getElementById('newProdName')?.focus();
        }, 100);
    }
};

window.closeAddProductModal = () => {
    const modal = document.getElementById('addProductModal');
    if (modal) {
        modal.classList.remove('open');
        modal.classList.remove('active');
    }
};

window.submitNewProduct = async (e) => {
    e.preventDefault();
    const name = document.getElementById('newProdName')?.value.trim();
    const categoryId = parseInt(document.getElementById('newProdCategory')?.value) || 2;
    const price = parseFloat(document.getElementById('newProdPrice')?.value) || 0;
    const weightGram = parseInt(document.getElementById('newProdWeight')?.value) || 300;
    const caloriesKcal = parseInt(document.getElementById('newProdCalories')?.value) || 500;
    const initialStock = parseInt(document.getElementById('newProdStock')?.value) || 0;
    const description = document.getElementById('newProdDescription')?.value.trim();
    const imageUrl = document.getElementById('newProdImageUrl')?.value.trim() || '/assets/images/product-2.jpg';

    if (!name || price <= 0) {
        showToast('Укажите название и цену блюда', 'error');
        return;
    }

    try {
        const res = await api.admin.addProduct({
            name,
            categoryId,
            price,
            weightGram,
            caloriesKcal,
            cookingTimeMinutes: 15,
            initialStock,
            description,
            imageUrl
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Блюдо добавлено!', 'success');
            window.closeAddProductModal();
            document.getElementById('addProductForm')?.reset();
            loadAdminStock();
        } else {
            showToast(data.message || 'Ошибка добавления блюда', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

window.deleteProduct = async (id, name) => {
    if (!confirm(`Вы действительно хотите удалить блюдо «${name}» из меню?\n\nОно больше не будет отображаться в каталоге для клиентов.`)) return;
    try {
        const res = await api.admin.deleteProduct(id);
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Блюдо удалено из меню', 'success');
            loadAdminStock();
        } else {
            showToast(data.message || 'Ошибка при удалении блюда', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

window.promptReplenish = async (productId, name) => {
    const qtyStr = prompt(`Пополнение остатков для «${name}»:\nВведите количество порций:`, '20');
    if (!qtyStr) return;
    const qty = parseInt(qtyStr);

    const costStr = prompt(`Введите себестоимость за 1 штуку (₽):`, '180');
    const cost = parseFloat(costStr) || 150;

    const reason = prompt(`Укажите основание (поставщик/закупка):`, 'Поставка полуфабрикатов от поставщика');

    try {
        const res = await fetch('/api/admin/stock/replenish', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, quantity: qty, costPerUnit: cost, reason })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message, 'success');
            loadAdminStock();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

window.promptStopList = async (productId, name) => {
    const reason = prompt(`Причина отправки «${name}» в стоп-лист:`, 'Закончились булочки на кухне');
    if (!reason) return;

    try {
        const res = await fetch('/api/admin/stock/stop', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, reason })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message, 'info');
            loadAdminStock();
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// --- Вкладка: Журнал склада (StockLog) ---
async function loadAdminStockHistory() {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    try {
        const res = await fetch('/api/admin/stock/history', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const logs = await res.json();

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Блюдо</th>
                        <th>Тип операции</th>
                        <th>Изменение</th>
                        <th>Остаток</th>
                        <th>Себестоимость</th>
                        <th>Причина / Основание</th>
                        <th>Оператор</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(l => `
                        <tr>
                            <td style="font-size: 0.8rem;">${formatDate(l.createdAt)}</td>
                            <td><strong>${l.productName}</strong></td>
                            <td>${l.changeType}</td>
                            <td>
                                <strong style="color: ${l.quantityChange > 0 ? 'var(--success)' : 'var(--danger)'};">
                                    ${l.quantityChange > 0 ? `+${l.quantityChange}` : l.quantityChange} шт.
                                </strong>
                            </td>
                            <td>${l.remainingStock} шт.</td>
                            <td>${l.costPerUnit ? `${l.costPerUnit} ₽` : '—'}</td>
                            <td style="font-size: 0.85rem; max-width: 250px;">${l.reason}</td>
                            <td style="font-size: 0.8rem; color: var(--text-dim);">${l.operatorName}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch {}
}

// --- Вкладка: Курьеры ---
async function loadAdminCouriers() {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    try {
        const res = await fetch('/api/admin/couriers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const couriers = await res.json();

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
                ${couriers.map(c => `
                    <div class="stat-widget">
                        <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
                            <img src="${c.photoUrl}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid ${c.status === 'Свободен' ? 'var(--success)' : 'var(--primary)'};">
                            <div>
                                <h3 style="font-size: 1.1rem; font-weight: 800;">${c.fullName}</h3>
                                <div style="font-size: 0.85rem; color: var(--text-muted);">${c.phone}</div>
                            </div>
                        </div>

                        <div style="background: var(--bg-input); padding: 0.75rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.85rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                                <span style="color: var(--text-muted);">Текущий статус:</span>
                                <strong>${c.status === 'Свободен' ? '🟢 Свободен' : c.status === 'На доставке' ? '🔴 На доставке' : '⚪ Не на смене'}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                                <span style="color: var(--text-muted);">Ставка за заказ:</span>
                                <strong>${c.deliveryRate} ₽</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--text-muted);">Всего доставок:</span>
                                <strong>${c.totalDeliveriesCount}</strong>
                            </div>
                        </div>

                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn-secondary" style="flex: 1; font-size: 0.8rem; justify-content: center;" onclick="window.toggleCourierShift(${c.id}, '${c.status === 'Свободен' ? 'Не на смене' : 'Свободен'}')">
                                ${c.status === 'Свободен' ? 'Завершить смену' : 'Выйти на смену'}
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch {}
}

window.toggleCourierShift = async (courierId, newStatus) => {
    try {
        const res = await fetch(`/api/admin/couriers/${courierId}/status`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ newStatus })
        });
        if (res.ok) {
            showToast('Статус курьера обновлен', 'success');
            loadAdminCouriers();
        }
    } catch {}
};

// --- Вкладка: Финансы и Статистика ---
async function loadAdminStats(period = 'all') {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    try {
        const res = await fetch(`/api/admin/stats?period=${period}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const s = await res.json();

        // 1. Построение SVG графика динамики выручки
        const revenueChartHtml = renderRevenueSvgChart(s.dailyRevenue || []);

        // 2. Построение Donut диаграммы по категориям
        const categoryDonutHtml = renderCategoryDonutChart(s.categorySales || [], s.totalRevenue || 0);

        // 3. Вычисление максимального объема продаж для полос популярности
        const maxSold = s.topProducts && s.topProducts.length > 0 ? Math.max(...s.topProducts.map(p => p.totalSold)) : 1;

        container.innerHTML = `
            <!-- ПАНЕЛЬ ВЫБОРА ПЕРИОДА -->
            <div class="stats-period-bar">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; margin-right: 0.25rem;">Период отчета:</span>
                <button class="stats-period-btn ${period === 'today' ? 'active' : ''}" onclick="window.loadAdminStats('today')">Сегодня</button>
                <button class="stats-period-btn ${period === 'yesterday' ? 'active' : ''}" onclick="window.loadAdminStats('yesterday')">Вчера</button>
                <button class="stats-period-btn ${period === 'week' ? 'active' : ''}" onclick="window.loadAdminStats('week')">За 7 дней</button>
                <button class="stats-period-btn ${period === 'month' ? 'active' : ''}" onclick="window.loadAdminStats('month')">За 30 дней</button>
                <button class="stats-period-btn ${period === 'all' ? 'active' : ''}" onclick="window.loadAdminStats('all')">Все время</button>
                
                <div style="margin-left: auto; font-size: 0.78rem; color: var(--text-dim);">
                    Обновлено: ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} (МСК)
                </div>
            </div>

            <!-- 5 ФИНАНСОВЫХ КАРТОЧЕК (KPI) -->
            <div class="stats-grid">
                <!-- КАРТОЧКА 1: ВЫРУЧКА -->
                <div class="stat-widget">
                    <div class="stat-card-header">
                        <span class="stat-label" style="margin: 0;">💰 Выручка (продажи)</span>
                        <span class="stat-card-badge" style="background: rgba(255, 90, 31, 0.15); color: var(--primary);">
                            ${s.completedOrdersCount} зак.
                        </span>
                    </div>
                    <div class="stat-value">${formatPrice(s.totalRevenue)}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 0.25rem;">
                        Средний чек: <strong style="color: #FFF;">${formatPrice(s.averageCheck || 0)}</strong>
                    </div>
                </div>

                <!-- КАРТОЧКА 2: ФУДКОСТ (COGS) -->
                <div class="stat-widget">
                    <div class="stat-card-header">
                        <span class="stat-label" style="margin: 0;">🥩 Себестоимость сырья</span>
                        <span class="stat-card-badge" style="background: rgba(248, 113, 113, 0.15); color: #F87171;">
                            COGS ~${s.foodCostPercent || 38}%
                        </span>
                    </div>
                    <div class="stat-value" style="color: #F87171;">-${formatPrice(s.totalFoodCost || 0)}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 0.25rem;">
                        Сырье, израсходованное на приготовление
                    </div>
                </div>

                <!-- КАРТОЧКА 3: КУРЬЕРЫ -->
                <div class="stat-widget">
                    <div class="stat-card-header">
                        <span class="stat-label" style="margin: 0;">🛵 Логистика и курьеры</span>
                        <span class="stat-card-badge" style="background: rgba(251, 191, 36, 0.15); color: #FBBF24;">
                            150 ₽ / выезд
                        </span>
                    </div>
                    <div class="stat-value" style="color: #FBBF24;">-${formatPrice(s.totalCourierWages)}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 0.25rem;">
                        Оплата доставки выполненных заказов
                    </div>
                </div>

                <!-- КАРТОЧКА 4: ЧИСТАЯ ПРИБЫЛЬ -->
                <div class="stat-widget" style="border-color: rgba(16, 185, 129, 0.45); background: linear-gradient(145deg, #1A1C22, rgba(16, 185, 129, 0.12));">
                    <div class="stat-card-header">
                        <span class="stat-label" style="margin: 0; color: var(--success); font-weight: 700;">📈 Чистая прибыль</span>
                        <span class="stat-card-badge" style="background: rgba(16, 185, 129, 0.2); color: var(--success);">
                            ${s.netProfitMargin || 0}% маржа
                        </span>
                    </div>
                    <div class="stat-value profit">+${formatPrice(s.netProfit)}</div>
                    <div style="font-size: 0.76rem; color: var(--success); margin-top: 0.25rem;">
                        Выручка − Фудкост − ЗП курьеров
                    </div>
                </div>

                <!-- КАРТОЧКА 5: СКЛАДСКИЕ АКТИВЫ КУХНИ -->
                <div class="stat-widget" style="border-color: rgba(56, 189, 248, 0.35); background: linear-gradient(145deg, #1A1C22, rgba(56, 189, 248, 0.08));">
                    <div class="stat-card-header">
                        <span class="stat-label" style="margin: 0; color: #38BDF8; font-weight: 700;">🏬 Товарные запасы</span>
                        <span class="stat-card-badge" style="background: rgba(56, 189, 248, 0.2); color: #38BDF8;">
                            Актив кухни
                        </span>
                    </div>
                    <div class="stat-value" style="color: #38BDF8;">${formatPrice(s.totalWarehouseValue || 0)}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 0.25rem;">
                        Стоимость продуктов в наличии на складе
                    </div>
                </div>
            </div>

            <!-- ГРАФИКИ: ДИНАМИКА ВЫРУЧКИ И СТРУКТУРА КАТЕГОРИЙ -->
            <div class="charts-grid-2">
                <!-- ГРАФИК 1: ИНТЕРАКТИВНЫЙ SVG ЧАРТ ДИНАМИКИ ВЫРУЧКИ -->
                <div class="chart-box">
                    <div class="chart-header">
                        <div>
                            <div class="chart-title">
                                <span>📊 Динамика выручки и заказов</span>
                            </div>
                            <div class="chart-subtitle">
                                ${period === 'today' || period === 'yesterday' ? 'Почасовая активность кухни (Балашов)' : 'Ежедневная выручка и объем заказов'}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF;">${formatPrice(s.totalRevenue)}</span>
                            <div style="font-size: 0.75rem; color: var(--primary); font-weight: 600;">${s.completedOrdersCount} выполненных</div>
                        </div>
                    </div>
                    
                    <div class="svg-chart-container">
                        ${revenueChartHtml}
                    </div>
                </div>

                <!-- ГРАФИК 2: КРУГОВАЯ ДИАГРАММА / СТРУКТУРА ПО КАТЕГОРИЯМ -->
                <div class="chart-box">
                    <div class="chart-header">
                        <div>
                            <div class="chart-title">
                                <span>🍕 Продажи по категориям</span>
                            </div>
                            <div class="chart-subtitle">Доля выручки по видам блюд</div>
                        </div>
                    </div>

                    ${categoryDonutHtml}
                </div>
            </div>

            <!-- НИЖНИЙ РЯД: ТОП-5 БЛЮД И СПОСОБЫ ОПЛАТЫ / СТАТУСЫ -->
            <div style="display: grid; grid-template-columns: 1.25fr 1fr; gap: 1.5rem;">
                <!-- ТОП 5 БЛЮД ПО ПРОДАЖАМ -->
                <div class="chart-box">
                    <div class="chart-header">
                        <div>
                            <div class="chart-title">
                                <span>🔥 Топ-5 блюд по продажам</span>
                            </div>
                            <div class="chart-subtitle">Лидеры меню по выручке и популярности</div>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                        ${s.topProducts && s.topProducts.length > 0 ? s.topProducts.map((p, idx) => {
                            const percent = Math.round((p.totalSold / maxSold) * 100);
                            return `
                                <div style="background: var(--bg-input); padding: 0.75rem 0.95rem; border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.04);">
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem;">
                                        <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
                                            <span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: ${idx === 0 ? 'var(--primary)' : 'rgba(255, 255, 255, 0.08)'}; color: #FFF; font-weight: 800; font-size: 0.8rem; flex-shrink: 0;">
                                                #${idx + 1}
                                            </span>
                                            ${p.imageUrl ? `<img src="${p.imageUrl}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover; flex-shrink: 0;">` : ''}
                                            <div style="min-width: 0;">
                                                <div style="font-weight: 700; font-size: 0.9rem; color: #FFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
                                                <div style="font-size: 0.72rem; color: var(--text-dim);">${p.categoryName || 'Основное меню'}</div>
                                            </div>
                                        </div>
                                        <div style="text-align: right; flex-shrink: 0; margin-left: 0.5rem;">
                                            <strong style="color: #FFF; font-size: 0.95rem;">${p.totalSold} шт.</strong>
                                            <div style="color: var(--primary); font-size: 0.78rem; font-weight: 600;">${formatPrice(p.totalSum)}</div>
                                        </div>
                                    </div>
                                    <div class="progress-bar-bg" style="margin-top: 0.25rem;">
                                        <div class="progress-bar-fill" style="width: ${percent}%; background: linear-gradient(90deg, var(--primary), #FF8A4C);"></div>
                                    </div>
                                </div>
                            `;
                        }).join('') : `
                            <div style="text-align: center; color: var(--text-muted); padding: 2rem;">Нет проданных блюд за период</div>
                        `}
                    </div>
                </div>

                <!-- СПОСОБЫ ОПЛАТЫ И ВОРОНКА ЗАКАЗОВ -->
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <!-- СПОСОБЫ ОПЛАТЫ -->
                    <div class="chart-box">
                        <div class="chart-header" style="margin-bottom: 0.85rem;">
                            <div>
                                <div class="chart-title">
                                    <span>💳 Способы оплаты</span>
                                </div>
                                <div class="chart-subtitle">Распределение финансовых потоков</div>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                            ${s.paymentMethods && s.paymentMethods.length > 0 ? s.paymentMethods.map(pm => {
                                const icon = pm.method.toLowerCase().includes('карт') ? '💳' : (pm.method.toLowerCase().includes('сбп') ? '⚡' : '💵');
                                return `
                                    <div style="background: var(--bg-input); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm);">
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span>${icon}</span>
                                                <span style="font-weight: 600; color: #FFF;">${pm.method}</span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.6rem;">
                                                <span style="color: var(--text-dim); font-size: 0.78rem;">${pm.count} зак.</span>
                                                <strong style="color: #FFF;">${formatPrice(pm.totalSum)}</strong>
                                                <span style="color: var(--primary); font-size: 0.78rem; font-weight: 700;">${pm.percentage}%</span>
                                            </div>
                                        </div>
                                        <div class="progress-bar-bg">
                                            <div class="progress-bar-fill" style="width: ${pm.percentage}%; background: var(--primary);"></div>
                                        </div>
                                    </div>
                                `;
                            }).join('') : `
                                <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem;">Нет оплат за период</div>
                            `}
                        </div>
                    </div>

                    <!-- ЗАКАЗЫ ПО СТАТУСАМ -->
                    <div class="chart-box">
                        <div class="chart-header" style="margin-bottom: 0.85rem;">
                            <div>
                                <div class="chart-title">
                                    <span>📋 Заказы по статусам</span>
                                </div>
                                <div class="chart-subtitle">Текущее распределение всех заказов</div>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                            ${s.ordersByStatus && s.ordersByStatus.length > 0 ? s.ordersByStatus.map(st => {
                                let badgeColor = 'var(--text-muted)';
                                if (st.statusName.includes('Новый')) badgeColor = 'var(--primary)';
                                else if (st.statusName.includes('Готовится')) badgeColor = '#F59E0B';
                                else if (st.statusName.includes('пути')) badgeColor = '#3B82F6';
                                else if (st.statusName.includes('Доставлен') || st.statusName.includes('Получен')) badgeColor = 'var(--success)';
                                else if (st.statusName.includes('Отменен')) badgeColor = 'var(--danger)';
                                else if (st.statusName.includes('Жалоба')) badgeColor = '#EF4444';

                                return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); padding: 0.55rem 0.75rem; border-radius: var(--radius-sm);">
                                        <span style="font-size: 0.78rem; color: ${badgeColor}; font-weight: 600;">${st.statusName}</span>
                                        <strong style="font-size: 0.95rem; color: #FFF;">${st.count}</strong>
                                    </div>
                                `;
                            }).join('') : `
                                <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem; grid-column: span 2;">Заказов нет</div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Ошибка загрузки статистики: ${err.message}</div>`;
    }
}
window.loadAdminStats = loadAdminStats;

// --- Вспомогательные функции рендеринга интерактивных графиков ---
function renderRevenueSvgChart(dailyRevenue) {
    if (!dailyRevenue || dailyRevenue.length === 0) {
        return '<div style="text-align: center; color: var(--text-muted); padding: 3rem;">Нет данных по выручке за выбранный период</div>';
    }

    const svgW = 680;
    const svgH = 220;
    const padL = 55;
    const padR = 25;
    const padT = 30;
    const padB = 40;
    const chartW = svgW - padL - padR;
    const chartH = svgH - padT - padB;

    const maxRev = Math.max(...dailyRevenue.map(d => d.revenue), 1000);
    const niceMax = Math.ceil(maxRev / 1000) * 1000 || 1000;

    // Сетка
    const gridSteps = [0, 0.5, 1];
    const gridLines = gridSteps.map(step => {
        const val = Math.round(niceMax * step);
        const y = padT + chartH - (step * chartH);
        return `
            <line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4 4" stroke-width="1"/>
            <text x="${padL - 8}" y="${y + 4}" fill="#71717A" font-size="10" text-anchor="end">${val >= 1000 ? (val/1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k' : val} ₽</text>
        `;
    }).join('');

    const n = dailyRevenue.length;
    const colW = chartW / n;
    const barW = Math.min(36, Math.max(14, colW * 0.52));

    let bars = '';
    const points = [];

    dailyRevenue.forEach((d, i) => {
        const cx = padL + i * colW + colW / 2;
        const barH = d.revenue > 0 ? Math.max(6, (d.revenue / niceMax) * chartH) : 4;
        const y = padT + (chartH - barH);
        const x = cx - barW / 2;

        if (d.revenue > 0) {
            points.push({ x: cx, y: y });
        }

        bars += `
            <g class="chart-col-group" style="cursor: pointer;">
                <rect class="chart-bar-rect" x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4"
                    fill="url(#barGradientOrange)"
                    opacity="${d.revenue > 0 ? '1' : '0.2'}"
                    onmouseenter="window.showChartTip(event, '${d.dayLabel}', '${d.revenue}', '${d.ordersCount}')"
                    onmouseleave="window.hideChartTip()"/>
                ${d.revenue > 0 ? `
                    <text x="${cx}" y="${y - 6}" fill="#FF8A4C" font-size="10" font-weight="700" text-anchor="middle">
                        ${d.revenue >= 1000 ? (d.revenue/1000).toFixed(1) + 'k' : d.revenue} ₽
                    </text>
                ` : ''}
                <text x="${cx}" y="${svgH - 12}" fill="#A1A1AA" font-size="10" text-anchor="middle">${d.date}</text>
            </g>
        `;
    });

    let trendPath = '';
    if (points.length > 1) {
        trendPath = `
            <path d="M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}" fill="none" stroke="#FF5A1F" stroke-width="2" stroke-linecap="round" opacity="0.65"/>
            ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#FF5A1F" stroke="#1A1C22" stroke-width="2"/>`).join('')}
        `;
    }

    return `
        <div style="position: relative;">
            <svg viewBox="0 0 ${svgW} ${svgH}" style="width: 100%; height: auto; display: block; overflow: visible;">
                <defs>
                    <linearGradient id="barGradientOrange" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#FF5A1F"/>
                        <stop offset="100%" stop-color="#FF8A4C" stop-opacity="0.65"/>
                    </linearGradient>
                </defs>
                ${gridLines}
                ${trendPath}
                ${bars}
            </svg>
            <div id="chartTooltip" class="chart-tooltip"></div>
        </div>
    `;
}

function renderCategoryDonutChart(categorySales, totalRevenue) {
    if (!categorySales || categorySales.length === 0) {
        return '<div style="text-align: center; color: var(--text-muted); padding: 2.5rem;">Нет продаж в этом периоде</div>';
    }

    const palette = ['#FF5A1F', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#10B981', '#3B82F6'];
    const radius = 55;
    const strokeWidth = 24;
    const circumference = 2 * Math.PI * radius; // ~345.57

    let currentOffset = 0;
    const circles = categorySales.map((cat, idx) => {
        const color = palette[idx % palette.length];
        const dashLength = (cat.percentage / 100) * circumference;
        const offset = -currentOffset;
        currentOffset += dashLength;

        return `
            <circle cx="85" cy="85" r="${radius}" fill="transparent"
                stroke="${color}" stroke-width="${strokeWidth}"
                stroke-dasharray="${dashLength} ${circumference}"
                stroke-dashoffset="${offset}"
                style="transition: stroke-dasharray 0.5s ease; transform: rotate(-90deg); transform-origin: 85px 85px;"/>
        `;
    }).join('');

    const legendItems = categorySales.map((cat, idx) => {
        const color = palette[idx % palette.length];
        return `
            <div style="margin-bottom: 0.6rem;">
                <div class="donut-legend-item">
                    <div style="display: flex; align-items: center; gap: 0.6rem; min-width: 0;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></span>
                        <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #FFF;">${cat.categoryName}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.65rem;">
                        <span style="color: var(--text-dim); font-size: 0.78rem;">${cat.count} шт.</span>
                        <strong style="color: #FFFFFF; font-size: 0.85rem;">${formatPrice(cat.totalSum)}</strong>
                        <span style="font-size: 0.75rem; font-weight: 700; color: ${color}; min-width: 38px; text-align: right;">${cat.percentage}%</span>
                    </div>
                </div>
                <div class="progress-bar-bg" style="margin-top: 0.2rem;">
                    <div class="progress-bar-fill" style="width: ${cat.percentage}%; background: ${color};"></div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div style="display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap;">
            <div style="position: relative; width: 170px; height: 170px; flex-shrink: 0; margin: 0 auto;">
                <svg viewBox="0 0 170 170" style="width: 170px; height: 170px; display: block;">
                    <circle cx="85" cy="85" r="${radius}" fill="transparent" stroke="rgba(255,255,255,0.05)" stroke-width="${strokeWidth}"/>
                    ${circles}
                </svg>
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
                    <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Всего</span>
                    <span style="font-size: 1.05rem; font-weight: 800; color: #FFFFFF;">${formatPrice(totalRevenue)}</span>
                </div>
            </div>
            <div style="flex: 1; min-width: 220px;" class="donut-legend">
                ${legendItems}
            </div>
        </div>
    `;
}

window.showChartTip = (e, dayLabel, revenue, count) => {
    const tip = document.getElementById('chartTooltip');
    if (!tip) return;
    tip.innerHTML = `
        <div style="font-weight: 700; color: var(--primary); margin-bottom: 0.2rem;">📅 ${dayLabel}</div>
        <div style="font-size: 0.82rem; font-weight: 800; color: #FFF;">Выручка: ${formatPrice(parseFloat(revenue))}</div>
        <div style="font-size: 0.75rem; color: #A1A1AA;">Выполнено заказов: <strong>${count} шт.</strong></div>
    `;
    tip.style.display = 'block';
    const container = tip.parentElement;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    tip.style.left = `${Math.min(Math.max(10, x - 50), rect.width - 160)}px`;
    tip.style.top = `${Math.max(10, y - 65)}px`;
};

window.hideChartTip = () => {
    const tip = document.getElementById('chartTooltip');
    if (tip) tip.style.display = 'none';
};

// --- Вкладка: Отзывы и претензии клиентов ---
async function loadAdminFeedbacks() {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    try {
        const res = await api.admin.getFeedbacks();
        if (!res.ok) {
            container.innerHTML = '<div style="color: var(--danger);">Ошибка загрузки отзывов и жалоб</div>';
            return;
        }
        const data = await res.json();
        const issues = data.issues || [];
        const reviews = data.reviews || [];

        container.innerHTML = `
            <div style="margin-bottom: 2.5rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div>
                        <h3 style="font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem;">
                            <span>⚠️</span>
                            <span>Претензии и жалобы по доставке</span>
                            ${issues.length > 0 ? `<span class="cart-badge-count" style="position: static; font-size: 0.8rem; background: var(--danger);">${issues.length}</span>` : ''}
                        </h3>
                        <p style="font-size: 0.82rem; color: var(--text-muted);">Заказы, по которым клиент заявил о проблеме (не получен, опоздание, повреждение)</p>
                    </div>
                </div>

                ${issues.length === 0 ? `
                    <div style="background: var(--bg-card); border: 1px dashed var(--border-color); padding: 1.5rem; border-radius: var(--radius-md); text-align: center; color: var(--text-muted);">
                        🎉 Активных споров и жалоб нет. Все заказы успешно переданы клиентам!
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        ${issues.map(iss => `
                            <div style="background: var(--bg-card); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: var(--radius-md); padding: 1.25rem;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                            <strong style="font-size: 1.05rem; color: #FFF;">Заказ #${iss.orderNumber}</strong>
                                            <span class="tracker-badge" style="background: rgba(239, 68, 68, 0.2); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.4);">
                                                🚨 ${iss.issueType || 'Претензия клиента'}
                                            </span>
                                        </div>
                                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
                                            Клиент: <strong>${iss.customerName}</strong> (${iss.customerPhone}) • Курьер: <strong>${iss.courierName}</strong>
                                        </div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 1.15rem; font-weight: 800; color: var(--primary);">${formatPrice(iss.totalAmount)}</div>
                                        <div style="font-size: 0.78rem; color: var(--text-dim);">${formatDate(iss.createdAt)}</div>
                                    </div>
                                </div>

                                <div style="background: var(--bg-input); padding: 0.75rem 1rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.88rem; border-left: 3px solid var(--danger);">
                                    <span style="color: var(--text-muted); font-size: 0.8rem; display: block; margin-bottom: 0.2rem;">Комментарий клиента:</span>
                                    <em>«${iss.issueComment || 'Клиент отметил, что заказ не был получен или доставлен с нарушением.'}»</em>
                                </div>

                                <div style="display: flex; justify-content: flex-end; gap: 0.75rem; flex-wrap: wrap;">
                                    <button class="btn-secondary" style="font-size: 0.82rem; color: var(--danger); border-color: rgba(239, 68, 68, 0.4);" onclick="window.resolveDispute(${iss.id}, 'reject')">
                                        ❌ Отклонить (клиент не подтвердил)
                                    </button>
                                    <button class="btn-primary" style="font-size: 0.82rem; background: var(--success); border-color: var(--success);" onclick="window.resolveDispute(${iss.id}, 'resolve')">
                                        ✅ Удовлетворить (+100 бонусов компенсации)
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>

            <div>
                <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>⭐</span>
                    <span>Отзывы и оценки клиентов</span>
                </h3>

                ${reviews.length === 0 ? `
                    <div style="background: var(--bg-card); border: 1px dashed var(--border-color); padding: 1.5rem; border-radius: var(--radius-md); text-align: center; color: var(--text-muted);">
                        Отзывов пока нет. Они появляются здесь после того, как клиенты оценивают доставленный заказ со звездами.
                    </div>
                ` : `
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Заказ</th>
                                <th>Клиент</th>
                                <th>Оценка</th>
                                <th>Отзыв</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reviews.map(r => `
                                <tr>
                                    <td style="font-size: 0.8rem; white-space: nowrap;">${formatDate(r.createdAt)}</td>
                                    <td><strong>#${r.orderNumber}</strong></td>
                                    <td>
                                        <div><strong>${r.customerName}</strong></div>
                                        <div style="font-size: 0.8rem; color: var(--text-muted);">${r.customerPhone}</div>
                                    </td>
                                    <td style="white-space: nowrap;">
                                        <span style="color: #FBBF24; font-size: 1rem; letter-spacing: 2px;">
                                            ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
                                        </span>
                                        <strong style="margin-left: 0.35rem; color: #FFF;">${r.rating}/5</strong>
                                    </td>
                                    <td style="font-size: 0.88rem; max-width: 320px;">
                                        ${r.comment ? `«${r.comment}»` : '<span style="color: var(--text-dim);">Без текстового комментария</span>'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<div style="color: var(--danger);">Ошибка при отображении отзывов</div>';
    }
}
window.loadAdminFeedbacks = loadAdminFeedbacks;

window.resolveDispute = async (orderId, action) => {
    const isResolve = action === 'resolve';
    const defaultNote = isResolve ? 'Претензия клиента удовлетворена, начислено +100 бонусов' : 'Претензия отклонена оператором после сверки с курьером';
    const note = prompt(`Решение по претензии к заказу #${orderId}:\nУкажите комментарий оператора для истории:`, defaultNote);
    if (note === null) return;

    try {
        const res = await api.admin.resolveIssue(orderId, action, note);
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Претензия обработана', 'success');
            loadAdminFeedbacks();
        } else {
            showToast(data.message || 'Ошибка обработки спора', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// ==========================================================================
// 10. СТРАНИЦА: О НАС И КОНТАКТЫ (ABOUT)
// ==========================================================================

function renderAbout() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <section class="catalog-section" style="max-width: 900px;">
            <div style="text-align: center; margin-bottom: 2.5rem;">
                <span class="hero-tag">🍔 О сервисе доставки</span>
                <h1 style="font-size: 2.5rem; font-weight: 900; margin-bottom: 0.75rem;">BiteGo — Быстрый Укус</h1>
                <p style="color: var(--text-muted); font-size: 1.1rem;">Городская служба быстрой доставки еды ресторанного качества в г. Балашов</p>
            </div>

            <div class="stat-widget" style="margin-bottom: 1.5rem; line-height: 1.7;">
                <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.75rem; color: var(--primary);">Наша миссия и стандарты</h3>
                <p style="margin-bottom: 1rem; color: var(--text-muted);">
                    Сервис BiteGo был основан в 2026 году в городе Балашов с одной главной целью: готовить и доставлять еду так быстро, чтобы вы получали её с пылу с жару, будто шеф-повар только что подал тарелку на ваш стол.
                </p>
                <p style="color: var(--text-muted);">
                    Мы используем только отборную говядину, фермерские сыры от сыроварен Поволжья и свежие овощи. Каждая пицца выпекается на заказ, а благодаря нашей собственной курьерской службе среднее время доставки по Балашову составляет всего 35 минут.
                </p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                <div class="stat-widget">
                    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 0.5rem;">📍 Адрес кухни и самовывоза</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Саратовская обл., г. Балашов, ул. Ленина, д. 18</p>
                    <div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--primary); font-weight: 700;">Ежедневно с 10:00 до 23:00</div>
                </div>

                <div class="stat-widget">
                    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 0.5rem;">💎 Программа лояльности</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">
                        Получайте <strong>5% кэшбэка</strong> бонусами за каждый завершенный заказ. 1 бонус = 1 рубль. Оплачивайте бонусами до 30% стоимости любого следующего заказа.
                    </p>
                </div>
            </div>

            <div class="stat-widget" style="text-align: center; padding: 2rem;">
                <h3 style="font-size: 1.3rem; font-weight: 800; margin-bottom: 0.5rem;">Есть вопросы или предложения?</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.25rem;">Служба контроля качества и заботы о клиентах всегда на связи</p>
                <a href="tel:88005553535" class="btn-primary" style="font-size: 1.1rem; padding: 0.75rem 2rem; text-decoration: none;">
                    📞 8 (800) 555-35-35 (Бесплатно по РФ)
                </a>
            </div>
        </section>
    `;
}
