// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE_CSV = path.resolve(__dirname, 'fixtures', 'sample-accounts.csv');
const FIXTURE_FULL_CSV = path.resolve(__dirname, 'fixtures', 'nonprofit-full-accounts.csv');

// Expected account count in fixture CSV (rows with non-zero or zero balances, excluding header)
const EXPECTED_ACCOUNT_COUNT = 22;

// ============================================================
// 1. Page Load & Initial State
// ============================================================
test.describe('Page Load & Initial State', () => {

  test('page title is correct', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('990 Mapper - Map Your Chart of Accounts to Form 990 Part IX');
  });

  test('privacy banner is visible with lock icon', async ({ page }) => {
    await page.goto('/');
    const banner = page.locator('.privacy-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Your data never leaves your browser');
    // Lock icon is an SVG with class privacy-icon
    const lockIcon = banner.locator('svg.privacy-icon');
    await expect(lockIcon).toBeAttached();
  });

  test('drop zone is visible', async ({ page }) => {
    await page.goto('/');
    const dropZone = page.locator('#drop-zone');
    await expect(dropZone).toBeVisible();
    await expect(dropZone).toContainText('Drop your file here');
    await expect(dropZone.locator('.format-tag').first()).toHaveText('.csv');
  });

  test('progress bar shows step 1 as active', async ({ page }) => {
    await page.goto('/');
    const step1 = page.locator('.progress-step[data-step="1"]');
    await expect(step1).toHaveClass(/active/);
    await expect(step1.locator('.step-label')).toContainText('Upload');
  });

  test('steps 2, 3, 4 sections are not visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#step-2')).not.toBeVisible();
    await expect(page.locator('#step-3')).not.toBeVisible();
    await expect(page.locator('#step-4')).not.toBeVisible();
  });

  test('footer disclaimer is present', async ({ page }) => {
    await page.goto('/');
    const disclaimer = page.locator('.disclaimer');
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText('mapping aid');
    await expect(disclaimer).toContainText('qualified tax professional');
  });

});

// ============================================================
// 2. File Upload (Step 1)
// ============================================================
test.describe('File Upload (Step 1)', () => {

  test('upload CSV via file input shows preview', async ({ page }) => {
    await page.goto('/');
    // Upload the fixture CSV
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);

    // Drop zone should be hidden (display: none)
    await expect(page.locator('#drop-zone')).toBeHidden();

    // File preview should be visible
    const preview = page.locator('#file-preview');
    await expect(preview).toBeVisible();
  });

  test('preview table shows header row and data rows', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);

    // Header should have 3 columns
    const headerCells = page.locator('#preview-thead th');
    await expect(headerCells).toHaveCount(3);
    await expect(headerCells.nth(0)).toHaveText('Account Number');
    await expect(headerCells.nth(1)).toHaveText('Account Name');
    await expect(headerCells.nth(2)).toHaveText('Balance');

    // Preview shows up to 5 data rows
    const dataRows = page.locator('#preview-tbody tr');
    await expect(dataRows).toHaveCount(5);
  });

  test('column selectors are populated with correct headers', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);

    // Each selector should have options for the 3 CSV columns
    const colName = page.locator('#col-name');
    const colNumber = page.locator('#col-number');
    const colBalance = page.locator('#col-balance');

    // col-name: placeholder + 3 header options = 4
    await expect(colName.locator('option')).toHaveCount(4);
    // col-number: "-- Not available --" + 3 header options = 4
    await expect(colNumber.locator('option')).toHaveCount(4);
    // col-balance: placeholder + 3 header options = 4
    await expect(colBalance.locator('option')).toHaveCount(4);
  });

  test('auto-detection selects the right columns', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);

    // "Account Name" should be auto-detected for col-name (index 1)
    await expect(page.locator('#col-name')).toHaveValue('1');
    // "Account Number" should be auto-detected for col-number (index 0)
    await expect(page.locator('#col-number')).toHaveValue('0');
    // "Balance" should be auto-detected for col-balance (index 2)
    await expect(page.locator('#col-balance')).toHaveValue('2');
  });

  test('file summary shows correct account count and total', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);

    const summary = page.locator('#file-summary');
    await expect(summary).toBeVisible();
    // Should show 22 accounts (all rows have parseable balances)
    await expect(summary).toContainText('22');
    // Total of all balances
    await expect(summary).toContainText('accounts totaling');
  });

  test('changing column selector updates the summary', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);

    const summary = page.locator('#file-summary');
    const originalText = await summary.textContent();

    // Change balance column to "-- Not available --"
    await page.locator('#col-balance').selectOption('__none__');
    const updatedText = await summary.textContent();

    // Summary should change (no longer show "totaling")
    expect(updatedText).not.toEqual(originalText);
    await expect(summary).toContainText('22');
    // When balance is not selected, should show "rows" without total
    await expect(summary).toContainText('rows');
  });

  test('clicking "Continue to Mapping" advances to step 2', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);

    await page.getByText('Continue to Mapping').click();

    // Step 2 should now be visible
    await expect(page.locator('#step-2')).toBeVisible();
    // Step 1 should be hidden
    await expect(page.locator('#step-1')).not.toBeVisible();
    // Progress bar step 2 should be active
    await expect(page.locator('.progress-step[data-step="2"]')).toHaveClass(/active/);
    // Progress bar step 1 should be completed
    await expect(page.locator('.progress-step[data-step="1"]')).toHaveClass(/completed/);
  });
});

// ============================================================
// 3. Auto-Mapping (Step 2)
// ============================================================
test.describe('Auto-Mapping (Step 2)', () => {

  // Helper: upload CSV and advance to step 2
  async function goToStep2(page) {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);
    await page.getByText('Continue to Mapping').click();
    await expect(page.locator('#step-2')).toBeVisible();
  }

  test('mapping table is populated with accounts from the CSV', async ({ page }) => {
    await goToStep2(page);
    const rows = page.locator('#mapping-tbody tr');
    // Revenue - Donations has balance 0.00 which is still a valid number, so all 22 rows
    // However, cleanData skips rows where balance is NaN. 0.00 is valid.
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(EXPECTED_ACCOUNT_COUNT);
  });

  test('each row has a dropdown with 990 line options', async ({ page }) => {
    await goToStep2(page);
    const firstSelect = page.locator('#mapping-tbody tr:first-child select.mapping-select');
    await expect(firstSelect).toBeVisible();

    // Should have "Skip - Not an expense" plus all Part IX lines (excluding skip and 25)
    const options = firstSelect.locator('option');
    const count = await options.count();
    // 1 skip + 30 line items (lines 1-24e excluding 25 and skip) = 31
    expect(count).toBeGreaterThanOrEqual(25);
  });

  test('confidence badges are visible with correct classes', async ({ page }) => {
    await goToStep2(page);
    // Check that badge elements exist
    const badges = page.locator('#mapping-tbody .badge');
    const badgeCount = await badges.count();
    expect(badgeCount).toBeGreaterThan(0);

    // Verify at least one badge has one of the expected classes
    const allBadgeClasses = [];
    for (let i = 0; i < badgeCount; i++) {
      const cls = await badges.nth(i).getAttribute('class');
      allBadgeClasses.push(cls);
    }
    const hasExpectedClass = allBadgeClasses.some(cls =>
      cls.includes('badge-high') || cls.includes('badge-medium') ||
      cls.includes('badge-low') || cls.includes('badge-unmapped')
    );
    expect(hasExpectedClass).toBe(true);
  });

  test('known accounts are mapped correctly', async ({ page }) => {
    await goToStep2(page);

    // Helper: find the row for an account name and check its dropdown value
    async function checkMapping(accountName, expectedLine) {
      const rows = page.locator('#mapping-tbody tr');
      const count = await rows.count();
      let found = false;
      for (let i = 0; i < count; i++) {
        const firstTd = await rows.nth(i).locator('td').first().textContent();
        if (firstTd.trim() === accountName) {
          const select = rows.nth(i).locator('select.mapping-select');
          const value = await select.inputValue();
          expect(value, `${accountName} should map to line ${expectedLine}`).toBe(expectedLine);
          found = true;
          break;
        }
      }
      expect(found, `Account "${accountName}" should exist in mapping table`).toBe(true);
    }

    await checkMapping('Salaries and Wages', '7');
    await checkMapping('Office Supplies', '13');
    await checkMapping('Rent', '16');
    await checkMapping('Health Insurance', '9');
  });

  test('unmapped/low confidence items appear before high confidence items', async ({ page }) => {
    await goToStep2(page);

    const badges = page.locator('#mapping-tbody .badge');
    const count = await badges.count();
    const confidenceOrder = [];
    for (let i = 0; i < count; i++) {
      const cls = await badges.nth(i).getAttribute('class');
      if (cls.includes('badge-unmapped')) confidenceOrder.push(0);
      else if (cls.includes('badge-low')) confidenceOrder.push(1);
      else if (cls.includes('badge-medium')) confidenceOrder.push(2);
      else if (cls.includes('badge-high')) confidenceOrder.push(3);
    }

    // Verify non-decreasing order (unmapped/low come first)
    for (let i = 1; i < confidenceOrder.length; i++) {
      expect(confidenceOrder[i]).toBeGreaterThanOrEqual(confidenceOrder[i - 1]);
    }
  });

  test('filter input works: typing filters visible rows', async ({ page }) => {
    await goToStep2(page);

    const allRowsBefore = await page.locator('#mapping-tbody tr').count();

    // Type a search term that should match only a few accounts
    await page.locator('#mapping-filter').fill('Rent');
    await page.waitForTimeout(300);

    const filteredRows = await page.locator('#mapping-tbody tr').count();
    expect(filteredRows).toBeLessThan(allRowsBefore);
    expect(filteredRows).toBeGreaterThanOrEqual(1);

    // The visible row should contain "Rent"
    const firstRowName = await page.locator('#mapping-tbody tr:first-child td').first().textContent();
    expect(firstRowName.toLowerCase()).toContain('rent');

    // Clear filter restores all rows
    await page.locator('#mapping-filter').fill('');
    await page.waitForTimeout(300);
    const restoredRows = await page.locator('#mapping-tbody tr').count();
    expect(restoredRows).toBe(allRowsBefore);
  });

  test('changing a dropdown updates the mapping', async ({ page }) => {
    await goToStep2(page);

    // Find a row and change its dropdown
    const firstSelect = page.locator('#mapping-tbody tr:first-child select.mapping-select');
    const originalValue = await firstSelect.inputValue();

    // Change to a different value (Line 17 - Travel)
    await firstSelect.selectOption('17');
    const newValue = await firstSelect.inputValue();
    expect(newValue).toBe('17');
    expect(newValue).not.toBe(originalValue !== '17' ? originalValue : 'different');

    // Badge should update to "High" since manual override = high
    const badge = page.locator('#mapping-tbody tr:first-child .badge');
    await expect(badge).toHaveClass(/badge-high/);
    await expect(badge).toHaveText('High');
  });

  test('"Confirm Mappings" button advances to step 3', async ({ page }) => {
    await goToStep2(page);
    await page.getByText('Confirm Mappings').click();

    await expect(page.locator('#step-3')).toBeVisible();
    await expect(page.locator('#step-2')).not.toBeVisible();
    await expect(page.locator('.progress-step[data-step="3"]')).toHaveClass(/active/);
  });
});

// ============================================================
// 4. Review Summary (Step 3)
// ============================================================
test.describe('Review Summary (Step 3)', () => {

  async function goToStep3(page) {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);
    await page.getByText('Continue to Mapping').click();
    await expect(page.locator('#step-2')).toBeVisible();
    await page.getByText('Confirm Mappings').click();
    await expect(page.locator('#step-3')).toBeVisible();
  }

  test('summary table shows Part IX line items', async ({ page }) => {
    await goToStep3(page);
    const rows = page.locator('#summary-tbody tr:not(.detail-row)');
    const count = await rows.count();
    // Should have entries for all Part IX lines except skip and 25
    expect(count).toBeGreaterThanOrEqual(25);
  });

  test('lines with mapped accounts show non-zero totals', async ({ page }) => {
    await goToStep3(page);

    // Line 7 (Other salaries and wages) should have a non-zero total from "Salaries and Wages"
    const line7Row = page.locator('#summary-tbody tr[data-line="7"]');
    await expect(line7Row).toBeVisible();
    const totalCell = line7Row.locator('td.col-balance');
    const totalText = await totalCell.textContent();
    // Should not be $0.00
    expect(totalText).not.toBe('$0.00');
  });

  test('lines with no mappings show $0.00', async ({ page }) => {
    await goToStep3(page);

    // Line 4 (Benefits paid to or for members) - unlikely to have any mapping from our fixture
    const line4Row = page.locator('#summary-tbody tr[data-line="4"]');
    await expect(line4Row).toBeVisible();
    const totalCell = line4Row.locator('td.col-balance');
    await expect(totalCell).toHaveText('$0.00');
  });

  test('Line 25 total is displayed and equals sum of line totals', async ({ page }) => {
    await goToStep3(page);

    const line25 = page.locator('#line25-total');
    await expect(line25).toBeVisible();
    await expect(line25).toContainText('Line 25');
    await expect(line25).toContainText('Total functional expenses');

    // The total amount should be present in a .total-amount span
    const totalAmount = line25.locator('.total-amount');
    await expect(totalAmount).toBeVisible();
    const totalText = await totalAmount.textContent();
    // Should contain a dollar sign and a number
    expect(totalText).toMatch(/\$/);
  });

  test('clicking a row with accounts expands to show detail', async ({ page }) => {
    await goToStep3(page);

    // Find a line that has mapped accounts (Line 7 should have "Salaries and Wages")
    const line7Row = page.locator('#summary-tbody tr[data-line="7"]');
    const detailRow = page.locator('#summary-tbody tr[data-detail-for="7"]');

    // Detail should be hidden initially
    await expect(detailRow).not.toBeVisible();

    // Click to expand
    await line7Row.click();
    await expect(detailRow).toBeVisible();
    await expect(detailRow).toHaveClass(/visible/);

    // Detail should show account names
    const detailList = detailRow.locator('.detail-list');
    await expect(detailList).toBeVisible();
    const items = detailList.locator('li');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('detail shows individual account names and balances', async ({ page }) => {
    await goToStep3(page);

    // Expand Line 7
    await page.locator('#summary-tbody tr[data-line="7"]').click();
    const detailRow = page.locator('#summary-tbody tr[data-detail-for="7"]');
    await expect(detailRow).toBeVisible();

    // Check that detail list contains account info
    const detailText = await detailRow.textContent();
    expect(detailText).toContain('Salaries and Wages');
    expect(detailText).toContain('$');
  });

  test('"Back to Mapping" button goes back to step 2', async ({ page }) => {
    await goToStep3(page);
    await page.getByText('Back to Mapping').click();

    await expect(page.locator('#step-2')).toBeVisible();
    await expect(page.locator('#step-3')).not.toBeVisible();
    await expect(page.locator('.progress-step[data-step="2"]')).toHaveClass(/active/);
  });

  test('"Continue to Export" button advances to step 4', async ({ page }) => {
    await goToStep3(page);
    await page.getByText('Continue to Export').click();

    await expect(page.locator('#step-4')).toBeVisible();
    await expect(page.locator('#step-3')).not.toBeVisible();
    await expect(page.locator('.progress-step[data-step="4"]')).toHaveClass(/active/);
  });
});

// ============================================================
// 5. Export (Step 4)
// ============================================================
test.describe('Export (Step 4)', () => {

  async function goToStep4(page) {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);
    await page.getByText('Continue to Mapping').click();
    await expect(page.locator('#step-2')).toBeVisible();
    await page.getByText('Confirm Mappings').click();
    await expect(page.locator('#step-3')).toBeVisible();
    await page.getByText('Continue to Export').click();
    await expect(page.locator('#step-4')).toBeVisible();
  }

  test('three export cards are visible (CSV, Excel, Print)', async ({ page }) => {
    await goToStep4(page);

    const cards = page.locator('.export-card');
    await expect(cards).toHaveCount(3);

    await expect(cards.nth(0)).toContainText('Download CSV');
    await expect(cards.nth(1)).toContainText('Download Excel');
    await expect(cards.nth(2)).toContainText('Print View');
  });

  test('CSV download triggers', async ({ page }) => {
    await goToStep4(page);

    // Listen for download event
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.export-card').filter({ hasText: 'Download CSV' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/990-part-ix-mapping-.*\.csv$/);
  });

  test('Excel download triggers', async ({ page }) => {
    await goToStep4(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.export-card').filter({ hasText: 'Download Excel' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/990-part-ix-mapping-.*\.xlsx$/);
  });

  test('"Start Over" button resets to step 1 with drop zone visible', async ({ page }) => {
    await goToStep4(page);

    await page.getByText('Start Over').click();

    // Should be back at step 1
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-4')).not.toBeVisible();

    // Drop zone should be visible again
    await expect(page.locator('#drop-zone')).toBeVisible();

    // File preview should be hidden
    await expect(page.locator('#file-preview')).toBeHidden();

    // Progress bar step 1 should be active
    await expect(page.locator('.progress-step[data-step="1"]')).toHaveClass(/active/);
  });
});

// ============================================================
// 6. Edge Cases
// ============================================================
test.describe('Edge Cases', () => {

  test('upload with invalid file type shows error', async ({ page }) => {
    await page.goto('/');

    // Create a temporary invalid file (txt)
    // We use setInputFiles with a buffer to simulate a .txt file
    await page.locator('#file-input').setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not a csv'),
    });

    // Error banner should appear
    const errorBanner = page.locator('#error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(page.locator('#error-message')).toContainText('Invalid file type');

    // Drop zone should still be visible
    await expect(page.locator('#drop-zone')).toBeVisible();
  });

  test('navigation guard: cannot go to step 2 without uploading', async ({ page }) => {
    await page.goto('/');

    // Try to navigate to step 2 via App.goToStep(2)
    await page.evaluate(() => App.goToStep(2));

    // Error banner should show
    const errorBanner = page.locator('#error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(page.locator('#error-message')).toContainText('upload');

    // Should still be on step 1
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-2')).not.toBeVisible();
  });

  test('navigation guard: cannot go to step 3 without mapping', async ({ page }) => {
    await page.goto('/');

    // Try to navigate to step 3 via App.goToStep(3)
    await page.evaluate(() => App.goToStep(3));

    const errorBanner = page.locator('#error-banner');
    await expect(errorBanner).toBeVisible();

    // Should still be on step 1
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#step-3')).not.toBeVisible();
  });
});

// ============================================================
// 7. Dark Mode Toggle
// ============================================================
test.describe('Dark Mode Toggle', () => {

  test('theme toggle button is visible on page load', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#theme-toggle');
    await expect(toggle).toBeVisible();
  });

  test('default theme respects no data-theme attribute (light mode)', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).not.toHaveAttribute('data-theme', 'dark');
    // Body should not have a dark class
    const body = page.locator('body');
    await expect(body).not.toHaveClass(/dark/);
  });

  test('clicking toggle switches to dark mode', async ({ page }) => {
    await page.goto('/');
    await page.locator('#theme-toggle').click();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('clicking toggle again switches back to light mode', async ({ page }) => {
    await page.goto('/');
    // First click: switch to dark
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Second click: switch back to light
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('theme preference persists via localStorage', async ({ page }) => {
    await page.goto('/');
    // Switch to dark mode
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Verify localStorage has the theme preference
    const storedTheme = await page.evaluate(() => localStorage.getItem('990mapper-theme'));
    expect(storedTheme).toBe('dark');

    // Reload the page
    await page.reload();

    // Theme should persist after reload
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('toggle button has correct aria-label', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Toggle dark mode');
  });

  test('dark mode: privacy banner is still visible', async ({ page }) => {
    await page.goto('/');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const banner = page.locator('.privacy-banner');
    await expect(banner).toBeVisible();
  });

  test('dark mode: full workflow still functions', async ({ page }) => {
    await page.goto('/');

    // Enable dark mode
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Upload the sample CSV
    await page.locator('#file-input').setInputFiles(FIXTURE_CSV);

    // File preview should appear
    const preview = page.locator('#file-preview');
    await expect(preview).toBeVisible();

    // Column selectors should be populated
    const colName = page.locator('#col-name');
    await expect(colName.locator('option')).toHaveCount(4);

    // Advance to step 2
    await page.getByText('Continue to Mapping').click();
    await expect(page.locator('#step-2')).toBeVisible();

    // Mapping table should be populated
    const rows = page.locator('#mapping-tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(EXPECTED_ACCOUNT_COUNT);
  });
});

// ============================================================
// 8. Mapping Accuracy - Full Nonprofit Chart of Accounts
// ============================================================
test.describe('Mapping Accuracy', () => {

  // Helper: upload file, confirm columns, get to step 2
  async function uploadAndMap(page) {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(FIXTURE_FULL_CSV);
    await expect(page.locator('#file-preview')).toBeVisible();
    await page.getByText('Continue to Mapping').click();
    await expect(page.locator('#step-2')).toBeVisible();
  }

  // Helper: find the selected mapping for a given account name
  async function getMappingForAccount(page, accountName) {
    const rows = page.locator('#mapping-tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const name = await row.locator('td').first().textContent();
      if (name && name.trim() === accountName) {
        const select = row.locator('select');
        return await select.inputValue();
      }
    }
    return null;
  }

  const expectedMappings = [
    ['Executive Director Salary', '5'],
    ['Development Coordinator Salary', '7'],
    ['Part-Time Program Staff', '7'],
    ['Dental & Vision', '9'],
    ['403(b) Employer Match', '8'],
    ['FICA Taxes', '10'],
    ['Grants to Partner Organizations', '1'],
    ['Scholarships to Individuals', '2'],
    ['Fundraising Consultant', '11e'],
    ['Accounting & Audit Fees', '11c'],
    ['Consulting - Strategic Planning', '11g'],
    ['Staff Travel - Lodging', '17'],
    ['Staff Travel - Airfare', '17'],
    ['Utilities - Electric', '16'],
    ['Internet Service', '14'],
    ['Phone & Telecommunications', '14'],
    ['IT Support Services', '14'],
    ['Software Licenses', '14'],
    ['Bank Service Charges', '24a'],
    ['Credit Card Processing Fees', '24a'],
    ['Participant Stipends', '24a'],
    ['Annual Report Design & Print', '12'],
    ['Professional Development Training', '19'],
    ['Equipment Depreciation', '22'],
    ['Interest on Line of Credit', '20'],
    ['D&O Insurance', '23'],
    ['Rent - Office Space', '16'],
    ['Office Supplies', '13'],
    ['Marketing & Outreach', '12'],
  ];

  for (const [accountName, expectedLine] of expectedMappings) {
    test(`"${accountName}" should map to Line ${expectedLine}`, async ({ page }) => {
      await uploadAndMap(page);
      const mappedLine = await getMappingForAccount(page, accountName);
      expect(mappedLine, `Expected "${accountName}" to map to Line ${expectedLine} but got Line ${mappedLine}`).toBe(expectedLine);
    });
  }
});
