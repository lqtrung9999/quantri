const ExcelJS = require('exceljs');

const number = value => {
  const parsed = Number(String(value ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const unitCode = value => {
  const original = String(value || 'Cái').trim();
  const key = original.toLocaleLowerCase('vi-VN');
  return ({ 'cái': 'PCE', 'pce': 'PCE', 'bộ': 'SET', 'set': 'SET', 'kg': 'KGM', 'kgm': 'KGM', 'cuộn': 'ROL', 'rol': 'ROL', 'túi': 'BAG', 'bag': 'BAG', 'quyển': 'PCE', 'bó': 'BUNDLE' })[key] || original.toUpperCase();
};

function exportLines(shipments, batchId) {
  const output = [];
  for (const shipment of shipments) {
    const loading = (shipment.loadingRecords || []).find(item => item.batchId === batchId);
    if (!loading) continue;
    const lines = Array.isArray(shipment.customsLines) ? shipment.customsLines : [];
    if (!lines.length) continue;
    const totalPackages = number(shipment.packageCount);
    const ratio = totalPackages > 0 ? Math.min(1, number(loading.packageCount) / totalPackages) : 1;
    if (ratio < 0.999999 && lines.length > 1) {
      throw new Error(`Mã ${shipment.cargoCode} được xếp một phần nhưng có nhiều dòng khai báo. Vui lòng hoàn thiện số lượng từng dòng trước khi xuất ECUS.`);
    }
    lines.forEach(line => output.push({
      cargoCode: shipment.cargoCode || '',
      englishName: line.englishName || '',
      description: line.goodsDescription || '',
      invoicePrice: number(line.invoicePriceBeforeTax),
      hsCode: line.hsCode || '',
      quantity: number(line.quantity1) * ratio,
      unit: unitCode(line.unit1),
      quantity2: number(line.quantity2) * ratio,
      unit2: unitCode(line.unit2 || line.unit1),
      declaredPriceUsd: number(line.declaredPriceUsd),
      packages: number(line.packageCount) * ratio,
      netWeight: number(line.netWeightKg) * ratio,
      grossWeight: number(line.grossWeightKg) * ratio,
      importRate: number(line.importTaxRate),
      vatRate: number(line.vatRate)
    }));
  }
  return output;
}

async function buildCustomsWorkbook({ templatePath, shipments, batchId, exchangeRate }) {
  const rows = exportLines(shipments, batchId);
  if (!rows.length) throw new Error('Mã xe này chưa có dòng khai báo hợp lệ để xuất.');
  if (rows.length > 120) throw new Error('File mẫu hỗ trợ tối đa 120 dòng hàng cho một lần xuất.');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  // ExcelJS cannot safely write a shared-formula clone after its master row is
  // cleared. Materialize every shared formula first; Excel recalculates the
  // same expressions when the downloaded workbook is opened.
  workbook.worksheets.forEach(sheet => sheet.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, cell => {
    if (cell.type === ExcelJS.ValueType.Formula && cell.formula) {
      cell.value = cell.formula.includes('#REF!') ? null : { formula: cell.formula, result: cell.result };
    }
  })));
  const contract = workbook.getWorksheet('HỢP ĐỒNG');
  const invoiceCo = workbook.getWorksheet('INVOICE lam CO');
  const packing = workbook.getWorksheet('PACKINGLIST');
  const machine = workbook.getWorksheet('nhập máy');
  const declaration = workbook.getWorksheet('BAN_KE');
  if (!contract || !invoiceCo || !packing || !machine) throw new Error('File mẫu ECUS thiếu sheet bắt buộc.');

  // The supplied template merges cargo codes that have several declaration
  // lines. Exported trips can group rows differently, so restore normal cells
  // in the data area before inserting the selected trip.
  for (const merge of [...(contract.model.merges || [])]) {
    const matched = String(merge).match(/^B(\d+):B(\d+)$/i);
    if (matched && Number(matched[1]) >= 19 && Number(matched[2]) <= 138) contract.unMergeCells(merge);
  }

  contract.getCell('L12').value = number(exchangeRate);
  for (let row = 19; row <= 138; row += 1) {
    for (let col = 1; col <= 24; col += 1) contract.getCell(row, col).value = null;
    for (let col = 1; col <= 11; col += 1) invoiceCo.getCell(row - 4, col).value = null;
    for (let col = 1; col <= 19; col += 1) packing.getCell(row - 6, col).value = null;
    for (let col = 1; col <= 26; col += 1) machine.getCell(row - 17, col).value = null;
  }
  if (declaration) for (let row = 2; row <= 51; row += 1) for (let col = 1; col <= 8; col += 1) declaration.getCell(row, col).value = null;

  rows.forEach((item, index) => {
    const r = 19 + index, co = 15 + index, pl = 13 + index, im = 2 + index;
    contract.getCell(`A${r}`).value = index + 1;
    contract.getCell(`B${r}`).value = item.cargoCode;
    contract.getCell(`C${r}`).value = item.description;
    contract.getCell(`D${r}`).value = item.unit;
    contract.getCell(`E${r}`).value = item.quantity;
    contract.getCell(`F${r}`).value = item.declaredPriceUsd;
    contract.getCell(`G${r}`).value = { formula: `E${r}*F${r}` };
    contract.getCell(`H${r}`).value = 'B05';
    contract.getCell(`I${r}`).value = item.hsCode;
    contract.getCell(`J${r}`).value = { formula: `F${r}*$L$12` };
    contract.getCell(`K${r}`).value = item.invoicePrice;
    contract.getCell(`L${r}`).value = { formula: `G${r}*$L$12` };
    contract.getCell(`M${r}`).value = item.importRate / 100;
    contract.getCell(`N${r}`).value = { formula: `M${r}*L${r}` };
    contract.getCell(`O${r}`).value = { formula: `L${r}+N${r}` };
    contract.getCell(`P${r}`).value = item.vatRate / 100;
    contract.getCell(`Q${r}`).value = { formula: `O${r}*P${r}` };
    contract.getCell(`T${r}`).value = { formula: `L${r}` };

    invoiceCo.getCell(`A${co}`).value = { formula: `'HỢP ĐỒNG'!A${r}` };
    invoiceCo.getCell(`B${co}`).value = item.englishName;
    invoiceCo.getCell(`C${co}`).value = { formula: `'HỢP ĐỒNG'!I${r}` };
    invoiceCo.getCell(`D${co}`).value = { formula: `'HỢP ĐỒNG'!D${r}` };
    invoiceCo.getCell(`E${co}`).value = { formula: `'HỢP ĐỒNG'!E${r}` };
    invoiceCo.getCell(`F${co}`).value = { formula: `'HỢP ĐỒNG'!F${r}` };
    invoiceCo.getCell(`G${co}`).value = { formula: `F${co}*E${co}` };
    invoiceCo.getCell(`H${co}`).value = item.packages;
    invoiceCo.getCell(`I${co}`).value = item.description;
    invoiceCo.getCell(`J${co}`).value = item.unit;
    invoiceCo.getCell(`K${co}`).value = item.cargoCode;

    packing.getCell(`A${pl}`).value = { formula: `'HỢP ĐỒNG'!A${r}` };
    packing.getCell(`B${pl}`).value = { formula: `'HỢP ĐỒNG'!C${r}` };
    packing.getCell(`C${pl}`).value = { formula: `'HỢP ĐỒNG'!D${r}` };
    packing.getCell(`D${pl}`).value = { formula: `'HỢP ĐỒNG'!E${r}` };
    packing.getCell(`F${pl}`).value = item.packages;
    packing.getCell(`G${pl}`).value = item.netWeight;
    packing.getCell(`H${pl}`).value = item.grossWeight;

    machine.getCell(`A${im}`).value = { formula: `'HỢP ĐỒNG'!A${r}` };
    machine.getCell(`B${im}`).value = item.cargoCode;
    machine.getCell(`C${im}`).value = { formula: `'HỢP ĐỒNG'!C${r}` };
    machine.getCell(`D${im}`).value = { formula: `'HỢP ĐỒNG'!I${r}` };
    machine.getCell(`E${im}`).value = 'CN';
    machine.getCell(`F${im}`).value = { formula: `'HỢP ĐỒNG'!E${r}` };
    machine.getCell(`G${im}`).value = item.unit;
    machine.getCell(`H${im}`).value = item.quantity2 || item.netWeight;
    machine.getCell(`I${im}`).value = item.unit2 || 'KGM';
    machine.getCell(`J${im}`).value = { formula: `'HỢP ĐỒNG'!F${r}` };
    machine.getCell(`M${im}`).value = 'B05';
    machine.getCell(`N${im}`).value = item.importRate / 100;
    machine.getCell(`Y${im}`).value = { formula: `IF(Z${im}=8%,"VB245",IF(Z${im}=10%,"VB901",IF(Z${im}=5%,"VB185","")))` };
    machine.getCell(`Z${im}`).value = { formula: `'HỢP ĐỒNG'!P${r}` };

    if (declaration && index < 50) {
      const br = 2 + index;
      declaration.getCell(`A${br}`).value = index + 1;
      declaration.getCell(`B${br}`).value = index + 1;
      declaration.getCell(`C${br}`).value = item.hsCode;
      declaration.getCell(`D${br}`).value = item.description;
      declaration.getCell(`E${br}`).value = item.quantity;
      declaration.getCell(`F${br}`).value = item.unit;
      declaration.getCell(`G${br}`).value = item.netWeight;
      declaration.getCell(`H${br}`).value = 'KGM';
    }
  });

  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  return workbook.xlsx.writeBuffer();
}

module.exports = { buildCustomsWorkbook, exportLines, unitCode };
