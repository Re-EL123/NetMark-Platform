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
        }

        const config = {
            ...options,
            headers,
        };
        delete config.requireAuth;
        delete config.optional;

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, config);
            const text = await response.text();
            let data = {};

            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (parseError) {
                    data = { message: text };
                }
            }

            if (!response.ok) {
                if (response.status === 401 && options.requireAuth) {
                    window.location.href = 'login.html';
                    throw new Error('Unauthorized. Please login again.');
                }
                const message = data.message || data.error || 'Request failed';
                throw new Error(message);
            }

            return data;
        } catch (error) {
            if (!options.optional) {
                console.error('API Error:', error);
            }
            throw error;
        }
    }

    async get(endpoint, params = {}, options = {}) {
        const filteredParams = Object.fromEntries(
            Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null)
        );
        const queryString = new URLSearchParams(filteredParams).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET', ...options });
    }

    async tryGet(endpoints, params = {}, options = {}) {
        let lastError;
        for (const endpoint of endpoints) {
            try {
                return await this.get(endpoint, params, { optional: true, ...options });
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('Request failed');
    }

    // POST request
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // PUT request
    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    // DELETE request
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // Upload file
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

// Create API instance
const api = new APIService(API_CONFIG.baseURL);

// Export API instance
window.api = api;