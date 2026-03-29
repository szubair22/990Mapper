/**
 * FileParser - Parses CSV, XLSX, and XLS files using SheetJS (global XLSX object)
 * Extracts account data for the 990 Mapper tool.
 */
const FileParser = {

  /**
   * Parse an uploaded file (CSV, XLSX, XLS) and return headers, rows, and sheet name.
   * @param {File} file - File object from input or drag-and-drop
   * @returns {Promise<{headers: string[], rows: any[][], sheetName: string}>}
   */
  parseFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }

      const reader = new FileReader();

      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          // Separate header row from data rows
          if (!raw || raw.length === 0) {
            reject(new Error('File is empty or could not be parsed'));
            return;
          }

          const headers = (raw[0] || []).map(function (h) {
            return h != null ? String(h).trim() : '';
          });
          const rows = raw.slice(1);

          resolve({ headers: headers, rows: rows, sheetName: sheetName });
        } catch (err) {
          reject(new Error('Failed to parse file: ' + err.message));
        }
      };

      reader.onerror = function () {
        reject(new Error('Failed to read file'));
      };

      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Auto-detect which columns correspond to account name, account number, and balance.
   * @param {string[]} headers - Array of header strings
   * @param {any[][]} rows - Array of row arrays
   * @returns {{accountName: number|null, accountNumber: number|null, balance: number|null}}
   */
  detectColumns(headers, rows) {
    var result = { accountName: null, accountNumber: null, balance: null };

    var namePatterns = [
      'account name', 'acct name', 'gl account', 'account description',
      'chart of accounts', 'account', 'name', 'description'
    ];
    var numberPatterns = [
      'acct #', 'account #', 'gl code', 'account code', 'account number',
      'acct no', 'acct num', 'number', 'code', 'acct', 'no.', 'num'
    ];
    var balancePatterns = [
      'ending balance', 'year to date', 'period total',
      'total', 'balance', 'amount', 'ytd', 'net', 'actual', 'budget',
      'debit', 'credit'
    ];
    // Higher-priority balance terms for tie-breaking
    var preferredBalanceTerms = ['total', 'balance', 'ending balance', 'ytd', 'year to date'];

    var lowerHeaders = headers.map(function (h) { return (h || '').toLowerCase().trim(); });

    // --- Header-based detection ---

    // Detect account name
    for (var pi = 0; pi < namePatterns.length; pi++) {
      for (var ci = 0; ci < lowerHeaders.length; ci++) {
        if (lowerHeaders[ci].indexOf(namePatterns[pi]) !== -1) {
          result.accountName = ci;
          break;
        }
      }
      if (result.accountName !== null) break;
    }

    // Detect account number
    for (var pi2 = 0; pi2 < numberPatterns.length; pi2++) {
      for (var ci2 = 0; ci2 < lowerHeaders.length; ci2++) {
        // Skip column already assigned as account name
        if (ci2 === result.accountName) continue;
        if (lowerHeaders[ci2].indexOf(numberPatterns[pi2]) !== -1) {
          result.accountNumber = ci2;
          break;
        }
      }
      if (result.accountNumber !== null) break;
    }

    // Detect balance - collect all candidates then pick the best
    var balanceCandidates = [];
    for (var pi3 = 0; pi3 < balancePatterns.length; pi3++) {
      for (var ci3 = 0; ci3 < lowerHeaders.length; ci3++) {
        if (ci3 === result.accountName || ci3 === result.accountNumber) continue;
        if (lowerHeaders[ci3].indexOf(balancePatterns[pi3]) !== -1) {
          var isPreferred = false;
          for (var pp = 0; pp < preferredBalanceTerms.length; pp++) {
            if (lowerHeaders[ci3].indexOf(preferredBalanceTerms[pp]) !== -1) {
              isPreferred = true;
              break;
            }
          }
          balanceCandidates.push({ index: ci3, preferred: isPreferred, patternOrder: pi3 });
        }
      }
    }

    if (balanceCandidates.length > 0) {
      // Deduplicate by index, keeping first occurrence (higher priority pattern)
      var seen = {};
      var unique = [];
      for (var bc = 0; bc < balanceCandidates.length; bc++) {
        if (!seen[balanceCandidates[bc].index]) {
          seen[balanceCandidates[bc].index] = true;
          unique.push(balanceCandidates[bc]);
        }
      }
      // Prefer "total"/"balance" columns over "debit"/"credit"
      var preferred = unique.filter(function (c) { return c.preferred; });
      if (preferred.length > 0) {
        result.balance = preferred[0].index;
      } else {
        result.balance = unique[0].index;
      }
    }

    // --- Data-based fallback if header detection missed required columns ---
    if (result.accountName === null || result.balance === null) {
      var sampleSize = Math.min(rows.length, 20);
      var colStats = [];

      // Determine max column count across rows
      var maxCols = headers.length;
      for (var ri = 0; ri < sampleSize; ri++) {
        if (rows[ri] && rows[ri].length > maxCols) {
          maxCols = rows[ri].length;
        }
      }

      for (var col = 0; col < maxCols; col++) {
        var numericCount = 0;
        var textCount = 0;
        var nonEmpty = 0;

        for (var row = 0; row < sampleSize; row++) {
          var val = rows[row] ? rows[row][col] : undefined;
          if (val == null || String(val).trim() === '') continue;
          nonEmpty++;
          var cleaned = String(val).replace(/[\$,\(\)\s]/g, '');
          if (cleaned !== '' && !isNaN(Number(cleaned))) {
            numericCount++;
          } else {
            textCount++;
          }
        }

        colStats.push({
          index: col,
          numericRatio: nonEmpty > 0 ? numericCount / nonEmpty : 0,
          textRatio: nonEmpty > 0 ? textCount / nonEmpty : 0,
          nonEmpty: nonEmpty
        });
      }

      // Account name: column with highest text ratio (and some data)
      if (result.accountName === null) {
        var bestText = null;
        for (var cs = 0; cs < colStats.length; cs++) {
          var s = colStats[cs];
          if (s.index === result.accountNumber || s.index === result.balance) continue;
          if (s.nonEmpty > 0 && s.textRatio > 0.5) {
            if (!bestText || s.textRatio > bestText.textRatio ||
                (s.textRatio === bestText.textRatio && s.nonEmpty > bestText.nonEmpty)) {
              bestText = s;
            }
          }
        }
        if (bestText) result.accountName = bestText.index;
      }

      // Balance: column with highest numeric ratio
      if (result.balance === null) {
        var bestNum = null;
        for (var cs2 = 0; cs2 < colStats.length; cs2++) {
          var s2 = colStats[cs2];
          if (s2.index === result.accountName || s2.index === result.accountNumber) continue;
          if (s2.nonEmpty > 0 && s2.numericRatio > 0.7) {
            if (!bestNum || s2.numericRatio > bestNum.numericRatio ||
                (s2.numericRatio === bestNum.numericRatio && s2.nonEmpty > bestNum.nonEmpty)) {
              bestNum = s2;
            }
          }
        }
        if (bestNum) result.balance = bestNum.index;
      }
    }

    return result;
  },

  /**
   * Parse a currency string into a number.
   * Handles $, commas, parentheses-as-negatives, and string-stored numbers.
   * @param {*} value - Raw cell value
   * @returns {number} Parsed number or NaN
   */
  _parseAmount(value) {
    if (value == null) return NaN;
    if (typeof value === 'number') return value;

    var str = String(value).trim();
    if (str === '') return NaN;

    // Check for parentheses indicating negative: "(1,234.56)" -> -1234.56
    var isNegative = false;
    if (/^\(.*\)$/.test(str)) {
      isNegative = true;
      str = str.slice(1, -1);
    }

    // Also handle leading minus
    if (str.charAt(0) === '-') {
      isNegative = !isNegative;
      str = str.slice(1);
    }

    // Remove currency symbols, commas, spaces
    str = str.replace(/[\$,\s]/g, '');

    // Handle percent signs or other non-numeric suffixes
    str = str.replace(/[^0-9.]/g, '');

    if (str === '') return NaN;

    var num = Number(str);
    if (isNaN(num)) return NaN;

    return isNegative ? -num : num;
  },

  /**
   * Check if a row looks like a total/summary row.
   * @param {string} name - The account name value
   * @returns {boolean}
   */
  _isTotalRow(name) {
    if (!name) return false;
    var lower = name.toLowerCase().trim();
    var totalPatterns = [
      'total', 'grand total', 'net', 'sum', 'subtotal', 'sub-total',
      'net income', 'net loss', 'total assets', 'total liabilities',
      'total equity', 'total revenue', 'total expenses'
    ];
    for (var i = 0; i < totalPatterns.length; i++) {
      if (lower === totalPatterns[i] || lower.indexOf('total ') === 0 ||
          lower.indexOf('grand total') !== -1) {
        return true;
      }
    }
    return false;
  },

  /**
   * Extract and clean account data from parsed rows using the confirmed column mapping.
   * @param {any[][]} rows - Data rows (excluding header)
   * @param {{accountName: number, accountNumber: number|null, balance: number}} columnMap
   * @returns {{accounts: Array<{accountName: string, accountNumber: string|null, balance: number}>, totalAmount: number, skippedRows: number}}
   */
  cleanData(rows, columnMap) {
    var accounts = [];
    var totalAmount = 0;
    var skippedRows = 0;

    if (columnMap.accountName == null || columnMap.balance == null) {
      return { accounts: [], totalAmount: 0, skippedRows: rows.length };
    }

    // Grab the header text for duplicate-header detection (from first row if it matches)
    var headerName = null;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.length === 0) {
        skippedRows++;
        continue;
      }

      // Check if row is completely blank
      var allBlank = true;
      for (var c = 0; c < row.length; c++) {
        if (row[c] != null && String(row[c]).trim() !== '') {
          allBlank = false;
          break;
        }
      }
      if (allBlank) {
        skippedRows++;
        continue;
      }

      var rawName = row[columnMap.accountName];
      var name = rawName != null ? String(rawName).trim() : '';

      // Skip empty account names
      if (name === '') {
        skippedRows++;
        continue;
      }

      // Capture the first row's name as potential header text for comparison
      if (headerName === null) {
        headerName = name;
      }

      // Skip rows that repeat the header text (case-insensitive)
      // Only skip if it looks like a header (check if balance is also non-numeric)
      if (i > 0 && headerName && name.toLowerCase() === headerName.toLowerCase()) {
        var testBal = this._parseAmount(row[columnMap.balance]);
        if (isNaN(testBal)) {
          skippedRows++;
          continue;
        }
      }

      // Skip total/summary rows
      if (this._isTotalRow(name)) {
        skippedRows++;
        continue;
      }

      // Parse balance
      var balance = this._parseAmount(row[columnMap.balance]);
      if (isNaN(balance)) {
        skippedRows++;
        continue;
      }

      // Parse account number (optional)
      var accountNumber = null;
      if (columnMap.accountNumber != null && row[columnMap.accountNumber] != null) {
        var rawNum = String(row[columnMap.accountNumber]).trim();
        if (rawNum !== '') {
          accountNumber = rawNum;
        }
      }

      accounts.push({
        accountName: name,
        accountNumber: accountNumber,
        balance: balance
      });

      totalAmount += balance;
    }

    return {
      accounts: accounts,
      totalAmount: Math.round(totalAmount * 100) / 100,
      skippedRows: skippedRows
    };
  },

  /**
   * Return the first N non-empty rows for preview display.
   * @param {any[][]} rows - Data rows
   * @param {number} [count=10] - Number of rows to return
   * @returns {any[][]}
   */
  getPreviewRows(rows, count) {
    if (count == null) count = 10;
    var preview = [];
    for (var i = 0; i < rows.length && preview.length < count; i++) {
      var row = rows[i];
      if (!row || row.length === 0) continue;

      // Check if row is completely blank
      var allBlank = true;
      for (var c = 0; c < row.length; c++) {
        if (row[c] != null && String(row[c]).trim() !== '') {
          allBlank = false;
          break;
        }
      }
      if (!allBlank) {
        preview.push(row);
      }
    }
    return preview;
  }
};
