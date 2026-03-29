/* ============================================
   990 Mapper - Main Application
   ============================================ */

const App = {
  currentStep: 1,
  rawHeaders: null,      // header strings from file
  rawRows: null,          // raw data rows (arrays of arrays)
  columnMap: null,        // { accountName: colIndex, accountNumber: colIndex|null, balance: colIndex }
  accounts: null,         // cleaned account data array [{name, number, balance}]
  mappingResults: null,   // array of { account, lineNumber, lineLabel, confidence, score }
  filteredIndices: null,  // indices visible after filter

  // ---- Initialization ----

  init() {
    FuzzyMatcher.init();
    this.setupDropZone();
    this.setupFileInput();
    this.updateProgress();
    this.initTheme();
  },

  // ---- Navigation ----

  goToStep(step) {
    if (step >= 2 && !this.accounts) {
      this.showError('Please upload and confirm a file before proceeding.');
      return;
    }
    if (step >= 3 && !this.mappingResults) {
      this.showError('Please complete the mapping step first.');
      return;
    }

    this.currentStep = step;
    document.querySelectorAll('.step-container').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('step-' + step);
    if (target) target.classList.add('active');

    this.updateProgress();

    if (step === 2) this.renderMappingTable();
    if (step === 3) this.renderSummary();
  },

  updateProgress() {
    document.querySelectorAll('.progress-step').forEach(el => {
      const s = parseInt(el.dataset.step, 10);
      el.classList.remove('active', 'completed');
      if (s === this.currentStep) el.classList.add('active');
      else if (s < this.currentStep) el.classList.add('completed');
    });
  },

  // ---- Step 1: Upload ----

  setupDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;

    ['dragenter', 'dragover'].forEach(evt => {
      zone.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      zone.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
      });
    });

    zone.addEventListener('drop', e => this.handleFileDrop(e));
    zone.addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
  },

  setupFileInput() {
    const input = document.getElementById('file-input');
    if (input) {
      input.addEventListener('change', e => this.handleFileSelect(e));
      input.addEventListener('click', e => e.stopPropagation());
    }
  },

  handleFileDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) this.processFile(files[0]);
  },

  handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) this.processFile(files[0]);
  },

  processFile(file) {
    const validExts = ['.csv', '.xlsx', '.xls'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(ext)) {
      this.showError('Invalid file type. Please upload a .csv, .xlsx, or .xls file.');
      return;
    }

    // File size limit: 50 MB
    if (file.size > 50 * 1024 * 1024) {
      this.showError('File is too large. Please upload a file under 50 MB.');
      return;
    }

    const zone = document.getElementById('drop-zone');
    zone.classList.add('loading');
    const origText = zone.querySelector('.drop-text').textContent;
    zone.querySelector('.drop-text').textContent = 'Processing...';

    // Use FileParser.parseFile which handles FileReader internally
    FileParser.parseFile(file).then(result => {
      this.rawHeaders = result.headers;
      this.rawRows = result.rows;

      if (!this.rawRows || this.rawRows.length === 0) {
        this.showError('The file appears to be empty. Please upload a file with data.');
        zone.classList.remove('loading');
        zone.querySelector('.drop-text').textContent = origText;
        return;
      }

      this.renderPreview();
      this.renderColumnSelectors();
      zone.classList.remove('loading');
      zone.querySelector('.drop-text').textContent = origText;
      zone.style.display = 'none';
      document.getElementById('file-preview').hidden = false;
    }).catch(err => {
      this.showError('Could not read the file: ' + err.message);
      zone.classList.remove('loading');
      zone.querySelector('.drop-text').textContent = origText;
    });
  },

  renderPreview() {
    const thead = document.getElementById('preview-thead');
    const tbody = document.getElementById('preview-tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    // Header row
    const tr = document.createElement('tr');
    this.rawHeaders.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      tr.appendChild(th);
    });
    thead.appendChild(tr);

    // First 5 data rows
    const previewRows = FileParser.getPreviewRows(this.rawRows, 5);
    previewRows.forEach(row => {
      const tr = document.createElement('tr');
      this.rawHeaders.forEach((h, colIdx) => {
        const td = document.createElement('td');
        td.textContent = row[colIdx] !== undefined && row[colIdx] !== null ? row[colIdx] : '';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  },

  renderColumnSelectors() {
    const selName = document.getElementById('col-name');
    const selNumber = document.getElementById('col-number');
    const selBalance = document.getElementById('col-balance');

    [selName, selNumber, selBalance].forEach(sel => { sel.innerHTML = ''; });

    // Add "-- Not available --" option for optional fields
    const naOpt = document.createElement('option');
    naOpt.value = '__none__';
    naOpt.textContent = '-- Not available --';
    selNumber.appendChild(naOpt.cloneNode(true));

    // Add a placeholder for required fields
    const placeholderName = document.createElement('option');
    placeholderName.value = '__none__';
    placeholderName.textContent = '-- Select column --';
    selName.appendChild(placeholderName);

    const placeholderBal = document.createElement('option');
    placeholderBal.value = '__none__';
    placeholderBal.textContent = '-- Select column --';
    selBalance.appendChild(placeholderBal);

    this.rawHeaders.forEach((h, idx) => {
      [selName, selNumber, selBalance].forEach(sel => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = h;
        sel.appendChild(opt);
      });
    });

    // Auto-detect columns using FileParser
    const detected = FileParser.detectColumns(this.rawHeaders, this.rawRows);
    if (detected.accountName !== null) selName.value = String(detected.accountName);
    if (detected.accountNumber !== null) selNumber.value = String(detected.accountNumber);
    else selNumber.value = '__none__';
    if (detected.balance !== null) selBalance.value = String(detected.balance);

    this.updateFileSummary();

    // Update summary when selectors change
    [selName, selNumber, selBalance].forEach(sel => {
      sel.addEventListener('change', () => this.updateFileSummary());
    });
  },

  updateFileSummary() {
    const balVal = document.getElementById('col-balance').value;
    if (!balVal || balVal === '__none__') {
      const summary1 = document.getElementById('file-summary');
      summary1.textContent = '';
      summary1.append('Found ', Object.assign(document.createElement('strong'), { textContent: this.rawRows.length }), ' rows');
      return;
    }

    const balIdx = parseInt(balVal, 10);
    let total = 0;
    let count = 0;
    this.rawRows.forEach(row => {
      const val = FileParser._parseAmount(row[balIdx]);
      if (!isNaN(val)) {
        total += val;
        count++;
      }
    });

    const summary2 = document.getElementById('file-summary');
    summary2.textContent = '';
    summary2.append(
      'Found ',
      Object.assign(document.createElement('strong'), { textContent: count }),
      ' accounts totaling ',
      Object.assign(document.createElement('strong'), { textContent: this.formatCurrency(total) })
    );
  },

  confirmColumns() {
    const nameVal = document.getElementById('col-name').value;
    const numVal = document.getElementById('col-number').value;
    const balVal = document.getElementById('col-balance').value;

    if (!nameVal || nameVal === '__none__') {
      this.showError('Please select the Account Name column.');
      return;
    }
    if (!balVal || balVal === '__none__') {
      this.showError('Please select the Balance/Amount column.');
      return;
    }

    this.columnMap = {
      accountName: parseInt(nameVal, 10),
      accountNumber: numVal !== '__none__' ? parseInt(numVal, 10) : null,
      balance: parseInt(balVal, 10),
    };

    // Use FileParser.cleanData to extract clean accounts
    const cleaned = FileParser.cleanData(this.rawRows, this.columnMap);
    this.accounts = cleaned.accounts.map((a, i) => ({
      index: i,
      name: a.accountName,
      number: a.accountNumber || '',
      balance: a.balance,
    }));

    if (this.accounts.length === 0) {
      this.showError('No valid accounts found. Check your column selection.');
      return;
    }

    this.runAutoMapping();
    this.goToStep(2);
  },

  // ---- Step 2: Map ----

  runAutoMapping() {
    this.mappingResults = this.accounts.map(account => {
      const match = FuzzyMatcher.matchAccount(account.name);
      return {
        account: account,
        lineNumber: match.lineNumber,
        lineLabel: match.lineLabel,
        confidence: match.confidence,
        score: match.score,
      };
    });

    // Sort: unmapped first, then low, medium, high
    const order = { unmapped: 0, low: 1, medium: 2, high: 3 };
    this.mappingResults.sort((a, b) => {
      const diff = (order[a.confidence] || 0) - (order[b.confidence] || 0);
      if (diff !== 0) return diff;
      return a.account.name.localeCompare(b.account.name);
    });

    this.filteredIndices = null;
  },

  renderMappingTable() {
    const tbody = document.getElementById('mapping-tbody');
    tbody.innerHTML = '';

    const total = this.accounts.reduce((sum, a) => sum + (isNaN(a.balance) ? 0 : a.balance), 0);
    document.getElementById('mapping-header').textContent =
      this.accounts.length + ' accounts | Total: ' + this.formatCurrency(total);

    const indicesToShow = this.filteredIndices || this.mappingResults.map((_, i) => i);

    indicesToShow.forEach(i => {
      const m = this.mappingResults[i];
      const tr = document.createElement('tr');

      // Account Name
      const tdName = document.createElement('td');
      tdName.textContent = m.account.name;
      tr.appendChild(tdName);

      // Account Number
      const tdNum = document.createElement('td');
      tdNum.textContent = m.account.number;
      tr.appendChild(tdNum);

      // Balance
      const tdBal = document.createElement('td');
      tdBal.className = 'col-balance';
      tdBal.textContent = this.formatCurrency(m.account.balance);
      tr.appendChild(tdBal);

      // 990 Line Dropdown
      const tdLine = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'form-select mapping-select';

      // "Skip" option first
      const skipOpt = document.createElement('option');
      skipOpt.value = 'skip';
      skipOpt.textContent = 'Skip - Not an expense';
      sel.appendChild(skipOpt);

      // Add all Part IX lines from PART_IX_LINES (excluding 'skip' and '25')
      PART_IX_LINES.forEach(lineItem => {
        if (lineItem.line === 'skip' || lineItem.line === '25') return;
        const opt = document.createElement('option');
        opt.value = lineItem.line;
        opt.textContent = 'Line ' + lineItem.line + ' - ' + lineItem.label;
        sel.appendChild(opt);
      });

      sel.value = m.lineNumber || 'skip';
      sel.addEventListener('change', () => this.updateMapping(i, sel.value));
      tdLine.appendChild(sel);
      tr.appendChild(tdLine);

      // Confidence Badge
      const tdConf = document.createElement('td');
      tdConf.className = 'col-confidence';
      const badge = document.createElement('span');
      badge.className = 'badge badge-' + m.confidence;
      badge.textContent = m.confidence.charAt(0).toUpperCase() + m.confidence.slice(1);
      tdConf.appendChild(badge);
      tr.appendChild(tdConf);

      tbody.appendChild(tr);
    });
  },

  updateMapping(index, lineNumber) {
    if (lineNumber === 'skip') {
      this.mappingResults[index].lineNumber = null;
      this.mappingResults[index].lineLabel = 'Unmapped';
      this.mappingResults[index].confidence = 'unmapped';
    } else {
      this.mappingResults[index].lineNumber = lineNumber;
      // Find the label from PART_IX_LINES
      const found = PART_IX_LINES.find(l => l.line === lineNumber);
      this.mappingResults[index].lineLabel = found ? found.label : lineNumber;
      this.mappingResults[index].confidence = 'high'; // manual override = high
    }
    // Re-render the badge in the row
    const tbody = document.getElementById('mapping-tbody');
    const rows = tbody.querySelectorAll('tr');
    const displayIndices = this.filteredIndices || this.mappingResults.map((_, i) => i);
    const rowPos = displayIndices.indexOf(index);
    if (rowPos >= 0 && rows[rowPos]) {
      const badge = rows[rowPos].querySelector('.badge');
      const m = this.mappingResults[index];
      badge.className = 'badge badge-' + m.confidence;
      badge.textContent = m.confidence.charAt(0).toUpperCase() + m.confidence.slice(1);
    }
  },

  filterMappings(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredIndices = null;
    } else {
      this.filteredIndices = [];
      this.mappingResults.forEach((m, i) => {
        if (m.account.name.toLowerCase().includes(term) ||
            m.account.number.toLowerCase().includes(term)) {
          this.filteredIndices.push(i);
        }
      });
    }
    this.renderMappingTable();
  },

  confirmMappings() {
    this.goToStep(3);
  },

  // ---- Step 3: Review ----

  _buildSummaryData() {
    // Build summary grouped by line number
    const lineGroups = {};

    // Initialize all lines (except skip and 25)
    PART_IX_LINES.forEach(lineItem => {
      if (lineItem.line === 'skip' || lineItem.line === '25') return;
      lineGroups[lineItem.line] = {
        line: lineItem.line,
        label: lineItem.label,
        total: 0,
        count: 0,
        accounts: [],
      };
    });

    // Aggregate mapped accounts
    this.mappingResults.forEach(m => {
      if (m.lineNumber && lineGroups[m.lineNumber]) {
        const bal = isNaN(m.account.balance) ? 0 : m.account.balance;
        lineGroups[m.lineNumber].total += bal;
        lineGroups[m.lineNumber].count++;
        lineGroups[m.lineNumber].accounts.push({
          accountName: m.account.name,
          accountNumber: m.account.number,
          balance: m.account.balance,
        });
      }
    });

    // Build ordered lines array
    const lines = [];
    let grandTotal = 0;
    PART_IX_LINES.forEach(lineItem => {
      if (lineItem.line === 'skip' || lineItem.line === '25') return;
      const g = lineGroups[lineItem.line];
      lines.push(g);
      grandTotal += g.total;
    });

    return { lines, grandTotal: Math.round(grandTotal * 100) / 100 };
  },

  renderSummary() {
    const tbody = document.getElementById('summary-tbody');
    tbody.innerHTML = '';

    const summary = this._buildSummaryData();

    summary.lines.forEach(g => {
      const tr = document.createElement('tr');
      if (g.total === 0 && g.accounts.length === 0) tr.classList.add('zero-line');
      tr.dataset.line = g.line;

      // Expand arrow
      const tdExp = document.createElement('td');
      tdExp.className = 'col-expand';
      if (g.accounts.length > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'expand-arrow';
        arrow.textContent = '\u25B6';
        tdExp.appendChild(arrow);
      }
      tr.appendChild(tdExp);

      // Line #
      const tdNum = document.createElement('td');
      tdNum.textContent = g.line;
      tr.appendChild(tdNum);

      // Description
      const tdDesc = document.createElement('td');
      tdDesc.textContent = g.label;
      tr.appendChild(tdDesc);

      // Total
      const tdTotal = document.createElement('td');
      tdTotal.className = 'col-balance';
      tdTotal.textContent = this.formatCurrency(g.total);
      tr.appendChild(tdTotal);

      // Count
      const tdCount = document.createElement('td');
      tdCount.className = 'col-count';
      tdCount.textContent = g.accounts.length;
      tr.appendChild(tdCount);

      tr.addEventListener('click', () => this.toggleLineDetail(g.line));
      tbody.appendChild(tr);

      // Detail row (hidden by default)
      if (g.accounts.length > 0) {
        const detailTr = document.createElement('tr');
        detailTr.className = 'detail-row';
        detailTr.dataset.detailFor = g.line;
        const detailTd = document.createElement('td');
        detailTd.colSpan = 5;

        const ul = document.createElement('ul');
        ul.className = 'detail-list';
        g.accounts.forEach(a => {
          const li = document.createElement('li');
          const nameSpan = document.createElement('span');
          nameSpan.textContent = (a.accountNumber ? a.accountNumber + ' - ' : '') + a.accountName;
          const balSpan = document.createElement('span');
          balSpan.textContent = this.formatCurrency(a.balance);
          li.appendChild(nameSpan);
          li.appendChild(balSpan);
          ul.appendChild(li);
        });
        detailTd.appendChild(ul);
        detailTr.appendChild(detailTd);
        tbody.appendChild(detailTr);
      }
    });

    // Line 25 total
    const line25El = document.getElementById('line25-total');
    line25El.textContent = '';
    line25El.append(
      'Line 25 - Total functional expenses',
      Object.assign(document.createElement('span'), {
        className: 'total-amount',
        textContent: this.formatCurrency(summary.grandTotal)
      })
    );
  },

  toggleLineDetail(lineNumber) {
    const parentRow = document.querySelector('tr[data-line="' + lineNumber + '"]');
    const detailRow = document.querySelector('tr[data-detail-for="' + lineNumber + '"]');
    if (!detailRow) return;

    const isOpen = detailRow.classList.contains('visible');
    detailRow.classList.toggle('visible', !isOpen);
    if (parentRow) parentRow.classList.toggle('expanded', !isOpen);
  },

  // ---- Step 4: Export ----

  exportCSV() {
    const summary = this._buildSummaryData();
    Exporter.generateCSV(summary, this._buildExportMappings());
  },

  exportExcel() {
    const summary = this._buildSummaryData();
    Exporter.generateExcel(summary, this._buildExportMappings());
  },

  _buildExportMappings() {
    // Build array matching what Exporter expects for Account Detail sheet
    return this.mappingResults.map(m => ({
      accountName: m.account.name,
      accountNumber: m.account.number,
      balance: m.account.balance,
      lineNumber: m.lineNumber || 'skip',
      lineDescription: m.lineLabel || 'Skipped',
      confidence: m.confidence,
    }));
  },

  printView() {
    const summary = this._buildSummaryData();
    Exporter.openPrintView(summary, this._buildExportMappings());
  },

  startOver() {
    this.currentStep = 1;
    this.rawHeaders = null;
    this.rawRows = null;
    this.columnMap = null;
    this.accounts = null;
    this.mappingResults = null;
    this.filteredIndices = null;

    // Reset UI
    document.getElementById('file-preview').hidden = true;
    document.getElementById('drop-zone').style.display = '';
    document.getElementById('file-input').value = '';
    document.getElementById('mapping-filter').value = '';

    document.querySelectorAll('.step-container').forEach(el => el.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    this.updateProgress();
  },

  // ---- Helpers ----

  formatCurrency(num) {
    if (isNaN(num) || num === null || num === undefined) return '$0.00';
    const negative = num < 0;
    const abs = Math.abs(num);
    const formatted = abs.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return negative ? '($' + formatted + ')' : '$' + formatted;
  },

  showError(message) {
    const banner = document.getElementById('error-banner');
    const msg = document.getElementById('error-message');
    msg.textContent = message;
    banner.hidden = false;
    clearTimeout(this._errorTimeout);
    this._errorTimeout = setTimeout(() => this.hideError(), 6000);
  },

  hideError() {
    document.getElementById('error-banner').hidden = true;
  },

  // ---- Theme Toggle ----

  initTheme() {
    // Check for saved preference, then OS preference
    const saved = localStorage.getItem('990mapper-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Set up toggle button
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggleTheme());
    }

    // Listen for OS theme changes (only if no manual preference saved)
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('990mapper-theme')) {
          document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
      });
    }
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('990mapper-theme', next);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
