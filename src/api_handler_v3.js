let selectedParams = {};
let sessionKey = null;
let totalParticipants = 0;
let comparisonChart = null;
let insuranceChart = null;
let loginAgeChart = null;
let lastFetchedData = [];

function initializeSelectedParams() {
    selectedParams = {
        location: null,
        program: null,
        status: 'Active',
        gender: null,
        highest_level_of_education: null,
        race: { type: 'ContainsAny', value: [] },
        language: null,
        health_insurance: { type: 'ContainsAny', value: [] },
        age: null,
        get_visit_history: false,
        get_last_visited: false,
        blood_pressure: { reading_type: 'Sit', systolic: null, diastolic: null },
        glucose: { glucose: null },
    };
}

function cleanParams(params) {
    const cleaned = {};
    for (const key in params) {
        if (key === 'is_veteran') continue;
        const value = params[key];
        if (value === null || value === '') continue;
        if (typeof value === 'boolean') {
            cleaned[key] = value;
            continue;
        }
        if (key === "race" || key === "health_insurance") {
            const expectedTypes = ['ContainsAny', 'Equals', 'Contains'];
            if (value.type && expectedTypes.includes(value.type) && Array.isArray(value.value)) {
                const filteredValues = value.value.filter(v => v !== null && v !== '');
                if (filteredValues.length > 0) {
                    cleaned[key] = { type: value.type, value: filteredValues };
                }
            }
        } else if (key === "glucose") {
            const glucoseValue = value.glucose;
            let includeGlucose = false;
            const cleanedGlucose = {};
            if (glucoseValue !== null && glucoseValue !== '') {
                cleanedGlucose.glucose = glucoseValue;
                includeGlucose = true;
            }
            if (includeGlucose) {
                cleaned[key] = cleanedGlucose;
            }
        } else if (key === "blood_pressure") {
            const syst = value.systolic;
            const diast = value.diastolic;
            if ((syst !== null && syst !== '') || (diast !== null && diast !== '')) {
                cleaned[key] = {
                    reading_type: value.reading_type || 'Sit',
                    systolic: (syst !== null && syst !== '') ? syst : null,
                    diastolic: (diast !== null && diast !== '') ? diast : null,
                };
            }
        } else if (Array.isArray(value)) {
            const filteredArray = value.filter(v => v !== null && v !== '');
            if (filteredArray.length > 0) {
                cleaned[key] = filteredArray;
            }
        } else if (key !== 'bmi') {
            cleaned[key] = value;
        }
    }
    if (params.status === null && !cleaned.hasOwnProperty('status')) {} else if (params.status !== null && !cleaned.hasOwnProperty('status')) {
        cleaned.status = params.status;
    }
    return cleaned;
}

async function login() {
    if (sessionKey) return sessionKey;
    console.log("Attempting login...");
    try {
        const res = await fetch("https://cs-25-303.wyatt-herkamp.dev/api/auth/login/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email_or_username: "admin", password: "password" })
        });
        if (!res.ok) throw new Error(`Login failed: ${res.status} ${res.statusText}`);
        const data = await res.json();
        sessionKey = data?.session?.session_key;
        if (!sessionKey) throw new Error("Login succeeded but no session key received.");
        console.log("Login successful.");
        return sessionKey;
    } catch (error) {
        console.error("Error during login:", error);
        updateResultsDisplay(`<h3>Login Error</h3><pre style="color:red;">${error.message}</pre>`);
        throw error;
    }
}

async function initializePredefinedTotals() {
    console.log("Initializing predefined totals (attempting ALL statuses)...");
    const overallTotalElement = document.getElementById("overallTotal");
    try {
        await login();
        const allParticipantsQueryParams = { status: null };
        const firstPageResult = await runQuery(allParticipantsQueryParams, false, 1);
        console.log("DEBUG: initializePredefinedTotals - Raw Result (status: null):", firstPageResult);
        totalParticipants = firstPageResult.total || 0;
        if (overallTotalElement) overallTotalElement.textContent = totalParticipants;
        console.log(`Total Participants (All Statuses?) set to: ${totalParticipants}`);
    } catch (error) {
        console.error("Error initializing predefined totals:", error);
        if (overallTotalElement) overallTotalElement.textContent = "Error";
        totalParticipants = 0;
    }
}

async function runQuery(paramsToQuery, updateUI = true, pageNumber = 1) {
    const pageSize = 100;
    console.log(`Running query page ${pageNumber} (updateUI=${updateUI})`);
    try {
        const authentication = `Session ${await login()}`;
        const requestBody = cleanParams(paramsToQuery);
        if (pageNumber === 1) {
            console.log("DEBUG: Sending Request Body for Query:", JSON.stringify(requestBody, null, 2));
        }
        const apiUrl = `https://cs-25-303.wyatt-herkamp.dev/api/researcher/query?page_size=${pageSize}&page=${pageNumber}`;
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": authentication },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            let errorMsg = `HTTP error ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMsg += ` - ${errorData.detail || JSON.stringify(errorData)}`;
            } catch (e) {}
            throw new Error(`Failed query page ${pageNumber}. ${errorMsg}`);
        }
        const pageData = await response.json();
        return pageData;
    } catch (error) {
        console.error(`Error in runQuery (page ${pageNumber}):`, error);
        if (updateUI && pageNumber === 1) {
            updateResultsDisplay(`<p style="color: red;"><b>Query Error:</b> ${error.message}</p>`);
            updateTotalDisplay("Error");
            clearCharts();
        }
        throw error;
    }
}

async function getDemographics(participantId) {
    if (!participantId) return null;
    try {
        const authentication = `Session ${sessionKey}`;
        if (!authentication) throw new Error("Not logged in for demographic fetch");
        const apiUrl = `https://cs-25-303.wyatt-herkamp.dev/api/participant/get/${participantId}/demographics`;
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: { "Authorization": authentication }
        });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (error) {
        return null;
    }
}

async function fetchData() {
    updateResultsDisplay("<p>Running initial search...</p>");
    updateTotalDisplay("...");
    const downloadBtn = document.getElementById("downloadCsvBtn");
    if (downloadBtn) downloadBtn.style.display = 'none';
    lastFetchedData = [];
    clearCharts();

    let allParticipantBasics = [];
    let currentPage = 1;
    let totalPages = 1;
    let reportedTotal = 0;

    try {
        console.log("Fetching initial participant list (all pages)...");
        updateResultsDisplay("<p>Fetching initial participant list...</p>");
        do {
            if (currentPage > 1) updateResultsDisplay(`<p>Fetching initial participant list (page ${currentPage}/${totalPages})...</p>`);
            const pageResult = await runQuery(selectedParams, true, currentPage);
            if (pageResult?.data) {
                allParticipantBasics = allParticipantBasics.concat(pageResult.data);
                if (currentPage === 1) {
                    reportedTotal = pageResult.total ?? 0;
                    totalPages = pageResult.total_pages ?? 1;
                    updateTotalDisplay(reportedTotal);
                    console.log(`Query reported total: ${reportedTotal}, total pages: ${totalPages}`);
                    console.log("DEBUG: fetchData - First Page Raw Result:", pageResult);
                }
            } else {
                if (currentPage === 1) {
                    throw new Error("No data returned from API.");
                } else {
                    console.warn(`Received empty data on page ${currentPage}, stopping pagination.`);
                    break;
                }
            }
            if (currentPage >= totalPages) break;
            currentPage++;
        } while (true);

        console.log(`Initial query finished. Found ${reportedTotal} total matches. Fetched basic info for ${allParticipantBasics.length}.`);

        if (allParticipantBasics.length === 0) {
            updateResultsDisplay("<p>No matching participants found.</p>");
            displayResultsChart(0);
            return;
        }

        updateResultsDisplay(`<p>Found ${reportedTotal} participant(s). Fetching details (this may take a while)...</p>`);
        let fetchedCount = 0;
        const totalToFetch = allParticipantBasics.length;
        const demographicPromises = allParticipantBasics.map(participant => {
            return getDemographics(participant.participant_id).then(result => {
                fetchedCount++;
                return result;
            });
        });
        const demographicResults = await Promise.all(demographicPromises);
        console.log(`Finished fetching ${fetchedCount} demographic details.`);

        const enrichedData = allParticipantBasics.map((participant, index) => {
            const demos = demographicResults[index];
            return {
                ...participant,
                age: demos?.age ?? 'N/A',
                gender: demos?.gender ?? 'N/A',
                race: demos?.race ?? 'N/A',
                health_insurance: demos?.health_insurance ?? 'N/A',
            };
        });

        if (enrichedData.length > 0) {
            console.log("Sorting data by participant ID...");
            enrichedData.sort((a, b) => (a.participant_id ?? 0) - (b.participant_id ?? 0));
        }

        lastFetchedData = enrichedData;

        updateResultsDisplay('');
        displayResultsTable(lastFetchedData);
        displayResultsChart(reportedTotal);

        if (lastFetchedData.length > 0 && downloadBtn) {
            downloadBtn.style.display = 'inline-block';
        }

    } catch (error) {
        console.error("fetchData (multi-call) completed with error:", error);
        updateResultsDisplay(`<p style="color: red;"><b>Operation Failed:</b> ${error.message}</p>`);
        updateTotalDisplay("Error");
        clearCharts();
    }
}

function updateResultsDisplay(htmlContent) {
    const outputContainer = document.getElementById("output");
    if (outputContainer) outputContainer.innerHTML = htmlContent;
}

function updateTotalDisplay(value) {
    const totalElement = document.getElementById("total");
    if (totalElement) totalElement.textContent = value;
}

function displayResultsTable(data) {
    const outputContainer = document.getElementById("output");
    if (!outputContainer) return;
    outputContainer.innerHTML = '';

    if (!data || data.length === 0) {
        outputContainer.innerHTML = '<p>No participant data to display.</p>';
        return;
    }

    const uniqueParticipants = [];
    const seenIds = new Set();
    for (const participant of data) {
        if (participant && typeof participant.participant_id !== 'undefined' && !seenIds.has(participant.participant_id)) {
            uniqueParticipants.push(participant);
            seenIds.add(participant.participant_id);
        }
    }
    if (uniqueParticipants.length === 0) {
        outputContainer.innerHTML = '<p>No valid participant data to display after de-duplication.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'results-table';

    const headers = ['ID', 'Name', 'Phone 1', 'Phone 2', 'Other Contact', 'Age', 'Race', 'Insurance'];
    const headerFields = [
        'participant_id', 'full_name', 'phone_number_one', 'phone_number_two',
        'other_contact', 'age', 'race', 'health_insurance'
    ];

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    const tbody = table.createTBody();
    uniqueParticipants.forEach(participant => {
        const row = tbody.insertRow();
        headerFields.forEach(field => {
            const cell = row.insertCell();
            let cellContent = participant[field] ?? 'N/A';

            if (field === 'full_name') {
                const firstName = participant.first_name ?? '';
                const lastName = participant.last_name ?? '';
                cellContent = `${firstName} ${lastName}`.trim() || 'N/A';
            } else if (Array.isArray(cellContent)) {
                cellContent = cellContent.join(', ');
            } else if (typeof cellContent === 'object' && cellContent !== null) {
                cellContent = JSON.stringify(cellContent);
            }
            cell.textContent = cellContent || 'N/A';
        });
    });
    outputContainer.appendChild(table);
}

function displayResultsChart(userQueryTotal) {
    const predefinedTotal = totalParticipants || 0;
    const displayQueryTotal = Math.min(userQueryTotal, predefinedTotal);
    const totalMinusUserSearch = Math.max(0, predefinedTotal - displayQueryTotal);
    const chartData = {
        labels: [`Other Participants (${totalMinusUserSearch})`, `Selected Participants (${displayQueryTotal})`],
        datasets: [{
            data: [totalMinusUserSearch, displayQueryTotal],
            backgroundColor: ["#dee2e6", "#EFB310"],
            borderColor: ["#adb5bd", "#d9a00b"],
            borderWidth: 1,
            hoverOffset: 4
        }]
    };
    const ctx = document.getElementById("comparisonChart")?.getContext("2d");
    if (!ctx) return;
    if (comparisonChart) comparisonChart.destroy();
    try {
        comparisonChart = new Chart(ctx, {
            type: "pie",
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Query vs. Total Participants' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                const value = context.parsed ?? 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                                label += `${value} (${percentage})`;
                                return label;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error creating chart:", error);
    }
}

function clearCharts() {
    if (comparisonChart) {
        comparisonChart.destroy();
        comparisonChart = null;
    }
    console.log("Comparison chart cleared.");
}

function jsonToCsv(jsonData) {
    if (!Array.isArray(jsonData) || jsonData.length === 0) return null;
    try {
        const headers = [
            'Participant ID', 'First Name', 'Last Name', 'Phone 1', 'Phone 2',
            'Other Contact', 'Age', 'Race', 'Insurance', 'Visit History'
        ];
        const fields = [
            'participant_id', 'first_name', 'last_name', 'phone_number_one', 'phone_number_two',
            'other_contact', 'age', 'race', 'health_insurance', 'visit_history'
        ];

        const csvRows = [];
        csvRows.push(headers.join(","));
        const uniqueDataForCsv = [];
        const seenCsvIds = new Set();
        for (const row of jsonData) {
            if (row && typeof row.participant_id !== 'undefined' && !seenCsvIds.has(row.participant_id)) {
                uniqueDataForCsv.push(row);
                seenCsvIds.add(row.participant_id);
            }
        }

        uniqueDataForCsv.forEach((row) => {
            const values = fields.map((field) => {
                let cellValue = row[field];
                if (cellValue === null || typeof cellValue === 'undefined') {
                    cellValue = "";
                } else if (field === 'visit_history' && Array.isArray(cellValue)) {
                    cellValue = cellValue.join('; ');
                } else if (field === 'race' && Array.isArray(cellValue)) {
                    cellValue = cellValue.join('; ');
                } else if (field === 'health_insurance' && Array.isArray(cellValue)) {
                    cellValue = cellValue.join('; ');
                } else if (typeof cellValue === 'object') {
                    cellValue = JSON.stringify(cellValue);
                } else {
                    cellValue = String(cellValue);
                }
                if (cellValue.includes('"') || cellValue.includes(',') || cellValue.includes('\n')) {
                    cellValue = `"${cellValue.replace(/"/g, '""')}"`;
                }
                return cellValue;
            });
            csvRows.push(values.join(","));
        });
        return csvRows.join("\n");
    } catch (error) {
        console.error("Error converting JSON to CSV:", error);
        return null;
    }
}

function downloadCsv(filename, csvContent) {
    if (!csvContent) {
        alert("No data available to download.");
        return;
    }
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
        alert("CSV download not supported in this browser.");
    }
}

function setupEventListeners() {
    const form = document.getElementById('filterForm');
    const submitButton = document.getElementById('submitFilterBtn');
    const clearButton = document.getElementById('clearBtn');
    const downloadButton = document.getElementById('downloadCsvBtn');

    if (submitButton && form) {
        submitButton.addEventListener('click', () => {
            console.log("Search initiated.");
            const formData = new FormData(form);
            initializeSelectedParams();
            selectedParams.location = formData.get('location') || null;
            selectedParams.program = formData.get('program') || null;
            selectedParams.status = formData.get('status');
            selectedParams.gender = formData.get('sex') || null;
            selectedParams.highest_level_of_education = formData.get('education') || null;
            selectedParams.language = formData.get('language') || null;
            selectedParams.age = formData.get('age') || null;
            selectedParams.glucose.glucose = formData.get('glucose') || null;
            selectedParams.blood_pressure.systolic = formData.get('bp_systolic') || null;
            selectedParams.blood_pressure.diastolic = formData.get('bp_diastolic') || null;
            const insuranceVal = formData.get('insurance');
            selectedParams.health_insurance.value = insuranceVal ? [insuranceVal] : [];
            const raceVal = formData.get('race');
            selectedParams.race.value = raceVal ? [raceVal] : [];
            const visitHistoryValue = formData.get('visitHistory');
            selectedParams.get_visit_history = visitHistoryValue === "true";
            if (selectedParams.status === '') {
                selectedParams.status = null;
            } else if (selectedParams.status === null) {
                selectedParams.status = initializeSelectedParams().status;
            }
            fetchData();
        });
    }
    if (clearButton && form) {
        clearButton.addEventListener('click', () => {
            console.log("Clearing filters.");
            form.reset();
            initializeSelectedParams();
            updateResultsDisplay("Filters cleared.");
            updateTotalDisplay("0");
            lastFetchedData = [];
            if (downloadButton) downloadButton.style.display = 'none';
            clearCharts();
        });
    }
    if (downloadButton) {
        downloadButton.addEventListener('click', () => {
            if (lastFetchedData.length > 0) {
                const csvContent = jsonToCsv(lastFetchedData);
                if (csvContent) {
                    downloadCsv("participant_query_results.csv", csvContent);
                } else {
                    alert("Failed to generate CSV data.");
                }
            } else {
                alert("No results available to download.");
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded. Initializing application v16 (Reverted Cols)...");
    initializeSelectedParams();
    initializePredefinedTotals();
    displayResultsChart(0);
    setupEventListeners();
    updateResultsDisplay("Please select filters and click Search.");
});