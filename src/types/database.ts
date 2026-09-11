// src/types/database.ts
export type SubscriptionStatus =
  | "trial"
  | "active_monthly"
  | "active_yearly"
  | "inactive";

export interface Merchant {
  id: string;
  user_id: string;
  business_name: string;
  yape_number: string | null;
  currency: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string;
  created_at: string;
}

export type PaymentMethod = "Efectivo" | "Yape" | "Plin" | "Tarjeta" | "Otro";

export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  merchant_id: string;
  type: TransactionType | "sale";
  amount: number;
  description?: string;
  payment_method: PaymentMethod;
  created_at: string;
}

export interface CustomerDebt {
  id: string;
  merchant_id: string;
  customer_name: string;
  phone_number: string;
  balance: number;
  updated_at: string;
}
