export default ({ env }) => ({
    'users-permissions': {
        config: {
            register: {
                allowedFields: ['firstName', 'lastName', 'phone', 'birthday', 'codiceFiscale', 'address', 'city', 'zip', 'province'],
            },
        },
    },
    upload: {
        config: {
            provider: 'cloudinary',
            providerOptions: {
                cloud_name: env('CLOUDINARY_NAME'),
                api_key: env('CLOUDINARY_KEY'),
                api_secret: env('CLOUDINARY_SECRET'),
            },
            actionOptions: {
                upload: {},
                uploadStream: {},
                delete: {},
            },
        },
    },
    email: {
        config: {
            provider: 'strapi-provider-email-resend',
            providerOptions: {
                apiKey: env('RESEND_API_KEY'),
            },
            settings: {
                defaultFrom: env('RESEND_FROM_EMAIL'),
                defaultReplyTo: env('RESEND_FROM_EMAIL'),
            },
        },
    },
});
