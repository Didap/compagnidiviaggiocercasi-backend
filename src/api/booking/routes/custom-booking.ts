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
    ],
};
