# 990 Mapper

**Free, open-source tool to map your nonprofit's chart of accounts to IRS Form 990 Part IX (Statement of Functional Expenses).**

No signup. No data leaves your browser. Just upload, map, and export.

## What It Does

If you're a nonprofit accountant, treasurer, or finance director preparing Form 990, you know the pain of mapping your chart of accounts to the ~25 line items on Part IX. This tool automates that process:

1. **Upload** your chart of accounts (CSV, XLSX, or XLS from QuickBooks, Xero, Sage, or any accounting software)
2. **Auto-map** accounts to 990 Part IX lines using fuzzy matching against a comprehensive keyword dictionary
3. **Review** the mapping in a summary that mirrors the actual Part IX layout
4. **Export** as CSV, Excel, or a printer-friendly worksheet to hand to your CPA

## Privacy

**Your data never leaves your browser.** Everything runs client-side in JavaScript. There is no backend, no database, no analytics, and no external API calls. The source code is right here for you to verify.

## Tech Stack

- Plain HTML, CSS, and vanilla JavaScript (no build step, no npm)
- [SheetJS](https://sheetjs.com/) for parsing spreadsheet files
- [Fuse.js](https://www.fusejs.io/) for fuzzy text matching
- Hosted on GitHub Pages

## Usage

1. Visit [szubair22.github.io/990Mapper](https://szubair22.github.io/990Mapper)
2. Drop your chart of accounts file (or click to browse)
3. Confirm which columns contain the account name and balance
4. Review the auto-suggested mappings and adjust any that need correction
5. Export your completed mapping

## Supported File Formats

- `.csv` (comma-separated values)
- `.xlsx` (Excel 2007+)
- `.xls` (Legacy Excel)

The tool handles common accounting software exports including QuickBooks, Xero, and Sage Intacct formats.

## Disclaimer

This tool is a mapping aid to help organize your chart of accounts for Form 990 preparation. It is not tax advice. Consult a qualified tax professional for your filing.

## License

MIT

## Built By

[Fossys](https://fossys.com)
