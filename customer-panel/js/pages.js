function contentPage(title, body) {
    return `
        <section class="products-section">
            <div class="container">
                <div class="content-card">
                    <h1>${title}</h1>
                    ${body}
                </div>
            </div>
        </section>
    `;
}

function loadAboutPage() {
    document.getElementById('mainContent').innerHTML = contentPage('About NetMark', `
        <p>NetMark is a multi-store wellness platform for verified NetMark distributors. Customers can shop products, book health appointments, and receive deliveries from local distributor stores.</p>
        <p>Every online store is operated by a verified distributor with an official Head Office code and an active yearly subscription.</p>
    `);
}

function loadContactPage() {
    document.getElementById('mainContent').innerHTML = contentPage('Contact us', `
        <p>For product, appointment, or delivery questions, contact the store you ordered from first. For platform support, email the NetMark team through your registered account email.</p>
        <p>Store owners and distributors should use their dashboard for order and appointment management.</p>
    `);
}

function loadFaqPage() {
    document.getElementById('mainContent').innerHTML = contentPage('Frequently asked questions', `
        <h3>Can a customer own a store?</h3>
        <p>No. Only a verified NetMark distributor with a valid distributor code can activate a store after paying the yearly subscription.</p>
        <h3>How much is store activation?</h3>
        <p>The initial yearly subscription is ${formatCurrency(CONSTANTS.SUBSCRIPTION_FEE)} and lasts 12 months.</p>
        <h3>Which wellness services can I book?</h3>
        <p>${CONSTANTS.APPOINTMENT_SERVICES.map((service) => service.label).join(', ')}.</p>
    `);
}

function loadShippingPage() {
    document.getElementById('mainContent').innerHTML = contentPage('Shipping & delivery', `
        <p>Orders are fulfilled by the distributor store you select at checkout. Delivery fees are set by that store and shown before you place the order.</p>
        <p>Once a driver accepts the delivery, you can track status from My Orders. Driver earnings are confirmed only after the order is marked delivered.</p>
    `);
}

window.loadAboutPage = loadAboutPage;
window.loadContactPage = loadContactPage;
window.loadFaqPage = loadFaqPage;
window.loadShippingPage = loadShippingPage;
