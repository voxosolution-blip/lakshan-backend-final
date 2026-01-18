// Unit Conversion Utility
// Base units: g (for weight), ml (for volume), piece (for count)

const UNIT_MAP = {
  // Weight
  g: 1,
  kg: 1000,
  // Volume
  ml: 1,
  liter: 1000,
  l: 1000,
  // Count
  piece: 1,
  pieces: 1,
  pcs: 1,
  unit: 1,
  units: 1
};

/**
 * Convert value to base unit
 * @param {number} value - The value to convert
 * @param {string} fromUnit - Source unit (g, kg, ml, liter, piece, etc.)
 * @returns {number} - Value in base unit
 */
export function convertToBase(value, fromUnit) {
  const unit = (fromUnit || '').toLowerCase().trim();
  const multiplier = UNIT_MAP[unit] || 1;
  return parseFloat(value) * multiplier;
}

/**
 * Convert value from base unit to target unit
 * @param {number} value - Value in base unit
 * @param {string} toUnit - Target unit (g, kg, ml, liter, piece, etc.)
 * @returns {number} - Value in target unit
 */
export function convertFromBase(value, toUnit) {
  const unit = (toUnit || '').toLowerCase().trim();
  const divisor = UNIT_MAP[unit] || 1;
  if (divisor === 0) return 0;
  return parseFloat(value) / divisor;
}

/**
 * Convert value from one unit to another
 * @param {number} value - The value to convert
 * @param {string} fromUnit - Source unit
 * @param {string} toUnit - Target unit
 * @returns {number} - Converted value
 */
export function convert(value, fromUnit, toUnit) {
  const baseValue = convertToBase(value, fromUnit);
  return convertFromBase(baseValue, toUnit);
}

/**
 * Check if two units are compatible (same type)
 * @param {string} unit1 - First unit
 * @param {string} unit2 - Second unit
 * @returns {boolean} - True if compatible
 */
export function areUnitsCompatible(unit1, unit2) {
  const u1 = (unit1 || '').toLowerCase().trim();
  const u2 = (unit2 || '').toLowerCase().trim();
  
  const weightUnits = ['g', 'kg'];
  const volumeUnits = ['ml', 'liter', 'l'];
  const countUnits = ['piece', 'pieces', 'pcs', 'unit', 'units'];
  
  const isWeight = (u) => weightUnits.includes(u);
  const isVolume = (u) => volumeUnits.includes(u);
  const isCount = (u) => countUnits.includes(u);
  
  return (isWeight(u1) && isWeight(u2)) ||
         (isVolume(u1) && isVolume(u2)) ||
         (isCount(u1) && isCount(u2));
}

export default {
  convertToBase,
  convertFromBase,
  convert,
  areUnitsCompatible,
  UNIT_MAP
};

