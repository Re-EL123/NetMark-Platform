// API Service
class APIService {
    constructor(baseURL) {
        this.baseURL = baseURL;
    }

    async getToken() {
        const user = auth.currentUser;
        if (user) {
            return await user.getIdToken();
        }
        return null;
    }

    async request(endpoint, options = {}) {
        const token = await this.getToken();
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        } else if (!options.skipAuthCheck) {
            // Redirect to login if no token is available for protected endpoints
            window.location.href = 'login.html';
            throw new Error('No authentication token available. Please login again.');
        }

        const config = {
            ...options,
            headers,
        };

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, config);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    // Redirect to login on 401 Unauthorized
                    window.location.href = 'login.html';
                    throw new Error('Unauthorized. Please login again.');
                }
                throw new Error(data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    async upload(endpoint, file, additionalData = {}) {
        const token = await this.getToken();
        const formData = new FormData();
        formData.append('file', file);

        Object.keys(additionalData).forEach(key => {
            formData.append(key, additionalData[key]);
        });

        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        return response.json();
    }
}

const api = new APIService(API_CONFIG.baseURL);
window.api = api;