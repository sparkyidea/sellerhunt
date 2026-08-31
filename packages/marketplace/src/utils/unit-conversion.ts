import type convert from "convert-units";

const lengthUnitMap: Record<string, string> = {
  inches: "in",
  inch: "in",
  in: "in",
  feet: "ft",
  foot: "ft",
  ft: "ft",
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  mm: "mm",
  millimeter: "mm",
  millimeters: "mm",
  m: "m",
  meter: "m",
  meters: "m",
};

/**
 * Map unit strings (e.g. "inches", "feet") to convert-units abbreviations
 */
export function toLengthUnit(unit: string): convert.Unit {
  return (lengthUnitMap[unit.toLowerCase()] ?? "in") as convert.Unit;
}
