// Use runtime API base from `public/env.js` (window.API_BASE)
if (typeof API_BASE === 'undefined') {
    var API_BASE = (window.API_BASE || '').replace(/\/$/, '');
}

function apiPath(path) {
    return API_BASE + path;
}

const contactForm = document.getElementById('contactForm');
const submitButton = document.getElementById('contactSubmit');
const errorMessage = document.getElementById('contactError');
const successMessage = document.getElementById('contactSuccess');

function showError(message) {
    if (!errorMessage) {
        return;
    }
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    if (successMessage) {
        successMessage.style.display = 'none';
    }
}

function showSuccess(message) {
    if (!successMessage) {
        return;
    }
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

if (contactForm) {
    contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = {
            name: document.getElementById('contactName').value.trim(),
            email: document.getElementById('contactEmail').value.trim(),
            subject: document.getElementById('contactSubject').value.trim(),
            emailText: document.getElementById('contactMessage').value.trim(),
            website: document.getElementById('contactWebsite').value.trim()
        };

        if (!payload.name || !payload.email || !payload.subject || !payload.emailText) {
            showError('Vul alle velden in voordat u verzendt.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(payload.email)) {
            showError('Vul een geldig e-mailadres in.');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Bezig met verzenden...';

        try {
            const response = await fetch(apiPath('/api/contact'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                showError(data.error || 'Er ging iets mis bij het verzenden.');
                return;
            }

            showSuccess(data.message || 'Bedankt voor uw bericht. Wij nemen snel contact met u op.');
            contactForm.reset();
        } catch (error) {
            console.error('Contact form error:', error);
            showError('Er ging iets mis bij het verzenden. Probeer het later opnieuw.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Verzenden';
        }
    });
}
