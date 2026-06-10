export type ConnectCodeEntry = {
  userId: string;
  provider: string;
  code: string;
  expiresAt: number;
  consumed: boolean;
};

export type ConnectCodeResult = {
  code: string;
  expiresAt: string;
  connectUrl: string;
};
