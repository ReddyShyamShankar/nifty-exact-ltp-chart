(function (root) {
  "use strict";

  const EPSILON = 1e-7;

  function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function normalized(value) {
    if (!Number.isFinite(value)) return value;
    if (Math.abs(value) < EPSILON) return 0;
    return Number(value.toFixed(10));
  }

  function invalidResult() {
    return {
      status: "INVALID_INPUT",
      breakevens: [],
      bands: [],
      maxProfit: null,
      maxLoss: null,
      upsideUnbounded: false,
      downsideValue: null,
      cashBalance: null,
      segments: []
    };
  }

  function validLeg(leg) {
    return leg && typeof leg.id === "string" && leg.id.length > 0 &&
      finiteNumber(leg.strike) && leg.strike >= 0 &&
      (leg.optionType === "CE" || leg.optionType === "PE") &&
      finiteNumber(leg.signedLots) && leg.signedLots !== 0 &&
      finiteNumber(leg.lotSize) && leg.lotSize > 0 &&
      finiteNumber(leg.entryPrice) && leg.entryPrice >= 0;
  }

  function validLegs(legs) {
    return Array.isArray(legs) && legs.length > 0 && legs.every(validLeg);
  }

  function readCharges(charges) {
    if (typeof charges === "undefined") return { amount: 0, known: false };
    if (!finiteNumber(charges) || charges < 0) return null;
    return { amount: charges, known: true };
  }

  function payoffFor(legs, cashBalance, underlyingPrice) {
    let payoff = cashBalance;
    for (const leg of legs) {
      const contracts = leg.signedLots * leg.lotSize;
      const intrinsic = leg.optionType === "CE"
        ? Math.max(underlyingPrice - leg.strike, 0)
        : Math.max(leg.strike - underlyingPrice, 0);
      payoff += contracts * intrinsic;
    }
    return normalized(payoff);
  }

  function slopeFor(legs, underlyingPrice) {
    let slope = 0;
    for (const leg of legs) {
      const contracts = leg.signedLots * leg.lotSize;
      if (leg.optionType === "CE" && underlyingPrice > leg.strike) slope += contracts;
      if (leg.optionType === "PE" && underlyingPrice < leg.strike) slope -= contracts;
    }
    return normalized(slope);
  }

  function uniqueSorted(values) {
    const sorted = values.slice().sort((left, right) => left - right);
    return sorted.reduce((result, value) => {
      if (!result.length || Math.abs(value - result[result.length - 1]) > EPSILON) result.push(normalized(value));
      return result;
    }, []);
  }

  function makeSegments(legs, cashBalance) {
    const strikes = uniqueSorted(legs.map((leg) => leg.strike));
    const boundaries = uniqueSorted([0].concat(strikes));
    const segments = [];
    for (let index = 0; index < boundaries.length; index += 1) {
      const from = boundaries[index];
      const to = index + 1 < boundaries.length ? boundaries[index + 1] : Infinity;
      const sample = to === Infinity ? from + 1 : (from + to) / 2;
      const slope = slopeFor(legs, sample);
      const intercept = normalized(payoffFor(legs, cashBalance, sample) - slope * sample);
      segments.push({ from, to, slope, intercept });
    }
    return segments;
  }

  function rootsFor(segments) {
    const roots = [];
    for (const segment of segments) {
      if (Math.abs(segment.slope) <= EPSILON) continue;
      const root = -segment.intercept / segment.slope;
      if (root >= segment.from - EPSILON && root <= segment.to + EPSILON && root >= -EPSILON) {
        roots.push(normalized(Math.max(0, root)));
      }
    }
    return uniqueSorted(roots);
  }

  function bandsFor(segments, roots) {
    const boundaries = uniqueSorted([0]
      .concat(segments.map((segment) => segment.from))
      .concat(roots));
    const bands = [];
    for (let index = 0; index < boundaries.length; index += 1) {
      const from = boundaries[index];
      const to = index + 1 < boundaries.length ? boundaries[index + 1] : Infinity;
      const sample = to === Infinity ? from + 1 : (from + to) / 2;
      const segment = segments.find((candidate) => sample >= candidate.from - EPSILON && sample <= candidate.to + EPSILON);
      const value = segment.slope * sample + segment.intercept;
      const kind = value > EPSILON ? "profit" : value < -EPSILON ? "loss" : "flat";
      const previous = bands[bands.length - 1];
      if (previous && previous.kind === kind && Math.abs(previous.to - from) <= EPSILON) {
        previous.to = to;
      } else {
        bands.push({ kind, from, to });
      }
    }
    return bands;
  }

  function mapFor(legs, cashBalance, status) {
    const segments = makeSegments(legs, cashBalance);
    const breakevens = rootsFor(segments);
    const finiteValues = uniqueSorted([0].concat(legs.map((leg) => leg.strike)))
      .map((price) => payoffFor(legs, cashBalance, price));
    const rightTailSlope = segments[segments.length - 1].slope;
    let maxProfit = Math.max.apply(null, finiteValues);
    let maxLoss = Math.min.apply(null, finiteValues);
    if (rightTailSlope > EPSILON) maxProfit = Infinity;
    if (rightTailSlope < -EPSILON) maxLoss = -Infinity;
    return {
      status,
      breakevens,
      bands: bandsFor(segments, breakevens),
      maxProfit: normalized(maxProfit),
      maxLoss: normalized(maxLoss),
      upsideUnbounded: rightTailSlope < -EPSILON,
      downsideValue: payoffFor(legs, cashBalance, 0),
      cashBalance: normalized(cashBalance),
      segments
    };
  }

  function currentRiskMap(input) {
    if (!input || !validLegs(input.legs)) return invalidResult();
    const charges = readCharges(input.charges);
    if (!charges) return invalidResult();
    const cashBalance = input.legs.reduce((total, leg) => (
      total - leg.signedLots * leg.lotSize * leg.entryPrice
    ), -charges.amount);
    return mapFor(input.legs, cashBalance, charges.known ? "OK" : "EXCLUDING_CHARGES");
  }

  function validFill(fill) {
    return fill && typeof fill.id === "string" && fill.id.length > 0 &&
      (fill.transactionType === "BUY" || fill.transactionType === "SELL") &&
      finiteNumber(fill.quantity) && fill.quantity > 0 &&
      finiteNumber(fill.price) && fill.price >= 0;
  }

  function wholeTradeRiskMap(input) {
    if (!input || !validLegs(input.openLegs) || !Array.isArray(input.fills) || !input.fills.every(validFill)) {
      return invalidResult();
    }
    const charges = readCharges(input.charges);
    if (!charges) return invalidResult();
    const cashBalance = input.fills.reduce((total, fill) => (
      total + (fill.transactionType === "SELL" ? 1 : -1) * fill.quantity * fill.price
    ), -charges.amount);
    return mapFor(input.openLegs, cashBalance, charges.known ? "OK" : "EXCLUDING_CHARGES");
  }

  function payoffAt(mapInput, underlyingPrice) {
    if (!mapInput || mapInput.status === "INVALID_INPUT" || !finiteNumber(underlyingPrice) || underlyingPrice < 0 || !Array.isArray(mapInput.segments)) {
      return null;
    }
    const segment = mapInput.segments.find((candidate) => underlyingPrice >= candidate.from - EPSILON && underlyingPrice <= candidate.to + EPSILON);
    if (!segment) return null;
    return normalized(segment.slope * underlyingPrice + segment.intercept);
  }

  function sameValue(left, right) {
    if (left === right) return true;
    return finiteNumber(left) && finiteNumber(right) && Math.abs(left - right) <= EPSILON;
  }

  function breakevenLabel(index, length) {
    if (length === 2) return index === 0 ? "Lower breakeven" : "Upper breakeven";
    return `Breakeven ${index + 1}`;
  }

  function explainRiskChange(previous, next) {
    const prior = previous || {};
    const current = next || {};
    const oldRoots = Array.isArray(prior.breakevens) ? prior.breakevens.filter(finiteNumber) : [];
    const newRoots = Array.isArray(current.breakevens) ? current.breakevens.filter(finiteNumber) : [];
    const breakevenMoves = [];
    const facts = [];
    const count = Math.min(oldRoots.length, newRoots.length);
    for (let index = 0; index < count; index += 1) {
      const points = normalized(newRoots[index] - oldRoots[index]);
      const move = { index, from: oldRoots[index], to: newRoots[index], points };
      breakevenMoves.push(move);
      if (Math.abs(points) > EPSILON) {
        facts.push(`${breakevenLabel(index, count)} moved ${Math.abs(points).toFixed(2)} points ${points < 0 ? "lower" : "higher"}.`);
      }
    }
    const maxProfitChange = finiteNumber(prior.maxProfit) && finiteNumber(current.maxProfit)
      ? normalized(current.maxProfit - prior.maxProfit)
      : sameValue(prior.maxProfit, current.maxProfit) ? 0 : null;
    if (maxProfitChange !== null && Math.abs(maxProfitChange) > EPSILON) {
      facts.push(`Maximum profit ${maxProfitChange > 0 ? "increased" : "decreased"} by ${Math.abs(maxProfitChange).toFixed(2)}.`);
    }
    const maxLossStateChanged = !sameValue(prior.maxLoss, current.maxLoss);
    if (maxLossStateChanged) {
      facts.push(current.maxLoss === -Infinity ? "Maximum loss is now unbounded." : "Maximum loss state changed.");
    }
    const upsideTailChanged = Boolean(prior.upsideUnbounded) !== Boolean(current.upsideUnbounded);
    if (upsideTailChanged) {
      facts.push(current.upsideUnbounded ? "Upside loss is now unbounded." : "Upside loss is now bounded.");
    }
    return { breakevenMoves, maxProfitChange, maxLossStateChanged, upsideTailChanged, facts };
  }

  const api = { currentRiskMap, wholeTradeRiskMap, payoffAt, explainRiskChange };
  root.NiftySellerRisk = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
