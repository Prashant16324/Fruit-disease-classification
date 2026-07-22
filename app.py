from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
from werkzeug.utils import secure_filename

# ML imports
from tensorflow.keras.models import load_model
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input as mobilenet_preprocess_input
import numpy as np
from PIL import Image

app = Flask(__name__)
CORS(app) 


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
MODEL_PATH = os.path.join(BASE_DIR, 'best_model.h5')
CLASS_INDICES_PATH = os.path.join(BASE_DIR, 'class_indices.json')

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

model = None

DEFAULT_CLASSES = [
    'Alternaria_Mango','Alternaria_Pomegranate','Anthracnose_Guava',
    'Anthracnose_Mango','Anthracnose_Pomegranate','Bacterial_Blight_Pomegranate',
    'Black Mould Rot (Aspergillus)_Mango','Blotch_Apple','Cercospora_Pomegranate',
    'Fruitfly_Guava','Healthy_Apple','Healthy_Guava','Healthy_Mango',
    'Healthy_Pomegranate','Rot_Apple','Scab_Apple',
    'Stem and Rot (Lasiodiplodia)_Mango'
]
classes = DEFAULT_CLASSES.copy()


def load_classes():
    if not os.path.exists(CLASS_INDICES_PATH):
        print("class_indices.json not found, using default class order")
        return DEFAULT_CLASSES.copy()

    try:
        with open(CLASS_INDICES_PATH, 'r', encoding='utf-8') as file:
            class_indices = json.load(file)

        if not isinstance(class_indices, dict) or not class_indices:
            raise ValueError("class_indices.json must be a non-empty object")

        max_index = max(int(v) for v in class_indices.values())
        class_list = [None] * (max_index + 1)
        for class_name, idx in class_indices.items():
            class_list[int(idx)] = class_name

        if any(name is None for name in class_list):
            raise ValueError("class_indices.json has missing indices")

        print("Loaded class order from class_indices.json")
        return class_list
    except Exception as err:
        print(f"Failed to load class_indices.json: {err}")
        print("Using default class order")
        return DEFAULT_CLASSES.copy()

try:
    model = load_model(MODEL_PATH)
    classes = load_classes()
    print("Model loaded")
except Exception as e:
    print("Model error:", e)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def preprocess(filepath):
    img = Image.open(filepath).convert('RGB')
    target_h, target_w = 224, 224
    if model is not None and hasattr(model, "input_shape") and len(model.input_shape) >= 3:
        if model.input_shape[1] is not None and model.input_shape[2] is not None:
            target_h, target_w = int(model.input_shape[1]), int(model.input_shape[2])

    img = img.resize((target_w, target_h))
    img = np.array(img, dtype=np.float32)
    img = mobilenet_preprocess_input(img)
    img = np.expand_dims(img, axis=0)
    return img


def build_tta_batch(img_batch):
    base = img_batch[0]
    variants = [
        base,
        np.flip(base, axis=1),  
    ]
    return np.array(variants, dtype=np.float32)


def predict_with_tta(img_batch):
    tta_batch = build_tta_batch(img_batch)
    preds = model.predict(tta_batch, verbose=0)
    mean_pred = np.mean(preds, axis=0)
    return mean_pred


def top_predictions(probabilities, k=3):
    ranked = np.argsort(probabilities)[::-1][:k]
    result = []
    for i in ranked:
        result.append({
            'label': classes[int(i)],
            'confidence': round(float(probabilities[int(i)]) * 100, 2)
        })
    return result


def get_result_type(label):
    lower = label.lower()
    if 'healthy' in lower:
        return 'healthy'
    if 'rot' in lower or 'rotten' in lower:
        return 'rotten'
    return 'disease'


UNCERTAIN_MAX_PROB = 0.20
UNCERTAIN_H_NORM = 0.96
UNCERTAIN_MAX_AMBIG = 0.34
UNCERTAIN_GAP_AMBIG = 0.02
UNCERTAIN_LOW_CONFIDENCE = 0.45
UNCERTAIN_AMBIG_TOP1 = 0.56
UNCERTAIN_AMBIG_GAP = 0.05
OOD_TOP1_MAX = 0.42
OOD_RUNNER_MIN = 0.30
UNCERTAIN_TOP3_SUM_MAX = 0.68


def is_clearly_uncertain(mean_pred):
    """
    True for flat / almost-uniform / dead-heat distributions (no usable winner).
    """
    p = np.asarray(mean_pred, dtype=np.float64).ravel()
    if p.size == 0:
        return True
    p = np.clip(p, 1e-12, 1.0)
    p = p / np.sum(p)

    n = len(p)
    sorted_p = np.sort(p)[::-1]
    max_prob = float(sorted_p[0])
    second = float(sorted_p[1]) if n > 1 else 0.0
    gap = max_prob - second

    entropy = float(-np.sum(p * np.log(p)))
    h_max = float(np.log(n))
    h_norm = entropy / h_max if h_max > 0 else 1.0

    if max_prob < UNCERTAIN_MAX_PROB:
        return True
    if h_norm > UNCERTAIN_H_NORM:
        return True
    if max_prob < UNCERTAIN_MAX_AMBIG and gap < UNCERTAIN_GAP_AMBIG:
        return True
    return False


def is_low_confidence_or_ambiguous(probs):
    """Use normalized softmax probs: weak peak or tight race → uncertain label."""
    p = np.asarray(probs, dtype=np.float64).ravel()
    if p.size == 0:
        return True
    p = np.clip(p, 1e-12, 1.0)
    p = p / np.sum(p)
    sorted_p = np.sort(p)[::-1]
    max_prob = float(sorted_p[0])
    second = float(sorted_p[1]) if len(sorted_p) > 1 else 0.0
    third = float(sorted_p[2]) if len(sorted_p) > 2 else 0.0
    gap = max_prob - second
    top3_sum = max_prob + second + third
    # With 17 classes, calibrated top-1 confidence is often below 80%.
    # Keep this guard moderate so "uncertain" is returned only for weak/ambiguous peaks.
    if max_prob < UNCERTAIN_LOW_CONFIDENCE:
        return True
    if max_prob < UNCERTAIN_AMBIG_TOP1 and gap < UNCERTAIN_AMBIG_GAP:
        return True
    if top3_sum < UNCERTAIN_TOP3_SUM_MAX:
        return True
    if max_prob < OOD_TOP1_MAX and second >= OOD_RUNNER_MIN:
        return True
    return False


def should_return_uncertain(mean_pred, probs):
    if is_clearly_uncertain(mean_pred):
        return True
    return is_low_confidence_or_ambiguous(probs)


def mean_pred_to_probs(mean_pred):
    p = np.asarray(mean_pred, dtype=np.float64).ravel()
    if p.size == 0:
        return p
    p = np.clip(p, 1e-12, 1.0)
    return p / np.sum(p)

@app.route('/')
def home():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/index.html')
def home_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/style.css')
def style():
    return send_from_directory(BASE_DIR, 'style.css')

@app.route('/script.js')
def script():
    return send_from_directory(BASE_DIR, 'script.js')

@app.route('/result.html')
def result_page():
    return send_from_directory(BASE_DIR, 'result.html')

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'num_classes': len(classes)
    })

@app.route('/predict', methods=['POST'])
def predict():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            file.save(filepath)

            if model is not None:   # ✅ safe check
                img = preprocess(filepath)
                mean_pred = predict_with_tta(img)
                probs = mean_pred_to_probs(mean_pred)

                if should_return_uncertain(mean_pred, probs):
                    disease = None
                    confidence = 0.0
                    result_type = 'uncertain'
                    top3 = []
                else:
                    idx = int(np.argmax(probs))
                    confidence = float(probs[idx]) * 100
                    disease = classes[idx]
                    top3 = top_predictions(probs, k=3)
                    result_type = get_result_type(disease)
            else:
                disease = "Model not loaded"
                confidence = 0.0
                result_type = "unknown"
                top3 = []

            payload = {
                'disease': disease,
                'confidence': round(confidence, 2),
                'result_type': result_type,
                'top_predictions': top3
            }
            return jsonify(payload)

        return jsonify({'error': 'Invalid file type'}), 400

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '5502'))
    app.run(debug=True, port=port)