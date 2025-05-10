let sessionKey = null;
let loginInsuranceChart = null;
let loginAgeChart = null;
let loginRaceChart = null;

async function login() {
    if (sessionKey) return sessionKey;
    console.log("Login page: Attempting login...");
    const statusDiv = document.getElementById('chartStatus');
    if (statusDiv) statusDiv.textContent = 'Logging in...';
    try {
        const res = await fetch("https://cs-25-303.wyatt-herkamp.dev/api/auth/login/password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email_or_username: "admin",
                password: "password"
            })
        });
        if (!res.ok) throw new Error(`Login failed: ${res.status} ${res.statusText}`);
        const data = await res.json();
        sessionKey = data?.session?.session_key;
        if (!sessionKey) throw new Error("Login succeeded but no session key received.");
        console.log("Login page: Login successful.");
        return sessionKey;
    } catch (error) {
        console.error("Login page: Error during login:", error);
        if (statusDiv) statusDiv.textContent = `Login Error: ${error.message}`;
        displayChartError('loginInsuranceChart', 'Login Failed');
        displayChartError('loginAgeChart', 'Login Failed');
        displayChartError('loginRaceChart', 'Login Failed');
        throw error;
    }
}

async function fetchAllParticipantBasics(paramsToQuery = {}) {
    let currentPage = 1;
    const pageSize = 100;
    let allData = [];
    let totalPages = 1;
    let initialTotal = 0;
    const statusDiv = document.getElementById('chartStatus');
    console.log("Fetching basic info for all participants...");
    if (statusDiv) statusDiv.textContent = 'Fetching participant list (page 1)...';
    try {
        const authentication = `Session ${await login()}`;
        const requestBody = {};
        do {
            if (statusDiv && currentPage > 1) statusDiv.textContent = `Workspaceing participant list (page ${currentPage}/${totalPages})...`;
            const apiUrl = `https://cs-25-303.wyatt-herkamp.dev/api/researcher/query?page_size=${pageSize}&page=${currentPage}`;
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": authentication
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                let errorMsg = `HTTP ${response.status}`;
                try {
                    const err = await response.json();
                    errorMsg += ` - ${err.detail || JSON.stringify(err)}`;
                } catch (e) {}
                throw new Error(`Failed initial query page ${currentPage}: ${errorMsg}`);
            }
            const pageData = await response.json();
            if (pageData?.data) {
                allData = allData.concat(pageData.data);
                if (currentPage === 1) {
                    totalPages = pageData.total_pages ?? 1;
                    initialTotal = pageData.total ?? 0;
                    console.log(`Total participants reported by query: ${initialTotal}, total pages: ${totalPages}`);
                }
            } else {
                if (currentPage === 1) {
                    console.warn("No data found on first page for initial query.");
                    return [];
                }
                break;
            }
            currentPage++;
        } while (currentPage <= totalPages);
        console.log(`Workspaceed basic info for ${allData.length} participants.`);
        if (statusDiv) statusDiv.textContent = `Found ${allData.length} participants. Fetching details...`;
        return allData;
    } catch (error) {
        console.error("Error fetching all participant basics:", error);
        if (statusDiv) statusDiv.textContent = `Error fetching list: ${error.message}`;
        displayChartError('loginInsuranceChart', 'Data Fetch Error');
        displayChartError('loginAgeChart', 'Data Fetch Error');
        displayChartError('loginRaceChart', 'Data Fetch Error');
        return [];
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
            headers: {
                "Authorization": authentication
            }
        });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (error) {
        return null;
    }
}

async function fetchParticipantDetails(participantId) {
    if (!participantId) return null;
    try {
        const demoPromise = getDemographics(participantId);
        const [demographics] = await Promise.all([demoPromise]);
        return { ...(demographics || {}) };
    } catch (error) {
        console.error(`Error fetching details for participant ${participantId}:`, error);
        return null;
    }
}

function generateInsuranceChartData(demographicsData) {
    const counts = {};
    const labels = [];
    const chartData = [];
    const backgroundColors = ['#EFB310', '#000000', '#6c757d', '#adb5bd', '#dee2e6', '#FF6384', '#36A2EB', '#FFCE56'];
    if (!demographicsData || demographicsData.length === 0) return {
        labels: ['No Data'],
        data: [1],
        backgroundColors: ['#cccccc']
    };
    demographicsData.forEach(demo => {
        if (!demo) {
            counts['Fetch Failed/Unknown'] = (counts['Fetch Failed/Unknown'] || 0) + 1;
            return;
        }
        const insuranceTypes = demo.health_insurance;
        if (Array.isArray(insuranceTypes) && insuranceTypes.length > 0) {
            const type = insuranceTypes[0] || 'Unknown';
            counts[type] = (counts[type] || 0) + 1;
        } else if (typeof insuranceTypes === 'string' && insuranceTypes !== '' && insuranceTypes !== 'N/A') {
            counts[insuranceTypes] = (counts[insuranceTypes] || 0) + 1;
        } else {
            counts['None/Unknown'] = (counts['None/Unknown'] || 0) + 1;
        }
    });
    for (const [label, count] of Object.entries(counts)) {
        labels.push(label);
        chartData.push(count);
    }
    if (labels.length === 0) return {
        labels: ['No Insurance Data'],
        data: [demographicsData.length],
        backgroundColors: ['#cccccc']
    };
    return {
        labels,
        data: chartData,
        backgroundColors: backgroundColors.slice(0, labels.length)
    };
}

function displayInsuranceChart(chartData) {
    const ctx = document.getElementById("loginInsuranceChart")?.getContext("2d");
    if (!ctx) {
        console.error("Login insurance chart canvas not found.");
        return;
    }
    if (loginInsuranceChart) loginInsuranceChart.destroy();
    try {
        loginInsuranceChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Insurance Types',
                    data: chartData.data,
                    backgroundColor: chartData.backgroundColors,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Health Insurance Distribution'
                    },
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
        console.error("Error creating login insurance chart:", error);
        displayChartError('loginInsuranceChart', 'Render Failed');
    }
}

function generateAgeChartData(demographicsData) {
    const ageBuckets = {
        'Unknown': 0,
        'Under 18': 0,
        '18-24': 0,
        '25-34': 0,
        '35-44': 0,
        '45-54': 0,
        '55-64': 0,
        '65-74': 0,
        '75+': 0
    };
    if (!demographicsData || demographicsData.length === 0) return {
        labels: ['No Data'],
        data: [1]
    };
    demographicsData.forEach(demo => {
        if (!demo || typeof demo.age !== 'number') {
            ageBuckets['Unknown']++;
            return;
        }
        const age = demo.age;
        if (age < 18) ageBuckets['Under 18']++;
        else if (age <= 24) ageBuckets['18-24']++;
        else if (age <= 34) ageBuckets['25-34']++;
        else if (age <= 44) ageBuckets['35-44']++;
        else if (age <= 54) ageBuckets['45-54']++;
        else if (age <= 64) ageBuckets['55-64']++;
        else if (age <= 74) ageBuckets['65-74']++;
        else ageBuckets['75+']++;
    });
    const labels = Object.keys(ageBuckets);
    const data = Object.values(ageBuckets);
    return {
        labels: labels,
        data: data
    };
}

function displayAgeChart(chartData) {
    const ctx = document.getElementById("loginAgeChart")?.getContext("2d");
    if (!ctx) {
        console.error("Login age chart canvas not found.");
        return;
    }
    if (loginAgeChart) loginAgeChart.destroy();
    const colors = ['#EFB310', '#000000', '#6c757d', '#adb5bd', '#dee2e6', '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'];
    try {
        loginAgeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Number of Participants',
                    data: chartData.data,
                    backgroundColor: colors.slice(0, chartData.labels.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Participant Age Distribution'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                label += context.parsed.x ?? context.parsed.y ?? 0;
                                return label;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error creating login age chart:", error);
        displayChartError('loginAgeChart', 'Render Failed');
    }
}

function generateRaceChartData(demographicsData) {
    const counts = {
        Unknown: 0
    };
    const knownRaces = ["NativeAmerican", "Asian", "Black", "Hispanic", "MiddleEasternOrNorthAfrican", "NativeHawaiianOrOtherPacificIslander", "White", "Multiracial", "IdentifyOther", "Declined"];
    knownRaces.forEach(r => counts[r] = 0);
    if (!demographicsData || demographicsData.length === 0) return {
        labels: ['No Data'],
        data: [1]
    };
    demographicsData.forEach(demo => {
        if (!demo || !demo.race) {
            counts['Unknown']++;
            return;
        }
        const races = demo.race;
        if (Array.isArray(races) && races.length > 0) {
            races.forEach(race => {
                if (counts.hasOwnProperty(race)) {
                    counts[race]++;
                } else {
                    counts['Unknown']++;
                    console.warn("Unknown race value found:", race);
                }
            });
        } else {
            counts['Unknown']++;
        }
    });
    const labels = [];
    const data = [];
    const backgroundColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#E7E9ED', '#77DD77', '#836953', '#C19A6B', '#cccccc'];
    for (const [label, count] of Object.entries(counts)) {
        if (count > 0) {
            let displayLabel = label;
            if (label === 'NativeAmerican') displayLabel = 'Native American';
            if (label === 'Black') displayLabel = 'Black/African American';
            if (label === 'Hispanic') displayLabel = 'Hispanic/Latino';
            if (label === 'MiddleEasternOrNorthAfrican') displayLabel = 'MENA';
            if (label === 'NativeHawaiianOrOtherPacificIslander') displayLabel = 'NHPI';
            labels.push(displayLabel);
            data.push(count);
        }
    }
    if (labels.length === 0) return {
        labels: ['No Race Data'],
        data: [demographicsData.length],
        backgroundColors: ['#cccccc']
    };
    return {
        labels,
        data,
        backgroundColors: backgroundColors.slice(0, labels.length)
    };
}

function displayRaceChart(chartData) {
    const ctx = document.getElementById("loginRaceChart")?.getContext("2d");
    if (!ctx) {
        console.error("Login race chart canvas not found.");
        return;
    }
    if (loginRaceChart) loginRaceChart.destroy();
    try {
        loginRaceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Race Distribution',
                    data: chartData.data,
                    backgroundColor: chartData.backgroundColors,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Race Distribution'
                    },
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
        console.error("Error creating login race chart:", error);
        displayChartError('loginRaceChart', 'Render Failed');
    }
}

function displayChartError(canvasId, message) {
    const ctx = document.getElementById(canvasId)?.getContext("2d");
    if (ctx) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Error: ${message}`, ctx.canvas.width / 2, ctx.canvas.height / 2);
    }
}

function clearCharts() {
    if (loginInsuranceChart) {
        loginInsuranceChart.destroy();
        loginInsuranceChart = null;
    }
    if (loginAgeChart) {
        loginAgeChart.destroy();
        loginAgeChart = null;
    }
    if (loginRaceChart) {
        loginRaceChart.destroy();
        loginRaceChart = null;
    }
    console.log("Login page charts cleared.");
}

async function initializeLoginPage() {
    const statusDiv = document.getElementById('chartStatus');
    clearCharts();
    try {
        const allParticipantBasics = await fetchAllParticipantBasics({});
        if (!allParticipantBasics || allParticipantBasics.length === 0) {
            if (statusDiv) statusDiv.textContent = 'No participants found to analyze.';
            ['loginInsuranceChart', 'loginAgeChart', 'loginRaceChart'].forEach(id => displayChartError(id, 'No Data'));
            return;
        }

        const totalToFetch = allParticipantBasics.length;
        let fetchedCount = 0;
        if (statusDiv) statusDiv.textContent = `Workspaceing details for ${totalToFetch} participants...`;
        const demographicPromises = allParticipantBasics.map(participant => {
            return getDemographics(participant.participant_id).then(result => {
                fetchedCount++;
                if (statusDiv && fetchedCount % 50 === 0) {
                    statusDiv.textContent = `Workspaceed details for ${fetchedCount} of ${totalToFetch}...`;
                }
                return result;
            });
        });
        const allDemographicsData = await Promise.all(demographicPromises);
        console.log(`Finished fetching ${fetchedCount} demographic details.`);
        if (statusDiv) statusDiv.textContent = 'Processing data for charts...';

        const validDemographics = allDemographicsData.filter(d => d !== null);
        if (validDemographics.length !== allDemographicsData.length) {
            console.warn(`Could not fetch demographics for ${allDemographicsData.length - validDemographics.length} participants.`);
        }

        if (validDemographics.length > 0) {
            displayInsuranceChart(generateInsuranceChartData(validDemographics));
            displayAgeChart(generateAgeChartData(validDemographics));
            displayRaceChart(generateRaceChartData(validDemographics));

            if (statusDiv) statusDiv.textContent = `Displayed charts for ${validDemographics.length} participants.`;
        } else {
            if (statusDiv) statusDiv.textContent = 'No valid demographic data found.';
            ['loginInsuranceChart', 'loginAgeChart', 'loginRaceChart'].forEach(id => displayChartError(id, 'No Demographic Data'));
        }

    } catch (error) {
        console.error("Failed to initialize login page charts:", error);
        if (statusDiv) statusDiv.textContent = `Error initializing charts: ${error.message}`;
        ['loginInsuranceChart', 'loginAgeChart', 'loginRaceChart'].forEach(id => displayChartError(id, 'Initialization Failed'));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("Login page DOM loaded.");
    initializeLoginPage();
});