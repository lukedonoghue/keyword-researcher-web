export type GeoSignal = {
  type: 'tld' | 'phone' | 'address' | 'currency' | 'meta' | 'content' | 'ai';
  value: string;
  confidence: number;
};

export type ServiceArea = {
  country: string;
  states: string[];
  cities: string[];
  isNationwide: boolean;
};

export type GeoTarget = {
  geoTargetId: string;
  languageId: string;
  countryCode: string;
  displayName: string;
  confidence: number;
  signals: GeoSignal[];
};

export type GeoConstant = {
  geoTargetId: string;
  languageId: string;
  countryCode: string;
  displayName: string;
  tlds: string[];
  phonePrefixes: string[];
  currencyCodes: string[];
  currencySymbols: string[];
};
