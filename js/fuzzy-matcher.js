/**
 * 990 Mapper - Fuzzy Matcher
 * Uses Fuse.js to match account names against the mapping dictionary.
 * Depends on: mapping-dictionary.js (MAPPING_RULES), Fuse.js (global Fuse)
 */

var FuzzyMatcher = {

  _fuse: null,
  _searchItems: [],

  /**
   * Initialize the Fuse.js instance with a flat list of all keywords
   * from the mapping dictionary.
   */
  init: function () {
    this._searchItems = [];

    // Build flat list of keywords with line references
    var lines = Object.keys(MAPPING_RULES);
    for (var i = 0; i < lines.length; i++) {
      var lineKey = lines[i];
      var rule = MAPPING_RULES[lineKey];
      var keywords = rule.keywords;
      for (var j = 0; j < keywords.length; j++) {
        this._searchItems.push({
          keyword: keywords[j],
          line: rule.line,
          label: rule.label,
          weight: rule.weight
        });
      }
    }

    // Configure Fuse.js
    this._fuse = new Fuse(this._searchItems, {
      keys: ["keyword"],
      threshold: 0.4,
      distance: 200,
      includeScore: true,
      shouldSort: true,
      minMatchCharLength: 2,
      ignoreLocation: true
    });
  },

  /**
   * Normalize an account name for matching:
   * - Strip leading account numbers/codes (e.g., "5000-Salaries" -> "Salaries")
   * - Strip department prefixes (e.g., "Program:Staff Salaries" -> "Staff Salaries")
   * - Normalize whitespace and case
   */
  _normalize: function (name) {
    if (!name || typeof name !== "string") return "";

    var cleaned = name.trim();

    // Remove leading account numbers: "5000-", "5000 - ", "5000.", "50000 "
    cleaned = cleaned.replace(/^\d{3,6}\s*[-.:]\s*/, "");
    // Also handle pure numeric prefix with space: "5000 Salaries"
    cleaned = cleaned.replace(/^\d{3,6}\s+/, "");

    // Remove department/class prefixes: "Program:Staff Salaries", "Admin - Travel"
    // But preserve content after the separator
    cleaned = cleaned.replace(/^[A-Za-z0-9\s&]+[:]\s*/, "");

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    return cleaned;
  },

  /**
   * Match a single account name to a Part IX line.
   * @param {string} accountName - The account name from the chart of accounts
   * @returns {object} { lineNumber, lineLabel, confidence, score, originalName, normalizedName }
   */
  matchAccount: function (accountName) {
    var originalName = accountName || "";
    var normalized = this._normalize(originalName);

    // Handle empty or very short names
    if (normalized.length < 3) {
      return {
        lineNumber: null,
        lineLabel: "Unmapped",
        confidence: "unmapped",
        score: 1.0,
        originalName: originalName,
        normalizedName: normalized
      };
    }

    // Search using Fuse.js
    var results = this._fuse.search(normalized);

    if (!results || results.length === 0) {
      return {
        lineNumber: null,
        lineLabel: "Unmapped",
        confidence: "unmapped",
        score: 1.0,
        originalName: originalName,
        normalizedName: normalized
      };
    }

    // Group results by line and pick the best match per line
    var bestByLine = {};
    for (var i = 0; i < results.length; i++) {
      var result = results[i];
      var line = result.item.line;
      var score = result.score; // 0 = perfect, 1 = worst
      var weight = result.item.weight;

      // Calculate weighted score: lower is better
      // weight > 1 boosts (reduces) score, weight < 1 penalizes (increases) score
      var weightedScore = score / weight;

      if (!bestByLine[line] || weightedScore < bestByLine[line].weightedScore) {
        bestByLine[line] = {
          line: line,
          label: result.item.label,
          score: score,
          weight: weight,
          weightedScore: weightedScore,
          matchedKeyword: result.item.keyword
        };
      }
    }

    // Find overall best match (lowest weighted score)
    var best = null;
    var lineKeys = Object.keys(bestByLine);
    for (var k = 0; k < lineKeys.length; k++) {
      var candidate = bestByLine[lineKeys[k]];
      if (!best || candidate.weightedScore < best.weightedScore) {
        best = candidate;
      }
    }

    // If best match score is too poor, mark as unmapped
    if (!best || best.score > 0.6) {
      return {
        lineNumber: null,
        lineLabel: "Unmapped",
        confidence: "unmapped",
        score: best ? best.score : 1.0,
        originalName: originalName,
        normalizedName: normalized
      };
    }

    // Determine confidence level based on raw Fuse.js score
    var confidence;
    if (best.score < 0.2) {
      confidence = "high";
    } else if (best.score < 0.4) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    return {
      lineNumber: best.line,
      lineLabel: best.label,
      confidence: confidence,
      score: best.score,
      originalName: originalName,
      normalizedName: normalized,
      matchedKeyword: best.matchedKeyword
    };
  },

  /**
   * Match an array of account names.
   * Returns results sorted: unmapped first, then low, medium, high confidence.
   * @param {string[]} accounts - Array of account name strings
   * @returns {object[]} Array of match results
   */
  matchAll: function (accounts) {
    if (!accounts || !Array.isArray(accounts)) return [];

    var results = [];
    for (var i = 0; i < accounts.length; i++) {
      results.push(this.matchAccount(accounts[i]));
    }

    // Sort: unmapped first, then low, medium, high
    var confidenceOrder = {
      "unmapped": 0,
      "low": 1,
      "medium": 2,
      "high": 3
    };

    results.sort(function (a, b) {
      var orderA = confidenceOrder[a.confidence] !== undefined ? confidenceOrder[a.confidence] : -1;
      var orderB = confidenceOrder[b.confidence] !== undefined ? confidenceOrder[b.confidence] : -1;
      if (orderA !== orderB) return orderA - orderB;
      // Within same confidence, sort by score descending (worst first)
      return b.score - a.score;
    });

    return results;
  }
};
