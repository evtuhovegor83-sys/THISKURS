// ==========================================================================
// Cart State & Management
// ==========================================================================
import { formatPrice } from './ui.js';

let cart = [];
let bonusPointsToUse = 0;
let userBonusBalance = 0;

export function initCart() {
    try {
        const saved = localStorage.getItem('bitego_cart');
        if (saved) cart = JSON.parse(saved);
    } catch {
        cart = [];
    }
    updateCartUI();
}

export function saveCart() {
    localStorage.setItem('bitego_cart', JSON.stringify(cart));
    updateCartUI();
}

export function getCartItems() {
    return cart;
}

export function getCartSubtotal() {
    return cart.reduce((sum, item) => sum + item.itemTotalPrice * item.quantity, 0);
}

export function getBonusDiscount() {
    return bonusPointsToUse;
}

export function getFinalTotal() {
    return Math.max(0, getCartSubtotal() - bonusPointsToUse);
}

export function setBonusUsage(use, balance) {
    userBonusBalance = balance;
    if (!use) {
        bonusPointsToUse = 0;
    } else {
        const subtotal = getCartSubtotal();
        const maxAllowed = Math.floor(subtotal * 0.30);
        bonusPointsToUse = Math.min(balance, maxAllowed);
    }
    updateCartUI();
}

export function addToCart(product, quantity = 1, excludedIngredients = [], addons = []) {
    // Рассчитываем стоимость 1 порции с учетом дополнений и скидки за исключенные ингредиенты
    const addonsTotal = addons.reduce((sum, a) => sum + a.price, 0);
    const ingredientDiscount = (excludedIngredients?.length || 0) * 40;
    const effectiveBasePrice = Math.max(150, product.price - ingredientDiscount);
    const unitTotal = effectiveBasePrice + addonsTotal;

    const excludedText = excludedIngredients.length > 0 ? excludedIngredients.join(', ') : '';
    const addonsText = addons.map(a => `${a.name} (+${a.price} ₽)`).join(', ');

    // Проверяем, есть ли точно такой же товар с такими же модификаторами
    const existingIndex = cart.findIndex(i => 
        i.productId === product.id && 
        i.excludedIngredients.join(',') === excludedIngredients.join(',') &&
        i.addonIds.sort().join(',') === addons.map(a => a.id).sort().join(',')
    );

    if (existingIndex > -1) {
        cart[existingIndex].quantity += quantity;
    } else {
        cart.push({
            productId: product.id,
            name: product.name,
            imageUrl: product.imageUrl,
            basePrice: product.price,
            itemTotalPrice: unitTotal,
            quantity: quantity,
            excludedIngredients: excludedIngredients,
            excludedText: excludedText,
            addonIds: addons.map(a => a.id),
            addonsText: addonsText
        });
    }

    saveCart();
}

export function updateQuantity(index, delta) {
    if (cart[index]) {
        cart[index].quantity += delta;
        if (cart[index].quantity <= 0) {
            cart.splice(index, 1);
        }
        saveCart();
    }
}

export function clearCart() {
    cart = [];
    bonusPointsToUse = 0;
    saveCart();
}

export function updateCartUI() {
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = getCartSubtotal();
    const finalTotal = getFinalTotal();

    const badge = document.getElementById('cartBadgeCount');
    const priceDisplay = document.getElementById('cartTotalPrice');
    if (badge) badge.textContent = totalCount;
    if (priceDisplay) priceDisplay.textContent = formatPrice(finalTotal);

    // Отрисовка списка товаров в боковом меню корзины
    const listEl = document.getElementById('cartItemsList');
    if (listEl) {
        if (cart.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 0.75rem;">🛒</div>
                    <h4 style="font-size: 1.1rem; color: #FFF; margin-bottom: 0.5rem;">Ваша корзина пуста</h4>
                    <p style="font-size: 0.85rem;">Добавьте вкуснейшую пиццу, бургер или роллы из нашего меню!</p>
                </div>
            `;
            const checkoutBtn = document.getElementById('cartCheckoutBtn');
            if (checkoutBtn) checkoutBtn.disabled = true;
        } else {
            listEl.innerHTML = cart.map((item, idx) => `
                <div class="cart-item">
                    <img src="${item.imageUrl}" class="cart-item-img" alt="${item.name}">
                    <div class="cart-item-info">
                        <div class="cart-item-title">${item.name}</div>
                        ${item.excludedText ? `<div class="cart-item-mods" style="color: #FF8A8A;">Без: ${item.excludedText}</div>` : ''}
                        ${item.addonsText ? `<div class="cart-item-mods" style="color: #FFA477;">Доп: ${item.addonsText}</div>` : ''}
                        <div class="cart-item-controls">
                            <span style="font-weight: 700; color: #FFF;">${formatPrice(item.itemTotalPrice * item.quantity)}</span>
                            <div class="qty-control">
                                <button class="qty-btn" onclick="window.changeCartQty(${idx}, -1)">−</button>
                                <span style="font-weight: 700; font-size: 0.85rem; min-width: 16px; text-align: center;">${item.quantity}</span>
                                <button class="qty-btn" onclick="window.changeCartQty(${idx}, 1)">+</button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');

            const checkoutBtn = document.getElementById('cartCheckoutBtn');
            if (checkoutBtn) checkoutBtn.disabled = false;
        }
    }

    const subtotalEl = document.getElementById('cartSubtotal');
    if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

    const bonusRowEl = document.getElementById('cartBonusRow');
    const bonusDiscountEl = document.getElementById('cartBonusDiscount');
    if (bonusRowEl && bonusDiscountEl) {
        if (bonusPointsToUse > 0) {
            bonusRowEl.style.display = 'flex';
            bonusDiscountEl.textContent = `-${formatPrice(bonusPointsToUse)}`;
        } else {
            bonusRowEl.style.display = 'none';
        }
    }

    const finalTotalEl = document.getElementById('cartFinalTotal');
    if (finalTotalEl) finalTotalEl.textContent = formatPrice(finalTotal);

    const checkoutTotalEl = document.getElementById('checkoutTotalPriceDisplay');
    if (checkoutTotalEl) checkoutTotalEl.textContent = formatPrice(finalTotal);
}
