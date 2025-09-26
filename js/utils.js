// API Service Functions
const API = {
    async makeRequest(endpoint, options = {}) {
        const token = localStorage.getItem('userToken');
        const defaults = {
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        };
        
        try {
            const response = await fetch(`/api${endpoint}`, { ...defaults, ...options });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'API request failed');
            }
            
            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    },
    
    auth: {
        async getOTP(identifier) {
            return API.makeRequest('/auth/get-otp', {
                method: 'POST',
                body: JSON.stringify({ identifier })
            });
        },
        
        async verifyOTP(identifier, otp) {
            return API.makeRequest('/auth/verify-otp', {
                method: 'POST',
                body: JSON.stringify({ identifier, otp })
            });
        }
    },
    
    events: {
        async uploadSelfie(eventId, guestEmail, file) {
            const formData = new FormData();
            formData.append('selfie', file);
            formData.append('eventId', eventId);
            formData.append('guestEmail', guestEmail);
            
            return API.makeRequest('/events/upload-selfie', {
                method: 'POST',
                headers: {},  // Let browser set correct Content-Type with boundary
                body: formData
            });
        },
        
        async getPhotos(eventId, guestEmail) {
            return API.makeRequest(`/events/${eventId}/photos?guestEmail=${encodeURIComponent(guestEmail)}`);
        },
        
        async processPhotos(eventId) {
            return API.makeRequest(`/events/${eventId}/process`, { method: 'POST' });
        }
    }
};

// UI Utility Functions
const UI = {
    showAlert(message, type = 'error') {
        const alertBox = document.createElement('div');
        alertBox.className = `alert alert-${type === 'error' ? 'danger' : 'success'}`;
        alertBox.textContent = message;
        
        document.body.appendChild(alertBox);
        setTimeout(() => alertBox.remove(), 5000);
    },
    
    toggleLoading(element, isLoading = true) {
        if (isLoading) {
            element.classList.add('loading');
            element.disabled = true;
        } else {
            element.classList.remove('loading');
            element.disabled = false;
        }
    },
    
    createImageGrid(photos, container) {
        container.innerHTML = '';
        
        if (!photos.length) {
            const message = document.createElement('p');
            message.className = 'text-center text-gray';
            message.textContent = 'No photos found';
            container.appendChild(message);
            return;
        }
        
        const grid = document.createElement('div');
        grid.className = 'image-grid';
        
        photos.forEach(photo => {
            const img = document.createElement('img');
            img.src = photo;
            img.alt = 'Event photo';
            img.loading = 'lazy';
            grid.appendChild(img);
        });
        
        container.appendChild(grid);
    },
    
    setupFileUpload(dropzone, onUpload) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = false;
        input.style.display = 'none';
        
        dropzone.appendChild(input);
        
        // Click handling
        dropzone.addEventListener('click', () => input.click());
        
        // Drag and drop handling
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => {
                dropzone.classList.add('dragover');
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => {
                dropzone.classList.remove('dragover');
            });
        });
        
        // File handling
        const handleFile = file => {
            if (!file.type.match(/^image\/(jpeg|png)$/)) {
                UI.showAlert('Please upload a valid image file (JPG or PNG)');
                return;
            }
            
            if (file.size > 5 * 1024 * 1024) {
                UI.showAlert('Image size should not exceed 5MB');
                return;
            }
            
            onUpload(file);
        };
        
        input.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) handleFile(file);
        });
        
        dropzone.addEventListener('drop', e => {
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });
    }
};

// Utility Functions
const Util = {
    validateEmail(email) {
        return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
    },
    
    validatePhone(phone) {
        return /^[0-9]{10}$/.test(phone);
    },
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },
    
    generateQRCode(text, canvas) {
        return new Promise((resolve, reject) => {
            QRCode.toCanvas(canvas, text, { width: 200 }, error => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
};