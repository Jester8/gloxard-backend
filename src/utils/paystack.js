import axios from 'axios';
import { env } from '../config/env.js';

/**
 * Verifies a transaction reference directly with Paystack REST API.
 * @param {string} reference - Paystack payment reference string
 * @returns {Promise<Object>} Paystack transaction data object
 */
export const verifyPaystackTransaction = async (reference) => {
  const secretKey = env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured in environment variables');
  }

  // Simulated test reference fallback for unit/integration testing
  // Never honoured in production: it would let anyone unlock paid courses for free.
  if (process.env.NODE_ENV !== 'production' && reference && reference.startsWith('PAYSTACK_TEST_REF_')) {
    return {
      status: 'success',
      amount: 1500000, // 15,000 NGN in Kobo
      currency: 'NGN',
      reference: reference,
      gateway_response: 'Successful',
      paid_at: new Date().toISOString(),
    };
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.data && response.data.status === true) {
      return response.data.data;
    } else {
      throw new Error(response.data?.message || 'Paystack verification failed');
    }
  } catch (error) {
    if (error.response?.data?.message) {
      throw new Error(`Paystack API Error: ${error.response.data.message}`);
    }
    throw error;
  }
};
