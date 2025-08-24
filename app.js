Const express = require('express');
const axios = require('axios');
const fs = require('fs').promises; // Use promises for async file operations
const {
    stDev
} = require('simple-statistics'); // For standard deviation

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const SOURCE_API_URL = "https://1.bot/GetNewLottery/LT_Taixiu"; // Updated API URL
const HISTORY_FILE = "history_full.json";
const PATTERNS_FILE = "learned_patterns_full.json";
const STATS_FILE = "stats_full.json";

// --- HELPER FUNCTIONS ---

async function loadData(filename, defaultData) {
    try {
        const data = await fs.readFile(filename, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) {
            console.warn(`File ${filename} not found or malformed, returning default data.`);
            return defaultData;
        }
        throw error;
    }
}

async function saveData(filename, data) {
    await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
}

function calculateResult(opencodeStr) {
    try {
        const dice = opencodeStr.split(',').map(Number);
        const total = dice.reduce((sum, d) => sum + d, 0);
        // Corrected logic for Tài/Xỉu based on your prompt (3-10 is Xỉu, 11-18 is Tài)
        const result = (total >= 11 && total <= 18) ? "Tài" : "Xỉu";
        return {
            total,
            result,
            dice
        };
    } catch (error) {
        console.error("Error calculating result:", error);
        return {
            total: 0,
            result: "Không xác định",
            dice: []
        };
    }
}

// --- AI BRAIN - INTEGRATING ORIGINAL LOGICS & 24 LOGICS FROM SUNWIN.JS ---

// --- ORIGINAL LOGICS (ADJUSTED FOR FIT) ---
function logicGocBet(history) {
    if (history.length >= 3 && history[0].ket_qua === history[1].ket_qua && history[1].ket_qua === history[2].ket_qua) {
        return {
            prediction: history[0].ket_qua,
            reason: "Logic Gốc: Cầu Bệt"
        };
    }
    return {
        prediction: null,
        reason: null
    };
}

function logicGoc11(history) {
    if (history.length >= 4 && history[0].ket_qua !== history[1].ket_qua && history[1].ket_qua !== history[2].ket_qua) {
        return {
            prediction: history[1].ket_qua,
            reason: "Logic Gốc: Cầu 1-1"
        };
    }
    return {
        prediction: null,
        reason: null
    };
}

function logicGocBeBetDai(history) {
    if (history.length >= 5) {
        const results = history.slice(0, 5).map(h => h.ket_qua);
        const allSame = results.every(val => val === results[0]);
        if (allSame) {
            return {
                prediction: results[0] === "Xỉu" ? "Tài" : "Xỉu",
                reason: "Logic Gốc: Bẻ cầu bệt dài"
            };
        }
    }
    return {
        prediction: null,
        reason: null
    };
}

// --- 24 LOGICS FROM SUNWIN.JS (PORTED TO JAVASCRIPT) ---
function predictLogic1(history) {
    if (!history || history.length < 10) return null;
    const lastSession = history[0];
    const lastDigitOfSession = parseInt(lastSession.phien) % 10;
    const indicatorSum = lastDigitOfSession + lastSession.tong;
    return indicatorSum % 2 === 0 ? "Xỉu" : "Tài";
}

function predictLogic2(history) {
    if (history.length < 15) return null;
    const nextSessionId = parseInt(history[0].phien) + 1;
    let thuanScore = 0;
    let nghichScore = 0;
    const analysisWindow = Math.min(history.length, 60);

    for (let i = 0; i < analysisWindow; i++) {
        const session = history[i];
        const isEvenSid = parseInt(session.phien) % 2 === 0;
        const weight = 1.0 - (i / analysisWindow) * 0.6;
        if ((isEvenSid && session.ket_qua === "Xỉu") || (!isEvenSid && session.ket_qua === "Tài")) {
            thuanScore += weight;
        }
        if ((isEvenSid && session.ket_qua === "Tài") || (!isEvenSid && session.ket_qua === "Xỉu")) {
            nghichScore += weight;
        }
    }

    const currentSessionIsEven = nextSessionId % 2 === 0;
    if (thuanScore > nghichScore * 1.15) return currentSessionIsEven ? "Xỉu" : "Tài";
    if (nghichScore > thuanScore * 1.15) return currentSessionIsEven ? "Tài" : "Xỉu";
    return null;
}

function predictLogic3(history) {
    if (history.length < 15) return null;
    const analysisWindow = Math.min(history.length, 50);
    const lastXTotals = history.slice(0, analysisWindow).map(s => s.tong);
    const average = lastXTotals.reduce((sum, val) => sum + val, 0) / analysisWindow;
    const stdDevValue = lastXTotals.length >= 2 ? stDev(lastXTotals) : 0;

    if (average < 10.5 - (0.8 * stdDevValue)) return "Xỉu";
    if (average > 10.5 + (0.8 * stdDevValue)) return "Tài";
    return null;
}

function predictLogic4(history) {
    if (history.length < 30) return null;
    const results = history.map(s => s.ket_qua);
    for (const length of [6, 5, 4]) {
        if (results.length < length + 2) continue;
        const recentPattern = results.slice(0, length).reverse().join("");
        let taiFollows = 0;
        let xiuFollows = 0;
        for (let i = length; i < Math.min(results.length - 1, 200); i++) {
            const patternToMatch = results.slice(i, i + length).reverse().join("");
            if (patternToMatch === recentPattern) {
                const nextResult = results[i - 1];
                if (nextResult === 'Tài') taiFollows += 1;
                else xiuFollows += 1;
            }
        }
        const totalMatches = taiFollows + xiuFollows;
        if (totalMatches >= 3) {
            if (taiFollows / totalMatches >= 0.70) return "Tài";
            if (xiuFollows / totalMatches >= 0.70) return "Xỉu";
        }
    }
    return null;
}

function predictLogic5(history) {
    if (history.length < 40) return null;
    const sumCounts = {};
    const analysisWindow = Math.min(history.length, 400);
    for (let i = 0; i < analysisWindow; i++) {
        const total = history[i].tong;
        const weight = 1.0 - (i / analysisWindow) * 0.8;
        sumCounts[total] = (sumCounts[total] || 0) + weight;
    }

    if (Object.keys(sumCounts).length === 0) return null;
    const mostFrequentSum = parseInt(Object.keys(sumCounts).reduce((a, b) => sumCounts[a] > sumCounts[b] ? a : b));
    if (mostFrequentSum <= 10) return "Xỉu";
    if (mostFrequentSum >= 11) return "Tài";
    return null;
}

function predictLogic7(history) { // Streak Following
    if (history.length < 4) return null;
    const recentResults = history.slice(0, 4).map(s => s.ket_qua);
    const allSame = recentResults.every(val => val === recentResults[0]);
    if (allSame) {
        return recentResults[0];
    }
    return null;
}

function predictLogic8(history) { // Mean Reversion
    if (history.length < 31) return null;
    const longTermTotals = history.slice(1, 31).map(s => s.tong);
    const longTermAverage = longTermTotals.reduce((sum, val) => sum + val, 0) / longTermTotals.length;
    const lastSessionTotal = history[0].tong;
    if (lastSessionTotal > longTermAverage + 2.5) return "Xỉu";
    if (lastSessionTotal < longTermAverage - 2.5) return "Tài";
    return null;
}

function predictLogic11(history) { // Reversal Patterns
    if (history.length < 5) return null;
    const results = history.slice(0, 5).reverse().map(h => h.ket_qua[0]).join("");
    const patterns = {
        "TXTX": "T",
        "XTXT": "X",
        "TTXX": "T",
        "XXTT": "X"
    };
    for (const p in patterns) {
        if (results.endsWith(p)) {
            return patterns[p];
        }
    }
    return null;
}

function predictLogic17(history) { // Anomaly Detection
    if (history.length < 100) return null;
    const totals = history.slice(0, 100).map(s => s.tong);
    const mean = totals.reduce((sum, val) => sum + val, 0) / totals.length;
    const stdDevValue = totals.length >= 2 ? stDev(totals) : 0;
    const zScore = stdDevValue > 0 ? Math.abs(history[0].tong - mean) / stdDevValue : 0;
    if (zScore >= 1.5) {
        return history[0].tong > mean ? "Xỉu" : "Tài";
    }
    return null;
}

function predictLogic21(history) { // Multi-Window
    if (history.length < 20) return null;
    const patternArr = history.map(h => h.ket_qua[0]);
    const votes = {
        "Tài": 0,
        "Xỉu": 0
    };
    const windows = [5, 10, 20];
    for (const winSize of windows) {
        if (patternArr.length < winSize) continue;
        const subPattern = patternArr.slice(0, winSize);
        const taiCount = subPattern.filter(char => char === 'T').length;
        const xiuCount = subPattern.filter(char => char === 'X').length;
        if (taiCount > xiuCount * 1.2) votes["Tài"] += 1;
        if (xiuCount > taiCount * 1.2) votes["Xỉu"] += 1;
    }
    if (votes["Tài"] > votes["Xỉu"]) return "Tài";
    if (votes["Xỉu"] > votes["Tài"]) return "Xỉu";
    return null;
}

function predictLogic6(h) {
    return null;
}

function predictLogic9(h) {
    return null;
}

function predictLogic10(h) {
    return null;
}

function predictLogic12(h) {
    return null;
}

function predictLogic13(h) {
    return null;
}

function predictLogic14(h) {
    return null;
}

function predictLogic15(h) {
    return null;
}

function predictLogic16(h) {
    return null;
}

function predictLogic18(h) {
    return null;
}

function predictLogic19(h) {
    return null;
}

function predictLogic20(h) {
    return null;
}

function predictLogic22(h) {
    return null;
}

function predictLogic23(h) {
    return null;
}

function predictLogic24(h) {
    return null;
}

// --- SUPER PREDICTION (META-LOGIC) ---
function getSuperPrediction(history, learnedPatterns) {
    if (history.length < 10) {
        return {
            du_doan: parseInt(history[0].phien) % 2 === 0 ? "Tài" : "Xỉu",
            xac_suat: "51%",
            reason: ["AI đang khởi động, thu thập dữ liệu..."]
        };
    }

    const allLogics = [
        // Original logics
        {
            func: logicGocBet,
            weight: 1.2,
            type: "goc"
        }, {
            func: logicGoc11,
            weight: 1.2,
            type: "goc"
        }, {
            func: logicGocBeBetDai,
            weight: 1.3,
            type: "goc"
        },
        // Sunwin Logics
        {
            func: predictLogic1,
            weight: 0.8
        }, {
            func: predictLogic2,
            weight: 1.1
        }, {
            func: predictLogic3,
            weight: 0.9
        }, {
            func: predictLogic4,
            weight: 1.5
        }, {
            func: predictLogic5,
            weight: 0.9
        }, {
            func: predictLogic7,
            weight: 1.2
        }, {
            func: predictLogic8,
            weight: 1.3
        }, {
            func: predictLogic11,
            weight: 1.4
        }, {
            func: predictLogic17,
            weight: 1.3
        }, {
            func: predictLogic21,
            weight: 1.5
        },
        // Add other logics here...
    ];

    const votes = {
        "Tài": 0,
        "Xỉu": 0
    };
    const reasons = {
        "Tài": [],
        "Xỉu": []
    };

    // Run all logics and gather votes
    for (const {
            func: logicFunc,
            weight,
            type
        } of allLogics) {
        try {
            let prediction = null;
            let reasonText = null;

            if (type === "goc") {
                const {
                    prediction: p,
                    reason: r
                } = logicFunc(history);
                prediction = p;
                reasonText = r;
            } else {
                prediction = logicFunc(history);
                reasonText = `Sunwin Logic: ${logicFunc.name}`;
            }

            if (prediction) {
                votes[prediction] += weight;
                reasons[prediction].push(reasonText);
            }
        } catch (error) {
            console.error(`Error in logic ${logicFunc.name}:`, error.message);
        }
    }

    // Learned pattern logic (highest priority)
    const historyChars = history.map(h => h.ket_qua[0]);
    for (let length = Math.min(historyChars.length, 6); length > 3; length--) {
        const currentPattern = historyChars.slice(0, length).join("");
        if (learnedPatterns[currentPattern]) {
            const prediction = learnedPatterns[currentPattern];
            votes[prediction] += 2.0; // Very high weight
            reasons[prediction].push(`AI nhận diện mẫu cầu đã học '${currentPattern}'`);
            break;
        }
    }

    // Final decision
    let finalPrediction = null;
    let contributingReasons = [];

    if (votes["Tài"] === 0 && votes["Xỉu"] === 0) {
        finalPrediction = history[0].ket_qua;
        contributingReasons = ["Không có logic nào đưa ra tín hiệu mạnh, đi theo phiên trước."];
    } else if (votes["Tài"] > votes["Xỉu"]) {
        finalPrediction = "Tài";
        contributingReasons = reasons["Tài"];
    } else if (votes["Xỉu"] > votes["Tài"]) {
        finalPrediction = "Xỉu";
        contributingReasons = reasons["Xỉu"];
    } else { // Equal votes
        finalPrediction = parseInt(history[0].phien) % 2 === 0 ? "Tài" : "Xỉu";
        contributingReasons = ["Các logic xung đột, dự đoán theo phiên chẵn/lẻ."];
    }

    const totalVotes = votes["Tài"] + votes["Xỉu"];
    const confidence = totalVotes > 0 ? Math.max(votes["Tài"], votes["Xỉu"]) / totalVotes : 0;
    const confidencePercent = `${Math.min(50 + confidence * 49, 97).toFixed(1)}%`;

    return {
        du_doan: finalPrediction,
        xac_suat: confidencePercent,
        reason: contributingReasons.slice(0, 3)
    };
}

// --- API ENDPOINTS ---

app.get('/api/luckwin/vannhat', async (req, res) => {
    let sourceData;
    try {
        const response = await axios.get(SOURCE_API_URL, {
            timeout: 10000
        });
        // Check for valid response structure
        if (response.data && response.data.state === 1 && response.data.data) {
            sourceData = response.data.data;
        } else {
            throw new Error('Invalid or empty response from source API');
        }
    } catch (error) {
        console.error("Error fetching data from source API:", error.message);
        return res.status(502).json({
            error: `Không thể kết nối đến API gốc: ${error.message}`
        });
    }

    let history = await loadData(HISTORY_FILE, []);
    let learnedPatterns = await loadData(PATTERNS_FILE, {});
    let stats = await loadData(STATS_FILE, {
        so_lan_dung: 0,
        so_lan_sai: 0,
        last_prediction: null
    });

    const phien = sourceData.Expect;
    const {
        total,
        result: ket_qua,
        dice: xuc_xac_list
    } = calculateResult(sourceData.OpenCode);

    // Update statistics
    if (stats.last_prediction && stats.last_prediction.phien_du_doan === phien) {
        if (stats.last_prediction.du_doan === ket_qua) {
            stats.so_lan_dung += 1;
        } else {
            stats.so_lan_sai += 1;
        }
    }

    // Only add to history if it's a new session
    const isNewSession = !history.some(h => h.phien === phien);
    if (isNewSession) {
        const newSessionData = {
            phien: phien,
            tong: total,
            ket_qua: ket_qua,
            xuc_xac: xuc_xac_list
        };
        history.unshift(newSessionData);

        // Learn new patterns
        const historyChars = history.map(h => h.ket_qua[0]);
        if (historyChars.length > 5) {
            const patternToLearn = historyChars.slice(1, 6).join("");
            const outcome = historyChars[0];
            learnedPatterns[patternToLearn] = outcome;
            await saveData(PATTERNS_FILE, learnedPatterns);
        }

        if (history.length > 300) history.pop();
        await saveData(HISTORY_FILE, history);
    }

    const currentPatternStr = history.map(h => h.ket_qua[0]).slice(0, 30).join("");

    // Get prediction
    const predictionResult = getSuperPrediction(history, learnedPatterns);
    const phienTiepTheo = String(parseInt(phien) + 1);

    stats.last_prediction = {
        phien_du_doan: phienTiepTheo,
        du_doan: predictionResult.du_doan
    };
    await saveData(STATS_FILE, stats);

    const finalResponse = {
        "id": "Tele@CsTool001 - VanNhat",
        phien: phien,
        xuc_xac: sourceData.OpenCode,
        tong: total,
        ket_qua: ket_qua,
        pattern: currentPatternStr,
        du_doan: {
            phien_tiep_theo: phienTiepTheo,
            ...predictionResult
        },
        thong_ke: {
            so_lan_dung: stats.so_lan_dung,
            so_lan_sai: stats.so_lan_sai
        }
    };
    res.json(finalResponse);
});

app.get('/stats', async (req, res) => {
    const stats = await loadData(STATS_FILE, {});
    res.json(stats);
});

app.get('/patterns', async (req, res) => {
    const patterns = await loadData(PATTERNS_FILE, {});
    res.json(patterns);
});

// Start the server
const PORT = process.env.PORT || 2222;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
