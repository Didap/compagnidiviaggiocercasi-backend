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
        {
            method: 'PUT',
            path: '/reviews/:id/publish',
            handler: 'review.publish',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'PUT',
            path: '/reviews/:id/unpublish',
            handler: 'review.unpublish',
            config: {
                policies: [],
                middlewares: [],
            },
        },
    ],
};
