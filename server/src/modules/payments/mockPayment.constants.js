export const MOCK_PLANS = Object.freeze({
  basic: {
    id: 'basic',
    name: 'Basic CAD Explorer',
    amount: 19,
    currency: 'USD',
    billingInterval: 'month',
    features: ['2D Drafting tools', '5 Active projects', 'Standard community support'],
  },
  starter: {
    id: 'starter',
    name: 'Starter Modeler',
    amount: 29,
    currency: 'USD',
    billingInterval: 'month',
    features: ['2D & 3D CAD modeling', 'Unlimited projects', 'Standard rendering engine'],
  },
  pro: {
    id: 'pro',
    name: 'Professional Engineer',
    amount: 79,
    currency: 'USD',
    billingInterval: 'month',
    popular: true,
    features: ['Advanced 3D Assemblies', 'Photorealistic rendering', 'Priority API & export pipelines'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Industrial',
    amount: 199,
    currency: 'USD',
    billingInterval: 'month',
    features: ['Full parametric CAD suite', 'Multi-user collaboration', 'Dedicated support SLA'],
  },
});

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
});

export const SIMULATION_OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
});
