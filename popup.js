const IGNORED_PARAMS = new Set(['page', 'page_size', 'depth', 'timezone', 'ordering']);

const dataTypeSelect = document.getElementById('dataType');
const captureBtn = document.getElementById('captureBtn');
const copyBtn = document.getElementById('copyBtn');
const copyBtnLabel = document.getElementById('copyBtnLabel');
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const outputPanel = document.getElementById('outputPanel');
const outputEl = document.getElementById('output');

function setStatus(text, state) {
  statusTextEl.textContent = text;
  statusEl.className = `status${state ? ` status-${state}` : ''}`;
}

function populateDataTypes() {
  const options = [
    { value: '__auto__', label: 'Auto-detect from Data Type filter' },
    { value: '__generic__', label: 'Custom / Unknown' },
    ...FILTER_MAP.dataTypeNames.map((name) => ({ value: name, label: name })),
  ];
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    dataTypeSelect.appendChild(el);
  }
}

function buildFieldMap(dataTypeName) {
  const map = { ...FILTER_MAP.genericFilterMap };
  if (dataTypeName && FILTER_MAP.filtersByDataType[dataTypeName]) {
    for (const entry of FILTER_MAP.filtersByDataType[dataTypeName]) {
      map[entry.data_field] = { filter: entry.filter, column_name: entry.column_name };
    }
  }
  return map;
}

function detectDataType(params) {
  const raw = params.get('vulnerability__data_type');
  if (!raw) return null;
  const votes = {};
  for (const value of raw.split('|')) {
    const category = FILTER_MAP.categoryByDataTypeValue[value.toLowerCase()];
    if (category) votes[category] = (votes[category] || 0) + 1;
  }
  const entries = Object.entries(votes);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function buildFilterJson(url, dataTypeChoice) {
  const parsed = new URL(url);
  const params = parsed.searchParams;

  const resolvedDataType = dataTypeChoice === '__auto__' ? detectDataType(params) : dataTypeChoice === '__generic__' ? null : dataTypeChoice;

  const fieldMap = buildFieldMap(resolvedDataType);
  const filters = [];

  for (const [key, rawValue] of params.entries()) {
    if (IGNORED_PARAMS.has(key)) continue;
    if (rawValue === '') continue;

    const values = rawValue.split('|').map((v) => decodeURIComponent(v));
    const input = values.length > 1 ? values : values[0];

    const meta = fieldMap[key] || { filter: key, column_name: key };
    filters.push({ filter: meta.filter, input, data_field: key, column_name: meta.column_name });
  }

  const label = resolvedDataType || 'Custom Filters';
  return { label, filters };
}

const LINE_WIDTH = 180;

function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function formatInput(value) {
  return Array.isArray(value) ? `[${value.map(quote).join(', ')}]` : quote(value);
}

function formatEntry(entry, indent) {
  const props = `filter: ${quote(entry.filter)}, input: ${formatInput(entry.input)}, data_field: ${quote(entry.data_field)}, column_name: ${quote(entry.column_name)}`;
  const oneLine = `${indent}{ ${props} },`;
  if (oneLine.length <= LINE_WIDTH) return oneLine;

  return [
    `${indent}{`,
    `${indent}  filter: ${quote(entry.filter)},`,
    `${indent}  input: ${formatInput(entry.input)},`,
    `${indent}  data_field: ${quote(entry.data_field)},`,
    `${indent}  column_name: ${quote(entry.column_name)},`,
    `${indent}},`,
  ].join('\n');
}

function formatFilterBlock(label, filters) {
  const lines = ['{', `  ${quote(label)}: [`];
  for (const entry of filters) {
    lines.push(formatEntry(entry, '    '));
  }
  lines.push('  ],', '};');
  return lines.join('\n');
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : null;
}

async function getCapturedRequest(tabId) {
  const keys = tabId != null ? [`lastFindingsRequest_${tabId}`, 'lastFindingsRequest'] : ['lastFindingsRequest'];
  const stored = await chrome.storage.local.get(keys);
  return (tabId != null && stored[`lastFindingsRequest_${tabId}`]) || stored.lastFindingsRequest || null;
}

function formatAge(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  outputPanel.hidden = true;
  outputEl.textContent = '';
  setStatus('Looking for the latest finding-dashboard-v2 request…', 'loading');

  try {
    const tabId = await getActiveTabId();
    const record = await getCapturedRequest(tabId);

    if (!record) {
      setStatus(
        'No finding-dashboard-v2 request captured yet. Apply/refresh a filter on the Findings page, then try again.',
        'error',
      );
      return;
    }

    const { label, filters } = buildFilterJson(record.url, dataTypeSelect.value);
    const text = formatFilterBlock(label, filters);
    outputEl.textContent = text;
    outputPanel.hidden = false;
    copyBtn.dataset.copyText = text;
    setStatus(`Captured as "${label}" · request from ${formatAge(record.timestamp)}`, 'success');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    captureBtn.disabled = false;
  }
});

copyBtn.addEventListener('click', async () => {
  const text = copyBtn.dataset.copyText || '';
  await navigator.clipboard.writeText(text);
  const original = copyBtnLabel.textContent;
  copyBtn.classList.add('copied');
  copyBtnLabel.textContent = 'Copied';
  setTimeout(() => {
    copyBtn.classList.remove('copied');
    copyBtnLabel.textContent = original;
  }, 1200);
});

populateDataTypes();
