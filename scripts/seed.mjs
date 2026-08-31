import { connect } from "./database.mjs";

const sql = connect();
const systems = [
  ["electrical", "Electrical", "Power generation, storage, and distribution."],
  ["fresh-water", "Fresh Water", "Fresh water storage, heating, and delivery."],
  ["propulsion", "Propulsion", "Main engines and drivetrain equipment."],
];
const components = [
  ["house-bank","electrical","House battery bank","Lifeline","GPL-8DL","Engine room, port side","Two AGM batteries wired in parallel. Check terminals each spring."],
  ["inverter","electrical","Inverter / charger","Victron Energy","MultiPlus 12/3000","Electrical locker","Primary charger when connected to shore power."],
  ["alternator","electrical","High-output alternator","Balmar","6-Series 120A","Port engine","External regulator mounted above engine room entry."],
  ["water-pump","fresh-water","Pressure water pump","Jabsco","Par-Max HD4","Under galley sole","Inline strainer is accessible from the forward hatch."],
  ["water-heater","fresh-water","Water heater","Isotemp","Basic 40","Engine room, starboard","Heats from shore power or engine coolant loop."],
  ["port-engine","propulsion","Port engine","Ford Lehman","SP135","Engine room, port","Naturally aspirated diesel. Oil and filters changed annually."],
  ["starboard-engine","propulsion","Starboard engine","Ford Lehman","SP135","Engine room, starboard","Naturally aspirated diesel. Oil and filters changed annually."],
  ["transmission","propulsion","Marine transmission","BorgWarner","Velvet Drive 10-18","Aft of each engine","Inspect fluid level before extended passages."],
];
try {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO assets (id,name,type,make,model,year,summary) VALUES ('far-better','Far Better','Boat','Grand Banks','42 Classic',1998,'A dependable coastal cruiser, thoughtfully maintained for long weekends and unhurried passages.') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,type=EXCLUDED.type,make=EXCLUDED.make,model=EXCLUDED.model,year=EXCLUDED.year,summary=EXCLUDED.summary`;
    for (const [id, name, description] of systems) await tx`INSERT INTO systems (id,asset_id,name,description,position) VALUES (${id},'far-better',${name},${description},${systems.findIndex((item) => item[0] === id)}) ON CONFLICT (id) DO UPDATE SET asset_id=EXCLUDED.asset_id,name=EXCLUDED.name,description=EXCLUDED.description,position=EXCLUDED.position`;
    for (const [id,systemId,name,manufacturer,model,location,notes] of components) await tx`INSERT INTO components (id,system_id,name,manufacturer,model,location,notes,position) VALUES (${id},${systemId},${name},${manufacturer},${model},${location},${notes},${components.filter((item) => item[1] === systemId).findIndex((item) => item[0] === id)}) ON CONFLICT (id) DO UPDATE SET system_id=EXCLUDED.system_id,name=EXCLUDED.name,manufacturer=EXCLUDED.manufacturer,model=EXCLUDED.model,location=EXCLUDED.location,notes=EXCLUDED.notes,position=EXCLUDED.position`;
  });
  console.log("Seeded Far Better");
} finally { await sql.end(); }
