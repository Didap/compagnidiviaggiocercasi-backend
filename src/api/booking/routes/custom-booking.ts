/**
 * Custom booking routes (loaded alongside the core router)
 */

export default {
    routes: [
        {
            method: 'POST',
            path: '/bookings/:id/payment-session',
            handler: 'booking.createPaymentSession',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'GET',
            path: '/bookings/preview-email/:template',
            handler: 'booking.previewEmail',
            config: {
                auth: false, // Temporarily disable auth for easy previewing
                policies: [],
                middlewares: [],
            },
        },
    ],
};
