export async function getDemoAccounts() {
    try {
        const response = await fetch('/api/auth/demo-accounts');
        if (response.ok) return await response.json();
    } catch {
        return [];
    }
    return [];
}

export async function login(phone, password) {
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
    });
    
    if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        return true;
    }
    return false;
}

export function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.hash = '/login';
}
