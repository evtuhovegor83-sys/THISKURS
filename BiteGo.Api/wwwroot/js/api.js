export const API_BASE = '/api';

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    const response = await fetch(API_BASE + url, options);
    return response;
}

export const api = {
    auth: {
        login: (phone, password) => fetch(API_BASE + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        }),
        register: (data) => fetch(API_BASE + '/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }),
        getProfile: () => fetchWithAuth('/auth/me')
    },
    menu: {
        getCategories: () => fetch(API_BASE + '/menu/categories'),
        getProducts: (categoryId, search) => fetch(`${API_BASE}/menu/products?categoryId=${categoryId || ''}&search=${search || ''}`),
        getProduct: (id) => fetch(API_BASE + '/menu/product/' + id),
        getReviews: () => fetch(API_BASE + '/menu/reviews')
    },
    address: {
        suggest: (query, city) => fetch(`${API_BASE}/address/suggest?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city || 'Балашов')}`),
        searchCities: (query) => fetch(`${API_BASE}/address/cities?query=${encodeURIComponent(query || '')}`)
    },
    order: {
        create: (orderData) => fetchWithAuth('/order', { method: 'POST', body: JSON.stringify(orderData) }),
        getMyOrders: () => fetchWithAuth('/order/my'),
        getOrder: (id) => fetchWithAuth('/order/' + id),
        confirm: (id) => fetchWithAuth(`/order/${id}/confirm`, { method: 'POST' }),
        addReview: (id, rating, comment) => fetchWithAuth(`/order/${id}/review`, { method: 'POST', body: JSON.stringify({ rating, comment }) }),
        reportIssue: (id, issueType, comment) => fetchWithAuth(`/order/${id}/report-issue`, { method: 'POST', body: JSON.stringify({ issueType, comment }) })
    },
    admin: {
        getOrders: (statusId) => fetchWithAuth(`/admin/orders?statusId=${statusId || ''}`),
        updateStatus: (id, statusId, reason) => fetchWithAuth(`/admin/order/${id}/status`, { method: 'PATCH', body: JSON.stringify({ newStatusId: statusId, reason }) }),
        assignCourier: (id, courierId) => fetchWithAuth(`/admin/order/${id}/assign-courier`, { method: 'PATCH', body: JSON.stringify({ courierId }) }),
        getFeedbacks: () => fetchWithAuth('/admin/feedbacks'),
        resolveIssue: (id, action, resolutionNote) => fetchWithAuth(`/admin/order/${id}/resolve-issue`, { method: 'POST', body: JSON.stringify({ action, resolutionNote }) }),
        addProduct: (productData) => fetchWithAuth('/admin/products', { method: 'POST', body: JSON.stringify(productData) }),
        deleteProduct: (id) => fetchWithAuth(`/admin/products/${id}`, { method: 'DELETE' })
    }
};
