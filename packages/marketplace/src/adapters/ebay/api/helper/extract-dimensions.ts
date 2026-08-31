import convert, { type Unit } from "convert-units";
import type { GetItemResponse } from "ebay-api/lib/types";
import { toLengthUnit } from "../../../../utils/unit-conversion";

type MeasureField = number | { value: number; unit: string } | undefined;

function getMeasureValue(field: MeasureField): number | null {
  if (field == null) {
    return null;
  }
  return typeof field === "number" ? field : field.value;
}

function getRawUnit(field: MeasureField): string {
  if (field == null || typeof field === "number") {
    return "";
  }
  return field.unit;
}

function getLengthUnit(field: MeasureField): Unit {
  if (field == null || typeof field === "number") {
    return "in";
  }
  return toLengthUnit(field.unit);
}

/**
 * Extract dimensions and weight from eBay ShippingPackageDetails
 * Converts to metric units (mm and mg)
 */
export function extractDimensionsAndWeight(item: GetItemResponse["Item"]): {
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
} {
  const details = item.ShippingPackageDetails;

  if (!details) {
    return { length: null, width: null, height: null, weight: null };
  }

  const lengthVal = getMeasureValue(details.PackageLength);
  const lengthUnit = getLengthUnit(details.PackageLength);
  const length =
    lengthVal == null
      ? null
      : Math.round(convert(lengthVal).from(lengthUnit).to("mm"));

  const widthVal = getMeasureValue(details.PackageWidth);
  const widthUnit = getLengthUnit(details.PackageWidth);
  const width =
    widthVal == null
      ? null
      : Math.round(convert(widthVal).from(widthUnit).to("mm"));

  const heightVal = getMeasureValue(details.PackageDepth);
  const heightUnit = getLengthUnit(details.PackageDepth);
  const height =
    heightVal == null
      ? null
      : Math.round(convert(heightVal).from(heightUnit).to("mm"));

  let weightInMilligrams: number | null = null;

  if (details.WeightMajor || details.WeightMinor) {
    let totalOunces = 0;

    const majorVal = getMeasureValue(details.WeightMajor);
    if (majorVal) {
      const majorUnit = getRawUnit(details.WeightMajor);
      const majorOz =
        majorUnit.toLowerCase() === "lbs" || majorUnit.toLowerCase() === "lb"
          ? majorVal * 16
          : majorVal;
      totalOunces += majorOz;
    }

    const minorVal = getMeasureValue(details.WeightMinor);
    if (minorVal) {
      totalOunces += minorVal;
    }

    if (totalOunces > 0) {
      weightInMilligrams = Math.round(convert(totalOunces).from("oz").to("mg"));
    }
  }

  return {
    length: length ?? 0,
    width: width ?? 0,
    height: height ?? 0,
    weight: weightInMilligrams ?? 0,
  };
}
