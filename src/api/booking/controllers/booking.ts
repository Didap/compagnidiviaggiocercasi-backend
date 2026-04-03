/**
 * booking controller
 */


import { factories } from '@strapi/strapi';
import Stripe from 'stripe';


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);


export default factories.createCoreController('api::booking.booking', ({ strapi }) => {
    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

    return {
        // Seat management is handled by lifecycles.ts (afterUpdate hook)
    // No custom update override needed

    async create(ctx) {
        // 0. Enforce 'pending' status BEFORE validation/creation
        if (!ctx.request.body.data) {
            ctx.request.body.data = {};
        }

        ctx.request.body.data.bookingStatus = 'pending';

        // Preserve flags from request
        const requestInvoice = ctx.request.body.data.requestInvoice === true;
        ctx.request.body.data.requestInvoice = requestInvoice;

        const paymentOption = ctx.request.body.data.paymentOption || 'deposit';
        ctx.request.body.data.paymentOption = paymentOption;

        console.log(`[Create Booking] paymentOption: ${paymentOption}, requestInvoice: ${requestInvoice}`);

        // Participants count
        const participantsPayload = ctx.request.body.data.participants;
        const participantsCount = (Array.isArray(participantsPayload) && participantsPayload.length > 0)
            ? participantsPayload.length
            : 1;

        // PRE-VALIDATION to prevent occupying seats and leaking DB rows
        const offerId = ctx.request.body.data.offer;
        if (offerId) {
            const offerCheck = await strapi.documents('api::offer.offer').findOne({
                documentId: typeof offerId === 'object' ? offerId.documentId || offerId.id || offerId : offerId,
                populate: ['installmentConfigs'],
            });

            if (offerCheck) {
                if (offerCheck.startDate) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const start = new Date(offerCheck.startDate);
                    start.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const daysBeforeClose = typeof (offerCheck as any).daysBeforeClose === 'number' ? (offerCheck as any).daysBeforeClose : 30;
                    if (diffDays < daysBeforeClose) {
                        return ctx.badRequest(`Le prenotazioni per questo viaggio sono chiuse (meno di ${daysBeforeClose} giorni alla partenza).`);
                    }
                }

                if (paymentOption === 'installments' && offerCheck.allowInstallments && offerCheck.installmentConfigs?.length > 0) {
                    const configs = offerCheck.installmentConfigs;
                    const startDate = offerCheck.startDate ? new Date(offerCheck.startDate) : null;
                    let firstDueDate: Date | null = null;
                    if (configs[0].dueDateType === 'relative' && startDate && configs[0].relativeMonths) {
                        firstDueDate = new Date(startDate);
                        firstDueDate.setMonth(firstDueDate.getMonth() - configs[0].relativeMonths);
                    } else if (configs[0].dueDate) {
                        firstDueDate = new Date(configs[0].dueDate);
                    }
                    if (firstDueDate) {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        firstDueDate.setHours(0, 0, 0, 0);
                        if (firstDueDate.getTime() < today.getTime()) {
                            return ctx.badRequest('Il pagamento a rate non è più disponibile per questa offerta.');
                        }
                    }
                }
            } else {
                return ctx.badRequest('Offer not found.');
            }
        } else {
            return ctx.badRequest('Offer is required.');
        }
        // === GUEST CHECKOUT: Auto-create or find user ===
        let guestJwt: string | null = null;
        const currentUser = ctx.state?.user;

        if (!currentUser) {
            // Guest checkout: user is not logged in
            const { email, firstName, lastName, password, phone, codiceFiscale, address, city, zip, province } = ctx.request.body.data;

            if (!email || !firstName || !lastName || !password) {
                return ctx.badRequest('Email, nome, cognome e password sono obbligatori per prenotare.');
            }

            // Check if user already exists
            const existingUsers = await strapi.db.query('plugin::users-permissions.user').findMany({
                where: { email: email.toLowerCase().trim() },
            });

            let userId: any;

            if (existingUsers.length > 0) {
                // User exists: link booking to existing user
                userId = existingUsers[0].documentId || existingUsers[0].id;
                console.log(`[Guest Checkout] Found existing user ${userId} for email ${email}`);

                // Update user's profile fields if they were empty
                const existingUser = existingUsers[0];
                const updateData: any = {};
                if (!existingUser.codiceFiscale && codiceFiscale) updateData.codiceFiscale = codiceFiscale;
                if (!existingUser.address && address) updateData.address = address;
                if (!existingUser.city && city) updateData.city = city;
                if (!existingUser.zip && zip) updateData.zip = zip;
                if (!existingUser.province && province) updateData.province = province;

                if (Object.keys(updateData).length > 0) {
                    await strapi.documents('plugin::users-permissions.user').update({
                        documentId: userId,
                        data: updateData,
                    });
                    console.log(`[Guest Checkout] Updated profile fields for existing user ${userId}`);
                }
            } else {
                // Create new user with user-provided password

                // Find the authenticated role
                const authenticatedRole = await strapi.db.query('plugin::users-permissions.role').findOne({
                    where: { type: 'authenticated' },
                });

                const newUser = await strapi.documents('plugin::users-permissions.user').create({
                    data: {
                        username: email.toLowerCase().trim(),
                        email: email.toLowerCase().trim(),
                        password: password,
                        provider: 'local',
                        confirmed: true,
                        blocked: false,
                        role: authenticatedRole?.documentId || authenticatedRole?.id,
                        firstName: firstName,
                        lastName: lastName,
                        phone: phone || null,
                        codiceFiscale: codiceFiscale || null,
                        address: address || null,
                        city: city || null,
                        zip: zip || null,
                        province: province || null,
                    } as any,
                });

                userId = newUser.documentId || newUser.id;
                console.log(`[Guest Checkout] Created new user ${userId} for email ${email}`);

                // Generate JWT for redirect after Stripe payment
                const jwtService = strapi.plugin('users-permissions').service('jwt');
                guestJwt = jwtService.issue({ id: newUser.id });

                // Note: Welcome email is sent automatically by the global user afterCreate lifecycle in index.ts
            }

            // Assign user to the booking payload
            ctx.request.body.data.user = userId;
            ctx.request.body.data.guestEmail = email.toLowerCase().trim();

            // Fake the auth context so Strapi's core controller doesn't reject
            ctx.state.user = existingUsers?.length > 0
                ? existingUsers[0]
                : await strapi.db.query('plugin::users-permissions.user').findOne({ where: { email: email.toLowerCase().trim() } });
        } else {
            // Logged-in user: update their profile fields if provided
            const { codiceFiscale, address, city, zip, province } = ctx.request.body.data;
            const updateData: any = {};
            if (codiceFiscale) updateData.codiceFiscale = codiceFiscale;
            if (address) updateData.address = address;
            if (city) updateData.city = city;
            if (zip) updateData.zip = zip;
            if (province) updateData.province = province;

            if (Object.keys(updateData).length > 0) {
                const userDocId = currentUser.documentId || currentUser.id;
                await strapi.documents('plugin::users-permissions.user').update({
                    documentId: userDocId,
                    data: updateData,
                });
                console.log(`[Create Booking] Updated profile fields for user ${userDocId}`);
            }
        }

        // Persist address/tax fields on the booking itself
        // (so the booking record has a snapshot of the data at booking time)
        ctx.request.body.data.codiceFiscale = ctx.request.body.data.codiceFiscale || null;
        ctx.request.body.data.address = ctx.request.body.data.address || null;
        ctx.request.body.data.city = ctx.request.body.data.city || null;
        ctx.request.body.data.zip = ctx.request.body.data.zip || null;
        ctx.request.body.data.province = ctx.request.body.data.province || null;

        // Clean up non-schema keys before Strapi validation
        // These were used above for guest checkout logic but are not part of the booking schema
        delete ctx.request.body.data.selectedSupplements;
        delete ctx.request.body.data.email;
        delete ctx.request.body.data.firstName;
        delete ctx.request.body.data.lastName;
        delete ctx.request.body.data.password;
        delete ctx.request.body.data.phone;

        // Save the offer documentId, then remove it from payload to avoid relation validation
        const offerDocumentId = ctx.request.body.data.offer;
        delete ctx.request.body.data.offer;
        // Also remove user (we'll link via query engine)
        delete ctx.request.body.data.user;

        // 1. Create the booking via Document Service WITHOUT the offer relation (no relation = no validation)
        const createdBooking = await strapi.documents('api::booking.booking').create({
            data: {
                ...ctx.request.body.data,
            },
            status: 'published',
        });

        const bookingDocId = createdBooking.documentId;
        const bookingId = createdBooking.id;
        console.log(`[Create Booking] Created Booking ID: ${bookingId}, DocID: ${bookingDocId}`);

        // 2. Link the offer and user via Document Service update (update does NOT validate relations like create does)
        const userDocId = ctx.state.user?.documentId || ctx.state.user?.id || null;
        await strapi.documents('api::booking.booking').update({
            documentId: bookingDocId,
            data: {
                offer: offerDocumentId,
                ...(userDocId ? { user: userDocId } : {}),
            } as any,
        });
        console.log(`[Create Booking] Linked offer ${offerDocumentId} and user ${userDocId || 'none'} to booking ${bookingDocId}`);

        // 2. Fetch booking with relations (include installmentConfigs)
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: bookingDocId,
            populate: ['offer', 'offer.trip', 'offer.installmentConfigs', 'participants', 'user'],
        });

        if (!booking || !booking.offer) {
            return ctx.badRequest('Booking created but offer not found.');
        }

        const offer = booking.offer as any;
        const totalPricePerPerson = Number(offer.price);
        const depositPerPerson = Number(offer.depositPrice);
        const tripTitle = offer.trip?.title || 'Viaggio';
        // price is now the TOTAL price; depositPrice is included in it
        const totalPrice = totalPricePerPerson * participantsCount;
        const totalDeposit = depositPerPerson * participantsCount;

        // (Booking deadline validated prior to creation)

        // 3. Generate payment steps based on paymentOption
        let paymentSteps: any[] = [];
        let firstStepAmount = 0;
        let firstStepName = '';

        if (paymentOption === 'full') {
            // Single step: full price
            firstStepAmount = totalPrice;
            firstStepName = 'Pagamento totale';
            paymentSteps = [
                { name: 'Pagamento totale', amount: totalPrice, status: 'pending' },
            ];
        } else if (paymentOption === 'installments' && offer.allowInstallments) {
            const configs = offer.installmentConfigs;
            // Installments apply to the balance (total price minus deposit)
            const totalPriceOnly = (totalPricePerPerson - depositPerPerson) * participantsCount;

            // Step 0: Acconto (deposit) — always paid immediately
            paymentSteps.push({
                name: 'Acconto',
                amount: totalDeposit,
                status: 'pending',
            });

            if (Array.isArray(configs) && configs.length > 0) {
                // --- Admin-defined percentage-based installment schedule ---
                const startDate = offer.startDate ? new Date(offer.startDate) : null;

                // Resolve due dates and validate first one
                const resolvedConfigs = configs.map((cfg: any) => {
                    let resolvedDueDate: Date | null = null;
                    if (cfg.dueDateType === 'relative' && startDate && cfg.relativeMonths) {
                        resolvedDueDate = new Date(startDate);
                        resolvedDueDate.setMonth(resolvedDueDate.getMonth() - cfg.relativeMonths);
                    } else if (cfg.dueDate) {
                        resolvedDueDate = new Date(cfg.dueDate);
                    }
                    return { ...cfg, resolvedDueDate };
                });

                // (First due date validated prior to creation)

                // Map configs to installment steps using percentage on PRICE ONLY
                const numInstallments = resolvedConfigs.length;
                let usedSum = 0;

                for (let i = 0; i < resolvedConfigs.length; i++) {
                    const cfg = resolvedConfigs[i];
                    const cfgAmountPerPerson = Number(cfg.amount) || 0;
                    const isLast = i === resolvedConfigs.length - 1;

                    const remainingBalance = Math.round((totalPriceOnly - usedSum) * 100) / 100;
                    let stepAmount = 0;

                    if (isLast) {
                        stepAmount = Math.max(0, remainingBalance);
                    } else {
                        stepAmount = Math.max(0, Math.round((cfgAmountPerPerson * participantsCount) * 100) / 100);
                        if (stepAmount > remainingBalance) {
                            stepAmount = remainingBalance;
                        }
                    }

                    usedSum += stepAmount;

                    const dueDateStr = cfg.resolvedDueDate ? cfg.resolvedDueDate.toISOString().split('T')[0] : null;
                    paymentSteps.push({
                        name: cfg.name || `Rata ${i + 1} di ${numInstallments}`,
                        amount: stepAmount,
                        dueDate: dueDateStr,
                        status: 'pending',
                    });
                }
            } else {
                // --- Fallback: equal-split installments on price only ---
                const count = offer.installmentsCount || 3;
                const isEvenlyDivisible = totalPriceOnly % count === 0;
                const evenAmount = totalPriceOnly / count;

                if (isEvenlyDivisible) {
                    for (let i = 0; i < count; i++) {
                        paymentSteps.push({
                            name: `Rata ${i + 1} di ${count}`,
                            amount: evenAmount,
                            status: 'pending',
                        });
                    }
                } else {
                    const installmentAmount = Math.floor(evenAmount * 100) / 100;
                    let fallbackSum = 0;
                    for (let i = 0; i < count; i++) {
                        const isLast = i === count - 1;
                        const stepAmount = isLast
                            ? Math.round((totalPriceOnly - fallbackSum) * 100) / 100
                            : installmentAmount;
                        if (!isLast) fallbackSum += stepAmount;
                        paymentSteps.push({
                            name: `Rata ${i + 1} di ${count}`,
                            amount: stepAmount,
                            status: 'pending',
                        });
                    }
                }
            }
            // First step is always the Acconto (deposit)
            firstStepAmount = paymentSteps[0].amount;
            firstStepName = paymentSteps[0].name;
        } else {
            // Default: deposit now, balance later
            const balance = totalPrice - totalDeposit;
            firstStepAmount = totalDeposit;
            firstStepName = 'Acconto';
            paymentSteps = [
                { name: 'Acconto', amount: totalDeposit, status: 'pending' },
                { name: 'Saldo', amount: balance, status: 'pending' },
            ];
        }

        console.log(`[Create Booking] Generated ${paymentSteps.length} payment steps. First: "${firstStepName}" = €${firstStepAmount}`);

        // 4. Save payment steps to the booking
        await strapi.documents('api::booking.booking').update({
            documentId: bookingDocId,
            data: {
                paymentSteps,
            } as any,
        });

        // The booking is now automatically public since Draft & Publish is disabled

        // 5. Create Stripe Checkout Session for the FIRST step only
        try {
            const hasRequestedInvoice = requestInvoice;
            console.log(`[Create Booking] Invoice requested: ${hasRequestedInvoice}`);

            const sessionOptions: Stripe.Checkout.SessionCreateParams = {
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `${firstStepName} per: ${tripTitle}`,
                                description: `Prenotazione #${bookingId} - ${participantsCount} partecipanti`,
                            },
                            unit_amount: Math.round(firstStepAmount * 100),
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: guestJwt
                    ? `${baseUrl}/prenotazione/successo?session_id={CHECKOUT_SESSION_ID}&guest_jwt=${guestJwt}`
                    : `${baseUrl}/prenotazione/successo?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${baseUrl}/prenotazione/annullato?offer_id=${offer.documentId}`,
                metadata: {
                    booking_id: bookingDocId,
                    offer_id: offer.documentId,
                    payment_step_index: '0',
                    request_invoice: hasRequestedInvoice ? 'true' : 'false',
                },
            };

            // Invoice + tax options
            if (hasRequestedInvoice) {
                console.log('[Create Booking] Configuring Stripe session for Invoice, Tax ID and Billing Address');
                sessionOptions.tax_id_collection = { enabled: true };
                sessionOptions.billing_address_collection = 'required';
                sessionOptions.invoice_creation = { enabled: true };
                if ((booking as any).user?.email) {
                    sessionOptions.customer_email = (booking as any).user.email;
                }
            }

            const session = await stripe.checkout.sessions.create(sessionOptions);
            console.log(`[Create Booking] Stripe Session Created: ${session.id}`);

            // Save Stripe session ID to the first payment step
            const updatedSteps = [...paymentSteps];
            updatedSteps[0].stripeSessionId = session.id;
            await strapi.documents('api::booking.booking').update({
                documentId: bookingDocId,
                data: {
                    paymentSteps: updatedSteps,
                } as any,
            });

            return {
                data: createdBooking,
                meta: {
                    checkoutUrl: session.url,
                    ...(guestJwt ? { guestJwt } : {}),
                },
            };
        } catch (error: any) {
            console.error('Stripe Session Error:', error);
            return ctx.internalServerError(`Could not create Stripe session: ${error.message || 'Unknown error'}`);
        }
    },

    /**
     * POST /api/bookings/:id/payment-session
     * Creates a Stripe Checkout Session for a specific pending payment step.
     */
    async createPaymentSession(ctx) {
        const { id: bookingDocId } = ctx.params;
        const { stepIndex } = ctx.request.body;

        if (stepIndex === undefined || stepIndex === null) {
            return ctx.badRequest('stepIndex is required');
        }

        // 1. Fetch booking with relations
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: bookingDocId,
            populate: ['offer', 'offer.trip', 'paymentSteps', 'user'],
        });

        if (!booking) {
            return ctx.notFound('Booking not found');
        }

        // 2. Verify ownership
        const currentUser = ctx.state.user;
        const bookingUser = (booking as any).user;

        console.log(`[PaymentSession] Ownership try: Request from user ${currentUser?.id || currentUser?.documentId}, Booking belongs to ${bookingUser?.id || bookingUser?.documentId}`);

        if (!currentUser) {
            return ctx.forbidden('You must be logged in to pay for a booking.');
        }

        const isOwner = bookingUser && (
            bookingUser.id === currentUser.id ||
            bookingUser.documentId === currentUser.documentId
        );
        const isAdmin = currentUser.role?.type === 'admin'; // If roles are populated on state.user

        if (!isOwner && !isAdmin) {
            return ctx.forbidden('You can only pay for your own bookings');
        }

        // 3. Validate the payment step
        const paymentSteps = (booking as any).paymentSteps || [];
        const step = paymentSteps[stepIndex];

        if (!step) {
            return ctx.badRequest(`Payment step ${stepIndex} not found`);
        }

        if (step.status === 'paid') {
            return ctx.badRequest('This payment step is already paid');
        }

        const offer = booking.offer as any;
        const tripTitle = offer?.trip?.title || 'Viaggio';
        const bookingId = (booking as any).id;

        // 4. Create Stripe session
        try {
            const sessionOptions: Stripe.Checkout.SessionCreateParams = {
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `${step.name} per: ${tripTitle}`,
                                description: `Prenotazione #${bookingId}`,
                            },
                            unit_amount: Math.round(step.amount * 100),
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${baseUrl}/profilo?success=true`,
                cancel_url: `${baseUrl}/profilo`,
                metadata: {
                    booking_id: bookingDocId,
                    offer_id: offer.documentId,
                    payment_step_index: String(stepIndex),
                },
            };

            // Invoice options if booking was created with invoice request
            if ((booking as any).requestInvoice) {
                sessionOptions.tax_id_collection = { enabled: true };
                sessionOptions.billing_address_collection = 'required';
                sessionOptions.invoice_creation = { enabled: true };
                if (bookingUser?.email) {
                    sessionOptions.customer_email = bookingUser.email;
                }
            }

            const session = await stripe.checkout.sessions.create(sessionOptions);
            console.log(`[PaymentSession] Created Stripe session ${session.id} for step ${stepIndex} of booking ${bookingDocId}`);

            // Save Stripe session ID to the step
            paymentSteps[stepIndex].stripeSessionId = session.id;
            await strapi.documents('api::booking.booking').update({
                documentId: bookingDocId,
                data: { paymentSteps } as any,
            });

            return { checkoutUrl: session.url };
        } catch (error: any) {
            console.error('[PaymentSession] Stripe Error:', error);
            return ctx.internalServerError(`Could not create payment session: ${error.message || 'Unknown error'}`);
        }
    },

    /**
     * GET /api/bookings/preview-email/:template
     * Previews the HTML email templates.
     */
    async previewEmail(ctx) {
        const { template } = ctx.params;
        const emailService = require('../services/email').default;

        const mockData = {
            userName: 'Alessandro',
            tripTitle: 'Avventura in Islanda',
            destination: 'Islanda e Aurore Boreali',
            startDate: '2026-06-15',
            endDate: '2026-06-25',
            participantsCount: 2,
            totalPrice: 2450,
            depositPrice: 500,
            paymentSteps: [
                { name: 'Acconto', amount: 500, status: 'paid', dueDate: '2026-02-20' },
                { name: 'Rata 1', amount: 975, status: 'pending', dueDate: '2026-04-15' },
                { name: 'Rata 2', amount: 975, status: 'pending', dueDate: '2026-05-15' },
            ],
        };

        const templates: any = {
            welcome: () => require('../services/email').default.sendWelcomeEmailHtml(mockData.userName),
            confirmation: () => require('../services/email').default.sendBookingConfirmedHtml(mockData),
            receipt: () => require('../services/email').default.sendPaymentReceiptHtml(mockData, 'Rata 1', 975),
            cancelled: () => require('../services/email').default.sendBookingCancelledHtml(mockData),
            reminder: () => require('../services/email').default.sendInstallmentReminderHtml(mockData, 'Rata 1', 975, '2026-04-15', false),
            reminder_urgent: () => require('../services/email').default.sendInstallmentReminderHtml(mockData, 'Rata 1', 975, '2026-04-15', true),
            trip_30: () => require('../services/email').default.sendTripReminderHtml(mockData, 30),
            trip_14: () => require('../services/email').default.sendTripReminderHtml(mockData, 14),
            trip_7: () => require('../services/email').default.sendTripReminderHtml(mockData, 7),
            trip_1: () => require('../services/email').default.sendTripReminderHtml(mockData, 1),
        };

        // Note: I need to export the HTML-generating functions in email.ts or adapt here.
        // Actually, let's adapt email.ts to export the HTML functions or just call them here.
        // I'll update email.ts to export the HTML generators.

        ctx.type = 'text/html';

        if (templates[template]) {
            // Wait, email.ts exports sendX functions that send. I need the HTML.
            // Let's modify email.ts to export the HTML-only versions.
            return ctx.body = templates[template]();
        }

        return ctx.notFound('Template not found. Available: ' + Object.keys(templates).join(', '));
    },
}});
