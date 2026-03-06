export type GoogleAdsAccountNode = {
  customerId: string;
  descriptiveName: string;
  isManager: boolean;
  status?: string;
  currencyCode?: string;
  timeZone?: string;
  hidden?: boolean;
  children: GoogleAdsAccountNode[];
};

export type GoogleAdsAccountSelection = {
  customerId: string | null;
  loginCustomerId: string | null;
  descriptiveName: string | null;
};
