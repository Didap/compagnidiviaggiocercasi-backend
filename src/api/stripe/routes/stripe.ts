
export default {
    routes: [
        {
            method: 'POST',
            path: '/stripe/webhook',
            handler: 'stripe.webhook',
            config: {
                auth: false, // Public access for webhook
                middlewares: [], // We might need a raw body middleware here
            },
        },
    ],
};
