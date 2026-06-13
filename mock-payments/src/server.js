const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();

app.use(express.json());

// Create a Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
  const { amount, currency, invoiceId, successUrl, cancelUrl } = req.body;

  try {
    const amountInCents = Math.round(amount * 100);

    // Create a Payment Session
    // This delegates the UI and PCI compliance to Stripe's hosted pages
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Invoice ${invoiceId.slice(-8).toUpperCase()}`,
              description: 'saasPlug Platform Usage',
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Metadata is critical: it carries the invoiceId to the webhook later
      metadata: { invoiceId }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[payment-service] Checkout session failed:', err.message);
    res.status(500).json({ error: 'SESSION_CREATION_FAILED', message: err.message });
  }
});

const PORT = process.env.PORT || 5008;
app.listen(PORT, () => console.log(`Payment Service running on port ${PORT}`));