import convert from "convert-units";

export function formatWeight(mg: number): string {
  if (!mg) {
    return "—";
  }

  const totalOz = convert(mg).from("mg").to("oz");
  const roundedOz = Math.round(totalOz * 10) / 10;
  const ozPerLb = convert(1).from("lb").to("oz");
  const lbs = Math.floor(roundedOz / ozPerLb);
  const remainingOz = roundedOz - lbs * ozPerLb;

  const parts: string[] = [];
  if (lbs > 0) {
    parts.push(`${lbs} lb`);
  }
  if (remainingOz > 0) {
    parts.push(`${remainingOz.toFixed(1)} oz`);
  }

  return parts.join(" ") || "—";
}

export function formatDimensions(
  length: number,
  width: number,
  height: number
): string {
  if (!(length || width || height)) {
    return "—";
  }

  const l = convert(length).from("mm").to("in");
  const w = convert(width).from("mm").to("in");
  const h = convert(height).from("mm").to("in");

  return `${l.toFixed(1)} × ${w.toFixed(1)} × ${h.toFixed(1)} in`;
}

export function mgToOz(mg: number): number {
  return Math.round(convert(mg).from("mg").to("oz") * 100) / 100;
}

export function ozToMg(oz: number): number {
  return Math.round(convert(oz).from("oz").to("mg"));
}

export function mmToIn(mm: number): number {
  return Math.round(convert(mm).from("mm").to("in") * 100) / 100;
}

export function inToMm(inches: number): number {
  return Math.round(convert(inches).from("in").to("mm"));
}
