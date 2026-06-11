const processNewsletterSend = async (event: any, isCreate = false) => {
    const { result } = event;

    // Trigger send if sendNow is checked, but only if it hasn't been processed yet
    if (result.sendNow === true && result.isSent === false) {

        // 1. Immediately reset sendNow and set isSent to true to prevent duplicate triggers
        await strapi.entityService.update('api::newsletter-campaign.newsletter-campaign', result.id, {
            data: {
                sendNow: false,
                isSent: true,
                sentAt: new Date().toISOString()
            }
        });

        try {
            // 2. Fetch active subscribers from the newsletter-registration collection
            const subscribers = await strapi.documents('api::newsletter-registration.newsletter-registration').findMany({
                filters: { subscribed: true },
                limit: 10000,
            });

            if (!subscribers || subscribers.length === 0) {
                strapi.log.info('No subscribers found for newsletter campaign.');
                return;
            }

            const total = subscribers.length;

            // 3. Update the campaign with the total number of subscribers it's being sent to
            await strapi.entityService.update('api::newsletter-campaign.newsletter-campaign', result.id, {
                data: {
                    totalSubscribers: total
                }
            });

            strapi.log.info(`Starting newsletter dispatch to ${total} subscribers for campaign ID ${result.id}`);

            // 4. Define the HTML Email Template with site stylings
            // Primary: #cf5827 (Terracotta), Secondary: #45828a (Teal)
            const templateHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background-color: #f4f4f5;
                            margin: 0;
                            padding: 0;
                            -webkit-font-smoothing: antialiased;
                        }
                        .wrapper {
                            width: 100%;
                            background-color: #f4f4f5;
                            padding: 40px 0;
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            background-color: #ffffff;
                            border-radius: 12px;
                            overflow: hidden;
                            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        }
                        .header {
                            background-color: #cf5827; /* Primary */
                            padding: 30px 40px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            color: #ffffff;
                            font-size: 24px;
                            font-weight: 800;
                            letter-spacing: -0.5px;
                        }
                        .content {
                            padding: 40px;
                            color: #334155;
                            font-size: 16px;
                            line-height: 1.6;
                        }
                        .content h1, .content h2, .content h3 {
                            color: #0f172a;
                            margin-top: 0;
                        }
                        .content p {
                            margin: 0 0 20px 0;
                        }
                        .content a {
                            color: #45828a; /* Secondary */
                            text-decoration: none;
                            font-weight: 600;
                        }
                        .content img {
                            max-width: 100%;
                            height: auto;
                            border-radius: 8px;
                        }
                        .button-container {
                            text-align: center;
                            margin: 30px 0;
                        }
                        .button {
                            background-color: #cf5827; /* Primary */
                            color: #ffffff !important;
                            text-decoration: none;
                            padding: 14px 28px;
                            border-radius: 8px;
                            font-weight: 600;
                            display: inline-block;
                        }
                        .footer {
                            background-color: #f8fafc;
                            padding: 30px 40px;
                            text-align: center;
                            border-top: 1px solid #e2e8f0;
                        }
                        .footer p {
                            margin: 0;
                            color: #64748b;
                            font-size: 13px;
                            line-height: 1.5;
                        }
                        @media only screen and (max-width: 600px) {
                            .container {
                                width: 100% !important;
                                border-radius: 0 !important;
                            }
                            .header, .content, .footer {
                                padding: 20px !important;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="wrapper">
                        <div class="container">
                            <div class="header">
                                <h1>Compagni di Viaggio Cercasi</h1>
                            </div>
                            <div class="content">
                                ${result.content}
                            </div>
                            <div class="footer">
                                <p>Hai ricevuto questa email perché ti sei iscritto alla newsletter di Compagni di Viaggio Cercasi.</p>
                                <p style="margin-top: 10px;"><a href="{{UNSUBSCRIBE_URL}}" style="color: #64748b; text-decoration: underline;">Disiscriviti dalla newsletter</a></p>
                                <p style="margin-top: 10px;">&copy; ${new Date().getFullYear()} Compagni di Viaggio Cercasi SRLS. Tutti i diritti riservati.</p>
                            </div>
                        </div>
                    </div>
                </body>
            </html>
            `;

            // 5. Asynchronously send emails to all subscribers
            const sendAllEmails = async () => {
                let successCount = 0;
                let errorCount = 0;

                const backendUrl = (process.env.BACKEND_URL || 'http://localhost:1337').replace(/\/$/, '');

                for (const sub of subscribers) {
                    try {
                        const unsubscribeUrl = `${backendUrl}/api/newsletter-registrations/unsubscribe?token=${sub.unsubscribeToken || ''}`;
                        const emailResult = await strapi.plugins['email'].services.email.send({
                            to: sub.email,
                            from: process.env.RESEND_FROM_EMAIL || 'info@compagnidiviaggiocercasi.it',
                            subject: result.subject,
                            html: templateHtml.replace('{{UNSUBSCRIBE_URL}}', unsubscribeUrl),
                            text: 'Per visualizzare correttamente questa email, utilizza un client di posta che supporti HTML.',
                        });
                        strapi.log.info(`[Newsletter] Success sending to ${sub.email}: ${JSON.stringify(emailResult)}`);
                        successCount++;

                        // Small delay to prevent rate-limiting (e.g., Resend limits)
                        await new Promise(resolve => setTimeout(resolve, 150));
                    } catch (err: any) {
                        errorCount++;
                        strapi.log.error(`[Newsletter] Failed to send to ${sub.email}. Error: ${err.message || JSON.stringify(err)}`);
                    }
                }

                strapi.log.info(`Newsletter dispatch finished for campaign ID ${result.id}. Success: ${successCount}, Errors: ${errorCount}`);
            };

            // Execute the send loop in the background (fire and forget)
            sendAllEmails().catch(err => {
                strapi.log.error('Unhandled error in background newsletter dispatch:', err);
            });

        } catch (err) {
            strapi.log.error('Error initiating newsletter dispatch:', err);
        }
    }
};

export default {
    async afterCreate(event) {
        await processNewsletterSend(event, true);
    },
    async afterUpdate(event) {
        await processNewsletterSend(event, false);
    }
};
