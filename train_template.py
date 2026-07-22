"""
Template training script with:
1) class_indices.json export
2) class_weight handling
3) MobileNetV2 preprocessing
4) best_model.keras checkpoint

Update DATASET_DIR before running.
"""

import json
import numpy as np
from sklearn.utils.class_weight import compute_class_weight
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping
from tensorflow.keras.layers import Dense, Dropout, GlobalAveragePooling2D, Input
from tensorflow.keras.models import Model
from tensorflow.keras.preprocessing.image import ImageDataGenerator


DATASET_DIR = "dataset"
IMAGE_SIZE = (224, 224)
BATCH_SIZE = 32
EPOCHS = 20


def build_model(num_classes):
    inputs = Input(shape=(224, 224, 3))
    base = MobileNetV2(weights="imagenet", include_top=False, input_tensor=inputs)
    base.trainable = False

    x = GlobalAveragePooling2D()(base.output)
    x = Dense(256, activation="relu")(x)
    x = Dropout(0.3)(x)
    outputs = Dense(num_classes, activation="softmax")(x)
    return Model(inputs, outputs)


def main():
    datagen = ImageDataGenerator(
        preprocessing_function=preprocess_input,
        validation_split=0.2
    )

    train_gen = datagen.flow_from_directory(
        DATASET_DIR,
        target_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
        class_mode="categorical",
        subset="training",
        shuffle=True
    )

    val_gen = datagen.flow_from_directory(
        DATASET_DIR,
        target_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
        class_mode="categorical",
        subset="validation",
        shuffle=False
    )

    with open("class_indices.json", "w", encoding="utf-8") as file:
        json.dump(train_gen.class_indices, file, indent=2)

    y_train = train_gen.classes
    class_weights = compute_class_weight(
        class_weight="balanced",
        classes=np.unique(y_train),
        y=y_train
    )
    class_weight_dict = {i: float(w) for i, w in enumerate(class_weights)}

    model = build_model(num_classes=train_gen.num_classes)
    model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])

    callbacks = [
        ModelCheckpoint("best_model.keras", monitor="val_accuracy", save_best_only=True),
        EarlyStopping(monitor="val_accuracy", patience=5, restore_best_weights=True)
    ]

    model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=EPOCHS,
        class_weight=class_weight_dict,
        callbacks=callbacks
    )


if __name__ == "__main__":
    main()
