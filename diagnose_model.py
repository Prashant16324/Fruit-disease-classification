import json
import numpy as np
from tensorflow.keras.models import load_model
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input


MODEL_PATH = "best_model.keras"
CLASS_INDICES_PATH = "class_indices.json"


def load_classes():
    with open(CLASS_INDICES_PATH, "r", encoding="utf-8") as file:
        class_indices = json.load(file)
    max_index = max(class_indices.values())
    classes = [None] * (max_index + 1)
    for name, idx in class_indices.items():
        classes[idx] = name
    return classes


def main():
    model = load_model(MODEL_PATH)
    classes = load_classes()

    print("input_shape:", model.input_shape)
    print("output_shape:", model.output_shape)
    print("num_classes:", len(classes))

    print("\nRandom input predictions:")
    for i in range(8):
        img = np.random.randint(0, 256, (1, 224, 224, 3)).astype("float32")
        pred = model.predict(preprocess_input(img), verbose=0)[0]
        idx = int(np.argmax(pred))
        print(f"{i}: {classes[idx]} ({float(np.max(pred)) * 100:.2f}%)")

    print("\nConstant color predictions:")
    probes = {
        "black": np.zeros((1, 224, 224, 3), dtype="float32"),
        "white": np.full((1, 224, 224, 3), 255, dtype="float32"),
        "gray": np.full((1, 224, 224, 3), 127, dtype="float32"),
    }
    for name, img in probes.items():
        pred = model.predict(preprocess_input(img), verbose=0)[0]
        idx = int(np.argmax(pred))
        print(f"{name}: {classes[idx]} ({float(np.max(pred)) * 100:.2f}%)")


if __name__ == "__main__":
    main()
