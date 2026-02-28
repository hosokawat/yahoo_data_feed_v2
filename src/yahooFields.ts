export const YAHOO_FIELDS = [
  "Item ID",
  "Item Name",
  "Description",
  "Tracking URL",
  "Landing Page URL",
  "Smartphone Landing Page URL",
  "Image URL",
  "Category ID",
  "Availability",
  "Capacity",
  "Price",
  "Sale Price",
  "Formatted Price",
  "Formatted Sale Price",
  "Rating",
  "Reviews",
  "Badge",
  "Display Settings",
  "Availability Date",
  "GTIN",
  "MPN",
  "Brand",
  "Product Type",
  "Google Product Category",
  "Age Group",
  "Gender Group",
  "Location",
  "Sales Rank",
  "Delete"
] as const;

export const REQUIRED_FIELDS = [
  "Item ID",
  "Item Name",
  "Description",
  "Landing Page URL"
] as const;

export const URL_FIELDS = [
  "Tracking URL",
  "Landing Page URL",
  "Smartphone Landing Page URL",
  "Image URL"
] as const;

export const FULL_UPDATE_FIELDS = YAHOO_FIELDS.filter(
  (field) => field !== "Delete"
);

export const ARRAY_FIELDS = [] as const;
