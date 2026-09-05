import { type AssetDetails, type ComponentDetails, type SystemDetails } from "@/domain/assets";

export class AssetInputError extends Error {}

function required(formData: FormData, name: string, label: string, maximum: number) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new AssetInputError(`${label} is required.`);
  if (value.length > maximum) {
    throw new AssetInputError(`${label} must be ${maximum} characters or fewer.`);
  }
  return value;
}

export function parseAssetDetails(formData: FormData): AssetDetails {
  const type = String(formData.get("type") ?? "");
  if (type !== "Boat" && type !== "RV") throw new AssetInputError("Choose Boat or RV.");

  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 1800 || year > 3000) {
    throw new AssetInputError("Enter a valid year between 1800 and 3000.");
  }

  return {
    name: required(formData, "name", "Name", 100),
    type,
    make: required(formData, "make", "Make", 100),
    model: required(formData, "model", "Model", 100),
    year,
    summary: required(formData, "summary", "Summary", 1000),
  };
}

export function parseSystemDetails(formData: FormData): SystemDetails {
  return {
    name: required(formData, "name", "System name", 100),
    description: required(formData, "description", "Description", 500),
  };
}

export function parseComponentDetails(formData: FormData): ComponentDetails {
  return {
    name: required(formData, "name", "Component name", 100),
    manufacturer: required(formData, "manufacturer", "Manufacturer", 100),
    model: required(formData, "model", "Model", 100),
    location: required(formData, "location", "Location", 200),
    notes: required(formData, "notes", "Notes", 1000),
  };
}
