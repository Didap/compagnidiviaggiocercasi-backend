/**
 * Custom newsletter-registration routes (loaded alongside the core router)
 */

export default {
    routes: [
        {
            method: 'POST',
            path: '/newsletter-registrations/unsubscribe-me',
            handler: 'newsletter-registration.unsubscribeMe',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'GET',
            path: '/newsletter-registrations/unsubscribe',
            handler: 'newsletter-registration.unsubscribe',
            config: {
                auth: false,
                policies: [],
                middlewares: [],
            },
        },
    ],
};
