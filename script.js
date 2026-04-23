const records = [];

const customerName = document.getElementById("customerName");
const invoiceNumber = document.getElementById("invoiceNumber");
const invoiceAmount = document.getElementById("invoiceAmount");
const paymentType = document.getElementById("paymentType");
const partialAmount = document.getElementById("partialAmount");
const addRecordBtn = document.getElementById("addRecordBtn");
const recordsTableBody = document.getElementById("recordsTableBody");
const chequeRegisterBody = document.getElementById("chequeRegisterBody");
const paymentReceivedBody = document.getElementById("paymentReceivedBody");

const totalInvoice = document.getElementById("totalInvoice");
const totalPaid = document.getElementById("totalPaid");
const totalRemaining = document.getElementById("totalRemaining");
const recordsTabBtn = document.getElementById("recordsTabBtn");
const reportsTabBtn = document.getElementById("reportsTabBtn");
const recordsPanel = document.getElementById("recordsPanel");
const summaryPanel = document.getElementById("summaryPanel");
const recordsTablePanel = document.getElementById("recordsTablePanel");
const reportsPanel = document.getElementById("reportsPanel");

function renderTable() {
  recordsTableBody.innerHTML = "";
  chequeRegisterBody.innerHTML = "";
  paymentReceivedBody.innerHTML = "";

  let invoiceSum = 0;
  let paidSum = 0;
  let remainingSum = 0;

  records.forEach((record) => {
    invoiceSum += record.invoiceAmount;
    paidSum += record.paid;
    remainingSum += record.remaining;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${record.customerName}</td>
      <td>${record.invoiceNumber}</td>
      <td>${record.invoiceAmount.toFixed(2)}</td>
      <td>${record.paymentType}</td>
      <td>${record.paid.toFixed(2)}</td>
      <td>${record.remaining.toFixed(2)}</td>
    `;
    recordsTableBody.appendChild(row);

    const chequeRow = document.createElement("tr");
    chequeRow.innerHTML = `
      <td>${record.customerName}</td>
      <td>${record.invoiceNumber}</td>
      <td>${record.invoiceAmount.toFixed(2)}</td>
      <td>${record.paid.toFixed(2)}</td>
    `;
    chequeRegisterBody.appendChild(chequeRow);

    const paymentRow = document.createElement("tr");
    paymentRow.innerHTML = `
      <td>${record.customerName}</td>
      <td>${record.invoiceNumber}</td>
      <td>${record.paymentType}</td>
      <td>${record.paid.toFixed(2)}</td>
    `;
    paymentReceivedBody.appendChild(paymentRow);
  });

  totalInvoice.textContent = invoiceSum.toFixed(2);
  totalPaid.textContent = paidSum.toFixed(2);
  totalRemaining.textContent = remainingSum.toFixed(2);
}

addRecordBtn.addEventListener("click", () => {
  const name = customerName.value.trim();
  const invNo = invoiceNumber.value.trim();
  const amount = Number(invoiceAmount.value);
  const type = paymentType.value;
  const partial = Number(partialAmount.value);

  if (!name || !invNo || !amount || !type) {
    alert("Please complete all required fields.");
    return;
  }

  let paid = 0;

  if (type === "full") {
    paid = amount;
  } else if (type === "partial") {
    if (!partial || partial <= 0 || partial > amount) {
      alert("Enter a valid partial amount.");
      return;
    }
    paid = partial;
  }

  const remaining = amount - paid;

  records.push({
    customerName: name,
    invoiceNumber: invNo,
    invoiceAmount: amount,
    paymentType: type,
    paid: paid,
    remaining: remaining
  });

  customerName.value = "";
  invoiceNumber.value = "";
  invoiceAmount.value = "";
  paymentType.value = "";
  partialAmount.value = "";

  renderTable();
});

function setActiveTab(tabName) {
  const showReports = tabName === "reports";

  recordsPanel.classList.toggle("hidden", showReports);
  summaryPanel.classList.toggle("hidden", showReports);
  recordsTablePanel.classList.toggle("hidden", showReports);
  reportsPanel.classList.toggle("hidden", !showReports);

  recordsTabBtn.classList.toggle("active", !showReports);
  reportsTabBtn.classList.toggle("active", showReports);
}

recordsTabBtn.addEventListener("click", () => setActiveTab("records"));
reportsTabBtn.addEventListener("click", () => setActiveTab("reports"));
