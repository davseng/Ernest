export type AssetType = "Boat" | "RV";

export interface Component {
  id: string;
  systemId: string;
  name: string;
  manufacturer: string;
  model: string;
  location: string;
  notes: string;
}

export interface AssetSystem {
  id: string;
  assetId: string;
  name: string;
  description: string;
  components: Component[];
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  make: string;
  model: string;
  year: number;
  summary: string;
  systems: AssetSystem[];
}

export const assets: Asset[] = [
  {
    id: "far-better",
    name: "Far Better",
    type: "Boat",
    make: "Grand Banks",
    model: "42 Classic",
    year: 1998,
    summary: "A dependable coastal cruiser, thoughtfully maintained for long weekends and unhurried passages.",
    systems: [
      {
        id: "electrical",
        assetId: "far-better",
        name: "Electrical",
        description: "Power generation, storage, and distribution.",
        components: [
          { id: "house-bank", systemId: "electrical", name: "House battery bank", manufacturer: "Lifeline", model: "GPL-8DL", location: "Engine room, port side", notes: "Two AGM batteries wired in parallel. Check terminals each spring." },
          { id: "inverter", systemId: "electrical", name: "Inverter / charger", manufacturer: "Victron Energy", model: "MultiPlus 12/3000", location: "Electrical locker", notes: "Primary charger when connected to shore power." },
          { id: "alternator", systemId: "electrical", name: "High-output alternator", manufacturer: "Balmar", model: "6-Series 120A", location: "Port engine", notes: "External regulator mounted above engine room entry." },
        ],
      },
      {
        id: "fresh-water",
        assetId: "far-better",
        name: "Fresh Water",
        description: "Fresh water storage, heating, and delivery.",
        components: [
          { id: "water-pump", systemId: "fresh-water", name: "Pressure water pump", manufacturer: "Jabsco", model: "Par-Max HD4", location: "Under galley sole", notes: "Inline strainer is accessible from the forward hatch." },
          { id: "water-heater", systemId: "fresh-water", name: "Water heater", manufacturer: "Isotemp", model: "Basic 40", location: "Engine room, starboard", notes: "Heats from shore power or engine coolant loop." },
        ],
      },
      {
        id: "propulsion",
        assetId: "far-better",
        name: "Propulsion",
        description: "Main engines and drivetrain equipment.",
        components: [
          { id: "port-engine", systemId: "propulsion", name: "Port engine", manufacturer: "Ford Lehman", model: "SP135", location: "Engine room, port", notes: "Naturally aspirated diesel. Oil and filters changed annually." },
          { id: "starboard-engine", systemId: "propulsion", name: "Starboard engine", manufacturer: "Ford Lehman", model: "SP135", location: "Engine room, starboard", notes: "Naturally aspirated diesel. Oil and filters changed annually." },
          { id: "transmission", systemId: "propulsion", name: "Marine transmission", manufacturer: "BorgWarner", model: "Velvet Drive 10-18", location: "Aft of each engine", notes: "Inspect fluid level before extended passages." },
        ],
      },
    ],
  },
];

export function getAsset(id: string): Asset | undefined {
  return assets.find((asset) => asset.id === id);
}
