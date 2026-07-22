
const homeScreen = document.getElementById('home-screen');
const uploadScreen = document.getElementById('upload-screen');

const startBtn = document.getElementById('start-btn');
const imageUpload = document.getElementById('image-upload');
const cameraBtn = document.getElementById('camera-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const newAnalysisBtn = document.getElementById('new-analysis-btn');

const previewContainer = document.getElementById('preview-container');
const loadingSpinner = document.getElementById('loading-spinner');

const resultImage = document.getElementById('result-image');
const diseaseName = document.getElementById('disease-name');
const confidenceText = document.getElementById('confidence-text');
const confidenceFill = document.getElementById('confidence-fill');
const resultTypeBadge = document.getElementById('result-type-badge');
const resultMessage = document.getElementById('result-message');
const topPredictionList = document.getElementById('top-prediction-list');
const historyListEl = document.getElementById('prediction-history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const copyResultBtn = document.getElementById('copy-result-btn');
const uploadHistoryListEl = document.getElementById('upload-history-list');
const uploadClearHistoryBtn = document.getElementById('upload-clear-history-btn');
const uploadHistoryCountEl = document.getElementById('upload-history-count');
const resultScannedAtEl = document.getElementById('result-scanned-at');
const exportHistoryBtn = document.getElementById('export-history-btn');
const historySearchEl = document.getElementById('history-search');
const historyTypeFilterEl = document.getElementById('history-type-filter');
const uploadHistorySearchEl = document.getElementById('upload-history-search');
const uploadHistoryTypeFilterEl = document.getElementById('upload-history-type-filter');


let currentImageFile = null;
let mediaStream = null;
let resolvedApiBase = null;
const RESULT_STORAGE_KEY = 'prediction_result';
const RESULT_QUERY_KEY = 'result_payload';
const HISTORY_STORAGE_KEY = 'prediction_history_v1';
const MAX_HISTORY_ITEMS = 20;


if (startBtn) {
    startBtn.onclick = () => {
        if (!homeScreen || !uploadScreen) return;
        homeScreen.classList.remove('active');
        uploadScreen.classList.add('active');
        refreshUploadHistoryUI();
    };
}

if (newAnalysisBtn) {
    newAnalysisBtn.onclick = () => {
        window.location.href = 'index.html';
    };
}

function applyLanguageUI() {
    if (historySearchEl) historySearchEl.placeholder = 'Search disease';
    if (uploadHistorySearchEl) uploadHistorySearchEl.placeholder = 'Search disease';
    const resultHeading = document.getElementById('result-history-heading');
    if (resultHeading) resultHeading.innerText = 'Last 20 scans';
    if (exportHistoryBtn) exportHistoryBtn.innerText = 'Download Report';
    if (clearHistoryBtn) clearHistoryBtn.innerText = 'Clear';
    if (uploadClearHistoryBtn) uploadClearHistoryBtn.innerText = 'Clear';
}


if (imageUpload) {
    imageUpload.onchange = (e) => {
        if (!analyzeBtn) return;
        const file = e.target.files[0];
        if (!file) return;

        stopCamera();
        currentImageFile = file;
        showPreview(file);
        analyzeBtn.disabled = false;
    };
}

function showPreview(file) {
    if (!previewContainer) return;
    previewContainer.classList.remove('camera-live');
    const url = URL.createObjectURL(file);
    previewContainer.innerHTML = `<img src="${url}" class="preview-image">`;
    previewContainer.classList.add('has-image');
}

if (cameraBtn) {
    cameraBtn.onclick = openCamera;
}

function getCameraConstraints() {
    return {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    };
}

async function openCamera() {
    if (!previewContainer || !analyzeBtn) return;
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        triggerMobileCameraFile();
        return;
    }

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia(getCameraConstraints());
    } catch (err) {
        console.warn('getUserMedia failed, trying user-facing camera', err);
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
        } catch (err2) {
            console.warn('Fallback camera failed, using file capture', err2);
            triggerMobileCameraFile();
            return;
        }
    }

    previewContainer.innerHTML = '';
    previewContainer.classList.add('has-image', 'camera-live');

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.className = 'camera-preview-video';
    video.srcObject = mediaStream;

    const toolbar = document.createElement('div');
    toolbar.className = 'camera-toolbar';

    const captureBtn = document.createElement('button');
    captureBtn.type = 'button';
    captureBtn.innerText = '📸 Capture';
    captureBtn.className = 'capture-btn';
    captureBtn.disabled = true;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.innerText = '✕ Cancel';
    cancelBtn.className = 'camera-cancel-btn';

    toolbar.appendChild(captureBtn);
    toolbar.appendChild(cancelBtn);
    previewContainer.appendChild(video);
    previewContainer.appendChild(toolbar);

    const enableCaptureWhenReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            captureBtn.disabled = false;
            return true;
        }
        return false;
    };

    video.addEventListener('loadedmetadata', () => {
        if (enableCaptureWhenReady()) return;
    });

    try {
        await video.play();
    } catch (e) {
        console.warn('video.play()', e);
    }

    if (!enableCaptureWhenReady()) {
        await new Promise((resolve) => {
            const t0 = performance.now();
            const tick = () => {
                if (enableCaptureWhenReady() || performance.now() - t0 > 8000) {
                    if (!enableCaptureWhenReady()) {
                        captureBtn.disabled = false;
                    }
                    resolve();
                    return;
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    captureBtn.onclick = () => {
        const track = mediaStream && mediaStream.getVideoTracks()[0];
        const settings = track && track.getSettings ? track.getSettings() : {};
        const mirror = settings.facingMode === 'user';
        capturePhoto(video, mirror);
    };
    cancelBtn.onclick = () => {
        stopCamera();
        resetPreviewPlaceholder();
    };
}

function triggerMobileCameraFile() {
    let input = document.getElementById('camera-fallback-input');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'camera-fallback-input';
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');
        input.hidden = true;
        document.body.appendChild(input);
        input.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (file && analyzeBtn) {
                currentImageFile = file;
                showPreview(file);
                analyzeBtn.disabled = false;
            }
            input.value = '';
        };
    }
    input.click();
}

function resetPreviewPlaceholder() {
    if (!previewContainer) return;
    previewContainer.classList.remove('has-image', 'camera-live');
    previewContainer.innerHTML = `
        <div class="preview-placeholder">
            <svg class="upload-icon" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9.09" y1="8.26" x2="12" y2="12"/>
                <line x1="14.91" y1="8.26" x2="12" y2="12"/>
            </svg>
            <p>No image selected</p>
        </div>
    `;
}

function capturePhoto(video, mirrorHorizontal) {
    if (!analyzeBtn || !video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
        alert('Camera is not ready yet. Please wait a second and tap Capture again.');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        alert('Capture fail: browser support issue.');
        return;
    }
    if (mirrorHorizontal) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
        (blob) => {
            if (!blob) {
                alert('Could not save photo. Please try again.');
                return;
            }
            const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
            currentImageFile = file;
            previewContainer.classList.remove('camera-live');
            showPreview(file);
            stopCamera();
            analyzeBtn.disabled = false;
        },
        'image/jpeg',
        0.92
    );
}

function stopCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mediaStream) {
        stopCamera();
        if (previewContainer && previewContainer.classList.contains('camera-live')) {
            resetPreviewPlaceholder();
        }
    }
});

if (analyzeBtn) {
    analyzeBtn.onclick = analyzeImage;
}

async function analyzeImage() {
    if (!currentImageFile || !analyzeBtn) return;

    showLoading(true);

    try {
        const formData = new FormData();
        formData.append('file', currentImageFile);

        const response = await requestPrediction(formData);
        const data = await parseJsonSafe(response);

        if (!response.ok) {
            throw new Error(data.error || "Server error");
        }

        redirectToResultPage(data);

    } catch (error) {
        alert("Error: " + error.message);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

async function parseJsonSafe(response) {
    try {
        return await response.json();
    } catch (_) {
        return { error: 'Invalid server response. Restart backend and try again.' };
    }
}

function getApiCandidates() {
    const currentOrigin = window.location.origin;
    const host = window.location.hostname || '127.0.0.1';
    const commonPorts = [5502, 5000, 8000, 8080, 5500, 5501];
    const candidates = [currentOrigin];

    for (const port of commonPorts) {
        candidates.push(`http://127.0.0.1:${port}`);
        candidates.push(`http://localhost:${port}`);
        if (host !== '127.0.0.1' && host !== 'localhost') {
            candidates.push(`http://${host}:${port}`);
        }
    }

    return [...new Set(candidates)].filter(base => base && base.startsWith('http'));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

async function findReachableApiBase() {
    if (resolvedApiBase) return resolvedApiBase;

    const candidates = getApiCandidates();
    for (const base of candidates) {
        try {
            const response = await fetchWithTimeout(`${base}/health`, { method: 'GET' });
            if (!response.ok) {
                continue;
            }
            const data = await parseJsonSafe(response);
            if (data && data.status === 'ok') {
                resolvedApiBase = base;
                return resolvedApiBase;
            }
        } catch (_) {
            
        }
    }

    throw new Error(
        'Backend server is not reachable. Run `python app.py`, then open http://127.0.0.1:5502/index.html and try again.'
    );
}

async function requestPrediction(formData) {
    const apiBase = await findReachableApiBase();
    try {
        return await fetch(`${apiBase}/predict`, {
            method: 'POST',
            body: formData
        });
    } catch (_) {
        resolvedApiBase = null;
        const retryBase = await findReachableApiBase();
        return fetch(`${retryBase}/predict`, {
            method: 'POST',
            body: formData
        });
    }
}

function redirectToResultPage(data) {
    const scannedAt = Date.now();
    createCompressedImageData(currentImageFile)
        .then((imageDataUrl) => {
            const full = { ...data, imageDataUrl, scannedAt };
            const hid = pushPredictionHistory(full);
            safeSavePredictionResult({ ...full, _historyId: hid });
        })
        .catch(() => {
            const full = { ...data, scannedAt };
            const hid = pushPredictionHistory(full);
            safeSavePredictionResult({ ...full, _historyId: hid });
        })
        .finally(() => {
            const payloadForUrl = getSavedPredictionResultObject() || data || {};
            window.location.href = `result.html?${RESULT_QUERY_KEY}=${encodeResultPayload(payloadForUrl)}`;
        });
}

function createCompressedImageData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const maxWidth = 700;
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context unavailable'));
                    return;
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.onerror = () => reject(new Error('Image decode failed'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('Image read failed'));
        reader.readAsDataURL(file);
    });
}

function normalizeDiseaseForStorage(d) {
    if (d === null || d === undefined) return null;
    const s = String(d).trim();
    if (!s) return null;
    return s;
}

function savePredictionResult(payload) {
    const textOnlyPayload = {
        disease: normalizeDiseaseForStorage(payload.disease),
        confidence: Number(payload.confidence || 0),
        result_type: payload.result_type || 'disease',
        top_predictions: Array.isArray(payload.top_predictions) ? payload.top_predictions : [],
        scannedAt: Number.isFinite(payload.scannedAt) ? payload.scannedAt : null
    };

    const fullPayload = {
        ...textOnlyPayload,
        imageDataUrl: payload.imageDataUrl || '',
        _historyId: payload._historyId || ''
    };

    let stored = false;
    try {
        localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(fullPayload));
        stored = true;
    } catch (_) {
        
    }

    if (!stored) {
        try {
            localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(textOnlyPayload));
            stored = true;
        } catch (_) {
            
        }
    }

    if (!stored) {
        try {
            sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(textOnlyPayload));
            stored = true;
        } catch (_) {
            
        }
    }

    return stored;
}

function safeSavePredictionResult(payload) {
    try {
        savePredictionResult(payload);
    } catch (_) {
        
    }
}

function getPredictionHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function pushPredictionHistory(entry) {
    const at = Number.isFinite(entry.scannedAt) ? entry.scannedAt : Date.now();
    const item = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        disease: normalizeDiseaseForStorage(entry.disease),
        confidence: Number(entry.confidence || 0),
        result_type: entry.result_type || 'disease',
        top_predictions: Array.isArray(entry.top_predictions) ? entry.top_predictions : [],
        imageDataUrl: entry.imageDataUrl || '',
        at
    };

    let next = [item, ...getPredictionHistory()].slice(0, MAX_HISTORY_ITEMS);
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch (_) {
        const compact = next.map((row) => ({
            ...row,
            imageDataUrl: ''
        }));
        try {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(compact));
        } catch (_) {
            
        }
    }

    return item.id;
}

function clearPredictionHistory() {
    try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (_) {
        
    }
}

function exportPredictionHistoryPdf() {
    const rows = getPredictionHistory();
    const current = getSavedPredictionResultObject() || rows[0] || null;
    const jsPdfApi = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdfApi) {
        alert('PDF generator not loaded. Please refresh once.');
        return;
    }
    const doc = new jsPdfApi({ unit: 'pt', format: 'a4' });
    let y = 42;
    const left = 40;
    doc.setFontSize(17);
    doc.text('Fruit Disease Scan Report', left, y);
    y += 24;
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
    y += 20;

    if (current) {
        doc.text(`Latest result: ${formatDiseaseName(current.disease)}`, left, y);
        y += 16;
        doc.text(`Confidence: ${Math.round(Number(current.confidence || 0))}%`, left, y);
        y += 16;
        doc.text(`Type: ${resultTypeShort(current.result_type)}`, left, y);
        y += 22;
    }

    doc.setFontSize(12);
    doc.text('Recent scans:', left, y);
    y += 16;
    doc.setFontSize(10);
    rows.forEach((row, idx) => {
        const line = `${idx + 1}. ${formatDiseaseName(row.disease)} | ${Math.round(Number(row.confidence || 0))}% | ${resultTypeShort(row.result_type)} | ${formatScanDate(row.at)} ${formatScanTime(row.at)}`;
        if (y > 790) {
            doc.addPage();
            y = 44;
        }
        doc.text(line, left, y);
        y += 14;
    });

    doc.save(`fruit-disease-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`);
}

function getSavedPredictionResult() {
    try {
        const localValue = localStorage.getItem(RESULT_STORAGE_KEY);
        if (localValue) return localValue;
    } catch (_) {
        
    }

    try {
        return sessionStorage.getItem(RESULT_STORAGE_KEY);
    } catch (_) {
        return null;
    }
}

function getSavedPredictionResultObject() {
    const stored = getSavedPredictionResult();
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch (_) {
        return null;
    }
}

function encodeResultPayload(data) {
    try {
        return encodeURIComponent(
            JSON.stringify({
                disease: normalizeDiseaseForStorage(data.disease),
                confidence: Number(data.confidence || 0),
                result_type: data.result_type || 'disease',
                top_predictions: Array.isArray(data.top_predictions) ? data.top_predictions : []
            })
        );
    } catch (_) {
        return '';
    }
}

function getResultFromQuery() {
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get(RESULT_QUERY_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(decodeURIComponent(raw));
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function formatDiseaseName(raw) {
    if (raw === null || raw === undefined) return '—';
    const s = String(raw).trim();
    if (!s) return '—';
    return s.replaceAll('_', ' ');
}

function buildUncertainMessage(disease, confidence) {
    const hasForcedLabel = disease != null && String(disease).trim() !== '';
    const core = [
        'This image is uncertain. Model confidence is low or the top scores are too close.',
        'Disease/healthy label is hidden for safety.',
        '',
        'Use a clear close-up fruit photo for better detection.',
        '',
        'Tips: use good light, keep one fruit in focus, avoid blur and distant shots.'
    ];
    if (hasForcedLabel) {
        const conf = Math.round(Number(confidence ?? 0));
        core.push(
            '',
            `(Purana saved hint: ${formatDiseaseName(disease)} ~ ${conf}%.)`
        );
    }
    return core.join('\n');
}

function setResultMessageElement(text, isUncertain) {
    if (!resultMessage) return;
    resultMessage.innerText = text;
    resultMessage.className = isUncertain ? 'result-message uncertain-hint' : 'result-message';
}

function getResultDetails(type, disease, confidence) {
    const conf = Math.round(Number(confidence ?? 0));
    if (type === 'uncertain') {
        return {
            badge: 'Uncertain image',
            message: buildUncertainMessage(disease, confidence),
            className: 'status-uncertain'
        };
    }
    if (type === 'healthy') {
        return {
            badge: 'Healthy',
            message: 'Fruit looks healthy. No disease detected.',
            className: 'status-healthy'
        };
    }
    if (type === 'rotten') {
        return {
            badge: 'Rotten',
            message: `Fruit detected as rotten: ${formatDiseaseName(disease)}.`,
            className: 'status-rotten'
        };
    }
    return {
        badge: 'Disease Found',
        message: `Disease detected: ${formatDiseaseName(disease)}.`,
        className: 'status-disease'
    };
}

function getConfidenceAdvice(confidence) {
    const conf = Math.round(Number(confidence || 0));
    if (conf >= 80) return '';
    if (conf >= 60) {
        return 'Moderate confidence. Re-scan in better light for stronger certainty.';
    }
    return 'Low confidence. Use a sharper close image of a single fruit.';
}

function hydrateResultPage() {
    if (!resultImage || !diseaseName || !confidenceText || !confidenceFill) return;

    let data = getSavedPredictionResultObject();
    if (!data) {
        data = getResultFromQuery();
        if (data) {
            safeSavePredictionResult(data);
        }
    }

    if (!data) {
        diseaseName.innerText = 'No previous result found';
        confidenceText.innerText = '0%';
        confidenceFill.style.width = '0%';
        setResultMessageElement('Analyze an image first to generate a result.', false);
        if (topPredictionList) {
            topPredictionList.innerHTML = '<li>Prediction data unavailable.</li>';
        }
        renderPredictionHistory(null);
        if (clearHistoryBtn) {
            clearHistoryBtn.onclick = () => {
                if (confirm('Clear recent scan history?')) {
                    clearPredictionHistory();
                    renderPredictionHistory(null);
                }
            };
        }
        if (copyResultBtn) {
            copyResultBtn.disabled = true;
        }
        setResultScannedAtDisplay(null);
        return;
    }
    resultImage.src = data.imageDataUrl || '';
    const confidence = Number(data.confidence || 0);
    diseaseName.innerText =
        data.result_type === 'uncertain' ? 'Uncertain image' : formatDiseaseName(data.disease);
    confidenceText.innerText = `${Math.round(confidence)}%`;
    confidenceFill.style.width = `${Math.max(0, Math.min(100, confidence))}%`;

    let scannedTs = Number.isFinite(data.scannedAt) ? data.scannedAt : null;
    if (!Number.isFinite(scannedTs) && data._historyId) {
        const matchRow = getPredictionHistory().find((r) => r.id === data._historyId);
        if (matchRow) scannedTs = matchRow.at;
    }
    setResultScannedAtDisplay(scannedTs);

    if (resultTypeBadge || resultMessage) {
        const details = getResultDetails(data.result_type, data.disease, confidence);
        const advice = getConfidenceAdvice(confidence);
        if (resultTypeBadge) {
            resultTypeBadge.innerText = details.badge;
            resultTypeBadge.className = `result-badge ${details.className}`;
        }
        setResultMessageElement(advice ? `${details.message}\n\n${advice}` : details.message, data.result_type === 'uncertain');
    }

    renderTopPredictions(data.top_predictions);
    renderPredictionHistory(data);
    setupResultPageActions(data);
}

function setupResultPageActions(current) {
    if (copyResultBtn) {
        copyResultBtn.disabled = false;
        copyResultBtn.onclick = async () => {
            const ts = Number.isFinite(current.scannedAt)
                ? current.scannedAt
                : Number.isFinite(current.at)
                  ? current.at
                  : null;
            const whenLine = Number.isFinite(ts)
                ? formatScanDateTimeLine(ts)
                : new Date().toLocaleString();
            const typeLine =
                current.result_type === 'uncertain'
                    ? 'Uncertain / not classified (reliability checks failed)'
                    : current.result_type || 'disease';
            const resultLine =
                current.result_type === 'uncertain' && (current.disease == null || String(current.disease).trim() === '')
                    ? 'Not classified (no label shown — unreliable input)'
                    : `Result: ${formatDiseaseName(current.disease)}`;
            const lines = [
                `Fruit disease scan`,
                `Date & time: ${whenLine}`,
                resultLine,
                `Confidence: ${Math.round(Number(current.confidence || 0))}%`,
                `Type: ${typeLine}`
            ];
            const text = lines.join('\n');
            try {
                await navigator.clipboard.writeText(text);
                copyResultBtn.innerText = '✓ Copied';
                setTimeout(() => {
                    copyResultBtn.innerText = '📋 Copy summary';
                }, 2000);
            } catch (_) {
                alert(text);
            }
        };
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.onclick = () => {
            if (confirm('Clear recent scan history?')) {
                clearPredictionHistory();
                renderPredictionHistory(current);
                refreshUploadHistoryUI();
            }
        };
    }
}

function formatScanDate(ts) {
    if (!Number.isFinite(ts)) return '—';
    try {
        return new Date(ts).toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (_) {
        return '—';
    }
}

function formatScanTime(ts) {
    if (!Number.isFinite(ts)) return '—';
    try {
        return new Date(ts).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (_) {
        return '—';
    }
}

function formatScanDateTimeLine(ts) {
    if (!Number.isFinite(ts)) return '';
    return `${formatScanDate(ts)} · ${formatScanTime(ts)}`;
}

function resultTypeShort(type) {
    if (type === 'uncertain') return 'Uncertain';
    if (type === 'healthy') return 'Healthy';
    if (type === 'rotten') return 'Rotten';
    return 'Disease';
}

function buildHistoryCardHtml(row, highlightId, markLatest) {
    const thumb = row.imageDataUrl
        ? `<img src="${row.imageDataUrl}" alt="" class="history-thumb">`
        : `<div class="history-thumb history-thumb--empty">🍎</div>`;
    const active = highlightId && row.id === highlightId;
    let cls = 'history-card';
    if (active) cls += ' history-card--active';
    if (markLatest) cls += ' history-card--latest';
    const conf = Math.round(Number(row.confidence || 0));
    const rtype = resultTypeShort(row.result_type);
    const histTitle =
        row.result_type === 'uncertain'
            ? 'Uncertain image'
            : formatDiseaseName(row.disease);
    return `
        <button type="button" class="${cls}" data-history-id="${row.id}">
            ${thumb}
            <span class="history-meta">
                <span class="history-title">${histTitle}</span>
                <span class="history-line2">
                    <span class="history-confidence">${conf}%</span>
                    <span class="history-dot">·</span>
                    <span class="history-ptype history-ptype--${row.result_type || 'disease'}">${rtype}</span>
                </span>
                <span class="history-date">${formatScanDate(row.at)}</span>
                <span class="history-time">${formatScanTime(row.at)}</span>
            </span>
        </button>
    `;
}

function resolveHistoryHighlightId(currentData, rows) {
    let highlightId = currentData && currentData._historyId;
    if (!highlightId && currentData && rows.length) {
        const c = Math.round(Number(currentData.confidence || 0));
        const match = rows.find(
            (r) => r.disease === currentData.disease && Math.round(Number(r.confidence || 0)) === c
        );
        if (match) highlightId = match.id;
    }
    return highlightId;
}

function bindHistoryListClicks(container, mode) {
    container.querySelectorAll('[data-history-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-history-id');
            const row = getPredictionHistory().find((r) => r.id === id);
            if (!row) return;
            if (mode === 'upload') {
                openHistoryRowOnResultPage(row);
            } else {
                applyHistoryRowToPage(row);
            }
        });
    });
}

function openHistoryRowOnResultPage(row) {
    safeSavePredictionResult({
        disease: row.disease,
        confidence: row.confidence,
        result_type: row.result_type,
        top_predictions: row.top_predictions,
        imageDataUrl: row.imageDataUrl,
        _historyId: row.id,
        scannedAt: row.at
    });
    window.location.href = 'result.html';
}

function filterHistoryRows(rows, searchEl, typeEl) {
    const q = (searchEl && searchEl.value ? searchEl.value : '').trim().toLowerCase();
    const type = typeEl && typeEl.value ? typeEl.value : 'all';
    return rows.filter((row) => {
        const typeOk = type === 'all' ? true : (row.result_type || 'disease') === type;
        if (!typeOk) return false;
        if (!q) return true;
        const label = row.result_type === 'uncertain' ? 'uncertain image' : formatDiseaseName(row.disease);
        return label.toLowerCase().includes(q);
    });
}

function refreshUploadHistoryUI() {
    if (!uploadHistoryListEl) return;

    const rows = getPredictionHistory();
    if (uploadHistoryCountEl) {
        uploadHistoryCountEl.textContent = rows.length ? `${rows.length}/${MAX_HISTORY_ITEMS}` : '';
    }

    if (!rows.length) {
        uploadHistoryListEl.innerHTML =
            '<p class="history-empty">No saved scans yet. Analyze an image first.</p>';
        return;
    }

    const filtered = filterHistoryRows(rows, uploadHistorySearchEl, uploadHistoryTypeFilterEl);
    if (!filtered.length) {
        uploadHistoryListEl.innerHTML =
            '<p class="history-empty">No matching scans found for this filter.</p>';
        return;
    }

    uploadHistoryListEl.innerHTML = filtered
        .map((row, index) => buildHistoryCardHtml(row, null, index === 0))
        .join('');

    bindHistoryListClicks(uploadHistoryListEl, 'upload');
}

function setResultScannedAtDisplay(ts) {
    if (!resultScannedAtEl) return;
    if (!Number.isFinite(ts)) {
        resultScannedAtEl.hidden = true;
        resultScannedAtEl.textContent = '';
        return;
    }
    resultScannedAtEl.hidden = false;
    resultScannedAtEl.textContent = `Scan: ${formatScanDate(ts)} · ${formatScanTime(ts)}`;
}

function renderPredictionHistory(currentData) {
    if (!historyListEl) return;

    const rows = getPredictionHistory();
    if (!rows.length) {
        historyListEl.innerHTML = '<p class="history-empty">No history yet. Run a scan to see entries.</p>';
        return;
    }
    const filtered = filterHistoryRows(rows, historySearchEl, historyTypeFilterEl);
    if (!filtered.length) {
        historyListEl.innerHTML =
            '<p class="history-empty">No matching scans found for this filter.</p>';
        return;
    }

    const highlightId = resolveHistoryHighlightId(currentData, filtered);

    historyListEl.innerHTML = filtered
        .map((row, index) => buildHistoryCardHtml(row, highlightId, index === 0))
        .join('');

    bindHistoryListClicks(historyListEl, 'result');
}

function applyHistoryRowToPage(row) {
    if (!resultImage || !diseaseName || !confidenceText || !confidenceFill) return;

    resultImage.src = row.imageDataUrl || '';
    const confidence = Number(row.confidence || 0);
    diseaseName.innerText =
        row.result_type === 'uncertain' ? 'Uncertain image' : formatDiseaseName(row.disease);
    confidenceText.innerText = `${Math.round(confidence)}%`;
    confidenceFill.style.width = `${Math.max(0, Math.min(100, confidence))}%`;

    const details = getResultDetails(row.result_type, row.disease, confidence);
    const advice = getConfidenceAdvice(confidence);
    if (resultTypeBadge) {
        resultTypeBadge.innerText = details.badge;
        resultTypeBadge.className = `result-badge ${details.className}`;
    }
    setResultMessageElement(advice ? `${details.message}\n\n${advice}` : details.message, row.result_type === 'uncertain');
    renderTopPredictions(row.top_predictions);
    setResultScannedAtDisplay(row.at);

    if (historyListEl) {
        historyListEl.querySelectorAll('.history-card').forEach((el) => {
            el.classList.toggle('history-card--active', el.getAttribute('data-history-id') === row.id);
        });
    }

    setupResultPageActions({ ...row, _historyId: row.id, scannedAt: row.at });
}

function renderTopPredictions(predictions) {
    if (!topPredictionList) return;
    const items = Array.isArray(predictions) ? predictions : [];
    if (!items.length) {
        topPredictionList.innerHTML =
            '<li>Top-3 list is empty (uncertain result) or data missing.</li>';
        return;
    }

    topPredictionList.innerHTML = items
        .map(item => `<li>${formatDiseaseName(item.label)} - ${Math.round(Number(item.confidence || 0))}%</li>`)
        .join('');
}


function showLoading(show) {
    if (!loadingSpinner) return;
    loadingSpinner.classList.toggle('hidden', !show);
}

function updateOfflineUiState() {
    document.body.classList.toggle('offline-mode', !navigator.onLine);
}


if (previewContainer) {
    previewContainer.ondragover = e => e.preventDefault();

    previewContainer.ondrop = e => {
        e.preventDefault();

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/") && analyzeBtn) {
            stopCamera();
            currentImageFile = file;
            showPreview(file);
            analyzeBtn.disabled = false;
        }
    };
}

if (resultImage && diseaseName && confidenceText && confidenceFill) {
    hydrateResultPage();
}

if (uploadClearHistoryBtn) {
    uploadClearHistoryBtn.onclick = () => {
        if (confirm('Clear recent scan history?')) {
            clearPredictionHistory();
            refreshUploadHistoryUI();
        }
    };
}

if (uploadHistoryListEl) {
    refreshUploadHistoryUI();
}

if (historySearchEl) historySearchEl.addEventListener('input', () => renderPredictionHistory(getSavedPredictionResultObject()));
if (historyTypeFilterEl) historyTypeFilterEl.addEventListener('change', () => renderPredictionHistory(getSavedPredictionResultObject()));
if (uploadHistorySearchEl) uploadHistorySearchEl.addEventListener('input', refreshUploadHistoryUI);
if (uploadHistoryTypeFilterEl) uploadHistoryTypeFilterEl.addEventListener('change', refreshUploadHistoryUI);

applyLanguageUI();
updateOfflineUiState();
window.addEventListener('online', updateOfflineUiState);
window.addEventListener('offline', updateOfflineUiState);

if (exportHistoryBtn) {
    exportHistoryBtn.onclick = () => {
        const rows = getPredictionHistory();
        if (!rows.length) {
            alert('Run at least one scan before downloading report.');
            return;
        }
        exportPredictionHistoryPdf();
    };
}