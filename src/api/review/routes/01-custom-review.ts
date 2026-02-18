export default {
    routes: [
        {
            method: 'GET',
            path: '/reviews/mine',
            handler: 'review.myReviews',
            config: {
                policies: [],
                middlewares: [],
            },
        },
    ],
};
