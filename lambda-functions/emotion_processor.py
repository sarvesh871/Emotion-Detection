import json
import boto3
import time
from decimal import Decimal
from datetime import datetime
from urllib.parse import unquote_plus

rekognition = boto3.client("rekognition")
dynamodb = boto3.resource("dynamodb")

table = dynamodb.Table("EmotionDetections")


def lambda_handler(event, context):

    for record in event["Records"]:

        bucket = record["s3"]["bucket"]["name"]
        key = unquote_plus(record["s3"]["object"]["key"])
        fileName = key.split("/")[-1]

        response = rekognition.detect_faces(
            Image={
                "S3Object": {
                    "Bucket": bucket,
                    "Name": key
                }
            },
            Attributes=["ALL"]
        )

        if len(response["FaceDetails"]) == 0:
            print("No face detected.")
            continue

        face = response["FaceDetails"][0]

        emotions = face["Emotions"]

        dominant = max(emotions, key=lambda x: x["Confidence"])

        # Create a dictionary of all emotions with default confidence 0
        emotion_scores = {
            "HAPPY": Decimal("0"),
            "SAD": Decimal("0"),
            "ANGRY": Decimal("0"),
            "CALM": Decimal("0"),
            "CONFUSED": Decimal("0"),
            "DISGUSTED": Decimal("0"),
            "SURPRISED": Decimal("0"),
            "FEAR": Decimal("0")
        }

        emotion_list = []

        for emotion in emotions:
            confidence = Decimal(str(emotion["Confidence"]))

            emotion_scores[emotion["Type"]] = confidence

            emotion_list.append({
                "Type": emotion["Type"],
                "Confidence": confidence
            })

        captureTimestamp = int(time.time())

        table.put_item(
            Item={
                "imageId": key.replace("/", "_"),
                "bucket": bucket,
                "objectKey": key,
                "fileName": fileName,

                "captureTime": datetime.utcnow().isoformat(),
                "captureTimestamp": captureTimestamp,

                "dominantEmotion": dominant["Type"],
                "dominantConfidence": Decimal(str(dominant["Confidence"])),

                "happyConfidence": emotion_scores["HAPPY"],
                "sadConfidence": emotion_scores["SAD"],
                "calmConfidence": emotion_scores["CALM"],
                "angryConfidence": emotion_scores["ANGRY"],
                "surprisedConfidence": emotion_scores["SURPRISED"],
                "confusedConfidence": emotion_scores["CONFUSED"],
                "fearConfidence": emotion_scores["FEAR"],
                "disgustedConfidence": emotion_scores["DISGUSTED"],

                "emotions": emotion_list,
                "constantPartition": "ALL"
            }
        )

        print(f"Processed {key}")

        print(f"Dominant emotion: {dominant['Type']}")

        print(f"Confidence: {dominant['Confidence']}")

    return {
        "statusCode": 200,
        "body": json.dumps("Images processed successfully")
    }