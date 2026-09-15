export type PaymentCollectionMode = 'bookings_only' | 'prepaid';

export type DoctorGatewayStatus = 'pending' | 'connected' | 'invalid' | 'disconnected';

export interface GatewayCredentials {
  keyId: string;
  keySecret: string;
}

export interface DoctorGatewayPublicStatus {
  connected: boolean;
  gateway: 'razorpay' | null;
  maskedKeyId: string | null;
  status: DoctorGatewayStatus | null;
  lastVerifiedAt: string | null;
  paymentCollectionMode: PaymentCollectionMode;
  webhookConfigured: boolean;
  webhookUrl: string | null;
}
