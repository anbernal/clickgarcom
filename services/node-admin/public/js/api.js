// ClickGarçom Admin — API Client
const API_BASE = '/admin/api';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

const api = {
    async get(path, params = {}) {
        const url = new URL(API_BASE + path, window.location.origin);
        url.searchParams.set('tenant_id', TENANT_ID);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, v);
        });
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },

    async post(path, body) {
        const res = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, tenant_id: TENANT_ID }),
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },

    async put(path, body) {
        const res = await fetch(API_BASE + path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },

    async patch(path, body) {
        const res = await fetch(API_BASE + path, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },

    async delete(path) {
        const res = await fetch(API_BASE + path, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },
};

// Toast notifications
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Format currency
function formatCurrency(value) {
    return `R$${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

// Format date
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Format time
function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Status label mapping
function statusLabel(status) {
    const map = {
        PENDING: 'Pendente',
        ACCEPTED: 'Em preparo',
        READY: 'Pronto',
        DELIVERED: 'Entregue',
        CANCELED: 'Cancelado',
    };
    return map[status] || status;
}

function statusClass(status) {
    const map = {
        PENDING: 'status-pending',
        ACCEPTED: 'status-prep',
        READY: 'status-done',
        DELIVERED: 'status-done',
        CANCELED: 'status-canceled',
    };
    return map[status] || '';
}

// Generate gradient for avatars
const gradients = [
    'linear-gradient(135deg, #f97316, #dc2626)',
    'linear-gradient(135deg, #8b5cf6, #3b82f6)',
    'linear-gradient(135deg, #1abc9c, #0891b2)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #ec4899, #8b5cf6)',
    'linear-gradient(135deg, #06b6d4, #3b82f6)',
];

function getGradient(index) {
    return gradients[index % gradients.length];
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}
